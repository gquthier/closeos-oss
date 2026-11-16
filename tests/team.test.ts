import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
process.env.DATABASE_PATH = ":memory:";
process.env.ENCRYPTION_KEY =
  "test-secret-encryption-key-long-enough-1234567890";
process.env.PUBLIC_URL = "http://localhost:4320";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "LocalTestPassword_123456";
process.env.SKOOL_COOKIE_HEADER = "auth_token=test";
const { app, bootstrap, errorHandler } = await import("../server/app.js");
const { setSkoolReader } = await import("../server/skool.js");
const { setOtpMailer, setMailTransport } = await import("../server/access.js");
const { db, all } = await import("../server/db.js");
bootstrap();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
after(() => server.close());

const codes: Record<string, string> = {},
  mails: { to: string; subject: string; text: string }[] = [];
setOtpMailer(async (to, code) => {
  codes[to] = code;
});
setMailTransport(async (m) => {
  mails.push(m);
});
// One annual Skool member, who first signs up on their own.
let skoolMembers = ["member@example.com"];
setSkoolReader(async () => {
  const pageProps = {
    currentGroup: { id: "39d0dedbc1694fd8bdfa15ae8930efd2" },
    isAdmin: true,
    tabName: "active",
    annual: true,
    monthly: false,
    totalPages: 1,
    users: skoolMembers.map((email) => ({
      firstName: "Sam",
      lastName: "Member",
      member: {
        role: "member",
        metadata: {
          mbme: email,
          mmbp: JSON.stringify({ amount: 99700, recurring_interval: "year" }),
        },
      },
    })),
  };
  return `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script>`;
});

let ws = "";
async function call(path: string, method = "GET", body?: unknown, cookie = "") {
  const r = await fetch(base + "/api/v1" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Workspace-Id": ws,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: (r.headers.get("set-cookie") || "").split(";")[0],
  };
}

const owner = await call("/auth/login", "POST", {
  email: "owner@example.com",
  password: "LocalTestPassword_123456",
});
const ownerCookie = owner.cookie;
const me = (await call("/me", "GET", undefined, ownerCookie)).data;
ws = me.workspace.id;
const as = (path: string, method = "GET", body?: unknown) =>
  call(path, method, body, ownerCookie);
const tokenOf = (url: string) => url.split("/").pop()!;

