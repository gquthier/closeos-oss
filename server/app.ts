import express, { Request, Response } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z, ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  db,
  all,
  across,
  get,
  put,
  remove,
  now,
  uid,
  bySlug,
  enqueue,
  tx,
  Row,
} from "./db.js";
import {
  hash,
  token,
  passwordHash,
  verifyPassword,
  encrypt,
  decrypt,
  authenticate,
  admin,
  HttpError,
  publicBase,
  publicLead,
  publicBooking,
} from "./security.js";
import { annualMember } from "./skool.js";
import { sendCode, checkCode, sendInviteEmail } from "./access.js";
import { workflowTemplates, templateWorkflow } from "./templates.js";
import { translateError } from "./i18n.js";
import {
  eventSchema,
  availabilitySchema,
  workflowSchema,
  captureSchema,
  attributionSchema,
  defaultAvailability,
  zone,
} from "./schema.js";
import {
  hostsFor,
  slots,
  book,
  validateAnswers,
  matches,
} from "./scheduling.js";
import { bookingJobs, trigger, tick, privateAddress } from "./jobs.js";
import {
  integration,
  oauthConfig,
  callbackUrl,
  providerFetch,
  access,
  ics,
} from "./calendar.js";

export const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: false,
  }),
);
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.headers.origin;
  const allowed = [
    publicBase(),
    process.env.API_URL,
    "http://localhost:4320",
    "http://127.0.0.1:4320",
    "http://localhost:4321",
    "http://127.0.0.1:4321",
  ];
  if (origin && allowed.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Credentials", "true");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Workspace-Id, Idempotency-Key, X-CloseOS-Lang",
    );
    res.set(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
  }
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  if (
    !["GET", "HEAD"].includes(req.method) &&
    origin &&
    !allowed.includes(origin)
  )
    throw new HttpError(403, "Origine non autorisée.");
  if (
    !["GET", "HEAD"].includes(req.method) &&
    !String(req.headers["content-type"] || "")
      .toLowerCase()
      .startsWith("application/json")
  )
    throw new HttpError(415, "Utilisez Content-Type: application/json.");
  next();
});
app.use(express.json({ limit: "256kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const authLimit = rateLimit({
  windowMs: 900000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
app.get("/api/health", (_, res) => {
  db.prepare("SELECT 1").get();
  res.json({ ok: true, version: "1.0.0", time: now() });
});
function must(kind: string, id: any, workspace?: string) {
  const r = get(kind, String(id), workspace);
  if (!r) throw new HttpError(404, "Élément introuvable.");
  return r;
}
function user(id: string) {
  return db
    .prepare("SELECT id,email,name,created FROM users WHERE id=?")
    .get(id) as Row;
}
function memberIds(workspace: string) {
  return (
    db
      .prepare("SELECT userId FROM memberships WHERE workspace=?")
      .all(workspace) as Row[]
  ).map((m) => m.userId);
}
function checkHosts(workspace: string, ids: string[]) {
  if (ids.some((id) => !memberIds(workspace).includes(id)))
    throw new HttpError(422, "Un hôte ne fait pas partie de cet espace.");
}
function createWorkspace(userId: string, name: string) {
  const id = uid();
  put("workspace", id, { name, timezone: "Asia/Dubai", currency: "EUR" }, id);
  db.prepare(
    "INSERT INTO memberships(workspace,userId,role) VALUES(?,?,?)",
  ).run(id, userId, "owner");
  put("availability", id, defaultAvailability(userId));
  put(
    "event",
    id,
    eventSchema.parse({
      name: "Appel découverte",
      slug: "decouverte-" + id.slice(0, 8),
      description:
        "Faisons connaissance. Échangeons sur votre activité, vos objectifs et la meilleure façon de vous accompagner.",
      hostIds: [userId],
      locationType: "phone",
      brandName: name,
    }),
  );
  return id;
}
export function bootstrap() {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (email && password && !db.prepare("SELECT 1 FROM users LIMIT 1").get()) {
    if (password.length < 12)
      throw new Error("ADMIN_PASSWORD must have at least 12 characters");
    tx(() => {
      const id = uid();
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        id,
        email.toLowerCase(),
        process.env.ADMIN_NAME || "Gauthier",
        passwordHash(password),
        now(),
      );
      createWorkspace(id, process.env.WORKSPACE_NAME || "Mon espace");
    });
  }
}
function session(res: Response, id: string) {
  const s = token();
  db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
    hash(s),
    id,
    new Date(Date.now() + 30 * 86400000).toISOString(),
  );
  res.cookie("closeos_session", s, {
    httpOnly: true,
    secure: publicBase().startsWith("https:"),
    sameSite: "lax",
    maxAge: 30 * 86400000,
    path: "/",
  });
}
app.post("/api/v1/auth/login", authLimit, (req, res) => {
  const b = z
    .object({ email: z.email(), password: z.string().min(1).max(256) })
    .parse(req.body);
  const u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(b.email.toLowerCase()) as Row;
  if (!u || !verifyPassword(b.password, u.password))
    throw new HttpError(401, "Email ou mot de passe incorrect.");
  session(res, u.id);
  res.json({ user: user(u.id) });
});
app.post("/api/v1/auth/logout", (req, res) => {
  const s = req.headers.cookie?.match(/(?:^|;\s*)closeos_session=([^;]+)/)?.[1];
  if (s) db.prepare("DELETE FROM sessions WHERE hash=?").run(hash(s));
  res.clearCookie("closeos_session", { path: "/" });
  res.json({ ok: true });
});
// Team invitations. The secret link authorizes joining; the invitee proves the invited
// email with a code (or the password of an existing CloseOS account).
function pendingInvite(secret: unknown) {
  const invite = across("invite").find(
    (i) =>
      i.tokenHash === hash(String(secret || "")) &&
      i.expires > now() &&
      !i.accepted,
  );
  if (!invite) throw new HttpError(410, "Invitation expirée ou déjà utilisée.");
  return invite;
}
app.get("/api/v1/auth/invite/:token", authLimit, (req, res) => {
  const invite = pendingInvite(req.params.token);
  res.json({
    email: invite.email,
    role: invite.role,
    workspace: get("workspace", invite.workspace)?.name || "",
    hasAccount: !!db
      .prepare("SELECT 1 FROM users WHERE email=?")
      .get(invite.email),
  });
});
app.post("/api/v1/auth/invite/code", authLimit, async (req, res) => {
  const invite = pendingInvite(
    z.object({ token: z.string().min(20) }).parse(req.body).token,
  );
  await sendCode(invite.email);
  res.json({ email: invite.email });
});
app.post("/api/v1/auth/accept-invite", authLimit, (req, res) => {
  const b = z
    .object({
      token: z.string().min(20),
      name: z.string().trim().min(1).max(100).optional(),
      password: z.string().min(12).max(256).optional(),
      code: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    })
    .refine((v) => v.code || v.password, "Code ou mot de passe requis.")
    .parse(req.body);
  const invite = pendingInvite(b.token);
  let u = db
    .prepare("SELECT * FROM users WHERE email=?")
    .get(invite.email) as Row;
  if (!u && !b.name) throw new HttpError(422, "Indiquez votre nom.");
  if (b.code) checkCode(invite.email, b.code);
  else if (u && !verifyPassword(b.password!, u.password))
    throw new HttpError(401, "Utilisez votre mot de passe CloseOS existant.");
  tx(() => {
    if (!u) {
      u = { id: uid(), email: invite.email };
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        u.id,
        u.email,
        b.name!,
        passwordHash(b.password || token()),
        now(),
      );
    }
    db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)").run(
      invite.workspace,
      u.id,
      invite.role,
    );
    if (!all("availability", invite.workspace).some((a) => a.userId === u.id))
      put("availability", invite.workspace, defaultAvailability(u.id));
    put("invite", invite.workspace, { ...invite, accepted: now() }, invite.id);
  });
  session(res, u!.id);
  res.json({ ok: true, workspace: invite.workspace });
});

