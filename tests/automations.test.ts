import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
process.env.DATABASE_PATH = ":memory:";
process.env.ENCRYPTION_KEY =
  "test-secret-encryption-key-long-enough-1234567890";
process.env.PUBLIC_URL = "http://localhost:4320";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "LocalTestPassword_123456";
process.env.ADMIN_NAME = "Camille Hôte";
const { app, bootstrap, errorHandler } = await import("../server/app.js");
const { db, all } = await import("../server/db.js");
const { dispatch } = await import("../server/jobs.js");
bootstrap();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
after(() => server.close());
const realFetch = globalThis.fetch;

async function call(path: string, method = "GET", body?: unknown, auth = "") {
  const r = await realFetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth.startsWith("cos_")
        ? { Authorization: "Bearer " + auth }
        : { Cookie: auth }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: (r.headers.get("set-cookie") || "").split(";")[0],
  };
}
const session = (
  await call("/auth/login", "POST", {
    email: "owner@example.com",
    password: "LocalTestPassword_123456",
  })
).cookie;
const key = (await call("/api-keys", "POST", { name: "Zapier" }, session)).data
  .key as string;
const readKey = (
  await call("/api-keys", "POST", { name: "Lecture", scope: "read" }, session)
).data.key as string;

test("the API lists ready-made 1 h and 5 min reminder templates", async () => {
  const r = await call("/workflows/templates", "GET", undefined, key);
  assert.equal(r.status, 200);
  const t = r.data.templates;
  assert.ok(t.length >= 6);
  assert.ok(t.filter((x: any) => x.delayMinutes === 60).length >= 3);
  assert.ok(t.filter((x: any) => x.delayMinutes === 5).length >= 3);
  for (const x of t) {
    assert.ok(x.subject && x.body.length > 60, x.id);
    assert.doesNotMatch(
      x.body,
      /\{\{\s*(?!first_name|last_name|email|phone|event_name|host_name|date|time|timezone|location|manage_link|event_link|answers)\w+/,
    );
  }
  assert.equal(r.data.channels.email.connected, false);
  const spec = (await call("/openapi.json", "GET", undefined, key)).data;
  assert.ok(spec.paths["/workflows/templates"]?.get);
  assert.ok(spec.paths["/workflows/templates/{id}"]?.post);
});

test("automations cannot be activated until the workspace email API is connected", async () => {
  assert.equal(
    (await call("/workflows/templates/reminder-1h", "POST", {}, key)).status,
    409,
  );
  const wf = {
    name: "Brouillon",
    trigger: "booking.before",
    delayMinutes: 60,
    actions: [{ channel: "email", body: "Bonjour {{first_name}}" }],
  };
  const blocked = await call("/workflows", "POST", wf, key);
  assert.equal(blocked.status, 409);
  assert.match(blocked.data.error, /Connectez votre API email/);
  const sms = await call(
    "/workflows",
    "POST",
    { ...wf, actions: [{ channel: "sms", body: "Rappel" }] },
    key,
  );
  assert.match(sms.data.error, /API SMS/);
  // A draft can be prepared before connecting.
  const draft = await call(
    "/workflows",
    "POST",
    { ...wf, enabled: false },
    key,
  );
  assert.equal(draft.status, 201);
  assert.equal(
    (
      await call(
        "/workflows/" + draft.data.workflow.id,
        "PUT",
        { ...wf, enabled: true },
        key,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        "/workflows/" + draft.data.workflow.id,
        "DELETE",
        undefined,
        key,
      )
    ).status,
    200,
  );
});

test("with the email API connected, API keys create automations from templates and they send at 1 h and 5 min", async () => {
  assert.equal(
    (
      await call(
        "/integrations/resend",
        "PUT",
        { apiKey: "re_test_1234567890", from: "Studio <rdv@studio.fr>" },
        key,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("/workflows/templates", "GET", undefined, key)).data.channels
      .email.connected,
    true,
  );
  assert.equal(
    (await call("/workflows/templates/reminder-1h", "POST", {}, readKey))
      .status,
    403,
    "read-only keys cannot create automations",
  );
  const event = (await call("/events", "GET", undefined, key)).data.events[0];
  for (const id of ["reminder-1h", "reminder-5min", "host-brief-5min"]) {
    const r = await call(
      "/workflows/templates/" + id,
      "POST",
      { eventIds: [event.id] },
      key,
    );
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.workflow.enabled, true);
    assert.equal(r.data.workflow.trigger, "booking.before");
  }
  assert.equal(
    (await call("/workflows/templates/nope", "POST", {}, key)).status,
    404,
  );
  const custom = await call(
    "/workflows",
    "POST",
    {
      name: "Relance J+1 sans réservation",
      trigger: "lead.qualified",
      delayMinutes: 1440,
      actions: [
        {
          channel: "email",
          subject: "{{first_name}}, votre créneau vous attend",
          body: "Réservez ici : {{event_link}}",
        },
      ],
    },
    key,
  );
  assert.equal(custom.status, 201);
  assert.equal(
    (await call("/workflows", "GET", undefined, key)).data.workflows.length,
    4,
  );

  // Book a call 3 hours from now and check the reminders that get scheduled.
  await call(
    "/events/" + event.id,
    "PUT",
    {
      ...event,
      noticeMinutes: 0,
      horizonDays: 30,
      questions: [],
      disqualify: [],
    },
    key,
  );
  const lead = await call(`/public/events/${event.slug}/leads`, "POST", {
    email: "alex@prospect.fr",
    phone: "+33612345678",
    firstName: "Alex",
    lastName: "Martin",
    visitorId: crypto.randomUUID(),
  });
  await call(`/public/events/${event.slug}/qualify`, "POST", {
    token: lead.data.token,
    answers: {},
    timezone: "Europe/Paris",
  });
  let day = DateTime.now().setZone(event.timezone).plus({ days: 1 });
  while (day.weekday > 5) day = day.plus({ days: 1 });
  const slots = (
    await call(
      `/public/events/${event.slug}/slots?token=${lead.data.token}&from=${day.toISODate()}&days=1`,
    )
  ).data.slots;
  const start = slots[0].start;
  const booked = await call(`/public/events/${event.slug}/bookings`, "POST", {
    token: lead.data.token,
    start,
  });
  assert.equal(booked.status, 201, JSON.stringify(booked.data));
  const ws = all("workflow", event.workspace)[0].workspace;
  const jobs = (
    db
      .prepare("SELECT * FROM jobs WHERE workspace=? AND kind='message'")
      .all(ws) as any[]
  )
    .map((j) => ({ ...j, p: JSON.parse(j.payload) }))
    .filter((j) => j.p.workflowId && j.p.trigger === "booking.before");
  const minutesBefore = (j: any) =>
    Math.round((Date.parse(start) - Date.parse(j.due)) / 60000);
  assert.deepEqual(
    jobs.map(minutesBefore).sort((a, b) => a - b),
    [5, 5, 60],
  );

  // Deliver them through the mocked Resend API and check the rendered messages.
  const sent: any[] = [];
  globalThis.fetch = (async (url: any, options: any) => {
    assert.equal(String(url), "https://api.resend.com/emails");
    assert.equal(options.headers.Authorization, "Bearer re_test_1234567890");
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "msg_" + sent.length }), {
      status: 200,
    });
  }) as any;
  try {
    for (const j of jobs) await dispatch(j);
  } finally {
    globalThis.fetch = realFetch;
  }
  const oneHour = sent.find((m) => m.subject.startsWith("Dans 1 heure"));
  assert.equal(
    oneHour.subject,
    `Dans 1 heure : ${event.name} avec Camille Hôte`,
  );
  assert.deepEqual(oneHour.to, ["alex@prospect.fr"]);
  assert.equal(oneHour.from, "Studio <rdv@studio.fr>");
  assert.match(oneHour.text, /^Bonjour Alex,/);
  assert.match(oneHour.text, /\/manage\//);
  const fiveMin = sent.find((m) => m.subject.startsWith("On commence"));
  assert.match(fiveMin.text, /Camille Hôte vous attend dans 5 minutes/);
  const brief = sent.find((m) => m.subject.startsWith("Dans 5 min :"));
  assert.deepEqual(brief.to, ["owner@example.com"]);
  assert.match(brief.text, /Alex Martin/);
  assert.match(brief.text, /\+33612345678/);
  for (const m of sent) assert.doesNotMatch(m.subject + m.text, /\{\{/);
});
