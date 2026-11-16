import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
process.env.DATABASE_PATH = ":memory:";
process.env.ENCRYPTION_KEY =
  "test-secret-encryption-key-long-enough-1234567890";
process.env.PUBLIC_URL = "http://localhost:4320";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "LocalTestPassword_123456";
process.env.ADMIN_NAME = "Jordan Host";
const { app, bootstrap, errorHandler } = await import("../server/app.js");
const { db } = await import("../server/db.js");
const { dispatch } = await import("../server/jobs.js");
bootstrap();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
after(() => server.close());
const realFetch = globalThis.fetch;

let cookie = "";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const r = await realFetch(base + "/api/v1" + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: (r.headers.get("set-cookie") || "").split(";")[0],
  };
}
cookie = (
  await call("/auth/login", "POST", {
    email: "owner@example.com",
    password: "LocalTestPassword_123456",
  })
).cookie;
const original = (await call("/events")).data.events[0];

test("events default to French and can switch to English", async () => {
  assert.equal(original.language, "fr");
  const r = await call("/events/" + original.id, "PUT", {
    ...original,
    language: "en",
    noticeMinutes: 0,
    questions: [],
    disqualify: [],
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.event.language, "en");
  const pub = await call("/public/events/" + original.slug);
  assert.equal(pub.data.event.language, "en");
  assert.equal(
    (
      await call("/events/" + original.id, "PUT", {
        ...original,
        language: "de",
      })
    ).status,
    422,
  );
});

test("public errors follow the page language; the admin API stays French", async () => {
  const en = await call(
    `/public/events/${original.slug}/slots?token=nope&from=2026-12-01`,
    "GET",
    undefined,
    { "X-CloseOS-Lang": "en" },
  );
  assert.equal(en.status, 403);
  assert.equal(
    en.data.error,
    "Your session has expired. Please refresh the page.",
  );
  const fr = await call(
    `/public/events/${original.slug}/slots?token=nope&from=2026-12-01`,
  );
  assert.equal(fr.data.error, "Session de formulaire invalide.");
  const invalid = await call(
    `/public/events/${original.slug}/leads`,
    "POST",
    { visitorId: crypto.randomUUID() },
    { "X-CloseOS-Lang": "en" },
  );
  assert.equal(invalid.status, 422);
  assert.equal(
    invalid.data.error,
    "Please enter a valid email or international phone number.",
  );
  const missing = await call(
    "/public/events/does-not-exist",
    "GET",
    undefined,
    {
      "X-CloseOS-Lang": "en",
    },
  );
  assert.equal(missing.data.error, "This event is not available.");
  const admin = await call("/events/missing", "GET", undefined, {
    "X-CloseOS-Lang": "en",
  });
  assert.equal(admin.status, 404);
  assert.match(admin.data.error, /introuvable|[éèà]/i);
});

test("an English event sends English confirmation, host and reminder emails", async () => {
  await call("/integrations/resend", "PUT", {
    apiKey: "re_test_1234567890",
    from: "Studio <hello@studio.com>",
  });
  const event = (await call("/events/" + original.id)).data.event;
  const lead = await call(`/public/events/${event.slug}/leads`, "POST", {
    email: "sam@prospect.com",
    phone: "+14155550123",
    firstName: "Sam",
    lastName: "Taylor",
    visitorId: crypto.randomUUID(),
  });
  await call(`/public/events/${event.slug}/qualify`, "POST", {
    token: lead.data.token,
    answers: {},
    timezone: "America/New_York",
  });
  let day = DateTime.now().setZone(event.timezone).plus({ days: 3 });
  while (day.weekday > 5) day = day.plus({ days: 1 });
  const slots = (
    await call(
      `/public/events/${event.slug}/slots?token=${lead.data.token}&from=${day.toISODate()}&days=1`,
    )
  ).data.slots;
  const booked = await call(`/public/events/${event.slug}/bookings`, "POST", {
    token: lead.data.token,
    start: slots[0].start,
  });
  assert.equal(booked.status, 201);
  const jobs = (
    db.prepare("SELECT * FROM jobs WHERE kind='message'").all() as any[]
  ).filter((j) => JSON.parse(j.payload).bookingId === booked.data.booking.id);
  const sent: any[] = [];
  globalThis.fetch = (async (_url: any, options: any) => {
    sent.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: "m" + sent.length }), {
      status: 200,
    });
  }) as any;
  try {
    for (const j of jobs) await dispatch(j);
  } finally {
    globalThis.fetch = realFetch;
  }
  const start = DateTime.fromISO(slots[0].start).setZone("America/New_York");
  const confirmed = sent.find((m) => m.subject.startsWith("Booking confirmed"));
  assert.ok(confirmed, JSON.stringify(sent.map((m) => m.subject)));
  assert.match(
    confirmed.text,
    /^Hi Sam,\nYour .+ with Jordan Host is confirmed for /,
  );
  assert.ok(
    confirmed.text.includes(
      start.setLocale("en-US").toLocaleString(DateTime.DATE_FULL),
    ),
    confirmed.text,
  );
  assert.ok(confirmed.text.includes(start.toFormat("h:mm a")), confirmed.text);
  assert.ok(sent.some((m) => m.subject.startsWith("New booking · Sam Taylor")));
  assert.ok(sent.some((m) => m.subject.startsWith("Reminder · ")));
  for (const m of sent)
    assert.doesNotMatch(m.subject + m.text, /Bonjour|Rendez-vous|Rappel/);
  // The calendar invitation attached to the confirmation is in English too.
  const ics = Buffer.from(
    confirmed.attachments[0].content,
    "base64",
  ).toString();
  assert.doesNotMatch(ics, /Appel téléphonique|Gérer/);
});

test("reminder templates exist in French and English", async () => {
  const t = (await call("/workflows/templates")).data.templates;
  for (const l of ["fr", "en"]) {
    const set = t.filter((x: any) => x.language === l);
    assert.equal(set.length, 6, l);
    assert.equal(set.filter((x: any) => x.delayMinutes === 60).length, 3);
    assert.equal(set.filter((x: any) => x.delayMinutes === 5).length, 3);
  }
  const en = t.filter((x: any) => x.language === "en");
  for (const x of en)
    assert.doesNotMatch(x.subject + x.body, /Bonjour|rendez-vous|Rappel/);
  const r = await call("/workflows/templates/reminder-5min-en", "POST", {});
  assert.equal(r.status, 201);
  assert.equal(
    r.data.workflow.actions[0].subject,
    "We’re starting in 5 minutes ⏱",
  );
});