// Sign-in by emailed code. Self-service access is reserved to active, paid, annual
// BizOS Skool members; accounts created by bootstrap or invitation, and members of
// someone else's team, are not gated.
const NOT_ELIGIBLE =
  "Cet email n’est associé à aucun abonnement annuel BizOS actif. Utilisez l’email de votre compte Skool.";
async function accessFor(email: string) {
  const u = db.prepare("SELECT * FROM users WHERE email=?").get(email) as
    Row | undefined;
  const gated =
    !u ||
    (!!db.prepare("SELECT 1 FROM skool_access WHERE userId=?").get(u.id) &&
      !db
        .prepare("SELECT 1 FROM memberships WHERE userId=? AND role<>'owner'")
        .get(u.id));
  if (!gated) return { user: u, member: null };
  const member = await annualMember(email);
  if (!member) throw new HttpError(403, NOT_ELIGIBLE);
  return { user: u, member };
}
const codeEmail = z
  .email()
  .max(254)
  .transform((e) => e.trim().toLowerCase());
app.post("/api/v1/auth/code", authLimit, async (req, res) => {
  const { email } = z.object({ email: codeEmail }).parse(req.body);
  await accessFor(email);
  await sendCode(email);
  res.json({ ok: true });
});
app.post("/api/v1/auth/code/verify", authLimit, async (req, res) => {
  const b = z
    .object({ email: codeEmail, code: z.string().regex(/^\d{6}$/) })
    .parse(req.body);
  checkCode(b.email, b.code);
  const { user: existing, member } = await accessFor(b.email);
  let id = existing?.id as string | undefined;
  tx(() => {
    if (!id) {
      id = uid();
      const name =
        [member?.firstName, member?.lastName].filter(Boolean).join(" ") ||
        b.email.split("@")[0];
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        id,
        b.email,
        name,
        passwordHash(token()),
        now(),
      );
      createWorkspace(id, name);
    }
    if (member)
      db.prepare(
        "INSERT INTO skool_access VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET verifiedAt=excluded.verifiedAt",
      ).run(id, b.email, now());
  });
  session(res, id!);
  res.json({ user: user(id!) });
});

