import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.DATABASE_PATH = ":memory:";
process.env.ENCRYPTION_KEY =
  "test-secret-encryption-key-long-enough-1234567890";
process.env.PUBLIC_URL = "http://localhost:4320";
process.env.ADMIN_EMAIL = "owner@example.com";
process.env.ADMIN_PASSWORD = "LocalTestPassword_123456";
process.env.SKOOL_COOKIE_HEADER = "auth_token=test";
const { app, bootstrap, errorHandler } = await import("../server/app.js");
const { setSkoolReader } = await import("../server/skool.js");
const { setOtpMailer } = await import("../server/access.js");
const { db } = await import("../server/db.js");
bootstrap();
app.use(errorHandler);
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = "http://127.0.0.1:" + (server.address() as any).port;
after(() => server.close());

const sent: Record<string, string> = {};
setOtpMailer(async (to, code) => {
  sent[to] = code;
});
const row = (
  email: string,
  interval: string,
  role = "member",
  amount = 99700,
) => ({
  firstName: "Camille",
  lastName: "Durand",
  email: "",
  member: {
    role,
    metadata: {
      mbme: email,
      mmbp: JSON.stringify({
        amount,
        currency: "eur",
        recurring_interval: interval,
      }),
    },
  },
});
let skoolDown = false,
  reads = 0;
setSkoolReader(async (url, cookie) => {
  reads++;
  assert.equal(cookie, "auth_token=test");
  assert.match(url, /\/bizos\/-\/members\?t=active&annual=true&p=1$/);
  if (skoolDown) throw new Error("network");
  const pageProps = {
    currentGroup: { id: "39d0dedbc1694fd8bdfa15ae8930efd2" },
    isAdmin: true,
    tabName: "active",
    annual: true,
    monthly: false,
    total: 4,
    totalPages: 1,
    users: [
      row("Annual@Example.com ", "year"),
      row("monthly@example.com", "month"),
      row("admin@example.com", "year", "admin"),
      row("free@example.com", "year", "member", 0),
    ],
  };
  return `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps } })}</script></html>`;
});

async function post(path: string, body: unknown, cookie = "") {
  const r = await fetch(base + "/api/v1" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie") || "",
  };
}

test("only active paid annual Skool members can request a code", async () => {
  for (const email of [
    "monthly@example.com",
    "admin@example.com",
    "free@example.com",
    "stranger@example.com",
  ]) {
    const r = await post("/auth/code", { email });
    assert.equal(r.status, 403, email);
    assert.match(r.data.error, /abonnement annuel BizOS/);
  }
  assert.equal(sent["monthly@example.com"], undefined);
  const ok = await post("/auth/code", { email: "ANNUAL@example.com" });
  assert.equal(ok.status, 200);
  assert.match(sent["annual@example.com"], /^\d{6}$/);
  const again = await post("/auth/code", { email: "annual@example.com" });
  assert.equal(again.status, 429);
});

test("a valid code creates the account, its workspace and a session; codes are single use", async () => {
  const code = sent["annual@example.com"];
  const wrong = code === "000000" ? "111111" : "000000";
  assert.equal(
    (
      await post("/auth/code/verify", {
        email: "annual@example.com",
        code: wrong,
      })
    ).status,
    401,
  );
  const r = await post("/auth/code/verify", {
    email: "annual@example.com",
    code,
  });
  assert.equal(r.status, 200);
  assert.match(r.cookie, /closeos_session=/);
  const me = await fetch(base + "/api/v1/me", {
    headers: { Cookie: r.cookie.split(";")[0] },
  });
  assert.equal(me.status, 200);
  const profile = await me.json();
  assert.equal(profile.user?.email ?? profile.email, "annual@example.com");
  const u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get("annual@example.com") as any;
  assert.equal(u.name, "Camille Durand");
  assert.ok(db.prepare("SELECT 1 FROM skool_access WHERE userId=?").get(u.id));
  assert.ok(
    db
      .prepare("SELECT 1 FROM memberships WHERE userId=? AND role='owner'")
      .get(u.id),
  );
  assert.equal(
    (await post("/auth/code/verify", { email: "annual@example.com", code }))
      .status,
    401,
  );
});

test("five wrong attempts burn the code", async () => {
  db.prepare("UPDATE otps SET lastSent=? WHERE email=?").run(
    new Date(0).toISOString(),
    "annual@example.com",
  );
  assert.equal(
    (await post("/auth/code", { email: "annual@example.com" })).status,
    200,
  );
  const code = sent["annual@example.com"];
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await post("/auth/code/verify", {
          email: "annual@example.com",
          code: wrong,
        })
      ).status,
      401,
    );
  assert.equal(
    (await post("/auth/code/verify", { email: "annual@example.com", code }))
      .status,
    401,
  );
});

test("the bootstrap owner signs in by code without a Skool subscription", async () => {
  const before = reads;
  const r = await post("/auth/code", { email: "owner@example.com" });
  assert.equal(r.status, 200);
  assert.equal(reads, before);
  const v = await post("/auth/code/verify", {
    email: "owner@example.com",
    code: sent["owner@example.com"],
  });
  assert.equal(v.status, 200);
});

test("Skool unavailability is reported, never treated as eligible", async () => {
  skoolDown = true;
  const { setSkoolReader: reset } = await import("../server/skool.js");
  const failing = async () => {
    throw new Error("network");
  };
  reset(failing);
  const r = await post("/auth/code", { email: "newcomer@example.com" });
  assert.equal(r.status, 503);
  assert.equal(sent["newcomer@example.com"], undefined);
});
