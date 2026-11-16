import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
process.env.DATABASE_PATH = ":memory:";
process.env.ENCRYPTION_KEY =
  "test-secret-encryption-key-long-enough-1234567890";
process.env.PUBLIC_URL = "http://localhost:4320";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "LocalTestPassword_123456";
const { app, bootstrap, errorHandler } = await import("../server/app.js");
const { db, all, get, put, now } = await import("../server/db.js");
const { dispatch, tick, privateAddress } = await import("../server/jobs.js");
const { slotsSync, overlaps } = await import("../server/scheduling.js");
const { encrypt, decrypt } = await import("../server/security.js");
const { ics } = await import("../server/calendar.js");
bootstrap();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
let cookie = "",
  ws = "",
  event: any,
  leadToken = "",
  booking: any,
  owner: any;
const realFetch = globalThis.fetch;
async function request(
  path: string,
  method = "GET",
  body?: any,
  extra: Record<string, string> = {},
) {
  const r = await realFetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Workspace-Id": ws,
      ...extra,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  return { status: r.status, data, cookie: r.headers.get("set-cookie") };
}
async function capture(slug = event.slug, email = "prospect@example.com") {
  const r = await request("/public/events/" + slug + "/leads", "POST", {
    email,
    phone: "+33612345678",
    firstName: "Alex",
    lastName: "Martin",
    visitorId: crypto.randomUUID(),
    attribution: {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "test-campaign",
      landingPage: "https://site.example/offer",
    },
    smsConsent: true,
  });
  assert.equal(r.status, 201);
  return r.data;
}
async function qualify(t: string, answers: any = { budget: "Plus de 1000 €" }) {
  return request("/public/events/" + event.slug + "/qualify", "POST", {
    token: t,
    answers,
    timezone: "Europe/Paris",
  });
}
test("private API is closed and login cookie is HttpOnly", async () => {
  assert.equal((await request("/events")).status, 401);
  const r = await request("/auth/login", "POST", {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  });
  assert.equal(r.status, 200);
  assert.match(r.cookie!, /HttpOnly/);
  cookie = r.cookie!.split(";")[0];
  const me = await request("/me");
  ws = me.data.workspace.id;
  owner = me.data.user;
  event = (await request("/events")).data.events[0];
});
test("event configuration and question-based qualification are server-enforced", async () => {
  event = {
    ...event,
    name: "Audit qualification",
    noticeMinutes: 0,
    horizonDays: 60,
    timezone: "Europe/Paris",
    questions: [
      {
        id: "budget",
        label: "Votre budget ?",
        type: "radio",
        required: true,
        options: ["Moins de 1000 €", "Plus de 1000 €"],
      },
    ],
    disqualify: [
      {
        id: "low",
        field: "budget",
        operator: "equals",
        value: "Moins de 1000 €",
        hostIds: [],
      },
    ],
  };
  assert.equal(
    (await request("/events/" + event.id, "PUT", event)).status,
    200,
  );
  const r = await capture();
  leadToken = r.token;
  const leads = (await request("/leads")).data.leads;
  assert.equal(leads[0].status, "potential");
  assert.equal(leads[0].firstTouch.utm_campaign, "test-campaign");
  assert.equal(leads[0].tokenHash, undefined);
  assert.equal(
    (
      await request(
        `/public/events/${event.slug}/slots?token=${leadToken}&from=2026-10-28`,
      )
    ).status,
    403,
  );
  assert.equal((await qualify(leadToken, {})).status, 422);
  const dq = await qualify(leadToken, { budget: "Moins de 1000 €" });
  assert.equal(dq.data.status, "disqualified");
  assert.equal(
    (
      await request("/public/events/" + event.slug + "/bookings", "POST", {
        token: leadToken,
        start: new Date(Date.now() + 86400000).toISOString(),
      })
    ).status,
    422,
  );
  assert.equal((await qualify(leadToken)).data.status, "qualified");
});
test("partial capture survives updates and preserves first touch, invalid tokens cannot mutate it", async () => {
  const r = await request("/public/events/" + event.slug + "/leads", "POST", {
    token: leadToken,
    email: "prospect@example.com",
    phone: "+33612345678",
    firstName: "Alex",
    lastName: "Martin",
    visitorId: "visitor-123456789",
    attribution: { utm_source: "newsletter" },
    smsConsent: true,
  });
  assert.equal(r.status, 200);
  const l = (await request("/leads")).data.leads[0];
  assert.equal(l.firstTouch.utm_source, "google");
  assert.equal(l.lastTouch.utm_source, "newsletter");
  assert.equal(
    (
      await request("/public/events/" + event.slug + "/leads", "POST", {
        token: "fake-token",
        email: "evil@example.com",
        visitorId: "visitor-123456789",
      })
    ).status,
    403,
  );
  await qualify(leadToken);
});
test("availability uses timezone/DST, buffers and date exceptions", async () => {
  const schedule = {
    userId: owner.id,
    name: "Paris",
    timezone: "Europe/Paris",
    weekly: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        i + 1,
        [{ start: "09:00", end: "18:00" }],
      ]),
    ),
    overrides: {},
  };
  assert.equal(
    (await request("/availability/" + owner.id, "PUT", schedule)).status,
    200,
  );
  const day = DateTime.now()
    .setZone("Europe/Paris")
    .plus({ days: 2 })
    .toISODate()!;
  const r = await request(
    `/public/events/${event.slug}/slots?token=${leadToken}&from=${day}&days=1`,
  );
  assert.equal(r.status, 200);
  assert.ok(r.data.slots.length > 0);
  assert.equal(
    DateTime.fromISO(r.data.slots[0].start).setZone("Europe/Paris").hour,
    9,
  );
  assert.ok(
    overlaps(
      "2026-01-01T10:00Z",
      "2026-01-01T10:30Z",
      "2026-01-01T10:30Z",
      "2026-01-01T11:00Z",
      0,
      10,
    ),
  );
  assert.equal(
    overlaps(
      "2026-01-01T10:00Z",
      "2026-01-01T10:30Z",
      "2026-01-01T10:30Z",
      "2026-01-01T11:00Z",
    ),
    false,
  );
  const utc = DateTime.fromISO(day + "T09:00", { zone: "Europe/Paris" })
    .toUTC()
    .toISO();
  assert.equal(r.data.slots[0].start, utc);
  const overridden = { ...schedule, overrides: { [day]: [] } };
  await request("/availability/" + owner.id, "PUT", overridden);
  assert.equal(
    (
      await request(
        `/public/events/${event.slug}/slots?token=${leadToken}&from=${day}&days=1`,
      )
    ).data.slots.length,
    0,
  );
  await request("/availability/" + owner.id, "PUT", schedule);
});
test("concurrent booking claims produce one success; idempotency replay returns the same booking", async () => {
  const other = await capture(event.slug, "other@example.com");
  await qualify(other.token);
  const day = DateTime.now().plus({ days: 2 }).toISODate();
  const slot = (
    await request(
      `/public/events/${event.slug}/slots?token=${leadToken}&from=${day}`,
    )
  ).data.slots[0];
  const responses = await Promise.all([
    request(
      "/public/events/" + event.slug + "/bookings",
      "POST",
      { token: leadToken, start: slot.start },
      { "Idempotency-Key": "booking-test" },
    ),
    request("/public/events/" + event.slug + "/bookings", "POST", {
      token: other.token,
      start: slot.start,
    }),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
  const winner = responses.find((r) => r.status === 201)!;
  booking = winner.data.booking;
  assert.equal(
    all("booking", ws).filter((b) => b.start === slot.start).length,
    1,
  );
  assert.ok(booking.manageToken);
  if (responses[0].status === 201) {
    const replay = await request(
      "/public/events/" + event.slug + "/bookings",
      "POST",
      { token: leadToken, start: slot.start },
      { "Idempotency-Key": "booking-test" },
    );
    assert.equal(replay.status, 200);
    assert.equal(replay.data.booking.id, booking.id);
    assert.equal(
      (
        await request(
          "/public/events/" + event.slug + "/bookings",
          "POST",
          { token: leadToken, start: slot.end },
          { "Idempotency-Key": "booking-test" },
        )
      ).status,
      409,
    );
  }
  const scheduled = db.prepare("SELECT * FROM jobs WHERE workspace=?").all(ws);
  assert.ok(scheduled.length >= 3);
});
test("calendar invitations use stable UID, UTC, organizer, attendee and CRLF", () => {
  const lead = get("lead", booking.leadId)!;
  const content = ics(booking, event, lead, owner);
  assert.match(content, /METHOD:REQUEST\r\n/);
  assert.match(content, new RegExp("UID:" + booking.id));
  assert.match(content, /DTSTART:\d{8}T\d{6}Z/);
  assert.match(content, /ORGANIZER/);
  assert.match(content, /ATTENDEE/);
});
test("reschedule invalidates old reminders; cancel preserves UID and prevents rebooking", async () => {
  const token = booking.manageToken,
    day = DateTime.now().plus({ days: 3 }).toISODate();
  const available = await request(
    `/public/bookings/${token}/slots?from=${day}`,
  );
  const r = await request(`/public/bookings/${token}/reschedule`, "POST", {
    start: available.data.slots[0].start,
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.booking.version, 1);
  assert.ok(
    db.prepare("SELECT * FROM jobs WHERE status='cancelled'").all().length >= 1,
  );
  const cancelled = await request(`/public/bookings/${token}/cancel`, "POST", {
    reason: "Test",
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.booking.status, "cancelled");
  assert.equal(cancelled.data.booking.version, 2);
  const content = ics(
    cancelled.data.booking,
    event,
    get("lead", booking.leadId)!,
    owner,
  );
  assert.match(content, /METHOD:CANCEL/);
  assert.match(content, /SEQUENCE:2/);
  assert.equal(
    (
      await request(`/public/bookings/${token}/reschedule`, "POST", {
        start: available.data.slots[1].start,
      })
    ).status,
    422,
  );
});
test("secrets are encrypted, masked and not included in public event response", async () => {
  const secret = "re_test_private_secret_12345";
  assert.equal(
    (
      await request("/integrations/resend", "PUT", {
        apiKey: secret,
        from: "Team <test@example.com>",
      })
    ).status,
    200,
  );
  const stored = all("integration", ws)[0];
  assert.equal(JSON.stringify(stored).includes(secret), false);
  assert.equal(decrypt(stored.secret).apiKey, secret);
  assert.equal(
    JSON.stringify((await request("/integrations")).data).includes(secret),
    false,
  );
  const publicEvent = (await request("/public/events/" + event.slug)).data;
  assert.equal(publicEvent.event.disqualify, undefined);
  assert.equal(publicEvent.event.routing, undefined);
});
test("Resend receives ICS and an idempotency key; unconfigured SMS is not marked sent", async () => {
  const jobs = db
    .prepare(
      "SELECT * FROM jobs WHERE kind='message' AND json_extract(payload,'$.trigger')='booking.cancelled'",
    )
    .all() as any[];
  assert.ok(jobs.length);
  let sent: any;
  globalThis.fetch = (async (url: any, options: any) => {
    assert.equal(url, "https://api.resend.com/emails");
    sent = options;
    return new Response(JSON.stringify({ id: "email_mock_123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await dispatch(jobs[0]);
    assert.equal(result.providerId, "email_mock_123");
    assert.equal(sent.headers["Idempotency-Key"], jobs[0].id);
    const payload = JSON.parse(sent.body);
    assert.equal(payload.to[0], get("lead", booking.leadId)!.email);
    assert.match(
      Buffer.from(payload.attachments[0].content, "base64").toString(),
      /METHOD:CANCEL/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
  const p = JSON.parse(jobs[0].payload);
  await assert.rejects(
    () =>
      dispatch({
        ...jobs[0],
        payload: JSON.stringify({ ...p, channel: "sms" }),
      }),
    /SMS non configuré/,
  );
});
test("read-only API keys cannot write and revoked keys are rejected", async () => {
  const created = await request("/api-keys", "POST", {
    name: "Read test",
    scope: "read",
  });
  const authorization = "Bearer " + created.data.key;
  assert.equal(
    (
      await request("/events", "GET", undefined, {
        Authorization: authorization,
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/events", "POST", event, { Authorization: authorization }))
      .status,
    403,
  );
  await request("/api-keys/" + created.data.id, "DELETE");
  assert.equal(
    (
      await request("/events", "GET", undefined, {
        Authorization: authorization,
      })
    ).status,
    401,
  );
});
test("workspace isolation rejects references and API keys remain bound to their workspace", async () => {
  const old = ws,
    second = await request("/workspaces", "POST", { name: "Second workspace" });
  ws = second.data.workspace.id;
  assert.equal((await request("/events/" + event.id)).status, 404);
  assert.equal(
    (await request("/events/" + event.id, "PUT", event)).status,
    404,
  );
  assert.equal((await request("/leads")).data.total, 0);
  const r = await request("/workflows", "POST", {
    name: "Cross workspace",
    trigger: "booking.created",
    eventIds: [event.id],
    actions: [{ channel: "email", body: "Test" }],
  });
  assert.equal(r.status, 404);
  ws = old;
});
test("signed webhooks cannot target local networks; malformed origins are refused", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.0.1",
    "172.16.0.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
  ])
    assert.ok(privateAddress(ip));
  assert.equal(privateAddress("8.8.8.8"), false);
  assert.equal(
    (
      await request("/events", "POST", event, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
});
test("CSV export and analytics reflect captured leads and UTM attribution", async () => {
  const analytics = (await request("/analytics")).data;
  assert.ok(analytics.totals.leads >= 2);
  assert.ok(analytics.sources.some((s: any) => s.source === "google"));
  const r = await realFetch(base + "/api/v1/leads/export.csv", {
    headers: { Cookie: cookie, "X-Workspace-Id": ws },
  });
  assert.equal(r.status, 200);
  assert.match(await r.text(), /test-campaign/);
});
after(() => {
  server.close();
  db.close();
});
test("Google connector checks real free/busy and creates native invitations with sendUpdates=all", async () => {
  const { calendarBusy, syncCalendar } = await import("../server/calendar.js");
  const c = put("calendar", ws, {
    provider: "google",
    userId: owner.id,
    email: owner.email,
    calendarId: "primary",
    secret: encrypt({
      accessToken: "mock_access",
      refreshToken: "mock_refresh",
      expiresAt: Date.now() + 3600000,
    }),
    checkConflicts: true,
    writeEvents: true,
  });
  const calls: any[] = [];
  globalThis.fetch = (async (url: any, options: any) => {
    calls.push({ url, options });
    const body = String(url).includes("freeBusy")
      ? {
          calendars: {
            primary: {
              busy: [
                { start: "2026-10-28T10:00:00Z", end: "2026-10-28T11:00:00Z" },
              ],
            },
          },
        }
      : {
          id: "google_event_1",
          hangoutLink: "https://meet.google.com/test-call",
        };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  try {
    const busy = await calendarBusy(
      ws,
      [owner.id],
      "2026-10-28T00:00:00Z",
      "2026-10-29T00:00:00Z",
    );
    assert.equal(busy[owner.id].length, 1);
    const b = { ...booking, status: "confirmed" };
    const result = await syncCalendar(
      b,
      { ...event, locationType: "google_meet" },
      get("lead", booking.leadId)!,
      owner,
    );
    assert.equal(result.meetingUrl, "https://meet.google.com/test-call");
    assert.match(calls[1].url, /sendUpdates=all/);
    const payload = JSON.parse(calls[1].options.body);
    assert.equal(
      payload.attendees[0].email,
      get("lead", booking.leadId)!.email,
    );
    assert.equal(payload.conferenceData.createRequest.requestId, booking.id);
    assert.match(payload.id, /^[a-v0-9]+$/);
    assert.equal(result.calendarConnectionId, c.id);
    assert.equal(result.externalCalendarId, "primary");
    // Updating the default destination must not strand an existing invitation.
    put(
      "calendar",
      ws,
      {
        ...get("calendar", c.id)!,
        calendarId: "another-calendar",
        writeEvents: false,
      },
      c.id,
    );
    await syncCalendar(
      { ...b, ...result, status: "cancelled" },
      event,
      get("lead", booking.leadId)!,
      owner,
    );
    assert.match(calls[2].url, /calendars\/primary\/events\/google_event_1/);
    assert.equal(calls[2].options.method, "DELETE");
    db.prepare("DELETE FROM records WHERE id=?").run(c.id);
    await assert.rejects(
      () =>
        syncCalendar(
          { ...b, ...result, status: "cancelled" },
          event,
          get("lead", booking.leadId)!,
          owner,
        ),
      /calendrier d’origine/,
    );
  } finally {
    globalThis.fetch = realFetch;
    db.prepare("DELETE FROM records WHERE id=?").run(c.id);
  }
});
test("Microsoft connector honors selected calendar and invitation idempotency", async () => {
  const { syncCalendar } = await import("../server/calendar.js");
  const c = put("calendar", ws, {
    provider: "microsoft",
    userId: owner.id,
    email: owner.email,
    calendarId: "custom-calendar",
    secret: encrypt({
      accessToken: "mock_access",
      expiresAt: Date.now() + 3600000,
    }),
    writeEvents: true,
  });
  let sent: any;
  globalThis.fetch = (async (url: any, options: any) => {
    sent = { url, options };
    return new Response(
      JSON.stringify({
        id: "outlook_event",
        onlineMeeting: { joinUrl: "https://teams.microsoft.com/test" },
      }),
      { status: 201 },
    );
  }) as typeof fetch;
  try {
    await syncCalendar(
      { ...booking, status: "confirmed" },
      { ...event, locationType: "teams" },
      get("lead", booking.leadId)!,
      owner,
    );
    assert.match(sent.url, /calendars\/custom-calendar\/events$/);
    const body = JSON.parse(sent.options.body);
    assert.equal(body.transactionId, booking.id);
    assert.equal(body.isOnlineMeeting, true);
    assert.equal(body.attendees.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    db.prepare("DELETE FROM records WHERE id=?").run(c.id);
  }
});
test("Twilio sends the opted-in recipient via the authenticated messaging endpoint", async () => {
  const c = put("integration", ws, {
    provider: "twilio",
    secret: encrypt({
      accountSid: "AC" + "a".repeat(32),
      authToken: "mock_twilio_secret",
      from: "+15005550006",
    }),
  });
  const jobs = db
    .prepare(
      "SELECT * FROM jobs WHERE kind='message' AND json_extract(payload,'$.trigger')='booking.cancelled'",
    )
    .all() as any[];
  let sent: any;
  globalThis.fetch = (async (url: any, options: any) => {
    sent = { url, options };
    return new Response(JSON.stringify({ sid: "SMtest123" }), { status: 201 });
  }) as typeof fetch;
  try {
    const p = JSON.parse(jobs[0].payload);
    const r = await dispatch({
      ...jobs[0],
      payload: JSON.stringify({ ...p, channel: "sms" }),
    });
    assert.equal(r.providerId, "SMtest123");
    assert.match(sent.url, /api.twilio.com\/2010-04-01\/Accounts\/AC/);
    assert.equal(sent.options.body.get("To"), "+33612345678");
    assert.ok(sent.options.headers.Authorization.startsWith("Basic "));
    const lead = get("lead", booking.leadId)!;
    put("lead", ws, { ...lead, smsConsent: false }, lead.id);
    sent = null;
    const skipped = await dispatch({
      ...jobs[0],
      payload: JSON.stringify({ ...p, channel: "sms" }),
    });
    assert.equal(skipped.skipped, true);
    assert.equal(sent, null);
  } finally {
    globalThis.fetch = realFetch;
    db.prepare("DELETE FROM records WHERE id=?").run(c.id);
  }
});

test("team invites bind the email, can only be accepted once, and enforce viewer access", async () => {
  const invitation = await request("/team/invites", "POST", {
    email: "viewer@example.com",
    role: "viewer",
  });
  assert.equal(invitation.status, 201);
  const inviteToken = invitation.data.url.split("/").pop();
  const accepted = await request("/auth/accept-invite", "POST", {
    token: inviteToken,
    name: "Viewer Test",
    password: "A_Strong_Viewer_Password_123",
  });
  assert.equal(accepted.status, 200);
  const viewerCookie = accepted.cookie!.split(";")[0];
  assert.equal(
    (await request("/events", "GET", undefined, { Cookie: viewerCookie }))
      .status,
    200,
  );
  assert.equal(
    (await request("/events", "POST", event, { Cookie: viewerCookie })).status,
    403,
  );
  assert.equal(
    (await request("/integrations", "GET", undefined, { Cookie: viewerCookie }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/auth/accept-invite", "POST", {
        token: inviteToken,
        name: "Viewer Test",
        password: "A_Strong_Viewer_Password_123",
      })
    ).status,
    410,
  );
});
test("webhooks include progressive lead updates without exposing opaque tokens", async () => {
  const hook = await request("/webhooks", "POST", {
    name: "CRM updates",
    url: "https://example.com/closeos-hook",
    events: ["lead.captured", "lead.updated"],
    enabled: true,
  });
  assert.equal(hook.status, 201);
  assert.ok(hook.data.signingSecret);
  const c = await capture(event.slug, "webhook@example.com");
  await request("/public/events/" + event.slug + "/leads", "POST", {
    token: c.token,
    email: "webhook@example.com",
    firstName: "Updated",
    lastName: "Prospect",
    visitorId: crypto.randomUUID(),
  });
  const jobs = db
    .prepare("SELECT * FROM jobs WHERE kind='webhook' AND workspace=?")
    .all(ws) as any[];
  const payloads = jobs.map((j) => JSON.parse(j.payload));
  assert.ok(payloads.some((p) => p.type === "lead.captured"));
  assert.ok(
    payloads.some(
      (p) =>
        p.type === "lead.updated" && p.body.data.lead.firstName === "Updated",
    ),
  );
  assert.equal(
    payloads.some((p) => JSON.stringify(p).includes(c.token)),
    false,
  );
  assert.equal(
    payloads.some((p) => p.body.data.lead.tokenHash),
    false,
  );
  await request("/webhooks/" + hook.data.webhook.id, "DELETE");
});
test("public OpenAPI covers event CRUD, management actions and integrations", async () => {
  const r = await request("/openapi.json", "GET", undefined, { Cookie: "" });
  assert.equal(r.status, 200);
  assert.equal(r.data.openapi, "3.1.0");
  assert.ok(r.data.paths["/public/bookings/{token}/reschedule"].post);
  assert.ok(r.data.paths["/integrations/{provider}"].put);
  assert.ok(r.data.paths["/events/{id}"].delete);
  assert.ok(Object.keys(r.data.paths).length >= 45);
});
test("lead deletion waits for native calendar cancellation to complete", async () => {
  const c = await capture(event.slug, "delete-after-cancel@example.com");
  const lead = all("lead", ws).find(
    (l) => l.email === "delete-after-cancel@example.com",
  )!;
  const b = put("booking", ws, {
    ...booking,
    leadId: lead.id,
    status: "cancelled",
    externalEventId: "native_pending",
    calendarStatus: "pending",
    manageToken: "temporary-deletion-test",
  });
  assert.equal((await request("/leads/" + lead.id, "DELETE")).status, 409);
  assert.ok(get("lead", lead.id));
  put("booking", ws, { ...b, calendarStatus: "synced" }, b.id);
  assert.equal((await request("/leads/" + lead.id, "DELETE")).status, 200);
  assert.equal(get("lead", lead.id), null);
  assert.equal(get("booking", b.id), null);
});
