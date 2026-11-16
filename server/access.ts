// One-time sign-in codes sent by email. Codes are stored hashed with a server pepper,
// expire after 10 minutes and are burnt after 5 wrong attempts.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { db, now } from "./db.js";
import { HttpError } from "./security.js";

db.exec(`CREATE TABLE IF NOT EXISTS otps(email TEXT PRIMARY KEY,hash TEXT NOT NULL,expires TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent INTEGER NOT NULL DEFAULT 1,windowStart TEXT NOT NULL,lastSent TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skool_access(userId TEXT PRIMARY KEY,email TEXT NOT NULL,verifiedAt TEXT NOT NULL);`);

const TTL_MS = 10 * 60_000,
  COOLDOWN_MS = 30_000,
  MAX_SENDS_PER_HOUR = 6,
  MAX_ATTEMPTS = 5;

const digest = (email: string, code: string) =>
  createHmac("sha256", process.env.ENCRYPTION_KEY || "closeos-dev")
    .update(email + ":" + code)
    .digest("hex");

type Mail = { to: string; subject: string; text: string; html: string };
// Delivers through Resend; without a key outside production the message is logged instead.
let transport = async (m: Mail) => {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production")
      throw new HttpError(503, "L’envoi des emails n’est pas configuré.");
    console.log(`[mail] to ${m.to}: ${m.subject}\n${m.text}`);
    return;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM || "CloseOS <acces@bizos.cc>",
      to: [m.to],
      subject: m.subject,
      text: m.text,
      html: m.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    console.error("[mail] resend", r.status, await r.text().catch(() => ""));
    throw new HttpError(502, "L’email n’a pas pu être envoyé. Réessayez.");
  }
};
export function setMailTransport(fn: (m: Mail) => Promise<void>) {
  transport = fn;
}

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const layout = (body: string) =>
  `<div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:440px;margin:0 auto;padding:32px 24px;color:#111928">
<p style="font-weight:700;font-size:16px;margin:0 0 28px">↗ CloseOS</p>${body}</div>`;

type Mailer = (to: string, code: string) => Promise<void>;
let mailer: Mailer = (to, code) =>
  transport({
    to,
    subject: `${code} est votre code CloseOS`,
    text: `Votre code de connexion CloseOS : ${code}\n\nIl expire dans 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez cet email.`,
    html: layout(`
<p style="font-size:15px;margin:0 0 18px">Votre code de connexion :</p>
<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 22px;color:#147d70">${code}</p>
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">Il expire dans 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez simplement cet email.</p>`),
  });
export function setOtpMailer(fn: Mailer) {
  mailer = fn;
}

export function sendInviteEmail(
  to: string,
  url: string,
  workspace: string,
  inviter: string,
) {
  return transport({
    to,
    subject: `${inviter} vous invite à rejoindre ${workspace} sur CloseOS`,
    text: `${inviter} vous invite à rejoindre l’espace ${workspace} sur CloseOS.\n\nRejoindre l’équipe : ${url}\n\nCe lien personnel est valable 7 jours.`,
    html: layout(`
<p style="font-size:15px;line-height:1.6;margin:0 0 22px"><strong>${esc(inviter)}</strong> vous invite à rejoindre l’espace <strong>${esc(workspace)}</strong> sur CloseOS.</p>
<p style="margin:0 0 22px"><a href="${esc(url)}" style="display:inline-block;background:#111928;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 18px;border-radius:8px">Rejoindre l’équipe</a></p>
<p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0">Ce lien personnel est valable 7 jours. Vous vous connecterez avec un code reçu par email, sans mot de passe.</p>`),
  });
}

export async function sendCode(email: string) {
  const row = db.prepare("SELECT * FROM otps WHERE email=?").get(email) as any;
  const t = Date.now();
  if (row && t - Date.parse(row.lastSent) < COOLDOWN_MS)
    throw new HttpError(
      429,
      "Un code vient d’être envoyé. Patientez quelques secondes avant d’en demander un autre.",
    );
  const sameWindow = row && t - Date.parse(row.windowStart) < 3600_000;
  if (sameWindow && row.sent >= MAX_SENDS_PER_HOUR)
    throw new HttpError(
      429,
      "Trop de codes demandés. Réessayez dans une heure.",
    );
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await mailer(email, code);
  db.prepare(
    "INSERT INTO otps(email,hash,expires,attempts,sent,windowStart,lastSent) VALUES(?,?,?,0,?,?,?) ON CONFLICT(email) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,attempts=0,sent=excluded.sent,windowStart=excluded.windowStart,lastSent=excluded.lastSent",
  ).run(
    email,
    digest(email, code),
    new Date(t + TTL_MS).toISOString(),
    sameWindow ? row.sent + 1 : 1,
    sameWindow ? row.windowStart : now(),
    now(),
  );
}

export function checkCode(email: string, code: string) {
  const row = db.prepare("SELECT * FROM otps WHERE email=?").get(email) as any;
  const invalid = () =>
    new HttpError(
      401,
      "Code incorrect ou expiré. Vérifiez le dernier email reçu.",
    );
  if (!row || row.expires < now() || row.attempts >= MAX_ATTEMPTS)
    throw invalid();
  const a = Buffer.from(row.hash, "hex"),
    b = Buffer.from(digest(email, code), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    db.prepare("UPDATE otps SET attempts=attempts+1 WHERE email=?").run(email);
    throw invalid();
  }
  db.prepare("UPDATE otps SET expires=? WHERE email=?").run(
    new Date(0).toISOString(),
    email,
  );
}
