// Read-only check of BizOS Skool annual subscriptions, through the community admin page.
// Skool has no public members API: the admin session cookie (SKOOL_COOKIE_HEADER) reads
// /-/members?t=active&annual=true, the same source as the BizOS bridge and coach.
import { HttpError } from "./security.js";

export interface AnnualMember {
  email: string;
  firstName: string;
  lastName: string;
}
type Reader = (url: string, cookie: string) => Promise<string>;

const GROUP = process.env.SKOOL_GROUP || "bizos";
const GROUP_ID =
  process.env.SKOOL_GROUP_ID || "39d0dedbc1694fd8bdfa15ae8930efd2";
const FRESH_MS = 10 * 60_000,
  RECHECK_MS = 60_000,
  MAX_PAGES = 40;

let reader: Reader = async (url, cookie) => {
  const r = await fetch(url, {
    headers: {
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  if (r.status !== 200) throw new Error("Skool HTTP " + r.status);
  return r.text();
};
export function setSkoolReader(fn: Reader) {
  reader = fn;
  cache = null;
}

let cache: { at: number; members: Map<string, AnnualMember> } | null = null,
  inflight: Promise<Map<string, AnnualMember>> | null = null;

const normalize = (email: unknown) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

async function readPage(page: number) {
  const cookie = process.env.SKOOL_COOKIE_HEADER || "";
  if (!cookie) throw new Error("SKOOL_COOKIE_HEADER missing");
  const html = await reader(
    `https://www.skool.com/${GROUP}/-/members?t=active&annual=true&p=${page}`,
    cookie,
  );
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Skool page format changed");
  const pp = JSON.parse(m[1])?.props?.pageProps;
  if (pp?.currentGroup?.id !== GROUP_ID || pp?.isAdmin !== true)
    throw new Error("Skool community or admin session mismatch");
  if (pp.tabName !== "active" || pp.annual !== true || pp.monthly === true)
    throw new Error("Unexpected Skool billing filter");
  if (!Array.isArray(pp.users)) throw new Error("Skool users missing");
  return pp as { users: any[]; totalPages: number; total: number };
}

async function load() {
  const members = new Map<string, AnnualMember>();
  let pages = 1;
  for (let p = 1; p <= Math.min(pages, MAX_PAGES); p++) {
    const pp = await readPage(p);
    if (p === 1) pages = Number(pp.totalPages) || 1;
    for (const u of pp.users) {
      const member = u?.member || {};
      if (member.role !== "member") continue;
      let price: any = {};
      try {
        price = JSON.parse(member.metadata?.mmbp || "{}");
      } catch {}
      if (price.recurring_interval !== "year" || !(Number(price.amount) > 0))
        continue;
      const email = normalize(member.metadata?.mbme) || normalize(u.email);
      if (!email) continue;
      members.set(email, {
        email,
        firstName: String(u.firstName || "").slice(0, 100),
        lastName: String(u.lastName || "").slice(0, 100),
      });
    }
  }
  return members;
}

async function refresh() {
  if (!inflight)
    inflight = load()
      .then((members) => {
        cache = { at: Date.now(), members };
        return members;
      })
      .finally(() => {
        inflight = null;
      });
  return inflight;
}

// Returns the member when the email has an active, paid, annual BizOS subscription.
export async function annualMember(
  email: string,
): Promise<AnnualMember | null> {
  const key = normalize(email);
  const age = cache ? Date.now() - cache.at : Infinity;
  try {
    if (age < FRESH_MS && cache!.members.has(key))
      return cache!.members.get(key)!;
    if (age < RECHECK_MS) return null;
    return (await refresh()).get(key) || null;
  } catch (e) {
    console.error("[skool]", (e as Error).message);
    throw new HttpError(
      503,
      "La vérification de votre abonnement Skool est momentanément indisponible. Réessayez dans quelques minutes.",
    );
  }
}