test("an invited teammate gets the link by email and joins with a code, without a password", async () => {
  const inv = await as("/team/invites", "POST", {
    email: "Closer@Example.com",
    role: "member",
  });
  assert.equal(inv.status, 201);
  assert.equal(inv.data.emailed, true);
  const mail = mails.find((m) => m.to === "closer@example.com")!;
  assert.match(mail.subject, /vous invite à rejoindre/);
  assert.ok(mail.text.includes(inv.data.url));

  const t = tokenOf(inv.data.url);
  const info = await call("/auth/invite/" + t);
  assert.deepEqual(
    { email: info.data.email, hasAccount: info.data.hasAccount },
    { email: "closer@example.com", hasAccount: false },
  );
  assert.equal(
    (await call("/auth/invite/code", "POST", { token: t })).status,
    200,
  );
  assert.equal(
    (
      await call("/auth/accept-invite", "POST", {
        token: t,
        code: codes["closer@example.com"],
      })
    ).status,
    422,
    "a new account needs a name",
  );
  const wrong = codes["closer@example.com"] === "000000" ? "111111" : "000000";
  assert.equal(
    (
      await call("/auth/accept-invite", "POST", {
        token: t,
        code: wrong,
        name: "Chris Closer",
      })
    ).status,
    401,
  );
  const joined = await call("/auth/accept-invite", "POST", {
    token: t,
    code: codes["closer@example.com"],
    name: "Chris Closer",
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.workspace, ws);
  const team = (await as("/team")).data;
  const closer = team.members.find(
    (m: any) => m.email === "closer@example.com",
  );
  assert.equal(closer.role, "member");
  assert.equal(closer.name, "Chris Closer");
  assert.ok(all("availability", ws).some((a) => a.userId === closer.id));
  // The link is single use and the teammate cannot be invited twice.
  assert.equal(
    (
      await call("/auth/accept-invite", "POST", {
        token: t,
        code: "123456",
        name: "X",
      })
    ).status,
    410,
  );
  assert.equal(
    (
      await as("/team/invites", "POST", {
        email: "closer@example.com",
        role: "member",
      })
    ).status,
    409,
  );
  // The teammate can sign in again later with an email code.
  db.prepare("UPDATE otps SET lastSent=? WHERE email=?").run(
    new Date(0).toISOString(),
    "closer@example.com",
  );
  assert.equal(
    (await call("/auth/code", "POST", { email: "closer@example.com" })).status,
    200,
  );
});

test("an existing CloseOS user (Skool member signed in by code) joins another team by code", async () => {
  assert.equal(
    (await call("/auth/code", "POST", { email: "member@example.com" })).status,
    200,
  );
  const own = await call("/auth/code/verify", "POST", {
    email: "member@example.com",
    code: codes["member@example.com"],
  });
  assert.equal(own.status, 200);

  const inv = await as("/team/invites", "POST", {
    email: "member@example.com",
    role: "admin",
  });
  const t = tokenOf(inv.data.url);
  assert.equal((await call("/auth/invite/" + t)).data.hasAccount, true);
  db.prepare("UPDATE otps SET lastSent=? WHERE email=?").run(
    new Date(0).toISOString(),
    "member@example.com",
  );
  assert.equal(
    (await call("/auth/invite/code", "POST", { token: t })).status,
    200,
  );
  const joined = await call("/auth/accept-invite", "POST", {
    token: t,
    code: codes["member@example.com"],
  });
  assert.equal(joined.status, 200);
  const ids = db
    .prepare(
      "SELECT m.workspace,m.role FROM memberships m JOIN users u ON u.id=m.userId WHERE u.email=?",
    )
    .all("member@example.com") as any[];
  assert.deepEqual(ids.map((m) => m.role).sort(), ["admin", "owner"]);
  // Losing the Skool plan does not lock a teammate out of the team they joined.
  skoolMembers = [];
  setSkoolReader(async () => {
    throw new Error("must not be called for a teammate");
  });
  db.prepare("UPDATE otps SET lastSent=? WHERE email=?").run(
    new Date(0).toISOString(),
    "member@example.com",
  );
  assert.equal(
    (await call("/auth/code", "POST", { email: "member@example.com" })).status,
    200,
  );
});

test("round robin spreads bookings evenly across available hosts; priority always picks the first", async () => {
  const team = (await as("/team")).data.members;
  const ownerId = team.find((m: any) => m.email === "owner@example.com").id;
  const closerId = team.find((m: any) => m.email === "closer@example.com").id;
  const event = (await as("/events")).data.events[0];
  const configured = {
    ...event,
    hostIds: [ownerId, closerId],
    routingMode: "round_robin",
    noticeMinutes: 0,
    horizonDays: 60,
    dailyLimit: 0,
    questions: [],
    disqualify: [],
    routing: [],
    type: "strategy",
  };
  assert.equal(
    (await as("/events/" + event.id, "PUT", configured)).status,
    200,
  );

  let n = 0;
  const lead = async () => {
    n++;
    const c = await call(`/public/events/${event.slug}/leads`, "POST", {
      email: `lead${n}@example.com`,
      phone: "+9715012345" + String(n).padStart(2, "0"),
      firstName: "Lead",
      lastName: String(n),
      visitorId: crypto.randomUUID(),
    });
    assert.equal(c.status, 201);
    const q = await call(`/public/events/${event.slug}/qualify`, "POST", {
      token: c.data.token,
      answers: {},
      timezone: "Asia/Dubai",
    });
    assert.equal(q.data.status, "qualified");
    return c.data.token as string;
  };
  const book = (token: string, start: string) =>
    call(`/public/events/${event.slug}/bookings`, "POST", { token, start });
  const hostOf = (start: string) =>
    all("booking", ws)
      .filter((b) => b.start === start && b.status === "confirmed")
      .map((b) => b.hostId);

  // Next Monday, well inside both hosts' default working hours.
  let day = DateTime.now().setZone(event.timezone).plus({ days: 2 });
  while (day.weekday !== 1) day = day.plus({ days: 1 });
  const first = await lead();
  const slots = (
    await call(
      `/public/events/${event.slug}/slots?token=${first}&from=${day.toISODate()}&days=1`,
    )
  ).data.slots.map((s: any) => s.start);
  assert.ok(slots.length >= 8, "both hosts expose the day's slots");

  // Four bookings at four different times: two each, alternating.
  const assigned: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await book(i === 0 ? first : await lead(), slots[i]);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assigned.push(hostOf(slots[i])[0]);
  }
  assert.equal(assigned.filter((h) => h === ownerId).length, 2);
  assert.equal(assigned.filter((h) => h === closerId).length, 2);
  assert.notEqual(assigned[0], assigned[1]);

  // Same time slot: the second prospect goes to the other host, a third finds it full.
  const shared = slots[5];
  assert.equal((await book(await lead(), shared)).status, 201);
  assert.equal((await book(await lead(), shared)).status, 201);
  assert.deepEqual(hostOf(shared).sort(), [ownerId, closerId].sort());
  assert.equal((await book(await lead(), shared)).status, 409);

  // Priority: the first host in the list takes every slot they are free for.
  assert.equal(
    (
      await as("/events/" + event.id, "PUT", {
        ...configured,
        routingMode: "priority",
      })
    ).status,
    200,
  );
  for (const s of [slots[6], slots[7]]) {
    assert.equal((await book(await lead(), s)).status, 201);
    assert.deepEqual(hostOf(s), [ownerId]);
  }
});
