import { DateTime } from "luxon";
import { all, get, put, Row, db, tx, now, uid, enqueue } from "./db.js";
import {
  token,
  hash,
  HttpError,
  publicBooking,
  publicLead,
} from "./security.js";
import { calendarBusy } from "./calendar.js";
import { defaultAvailability } from "./schema.js";
export function matches(rule: Row, lead: Row) {
  let v =
    rule.field === "email_type"
      ? lead.email
          ?.split("@")[1]
          ?.match(/^(gmail|yahoo|hotmail|outlook|icloud)\./)
        ? "personal"
        : "business"
      : rule.field === "phone_country"
        ? lead.phone
        : rule.field === "timezone"
          ? lead.timezone
          : (lead.answers?.[rule.field] ?? lead[rule.field]);
  const s = Array.isArray(v) ? v.map(String) : [String(v ?? "")],
    r = rule.value;
  switch (rule.operator) {
    case "equals":
      return s.includes(r);
    case "not_equals":
      return !s.includes(r);
    case "contains":
      return s.some((v) => v.toLowerCase().includes(r.toLowerCase()));
    case "in":
      return s.some((v) =>
        r
          .split(",")
          .map((x: string) => x.trim())
          .includes(v),
      );
    case "less_than":
      return s[0] !== "" && Number(s[0]) < Number(r);
    case "greater_than":
      return s[0] !== "" && Number(s[0]) > Number(r);
    default:
      return false;
  }
}
export function hostsFor(event: Row, lead?: Row) {
  const ids = event.hostIds.filter((id: string) =>
    db
      .prepare("SELECT 1 FROM memberships WHERE workspace=? AND userId=?")
      .get(event.workspace, id),
  );
  if (!lead) return ids;
  const route = event.routing.find((r: Row) => matches(r, lead));
  return route ? ids.filter((id: string) => route.hostIds.includes(id)) : ids;
}
export function overlaps(
  start: string,
  end: string,
  otherStart: string,
  otherEnd: string,
  before = 0,
  after = 0,
) {
  return (
    Date.parse(start) - before * 60000 < Date.parse(otherEnd) &&
    Date.parse(end) + after * 60000 > Date.parse(otherStart)
  );
}
export function slotsSync(
  event: Row,
  lead: Row | undefined,
  from: string,
  days = 1,
  busy: Record<string, Row[]> = {},
  excludeBooking?: string,
) {
  const hostIds = hostsFor(event, lead),
    out = new Map<string, { start: string; end: string; hostIds: string[] }>();
  const allBookings = all("booking", event.workspace).filter(
    (b) => b.status === "confirmed" && b.id !== excludeBooking,
  );
  const schedules = all("availability", event.workspace);
  const nowMs = Date.now(),
    earliest = nowMs + event.noticeMinutes * 60000,
    latest = nowMs + event.horizonDays * 86400000;
  const startDay = DateTime.fromISO(from, { zone: event.timezone }).startOf(
    "day",
  );
  if (!startDay.isValid) throw new HttpError(400, "Date invalide.");
  for (const hostId of hostIds) {
    const a =
      schedules.find((s) => s.userId === hostId) ||
      defaultAvailability(hostId, event.timezone);
    for (let d = -1; d <= days; d++) {
      const date = startDay
        .plus({ days: d })
        .setZone(a.timezone)
        .startOf("day");
      const dateKey = date.toISODate()!;
      const blocks =
        a.overrides[dateKey] ?? a.weekly[String(date.weekday)] ?? [];
      const dayBookings = allBookings.filter(
        (b) =>
          (b.hostIds || [b.hostId]).includes(hostId) &&
          DateTime.fromISO(b.start).setZone(a.timezone).toISODate() === dateKey,
      );
      if (
        event.dailyLimit &&
        dayBookings.filter((b) => b.eventId === event.id).length >=
          event.dailyLimit
      )
        continue;
      for (const block of blocks) {
        const [h, m] = block.start.split(":").map(Number),
          [eh, em] = block.end.split(":").map(Number);
        const begin = date.set({ hour: h, minute: m }),
          end = date.set({ hour: eh, minute: em });
        for (
          let time = begin;
          time.plus({ minutes: event.duration }) <= end;
          time = time.plus({ minutes: event.slotInterval })
        ) {
          const st = time.toUTC().toISO()!,
            en = time.plus({ minutes: event.duration }).toUTC().toISO()!;
          if (
            time.toMillis() < earliest ||
            time.toMillis() > latest ||
            time < startDay ||
            time >= startDay.plus({ days })
          )
            continue;
          if (
            time.minus({ minutes: event.bufferBefore }) < begin ||
            time.plus({ minutes: event.duration + event.bufferAfter }) > end
          )
            continue;
          const conflict =
            allBookings.some(
              (b) =>
                (b.hostIds || [b.hostId]).includes(hostId) &&
                overlaps(
                  st,
                  en,
                  DateTime.fromISO(b.start)
                    .minus({ minutes: b.bufferBefore || 0 })
                    .toISO()!,
                  DateTime.fromISO(b.end)
                    .plus({ minutes: b.bufferAfter || 0 })
                    .toISO()!,
                  event.bufferBefore,
                  event.bufferAfter,
                ),
            ) ||
            (busy[hostId] || []).some((b) =>
              overlaps(
                st,
                en,
                b.start,
                b.end,
                event.bufferBefore,
                event.bufferAfter,
              ),
            );
          if (conflict) continue;
          const slot = out.get(st) || { start: st, end: en, hostIds: [] };
          slot.hostIds.push(hostId);
          out.set(st, slot);
        }
      }
    }
  }
  return [...out.values()]
    .filter(
      (s) => event.type !== "collective" || s.hostIds.length === hostIds.length,
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}
export async function slots(
  event: Row,
  lead: Row | undefined,
  from: string,
  days = 1,
  excludeBooking?: string,
) {
  const date = DateTime.fromISO(from, { zone: event.timezone });
  const busy = await calendarBusy(
    event.workspace,
    hostsFor(event, lead),
    date.minus({ days: 1 }).toUTC().toISO()!,
    date
      .plus({ days: days + 1 })
      .toUTC()
      .toISO()!,
  );
  return {
    slots: slotsSync(event, lead, from, days, busy, excludeBooking),
    busy,
  };
}
export async function book(
  event: Row,
  lead: Row,
  start: string,
  existing?: Row,
  onCommit?: (booking: Row) => void,
) {
  if (!event.active) throw new HttpError(422, "Cet événement est désactivé.");
  if (!["qualified", "booked"].includes(lead.status))
    throw new HttpError(422, "Terminez le formulaire avant de réserver.");
  const from = DateTime.fromISO(start).setZone(event.timezone).toISODate();
  if (!from) throw new HttpError(400, "Créneau invalide.");
  const { busy } = await slots(event, lead, from, 1, existing?.id);
  return tx(() => {
    const normalized = DateTime.fromISO(start).toUTC().toISO();
    const candidates = slotsSync(event, lead, from, 1, busy, existing?.id).find(
      (s) => s.start === normalized,
    );
    if (!candidates)
      throw new HttpError(
        409,
        "Ce créneau vient d’être réservé ou n’est plus disponible. Choisissez-en un autre.",
      );
    const duplicate = all("booking", event.workspace).find(
      (b) =>
        b.leadId === lead.id &&
        b.status === "confirmed" &&
        b.id !== existing?.id,
    );
    if (duplicate)
      throw new HttpError(
        409,
        "Ce prospect possède déjà un rendez-vous. Utilisez son lien de report.",
      );
    let hostId = candidates.hostIds[0];
    if (event.routingMode === "round_robin") {
      const counts = Object.fromEntries(
        candidates.hostIds.map((id) => [
          id,
          all("booking", event.workspace).filter(
            (b) =>
              b.hostId === id &&
              b.eventId === event.id &&
              b.status === "confirmed",
          ).length,
        ]),
      );
      hostId = [...candidates.hostIds].sort((a, b) => counts[a] - counts[b])[0];
    }
    if (existing && candidates.hostIds.includes(existing.hostId))
      hostId = existing.hostId;
    const manageToken = existing?.manageToken || token();
    const booking = put(
      "booking",
      event.workspace,
      {
        ...existing,
        eventId: event.id,
        leadId: lead.id,
        hostId,
        hostIds: event.type === "collective" ? candidates.hostIds : [hostId],
        start: normalized,
        end: candidates.end,
        status: "confirmed",
        bufferBefore: event.bufferBefore,
        bufferAfter: event.bufferAfter,
        manageToken,
        tokenHash: hash(manageToken),
        version: (existing?.version ?? -1) + 1,
        calendarStatus: "pending",
        outcome: existing?.outcome || null,
      },
      existing?.id,
    );
    put(
      "lead",
      event.workspace,
      { ...lead, status: "booked", bookedAt: now() },
      lead.id,
    );
    if (existing)
      db.prepare(
        "UPDATE jobs SET status='cancelled',updated=? WHERE workspace=? AND json_extract(payload,'$.bookingId')=? AND status IN ('pending','retry')",
      ).run(now(), event.workspace, existing.id);
    if (existing && existing.hostId !== hostId && existing.externalEventId) {
      const snapshot = {
        ...existing,
        status: "cancelled",
        version: existing.version + 1,
      };
      enqueue(event.workspace, "calendar_cleanup", {
        snapshot,
        eventId: event.id,
        leadId: lead.id,
      });
      const changed = put(
        "booking",
        event.workspace,
        {
          ...booking,
          externalEventId: null,
          meetingUrl: null,
          calendarConnectionId: null,
          externalCalendarId: null,
        },
        booking.id,
      );
      onCommit?.(changed);
      return changed;
    }
    onCommit?.(booking);
    return booking;
  });
}
export function validateAnswers(event: Row, answers: Row) {
  const out: Row = {};
  for (const q of event.questions) {
    const v = answers[q.id];
    if (
      q.required &&
      (v === undefined ||
        v === "" ||
        v === null ||
        (Array.isArray(v) && !v.length))
    )
      throw new HttpError(422, `Répondez à « ${q.label} ».`);
    if (v === undefined || v === null) continue;
    if (q.type === "checkbox") {
      if (!Array.isArray(v) || v.some((x) => !q.options.includes(x)))
        throw new HttpError(422, "Réponse invalide.");
      out[q.id] = v;
    } else {
      if (typeof v !== "string" || v.length > 10000)
        throw new HttpError(422, "Réponse invalide.");
      if (["select", "radio"].includes(q.type) && v && !q.options.includes(v))
        throw new HttpError(422, "Choix invalide.");
      if (q.type === "number" && v && !Number.isFinite(Number(v)))
        throw new HttpError(422, "Nombre invalide.");
      out[q.id] = v;
    }
  }
  return out;
}
