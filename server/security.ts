import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { db, get, now } from "./db.js";
export const token = () => randomBytes(32).toString("base64url");
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function passwordHash(s: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(s, salt, 64).toString("hex");
}
export function verifyPassword(p: string, stored: string) {
  const [salt, h] = stored.split(":");
  const a = scryptSync(p, salt, 64),
    b = Buffer.from(h || "", "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32)
    throw new Error("ENCRYPTION_KEY must contain at least 32 characters");
  return createHash("sha256").update(raw).digest();
}
export function encrypt(value: unknown) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const out = Buffer.concat([c.update(JSON.stringify(value)), c.final()]);
  return [
    iv.toString("base64"),
    c.getAuthTag().toString("base64"),
    out.toString("base64"),
  ].join(".");
}
export function decrypt(s: string) {
  const [a, b, c] = s.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(a, "base64"));
  d.setAuthTag(Buffer.from(b, "base64"));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(c, "base64")), d.final()]).toString(),
  );
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const assert = (
  condition: any,
  status: number,
  message: string,
): asserts condition => {
  if (!condition) throw new HttpError(status, message);
};
export type Auth = {
  userId: string;
  workspace: string;
  role: string;
  scope: string;
};
declare global {
  namespace Express {
    interface Request {
      auth: Auth;
    }
  }
}
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    let userId = "",
      workspace = "",
      scope = "write";
    const bearer = req.headers.authorization?.replace(/^Bearer /i, "");
    if (bearer) {
      const k = db
        .prepare("SELECT * FROM api_keys WHERE hash=?")
        .get(hash(bearer)) as any;
      if (!k) throw new HttpError(401, "Clé API invalide.");
      userId = k.userId;
      workspace = k.workspace;
      scope = k.scope;
      db.prepare("UPDATE api_keys SET lastUsed=? WHERE id=?").run(now(), k.id);
    } else {
      const cookie = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("closeos_session="))
        ?.split("=")[1];
      const session = cookie
        ? (db
            .prepare("SELECT * FROM sessions WHERE hash=? AND expires>?")
            .get(hash(cookie), now()) as any)
        : null;
      if (!session) throw new HttpError(401, "Connectez-vous pour continuer.");
      userId = session.userId;
      workspace = String(req.headers["x-workspace-id"] || "");
      if (!workspace) {
        const m = db
          .prepare("SELECT workspace FROM memberships WHERE userId=? LIMIT 1")
          .get(userId) as any;
        workspace = m?.workspace;
      }
    }
    const member = db
      .prepare("SELECT role FROM memberships WHERE workspace=? AND userId=?")
      .get(workspace, userId) as any;
    if (!member || !get("workspace", workspace))
      throw new HttpError(403, "Accès à cet espace refusé.");
    req.auth = { userId, workspace, role: member.role, scope };
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      (scope === "read" || member.role === "viewer")
    )
      throw new HttpError(403, "Cet accès est en lecture seule.");
    next();
  } catch (e) {
    next(e);
  }
}
export function admin(req: Request) {
  if (!["owner", "admin"].includes(req.auth.role))
    throw new HttpError(403, "Droits administrateur requis.");
}
export const publicBase = () =>
  process.env.PUBLIC_URL || "http://localhost:4320";
export function publicLead(l: any) {
  const { tokenHash, ...rest } = l;
  return rest;
}
export function publicBooking(b: any) {
  const { tokenHash, ...rest } = b;
  return rest;
}