// Public scheduler. The opaque lead token is required to read or change a partial submission.
app.get("/api/v1/public/events/:slug", (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e || !e.active)
    throw new HttpError(404, "Cet événement est indisponible.");
  const { disqualify, routing, hostIds, notifications, ...safe } = e;
  res.json({
    event: safe,
    hosts: hostIds.map((id: string) => ({ id, name: user(id)?.name })),
    workspace: get("workspace", e.workspace)?.name,
  });
});
app.post("/api/v1/public/events/:slug/visits", (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e?.active) throw new HttpError(404, "Événement indisponible.");
  const b = z
    .object({
      visitorId: z.string().min(10).max(100),
      attribution: attributionSchema.default({}),
    })
    .parse(req.body);
  const existing = all("visit", e.workspace).find(
    (v) => v.eventId === e.id && v.visitorId === b.visitorId,
  );
  if (!existing) put("visit", e.workspace, { eventId: e.id, ...b });
  res.json({ ok: true });
});
app.post("/api/v1/public/events/:slug/leads", (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e?.active) throw new HttpError(404, "Événement indisponible.");
  const b = captureSchema.parse(req.body);
  if (b.website) throw new HttpError(422, "Formulaire invalide.");
  const previous = b.token
    ? all("lead", e.workspace).find(
        (l) => l.eventId === e.id && l.tokenHash === hash(b.token!),
      )
    : null;
  if (b.token && !previous)
    throw new HttpError(403, "Session de formulaire invalide.");
  if (previous?.status === "booked")
    throw new HttpError(409, "Ce formulaire a déjà abouti à un rendez-vous.");
  const secret = b.token || token();
  const lead = put(
    "lead",
    e.workspace,
    {
      ...previous,
      eventId: e.id,
      email: b.email.toLowerCase(),
      phone: b.phone,
      firstName: b.firstName,
      lastName: b.lastName,
      visitorId: b.visitorId,
      tokenHash: hash(secret),
      status: "potential",
      answers: previous?.answers || {},
      firstTouch: previous?.firstTouch || b.attribution,
      lastTouch: b.attribution,
      smsConsent: b.smsConsent,
      consentAt: b.smsConsent ? now() : null,
      notes: previous?.notes || "",
      tags: previous?.tags || [],
    },
    previous?.id,
  );
  trigger(e.workspace, previous ? "lead.updated" : "lead.captured", lead, e);
  res
    .status(previous ? 200 : 201)
    .json({ token: secret, id: lead.id, status: lead.status });
});
function leadByToken(e: Row, t: any) {
  const l = all("lead", e.workspace).find(
    (l) => l.eventId === e.id && l.tokenHash === hash(String(t || "")),
  );
  if (!l) throw new HttpError(403, "Session de formulaire invalide.");
  return l;
}
app.post("/api/v1/public/events/:slug/qualify", (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e?.active) throw new HttpError(404, "Événement indisponible.");
  const b = z
    .object({
      token: z.string(),
      answers: z.record(z.string(), z.unknown()),
      timezone: zone,
    })
    .parse(req.body);
  const lead = leadByToken(e, b.token);
  if (lead.status === "booked")
    throw new HttpError(409, "Ce prospect a déjà réservé.");
  if (!lead.firstName.trim() || !lead.lastName.trim())
    throw new HttpError(422, "Prénom et nom requis.");
  if (e.primaryContact !== "phone" && !lead.email)
    throw new HttpError(422, "Email requis.");
  if (e.primaryContact !== "email" && !/^\+[1-9]\d{6,14}$/.test(lead.phone))
    throw new HttpError(422, "Téléphone international requis.");
  const next = {
    ...lead,
    answers: validateAnswers(e, b.answers),
    timezone: b.timezone,
  };
  const disqualified = e.disqualify.some((r: Row) => matches(r, next));
  const updated = put(
    "lead",
    e.workspace,
    {
      ...next,
      status: disqualified ? "disqualified" : "qualified",
      qualifiedAt: now(),
    },
    lead.id,
  );
  if (lead.status !== updated.status)
    trigger(e.workspace, "lead." + updated.status, updated, e);
  res.json({
    status: updated.status,
    message: disqualified ? e.disqualifyMessage : null,
    redirectUrl: disqualified ? e.disqualifyRedirect : null,
  });
});
app.get("/api/v1/public/events/:slug/slots", async (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e?.active) throw new HttpError(404, "Événement indisponible.");
  const lead = leadByToken(e, req.query.token);
  if (!["qualified", "booked"].includes(lead.status))
    throw new HttpError(
      403,
      "Terminez la qualification pour accéder aux créneaux.",
    );
  const from = z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .parse(req.query.from),
    days = z.coerce
      .number()
      .int()
      .min(1)
      .max(31)
      .default(7)
      .parse(req.query.days);
  const result = await slots(e, lead, from, days);
  res.json({
    slots: result.slots.map(({ start, end }) => ({ start, end })),
    timezone: e.timezone,
  });
});
app.post("/api/v1/public/events/:slug/bookings", async (req, res) => {
  const e = bySlug(String(req.params.slug));
  if (!e?.active) throw new HttpError(404, "Événement indisponible.");
  const b = z
    .object({ token: z.string(), start: z.iso.datetime({ offset: true }) })
    .parse(req.body);
  const lead = leadByToken(e, b.token);
  const key = req.headers["idempotency-key"];
  if (key && typeof key !== "string")
    throw new HttpError(400, "Clé d’idempotence invalide");
  const fingerprint = hash(JSON.stringify(b));
  if (key) {
    const existing = db
      .prepare("SELECT * FROM idempotency WHERE workspace=? AND key=?")
      .get(e.workspace, key) as Row;
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new HttpError(
          409,
          "Clé d’idempotence déjà utilisée avec une autre demande.",
        );
      res.json(JSON.parse(existing.response));
      return;
    }
  }
  const booking = await book(e, lead, b.start, undefined, (next) =>
    bookingJobs(next, e, lead),
  );
  const response = {
    booking: publicBooking(booking),
    manageUrl: `${publicBase()}/manage/${booking.manageToken}`,
  };
  if (key)
    db.prepare("INSERT OR IGNORE INTO idempotency VALUES(?,?,?,?,?)").run(
      e.workspace,
      key,
      fingerprint,
      JSON.stringify(response),
      now(),
    );
  res.status(201).json(response);
});
function managed(t: string) {
  const b = across("booking").find((b) => b.tokenHash === hash(t));
  if (!b) throw new HttpError(404, "Rendez-vous introuvable.");
  return b;
}
app.get("/api/v1/public/bookings/:token", (req, res) => {
  const b = managed(String(req.params.token)),
    e = must("event", b.eventId),
    l = must("lead", b.leadId);
  res.json({
    booking: publicBooking(b),
    event: {
      name: e.name,
      slug: e.slug,
      duration: e.duration,
      color: e.color,
      confirmationMessage: e.confirmationMessage,
      timezone: e.timezone,
      location: e.location,
      active: e.active,
    },
    lead: { firstName: l.firstName, lastName: l.lastName, email: l.email },
    host: user(b.hostId),
  });
});
app.get("/api/v1/public/bookings/:token/calendar.ics", (req, res) => {
  const b = managed(String(req.params.token));
  res
    .type("text/calendar")
    .set("Content-Disposition", 'attachment; filename="invitation.ics"')
    .send(
      ics(b, must("event", b.eventId), must("lead", b.leadId), user(b.hostId)),
    );
});
app.get("/api/v1/public/bookings/:token/slots", async (req, res) => {
  const b = managed(String(req.params.token));
  if (b.status === "cancelled") throw new HttpError(422, "Rendez-vous annulé.");
  const e = must("event", b.eventId);
  const from = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(req.query.from);
  const result = await slots(e, must("lead", b.leadId), from, 31, b.id);
  res.json({ slots: result.slots.map(({ start, end }) => ({ start, end })) });
});
function cancel(b: Row, reason: string) {
  if (b.status === "cancelled") return b;
  const updated = tx(() => {
    const next = put(
      "booking",
      b.workspace,
      {
        ...b,
        status: "cancelled",
        reason,
        version: b.version + 1,
        calendarStatus: "pending",
      },
      b.id,
    );
    db.prepare(
      "UPDATE jobs SET status='cancelled',updated=? WHERE workspace=? AND json_extract(payload,'$.bookingId')=? AND status IN ('pending','retry','blocked')",
    ).run(now(), b.workspace, b.id);
    const lead = must("lead", b.leadId);
    put("lead", b.workspace, { ...lead, status: "qualified" }, lead.id);
    bookingJobs(
      next,
      must("event", b.eventId),
      must("lead", b.leadId),
      "booking.cancelled",
    );
    return next;
  });
  return updated;
}
app.post("/api/v1/public/bookings/:token/cancel", (req, res) => {
  const b = managed(String(req.params.token));
  res.json({
    booking: publicBooking(
      cancel(b, z.string().max(1000).default("").parse(req.body.reason)),
    ),
  });
});
app.post("/api/v1/public/bookings/:token/reschedule", async (req, res) => {
  const old = managed(String(req.params.token));
  if (old.status !== "confirmed")
    throw new HttpError(422, "Ce rendez-vous ne peut plus être reporté.");
  const e = must("event", old.eventId),
    l = must("lead", old.leadId);
  const b = await book(
    e,
    l,
    z.iso.datetime({ offset: true }).parse(req.body.start),
    old,
    (next) => bookingJobs(next, e, l, "booking.rescheduled"),
  );
  res.json({ booking: publicBooking(b) });
});

// OAuth callbacks use single-use, expiring state bound to a workspace and user.
app.get("/api/v1/oauth/:provider/callback", async (req, res) => {
  const provider = z.enum(["google", "microsoft"]).parse(req.params.provider);
  const state = across("oauth").find(
    (s) =>
      s.tokenHash === hash(String(req.query.state || "")) &&
      s.provider === provider &&
      s.expires > now(),
  );
  if (!state)
    throw new HttpError(
      400,
      "Session OAuth expirée. Recommencez la connexion.",
    );
  remove("oauth", state.id, state.workspace);
  if (req.query.error) {
    res.redirect(publicBase() + "/app/calendars?error=authorization_refused");
    return;
  }
  const c = oauthConfig(state.workspace, provider);
  const url =
    provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const t = await providerFetch(url, {
    method: "POST",
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code: String(req.query.code),
      grant_type: "authorization_code",
      redirect_uri: callbackUrl(provider),
    }),
  });
  const profile = await providerFetch(
    provider === "google"
      ? "https://www.googleapis.com/oauth2/v2/userinfo"
      : "https://graph.microsoft.com/v1.0/me",
    { headers: { Authorization: `Bearer ${t.access_token}` } },
  );
  const email = profile.email || profile.mail || profile.userPrincipalName;
  const existing = all("calendar", state.workspace).find(
    (x) =>
      x.provider === provider && x.userId === state.userId && x.email === email,
  );
  const refresh =
    t.refresh_token ||
    (existing ? decrypt(existing.secret).refreshToken : null);
  if (!refresh)
    throw new HttpError(
      422,
      "Autorisez l’accès hors ligne à votre calendrier.",
    );
  for (const other of all("calendar", state.workspace).filter(
    (c) => c.userId === state.userId && c.id !== existing?.id,
  )) {
    put(
      "calendar",
      state.workspace,
      { ...other, writeEvents: false },
      other.id,
    );
  }
  put(
    "calendar",
    state.workspace,
    {
      provider,
      email,
      userId: state.userId,
      calendarId: "primary",
      checkConflicts: true,
      writeEvents: true,
      secret: encrypt({
        accessToken: t.access_token,
        refreshToken: refresh,
        expiresAt: Date.now() + t.expires_in * 1000,
      }),
    },
    existing?.id,
  );
  res.redirect(publicBase() + "/app/calendars?connected=1");
});

