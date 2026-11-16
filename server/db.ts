import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export const dbPath = process.env.DATABASE_PATH || "./data/closeos.sqlite";
if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password TEXT NOT NULL,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(workspace TEXT NOT NULL,userId TEXT NOT NULL,role TEXT NOT NULL,PRIMARY KEY(workspace,userId));
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,userId TEXT NOT NULL,expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,userId TEXT NOT NULL,name TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,prefix TEXT NOT NULL,scope TEXT NOT NULL,created TEXT NOT NULL,lastUsed TEXT);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,workspace TEXT NOT NULL,data TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_kind_workspace ON records(kind,workspace);
CREATE UNIQUE INDEX IF NOT EXISTS event_slug ON records(json_extract(data,'$.slug')) WHERE kind='event';
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,due TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,error TEXT,providerId TEXT,created TEXT NOT NULL,updated TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,due);
CREATE TABLE IF NOT EXISTS idempotency(workspace TEXT,key TEXT,fingerprint TEXT,response TEXT,created TEXT,PRIMARY KEY(workspace,key));`);
export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
export type Row = Record<string, any>;
const decode = (row: any) =>
  row
    ? {
        ...JSON.parse(row.data),
        id: row.id,
        workspace: row.workspace,
        createdAt: row.created,
        updatedAt: row.updated,
      }
    : null;
export function get(kind: string, id: string, workspace?: string): Row | null {
  return decode(
    workspace
      ? db
          .prepare(
            "SELECT * FROM records WHERE kind=? AND id=? AND workspace=?",
          )
          .get(kind, id, workspace)
      : db.prepare("SELECT * FROM records WHERE kind=? AND id=?").get(kind, id),
  );
}
export function all(kind: string, workspace: string): Row[] {
  return db
    .prepare(
      "SELECT * FROM records WHERE kind=? AND workspace=? ORDER BY created DESC",
    )
    .all(kind, workspace)
    .map(decode);
}
export function across(kind: string): Row[] {
  return db.prepare("SELECT * FROM records WHERE kind=?").all(kind).map(decode);
}
export function put(
  kind: string,
  workspace: string,
  data: Row,
  id: string = uid(),
): Row {
  const old = get(kind, id);
  if (old && old.workspace !== workspace) throw new Error("Workspace mismatch");
  const time = now();
  const clean = { ...data };
  for (const k of ["id", "workspace", "createdAt", "updatedAt"])
    delete clean[k];
  db.prepare(
    "INSERT INTO records(id,kind,workspace,data,created,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated",
  ).run(
    id,
    kind,
    workspace,
    JSON.stringify(clean),
    old?.createdAt || time,
    time,
  );
  return get(kind, id)!;
}
export function remove(kind: string, id: string, workspace: string) {
  db.prepare("DELETE FROM records WHERE kind=? AND id=? AND workspace=?").run(
    kind,
    id,
    workspace,
  );
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function bySlug(slug: string) {
  return decode(
    db
      .prepare(
        "SELECT * FROM records WHERE kind='event' AND json_extract(data,'$.slug')=?",
      )
      .get(slug),
  );
}
export function enqueue(
  workspace: string,
  kind: string,
  payload: Row,
  due = now(),
  id: string = uid(),
) {
  db.prepare(
    "INSERT OR IGNORE INTO jobs(id,workspace,kind,payload,due,created,updated) VALUES(?,?,?,?,?,?,?)",
  ).run(id, workspace, kind, JSON.stringify(payload), due, now(), now());
  return id;
}