const api = express.Router();
app.use("/api/v1", api);
api.use((req, res, next) =>
  req.method === "GET" && req.path === "/openapi.json"
    ? next()
    : authenticate(req, res, next),
);
api.get("/me", (req, res) => {
  const memberships = db
    .prepare("SELECT workspace,role FROM memberships WHERE userId=?")
    .all(req.auth.userId) as Row[];
  res.json({
    user: user(req.auth.userId),
    workspace: must("workspace", req.auth.workspace),
    role: req.auth.role,
    workspaces: memberships.map((m) => ({
      ...get("workspace", m.workspace),
      role: m.role,
    })),
  });
});
api.patch("/me", (req, res) => {
  const b = z
    .object({
      name: z.string().min(1).max(100).optional(),
      currentPassword: z.string().max(256).optional(),
      password: z.string().min(12).max(256).optional(),
    })
    .parse(req.body);
  if (b.password) {
    const u = db
      .prepare("SELECT password FROM users WHERE id=?")
      .get(req.auth.userId) as Row;
    if (!b.currentPassword || !verifyPassword(b.currentPassword, u.password))
      throw new HttpError(401, "Mot de passe actuel incorrect.");
    db.prepare("UPDATE users SET password=? WHERE id=?").run(
      passwordHash(b.password),
      req.auth.userId,
    );
    db.prepare("DELETE FROM sessions WHERE userId=?").run(req.auth.userId);
    session(res, req.auth.userId);
  }
  if (b.name)
    db.prepare("UPDATE users SET name=? WHERE id=?").run(
      b.name,
      req.auth.userId,
    );
  res.json({ user: user(req.auth.userId) });
});
api.post("/workspaces", (req, res) => {
  const name = z.string().min(1).max(100).parse(req.body.name);
  const workspace = tx(() => createWorkspace(req.auth.userId, name));
  res.status(201).json({ workspace: get("workspace", workspace) });
});
api.patch("/workspace", (req, res) => {
  admin(req);
  const b = z
    .object({
      name: z.string().min(1).max(100),
      timezone: zone,
      currency: z.enum(["EUR", "USD", "GBP", "AED", "CAD", "CHF"]),
    })
    .parse(req.body);
  res.json({
    workspace: put("workspace", req.auth.workspace, b, req.auth.workspace),
  });
});
api.get("/events", (req, res) =>
  res.json({ events: all("event", req.auth.workspace) }),
);
api.post("/events", (req, res) => {
  admin(req);
  const b = eventSchema.parse(req.body);
  checkHosts(req.auth.workspace, b.hostIds);
  for (const r of b.routing) checkHosts(req.auth.workspace, r.hostIds);
  res.status(201).json({ event: put("event", req.auth.workspace, b) });
});
api.get("/events/:id", (req, res) =>
  res.json({ event: must("event", req.params.id, req.auth.workspace) }),
);
api.put("/events/:id", (req, res) => {
  admin(req);
  const old = must("event", req.params.id, req.auth.workspace),
    b = eventSchema.parse(req.body);
  checkHosts(req.auth.workspace, b.hostIds);
  for (const r of b.routing) checkHosts(req.auth.workspace, r.hostIds);
  res.json({ event: put("event", req.auth.workspace, b, old.id) });
});
api.post("/events/:id/duplicate", (req, res) => {
  admin(req);
  const e = must("event", req.params.id, req.auth.workspace);
  res.status(201).json({
    event: put("event", req.auth.workspace, {
      ...e,
      name: e.name + " (copie)",
      slug: e.slug.slice(0, 85) + "-" + uid().slice(0, 6),
      active: false,
    }),
  });
});
api.delete("/events/:id", (req, res) => {
  admin(req);
  const e = must("event", req.params.id, req.auth.workspace);
  if (all("booking", req.auth.workspace).some((b) => b.eventId === e.id)) {
    put("event", req.auth.workspace, { ...e, active: false }, e.id);
    res.json({ archived: true });
  } else {
    remove("event", e.id, req.auth.workspace);
    res.json({ deleted: true });
  }
});
api.get("/availability", (req, res) =>
  res.json({ schedules: all("availability", req.auth.workspace) }),
);
api.put("/availability/:userId", (req, res) => {
  const userId = String(req.params.userId);
  if (userId !== req.auth.userId) admin(req);
  checkHosts(req.auth.workspace, [userId]);
  const b = availabilitySchema.parse({ ...req.body, userId });
  const old = all("availability", req.auth.workspace).find(
    (a) => a.userId === userId,
  );
  res.json({ schedule: put("availability", req.auth.workspace, b, old?.id) });
});
api.get("/leads", (req, res) => {
  let leads = all("lead", req.auth.workspace);
  if (req.query.status)
    leads = leads.filter((l) => l.status === req.query.status);
  if (req.query.eventId)
    leads = leads.filter((l) => l.eventId === req.query.eventId);
  if (req.query.q) {
    const q = String(req.query.q).toLowerCase();
    leads = leads.filter((l) =>
      [l.firstName, l.lastName, l.email, l.phone]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }
  const offset = Math.max(0, Number(req.query.offset) || 0),
    limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
  res.json({
    leads: leads.slice(offset, offset + limit).map(publicLead),
    total: leads.length,
  });
});
api.patch("/leads/:id", (req, res) => {
  const l = must("lead", req.params.id, req.auth.workspace);
  const b = z
    .object({
      notes: z.string().max(20000).optional(),
      tags: z.array(z.string().max(100)).max(100).optional(),
      stage: z.string().max(100).optional(),
      status: z
        .enum([
          "potential",
          "qualified",
          "disqualified",
          "booked",
          "won",
          "lost",
        ])
        .optional(),
      smsConsent: z.literal(false).optional(),
    })
    .parse(req.body);
  const next = put("lead", req.auth.workspace, { ...l, ...b }, l.id);
  res.json({ lead: publicLead(next) });
});
api.delete("/leads/:id", (req, res) => {
  admin(req);
  const l = must("lead", req.params.id, req.auth.workspace);
  if (
    db
      .prepare(
        "SELECT id FROM jobs WHERE workspace=? AND kind='calendar_cleanup' AND json_extract(payload,'$.leadId')=? AND status NOT IN ('sent','skipped','cancelled') LIMIT 1",
      )
      .get(req.auth.workspace, l.id)
  )
    throw new HttpError(
      409,
      "Une annulation de calendrier reste à synchroniser pour ce contact. Consultez le journal d’envoi.",
    );
  if (
    all("booking", req.auth.workspace).some(
      (b) =>
        b.leadId === l.id &&
        b.status === "cancelled" &&
        (b.externalEventId ||
          b.calendarConnectionId ||
          all("calendar", req.auth.workspace).some(
            (c) => c.userId === b.hostId && c.writeEvents !== false,
          )) &&
        b.calendarStatus !== "synced",
    )
  )
    throw new HttpError(
      409,
      "Attendez la synchronisation de l’annulation dans le calendrier avant de supprimer ce contact.",
    );
  if (
    all("booking", req.auth.workspace).some(
      (b) => b.leadId === l.id && b.status === "confirmed" && b.start > now(),
    )
  )
    throw new HttpError(
      409,
      "Annulez les rendez-vous à venir avant de supprimer ce contact.",
    );
  db.prepare(
    "DELETE FROM jobs WHERE workspace=? AND (json_extract(payload,'$.leadId')=? OR json_extract(payload,'$.body.data.lead.id')=?)",
  ).run(req.auth.workspace, l.id, l.id);
  for (const v of all("visit", req.auth.workspace).filter(
    (v) => v.visitorId === l.visitorId,
  ))
    remove("visit", v.id, req.auth.workspace);
  for (const b of all("booking", req.auth.workspace).filter(
    (b) => b.leadId === l.id,
  )) {
    db.prepare(
      "DELETE FROM jobs WHERE workspace=? AND json_extract(payload,'$.bookingId')=?",
    ).run(req.auth.workspace, b.id);
    remove("booking", b.id, req.auth.workspace);
  }
  remove("lead", l.id, req.auth.workspace);
  res.json({ deleted: true });
});
api.get("/leads/export.csv", (req, res) => {
  const fields = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "status",
    "createdAt",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "referrer",
    "landingPage",
  ];
  const cell = (v: any) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const rows = all("lead", req.auth.workspace).map((l) =>
    fields.map((f) => cell(l[f] ?? l.firstTouch?.[f])).join(","),
  );
  res
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="closeos-leads.csv"')
    .send("\ufeff" + fields.join(",") + "\r\n" + rows.join("\r\n"));
});
api.get("/bookings", (req, res) =>
  res.json({
    bookings: all("booking", req.auth.workspace).map((b) => ({
      ...publicBooking(b),
      lead: publicLead(must("lead", b.leadId)),
      event: must("event", b.eventId).name,
      host: user(b.hostId),
    })),
  }),
);
api.post("/bookings/:id/cancel", (req, res) => {
  const b = must("booking", req.params.id, req.auth.workspace);
  if (req.auth.role === "member" && b.hostId !== req.auth.userId)
    throw new HttpError(403, "Vous ne gérez pas ce rendez-vous.");
  res.json({
    booking: publicBooking(
      cancel(b, z.string().max(1000).default("").parse(req.body.reason)),
    ),
  });
});
api.patch("/bookings/:id/outcome", (req, res) => {
  const b = must("booking", req.params.id, req.auth.workspace);
  if (req.auth.role === "member" && b.hostId !== req.auth.userId)
    throw new HttpError(403, "Vous ne gérez pas ce rendez-vous.");
  const outcome = z
    .object({
      result: z.enum([
        "sale",
        "no_sale",
        "no_show",
        "follow_up",
        "unqualified",
      ]),
      value: z.number().min(0).max(1e10).default(0),
      currency: z.string().length(3).default("EUR"),
      notes: z.string().max(10000).default(""),
    })
    .parse(req.body);
  res.json({
    booking: put("booking", req.auth.workspace, { ...b, outcome }, b.id),
  });
});
// Messages leave through the workspace's own providers: an automation can only be
// active once the API of each of its channels is connected (drafts can be saved).
function channels(workspace: string) {
  const resend = integration(workspace, "resend"),
    twilio = integration(workspace, "twilio"),
    brevo = integration(workspace, "brevo");
  return {
    email: {
      connected: !!(resend?.apiKey && resend?.from),
      from: resend?.from || "",
    },
    sms: {
      connected: !!((twilio?.accountSid && twilio?.authToken) || brevo?.apiKey),
    },
  };
}
function checkChannels(workspace: string, wf: Row) {
  if (!wf.enabled) return;
  const c = channels(workspace);
  if (wf.actions.some((a: Row) => a.channel === "email") && !c.email.connected)
    throw new HttpError(
      409,
      "Connectez votre API email (Resend) dans Intégrations avant d’activer cette automatisation.",
    );
  if (wf.actions.some((a: Row) => a.channel === "sms") && !c.sms.connected)
    throw new HttpError(
      409,
      "Connectez votre API SMS (Twilio ou Brevo) dans Intégrations avant d’activer cette automatisation.",
    );
}
api.get("/workflows", (req, res) =>
  res.json({
    workflows: all("workflow", req.auth.workspace),
    channels: channels(req.auth.workspace),
  }),
);
api.get("/workflows/templates", (req, res) =>
  res.json({
    templates: workflowTemplates,
    channels: channels(req.auth.workspace),
  }),
);
api.post("/workflows/templates/:id", (req, res) => {
  admin(req);
  const t = workflowTemplates.find((x) => x.id === req.params.id);
  if (!t) throw new HttpError(404, "Modèle introuvable.");
  const { eventIds } = z
    .object({ eventIds: z.array(z.string()).default([]) })
    .parse(req.body || {});
  for (const id of eventIds) must("event", id, req.auth.workspace);
  const wf = workflowSchema.parse(templateWorkflow(t, eventIds));
  checkChannels(req.auth.workspace, wf);
  res.status(201).json({ workflow: put("workflow", req.auth.workspace, wf) });
});
api.post("/workflows", (req, res) => {
  admin(req);
  const b = workflowSchema.parse(req.body);
  for (const id of b.eventIds) must("event", id, req.auth.workspace);
  checkChannels(req.auth.workspace, b);
  res.status(201).json({ workflow: put("workflow", req.auth.workspace, b) });
});
api.put("/workflows/:id", (req, res) => {
  admin(req);
  const old = must("workflow", req.params.id, req.auth.workspace);
  const b = workflowSchema.parse(req.body);
  for (const id of b.eventIds) must("event", id, req.auth.workspace);
  checkChannels(req.auth.workspace, b);
  res.json({ workflow: put("workflow", req.auth.workspace, b, old.id) });
});
api.delete("/workflows/:id", (req, res) => {
  admin(req);
  remove("workflow", String(req.params.id), req.auth.workspace);
  res.json({ deleted: true });
});
api.get("/team", (req, res) => {
  const members = db
    .prepare(
      "SELECT u.id,u.email,u.name,m.role FROM users u JOIN memberships m ON m.userId=u.id WHERE m.workspace=?",
    )
    .all(req.auth.workspace);
  res.json({
    members,
    invites: all("invite", req.auth.workspace).map(({ tokenHash, ...i }) => i),
  });
});
api.post("/team/invites", async (req, res) => {
  admin(req);
  const b = z
    .object({ email: z.email(), role: z.enum(["admin", "member", "viewer"]) })
    .parse(req.body);
  if (req.auth.role !== "owner" && b.role === "admin")
    throw new HttpError(
      403,
      "Seul le propriétaire peut ajouter un administrateur.",
    );
  const secret = token(),
    email = b.email.toLowerCase();
  if (
    db
      .prepare(
        "SELECT 1 FROM memberships m JOIN users u ON u.id=m.userId WHERE m.workspace=? AND u.email=?",
      )
      .get(req.auth.workspace, email)
  )
    throw new HttpError(409, "Cette personne fait déjà partie de l’équipe.");
  for (const old of all("invite", req.auth.workspace))
    if (old.email === email && !old.accepted)
      remove("invite", old.id, req.auth.workspace);
  put("invite", req.auth.workspace, {
    ...b,
    email,
    tokenHash: hash(secret),
    expires: new Date(Date.now() + 7 * 86400000).toISOString(),
    accepted: null,
  });
  const url = `${publicBase()}/invite/${secret}`;
  const inviter = user(req.auth.userId)?.name || "Votre équipe";
  const emailed = await sendInviteEmail(
    email,
    url,
    get("workspace", req.auth.workspace)?.name || "CloseOS",
    inviter,
  )
    .then(() => true)
    .catch((e) => {
      console.error("[invite]", (e as Error).message);
      return false;
    });
  res.status(201).json({ url, expiresInDays: 7, emailed });
});
api.patch("/team/:id", (req, res) => {
  admin(req);
  const role = z.enum(["admin", "member", "viewer"]).parse(req.body.role);
  const target = db
    .prepare("SELECT role FROM memberships WHERE workspace=? AND userId=?")
    .get(req.auth.workspace, String(req.params.id)) as Row;
  if (!target) throw new HttpError(404, "Membre introuvable.");
  if (target.role === "owner" || req.auth.role !== "owner")
    throw new HttpError(403, "Seul le propriétaire peut modifier les rôles.");
  db.prepare(
    "UPDATE memberships SET role=? WHERE workspace=? AND userId=?",
  ).run(role, req.auth.workspace, String(req.params.id));
  res.json({ ok: true });
});
api.delete("/team/:id", (req, res) => {
  admin(req);
  const id = String(req.params.id),
    m = db
      .prepare("SELECT role FROM memberships WHERE workspace=? AND userId=?")
      .get(req.auth.workspace, id) as Row;
  if (!m) throw new HttpError(404, "Membre introuvable.");
  if (m.role === "owner" || (m.role === "admin" && req.auth.role !== "owner"))
    throw new HttpError(403, "Suppression interdite.");
  if (
    all("event", req.auth.workspace).some((e) => e.hostIds.includes(id)) ||
    all("booking", req.auth.workspace).some(
      (b) => b.hostId === id && b.status === "confirmed" && b.start > now(),
    )
  )
    throw new HttpError(
      409,
      "Retirez ce membre des événements et réaffectez ses rendez-vous avant de le supprimer.",
    );
  db.prepare("DELETE FROM memberships WHERE workspace=? AND userId=?").run(
    req.auth.workspace,
    id,
  );
  db.prepare("DELETE FROM api_keys WHERE workspace=? AND userId=?").run(
    req.auth.workspace,
    id,
  );
  for (const c of all("calendar", req.auth.workspace).filter(
    (c) => c.userId === id,
  ))
    remove("calendar", c.id, req.auth.workspace);
  res.json({ deleted: true });
});
const integrationSchemas: Record<string, z.ZodType> = {
  resend: z.object({
    apiKey: z.string().min(8).max(500),
    from: z.string().min(5).max(200),
    replyTo: z.union([z.email(), z.literal("")]).optional(),
  }),
  twilio: z.object({
    accountSid: z.string().regex(/^AC[0-9a-f]{32}$/i),
    authToken: z.string().min(10).max(500),
    from: z.string().regex(/^\+[1-9]\d{6,14}$/),
  }),
  brevo: z.object({
    apiKey: z.string().min(10).max(500),
    sender: z.string().min(1).max(11),
  }),
  google: z.object({
    clientId: z.string().min(10).max(500),
    clientSecret: z.string().min(10).max(500),
  }),
  microsoft: z.object({
    clientId: z.string().min(10).max(500),
    clientSecret: z.string().min(10).max(500),
  }),
};
api.get("/integrations", (req, res) => {
  admin(req);
  res.json({
    integrations: all("integration", req.auth.workspace).map((i) => {
      const c = decrypt(i.secret);
      return {
        provider: i.provider,
        configured: true,
        updatedAt: i.updatedAt,
        from: c.from || c.sender || "",
        replyTo: c.replyTo || "",
        clientId: c.clientId || "",
        callbackUrl: ["google", "microsoft"].includes(i.provider)
          ? callbackUrl(i.provider)
          : null,
      };
    }),
  });
});
api.put("/integrations/:provider", (req, res) => {
  admin(req);
  const provider = String(req.params.provider),
    schema = integrationSchemas[provider];
  if (!schema) throw new HttpError(400, "Fournisseur inconnu.");
  const old = all("integration", req.auth.workspace).find(
    (i) => i.provider === provider,
  );
  const oldSecret = old ? decrypt(old.secret) : {};
  const merged = {
    ...oldSecret,
    ...Object.fromEntries(
      Object.entries(req.body).filter(([_, v]) => v !== ""),
    ),
  };
  const config = schema.parse(merged);
  put(
    "integration",
    req.auth.workspace,
    { provider, secret: encrypt(config) },
    old?.id,
  );
  db.prepare(
    "UPDATE jobs SET status='pending',due=?,error=NULL,updated=? WHERE workspace=? AND status='blocked'",
  ).run(now(), now(), req.auth.workspace);
  res.json({ configured: true });
});
api.delete("/integrations/:provider", (req, res) => {
  admin(req);
  const old = all("integration", req.auth.workspace).find(
    (i) => i.provider === req.params.provider,
  );
  if (old) remove("integration", old.id, req.auth.workspace);
  res.json({ deleted: true });
});
api.get("/calendars", (req, res) =>
  res.json({
    calendars: all("calendar", req.auth.workspace).map(({ secret, ...c }) => c),
    configured: ["google", "microsoft"].filter(
      (p) => !!integration(req.auth.workspace, p),
    ),
    callbacks: {
      google: callbackUrl("google"),
      microsoft: callbackUrl("microsoft"),
    },
  }),
);
api.post("/calendars/connect/:provider", (req, res) => {
  const provider = z.enum(["google", "microsoft"]).parse(req.params.provider);
  const c = oauthConfig(req.auth.workspace, provider);
  const state = token();
  put("oauth", req.auth.workspace, {
    provider,
    userId: req.auth.userId,
    tokenHash: hash(state),
    expires: new Date(Date.now() + 600000).toISOString(),
  });
  const params = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    state,
    scope:
      provider === "google"
        ? "openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
        : "offline_access User.Read Calendars.ReadWrite",
    ...(provider === "google"
      ? { access_type: "offline", prompt: "consent" }
      : {}),
  });
  res.json({
    url:
      (provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth?"
        : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?") +
      params,
  });
});
api.get("/calendars/:id/list", async (req, res) => {
  const c = must("calendar", req.params.id, req.auth.workspace);
  if (c.userId !== req.auth.userId) admin(req);
  const t = await access(c);
  const data = await providerFetch(
    c.provider === "google"
      ? "https://www.googleapis.com/calendar/v3/users/me/calendarList"
      : "https://graph.microsoft.com/v1.0/me/calendars",
    { headers: { Authorization: `Bearer ${t}` } },
  );
  res.json({
    calendars:
      c.provider === "google"
        ? data.items.map((i: Row) => ({ id: i.id, name: i.summary }))
        : data.value.map((i: Row) => ({ id: i.id, name: i.name })),
  });
});
api.patch("/calendars/:id", (req, res) => {
  const c = must("calendar", req.params.id, req.auth.workspace);
  if (c.userId !== req.auth.userId) admin(req);
  const b = z
    .object({
      calendarId: z.string().max(500).optional(),
      conflictCalendarIds: z.array(z.string().max(500)).max(50).optional(),
      checkConflicts: z.boolean().optional(),
      writeEvents: z.boolean().optional(),
    })
    .parse(req.body);
  if (b.writeEvents)
    for (const other of all("calendar", req.auth.workspace).filter(
      (x) => x.userId === c.userId && x.id !== c.id,
    )) {
      put(
        "calendar",
        req.auth.workspace,
        { ...other, writeEvents: false },
        other.id,
      );
    }
  const { secret, ...next } = put(
    "calendar",
    req.auth.workspace,
    { ...c, ...b },
    c.id,
  );
  res.json({ calendar: next });
});
api.delete("/calendars/:id", (req, res) => {
  const c = must("calendar", req.params.id, req.auth.workspace);
  if (c.userId !== req.auth.userId) admin(req);
  remove("calendar", c.id, req.auth.workspace);
  res.json({ deleted: true });
});
api.get("/api-keys", (req, res) => {
  admin(req);
  res.json({
    keys: db
      .prepare(
        "SELECT id,name,prefix,scope,created,lastUsed FROM api_keys WHERE workspace=?",
      )
      .all(req.auth.workspace),
  });
});
api.post("/api-keys", (req, res) => {
  admin(req);
  const b = z
    .object({
      name: z.string().min(1).max(100),
      scope: z.enum(["read", "write"]).default("write"),
    })
    .parse(req.body);
  const key = "cos_" + token(),
    id = uid();
  db.prepare(
    "INSERT INTO api_keys(id,workspace,userId,name,hash,prefix,scope,created) VALUES(?,?,?,?,?,?,?,?)",
  ).run(
    id,
    req.auth.workspace,
    req.auth.userId,
    b.name,
    hash(key),
    key.slice(0, 12),
    b.scope,
    now(),
  );
  res.status(201).json({ id, key });
});
api.delete("/api-keys/:id", (req, res) => {
  admin(req);
  db.prepare("DELETE FROM api_keys WHERE id=? AND workspace=?").run(
    String(req.params.id),
    req.auth.workspace,
  );
  res.json({ deleted: true });
});
api.get("/webhooks", (req, res) => {
  admin(req);
  res.json({
    webhooks: all("webhook", req.auth.workspace).map(({ secret, ...x }) => x),
  });
});
api.post("/webhooks", (req, res) => {
  admin(req);
  const b = z
    .object({
      name: z.string().min(1).max(100),
      url: z.url().refine((s) => s.startsWith("https://"), "HTTPS requis"),
      events: z
        .array(
          z.enum([
            "*",
            "lead.captured",
            "lead.updated",
            "lead.qualified",
            "lead.disqualified",
            "booking.created",
            "booking.rescheduled",
            "booking.cancelled",
          ]),
        )
        .min(1),
      enabled: z.boolean().default(true),
    })
    .parse(req.body);
  const secret = token();
  const hook = put("webhook", req.auth.workspace, {
    ...b,
    secret: encrypt(secret),
  });
  res
    .status(201)
    .json({ webhook: { ...hook, secret: undefined }, signingSecret: secret });
});
api.patch("/webhooks/:id", (req, res) => {
  admin(req);
  const h = must("webhook", req.params.id, req.auth.workspace);
  const enabled = z.boolean().parse(req.body.enabled);
  put("webhook", req.auth.workspace, { ...h, enabled }, h.id);
  res.json({ ok: true });
});
api.delete("/webhooks/:id", (req, res) => {
  admin(req);
  remove("webhook", String(req.params.id), req.auth.workspace);
  res.json({ deleted: true });
});
api.get("/jobs", (req, res) => {
  admin(req);
  const jobs = db
    .prepare(
      "SELECT id,kind,payload,due,status,attempts,error,providerId,created,updated FROM jobs WHERE workspace=? ORDER BY created DESC LIMIT 300",
    )
    .all(req.auth.workspace) as Row[];
  res.json({
    jobs: jobs.map((j) => ({ ...j, payload: JSON.parse(j.payload) })),
  });
});
api.post("/jobs/:id/retry", (req, res) => {
  admin(req);
  const j = db
    .prepare("SELECT * FROM jobs WHERE id=? AND workspace=?")
    .get(String(req.params.id), req.auth.workspace) as Row;
  if (!j) throw new HttpError(404, "Tâche introuvable.");
  if (!["failed", "blocked", "uncertain"].includes(j.status))
    throw new HttpError(422, "Cette tâche ne peut pas être relancée.");
  db.prepare(
    "UPDATE jobs SET status='pending',attempts=0,error=NULL,due=?,updated=? WHERE id=?",
  ).run(now(), now(), j.id);
  res.json({ ok: true });
});
api.get("/analytics", (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30)),
    after = new Date(Date.now() - days * 86400000).toISOString();
  const leads = all("lead", req.auth.workspace).filter(
      (l) => l.createdAt >= after,
    ),
    bookings = all("booking", req.auth.workspace).filter(
      (b) => b.createdAt >= after,
    ),
    visits = all("visit", req.auth.workspace).filter(
      (v) => v.createdAt >= after,
    );
  const sources = new Map<string, Row>();
  for (const l of leads) {
    const source =
      l.firstTouch?.utm_source ||
      (() => {
        try {
          return new URL(l.firstTouch?.referrer).hostname;
        } catch {
          return "Direct";
        }
      })();
    const key = [
      source,
      l.firstTouch?.utm_medium || "—",
      l.firstTouch?.utm_campaign || "—",
    ].join("|");
    const row = sources.get(key) || {
      source,
      medium: l.firstTouch?.utm_medium || "—",
      campaign: l.firstTouch?.utm_campaign || "—",
      leads: 0,
      qualified: 0,
      bookings: 0,
      revenue: 0,
    };
    row.leads++;
    if (["qualified", "booked", "won"].includes(l.status)) row.qualified++;
    const bs = bookings.filter(
      (b) => b.leadId === l.id && b.status === "confirmed",
    );
    row.bookings += bs.length;
    row.revenue += bs
      .filter((b) => b.outcome?.result === "sale")
      .reduce((sum, b) => sum + b.outcome.value, 0);
    sources.set(key, row);
  }
  const daily = Array.from({ length: days }, (_, i) => {
    const date = DateTime.now()
      .minus({ days: days - 1 - i })
      .toISODate();
    return {
      date,
      leads: leads.filter((l) => l.createdAt.startsWith(date!)).length,
      bookings: bookings.filter(
        (b) => b.createdAt.startsWith(date!) && b.status === "confirmed",
      ).length,
    };
  });
  const confirmed = bookings.filter((b) => b.status === "confirmed");
  res.json({
    totals: {
      visits: visits.length,
      leads: leads.length,
      qualified: leads.filter((l) =>
        ["qualified", "booked", "won"].includes(l.status),
      ).length,
      disqualified: leads.filter((l) => l.status === "disqualified").length,
      bookings: confirmed.length,
      conversion: leads.length
        ? Math.round((confirmed.length / leads.length) * 1000) / 10
        : 0,
      revenue: confirmed
        .filter((b) => b.outcome?.result === "sale")
        .reduce((s, b) => s + b.outcome.value, 0),
      noShows: confirmed.filter((b) => b.outcome?.result === "no_show").length,
    },
    daily,
    sources: [...sources.values()].sort((a, b) => b.leads - a.leads),
    hosts: memberIds(req.auth.workspace).map((id) => ({
      name: user(id)?.name,
      bookings: confirmed.filter((b) => b.hostId === id).length,
      sales: confirmed.filter(
        (b) => b.hostId === id && b.outcome?.result === "sale",
      ).length,
    })),
  });
});
api.get("/openapi.json", (_req, res) => {
  const schemas = {
    Event: z.toJSONSchema(eventSchema),
    Availability: z.toJSONSchema(availabilitySchema),
    Workflow: z.toJSONSchema(workflowSchema),
    LeadCapture: z.toJSONSchema(captureSchema),
  };
  const paths: Row = {};
  const allRoutes = [
    ...app.router.stack.filter((l: any) => l.route).map((l: any) => l.route),
    ...api.stack
      .filter((l: any) => l.route)
      .map((l: any) => ({ ...l.route, path: "/api/v1" + l.route.path })),
  ];
  for (const r of allRoutes) {
    if (!r.path.startsWith("/api/v1") || r.path.includes("openapi")) continue;
    const path = r.path.replace("/api/v1", "").replace(/:([A-Za-z]+)/g, "{$1}");
    const isPublic =
      path.startsWith("/public/") ||
      path.startsWith("/auth/") ||
      path.startsWith("/oauth/");
    paths[path] ||= {};
    for (const method of Object.keys(r.methods)) {
      let schema: string | undefined;
      if (
        (path === "/events" && method === "post") ||
        (path === "/events/{id}" && method === "put")
      )
        schema = "Event";
      if (
        (path === "/workflows" && method === "post") ||
        (path === "/workflows/{id}" && method === "put")
      )
        schema = "Workflow";
      if (path.startsWith("/availability/") && method === "put")
        schema = "Availability";
      if (path === "/public/events/{slug}/leads") schema = "LeadCapture";
      const parameters: Row[] = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      }));
      if (path.endsWith("/slots"))
        parameters.push(
          {
            name: "from",
            in: "query",
            required: true,
            schema: { type: "string", format: "date" },
          },
          {
            name: "days",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 31 },
          },
        );
      if (path === "/public/events/{slug}/slots")
        parameters.push({
          name: "token",
          in: "query",
          required: true,
          schema: { type: "string" },
        });
      if (path === "/leads")
        for (const n of ["q", "status", "eventId", "offset", "limit"])
          parameters.push({ name: n, in: "query", schema: { type: "string" } });
      if (path === "/analytics")
        parameters.push({
          name: "days",
          in: "query",
          schema: { type: "integer", default: 30 },
        });
      if (method === "post" && path === "/public/events/{slug}/bookings")
        parameters.push({
          name: "Idempotency-Key",
          in: "header",
          schema: { type: "string" },
        });
      let body: Row = schema
        ? { $ref: `#/components/schemas/${schema}` }
        : { type: "object", additionalProperties: true };
      if (path.endsWith("/qualify"))
        body = {
          type: "object",
          required: ["token", "answers", "timezone"],
          properties: {
            token: { type: "string" },
            answers: { type: "object", additionalProperties: true },
            timezone: { type: "string", example: "Europe/Paris" },
          },
        };
      if (path === "/public/events/{slug}/bookings")
        body = {
          type: "object",
          required: ["token", "start"],
          properties: {
            token: { type: "string" },
            start: { type: "string", format: "date-time" },
          },
        };
      if (path.endsWith("/reschedule"))
        body = {
          type: "object",
          required: ["start"],
          properties: { start: { type: "string", format: "date-time" } },
        };
      paths[path][method] = {
        operationId: method + "_" + path.replace(/[^a-zA-Z0-9]/g, "_"),
        summary: method.toUpperCase() + " " + path,
        tags: [path.split("/")[1]],
        security: isPublic ? [] : [{ apiKey: [] }],
        parameters,
        ...(["post", "put", "patch"].includes(method)
          ? {
              requestBody: {
                required: true,
                content: { "application/json": { schema: body } },
              },
            }
          : {}),
        responses: {
          "200": { description: "Succès" },
          "201": { description: "Créé" },
          "401": { description: "Authentification requise" },
          "403": { description: "Accès refusé" },
          "404": { description: "Introuvable" },
          "409": { description: "Conflit (créneau ou idempotence)" },
          "422": { description: "Validation invalide" },
          "503": { description: "Calendrier externe indisponible" },
        },
      };
    }
  }
  res.json({
    openapi: "3.1.0",
    info: {
      title: "CloseOS API",
      version: "1.0.0",
      description:
        "API complète du scheduler. Clés Bearer cos_… liées à un espace. Pagination leads : offset/limit, maximum 500. Erreurs JSON {error:string}. Les routes publiques de réservation utilisent un token de formulaire opaque obtenu lors de la capture. Webhooks HMAC-SHA256 sur timestamp + point + corps brut, avec identifiant à dédupliquer.",
    },
    servers: [{ url: publicBase() + "/api/v1" }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
      schemas,
    },
    paths,
  });
});
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Route inconnue." }),
);
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  _next: any,
) {
  // Prospects on an English booking page get English errors.
  if (req.headers["x-closeos-lang"] === "en" && req.path.includes("/public/")) {
    const status =
      error instanceof ZodError
        ? 422
        : String(error).includes("UNIQUE constraint")
          ? 409
          : error.status || 500;
    if (status >= 500) console.error("Request error:", error.message);
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => i.message).join(" ")
        : String(error.message || "");
    res.status(status).json({ error: translateError(message, status) });
    return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({
      error: error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join(" · "),
    });
    return;
  }
  if (String(error).includes("UNIQUE constraint")) {
    res.status(409).json({
      error: "Cette valeur existe déjà. Choisissez un autre lien ou email.",
    });
    return;
  }
  const status = error.status || 500;
  if (status >= 500) console.error("Request error:", error.message);
  res.status(status).json({
    error:
      status >= 500
        ? "Une erreur est survenue. Réessayez dans quelques instants."
        : error.message,
  });
}
