import { all, get, put, Row, now } from "./db.js";
import { emailCopy, lang } from "./i18n.js";
import { encrypt, decrypt, HttpError, publicBase } from "./security.js";
export function integration(workspace: string, provider: string) {
  const i = all("integration", workspace).find((x) => x.provider === provider);
  return i ? decrypt(i.secret) : null;
}
export async function providerFetch(url: string, options: RequestInit = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(
      `Provider HTTP ${r.status}: ${err.slice(0, 250).replace(/Bearer\s+\S+/gi, "[redacted]")}`,
    );
  }
  return r.status === 204 ? {} : r.json();
}
export const callbackUrl = (provider: string) =>
  `${publicBase()}/api/v1/oauth/${provider}/callback`;
export function oauthConfig(workspace: string, provider: string) {
  const c = integration(workspace, provider);
  if (!c?.clientId || !c?.clientSecret)
    throw new HttpError(
      422,
      `Configurez d'abord le client OAuth ${provider} dans Intégrations.`,
    );
  return c;
}
export async function access(connection: Row) {
  const c = decrypt(connection.secret);
  if (c.expiresAt > Date.now() + 60000) return c.accessToken;
  const config = oauthConfig(connection.workspace, connection.provider);
  const url =
    connection.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: c.refreshToken,
    grant_type: "refresh_token",
  });
  const t = await providerFetch(url, { method: "POST", body });
  put(
    "calendar",
    connection.workspace,
    {
      ...connection,
      secret: encrypt({
        ...c,
        accessToken: t.access_token,
        refreshToken: t.refresh_token || c.refreshToken,
        expiresAt: Date.now() + t.expires_in * 1000,
      }),
    },
    connection.id,
  );
  return t.access_token;
}
export async function calendarBusy(
  workspace: string,
  hostIds: string[],
  from: string,
  to: string,
) {
  const result: Record<string, { start: string; end: string }[]> = {};
  for (const hostId of hostIds) {
    result[hostId] = [];
    for (const c of all("calendar", workspace).filter(
      (c) => c.userId === hostId && c.checkConflicts !== false,
    )) {
      try {
        const t = await access(c),
          headers = {
            Authorization: `Bearer ${t}`,
            "Content-Type": "application/json",
          };
        if (c.provider === "google") {
          const data = await providerFetch(
            "https://www.googleapis.com/calendar/v3/freeBusy",
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                timeMin: from,
                timeMax: to,
                items: (
                  c.conflictCalendarIds || [c.calendarId || "primary"]
                ).map((id: string) => ({ id })),
              }),
            },
          );
          for (const item of Object.values(data.calendars) as any[]) {
            if (item.errors?.length) throw new Error("Calendrier inaccessible");
            result[hostId].push(...item.busy);
          }
        } else {
          const data = await providerFetch(
            `https://graph.microsoft.com/v1.0/me/${c.calendarId && c.calendarId !== "primary" ? "calendars/" + encodeURIComponent(c.calendarId) + "/" : ""}calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$top=1000`,
            { headers: { ...headers, Prefer: 'outlook.timezone="UTC"' } },
          );
          if (data["@odata.nextLink"])
            throw new Error(
              "Trop de rendez-vous dans la plage, réduisez la période",
            );
          result[hostId].push(
            ...data.value
              .filter((e: any) => !e.isCancelled && e.showAs !== "free")
              .map((e: any) => ({
                start: e.start.dateTime + "Z",
                end: e.end.dateTime + "Z",
              })),
          );
        }
        put(
          "calendar",
          workspace,
          { ...get("calendar", c.id)!, lastChecked: now(), error: null },
          c.id,
        );
      } catch (error) {
        put(
          "calendar",
          workspace,
          {
            ...get("calendar", c.id)!,
            error: "Synchronisation impossible. Reconnectez ce calendrier.",
          },
          c.id,
        );
        throw new HttpError(
          503,
          "Impossible de vérifier un calendrier connecté. Réessayez dans quelques instants.",
        );
      }
    }
  }
  return result;
}
type CalendarSyncResult = {
  mode: "ics" | "google" | "microsoft";
  externalEventId?: string;
  calendarConnectionId?: string;
  externalCalendarId?: string;
  meetingUrl?: string;
};
export async function syncCalendar(
  booking: Row,
  event: Row,
  lead: Row,
  host: Row,
): Promise<CalendarSyncResult> {
  const connection = booking.calendarConnectionId
    ? get("calendar", booking.calendarConnectionId)
    : all("calendar", booking.workspace).find(
        (c) => c.userId === booking.hostId && c.writeEvents !== false,
      );
  if (booking.externalEventId && !connection)
    throw new Error(
      "Reconnectez le calendrier d’origine pour modifier ce rendez-vous.",
    );
  const c: Row | null | undefined = connection && {
    ...connection,
    calendarId:
      booking.externalCalendarId || connection.calendarId || "primary",
  };
  if (!c) return { mode: "ics" };
  if (c.workspace !== booking.workspace || c.userId !== booking.hostId)
    throw new Error("Le calendrier ne correspond pas à cet hôte.");
  const destination = {
    calendarConnectionId: c.id,
    externalCalendarId: c.calendarId,
  };
  const t = await access(c),
    headers = {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    };
  const description = `${event.name}\n${lead.firstName} ${lead.lastName}\n${lead.phone || ""}\n${Object.entries(
    lead.answers || {},
  )
    .map(
      ([k, v]) =>
        `${event.questions.find((q: any) => q.id === k)?.label || k}: ${v}`,
    )
    .join(
      "\n",
    )}\n${emailCopy[lang(event.language)].manage} : ${publicBase()}/manage/${booking.manageToken}`;
  const old = booking.externalEventId;
  let data: any;
  if (c.provider === "google") {
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.calendarId || "primary")}/events`;
    const deterministic = "c" + booking.id.replaceAll("-", "");
    if (booking.status === "cancelled") {
      try {
        await providerFetch(`${base}/${old || deterministic}?sendUpdates=all`, {
          method: "DELETE",
          headers,
        });
      } catch (e) {
        if (!String(e).includes("404") && !String(e).includes("410")) throw e;
      }
      return {
        mode: "google",
        externalEventId: old || deterministic,
        ...destination,
      };
    }
    const body: any = {
      summary: `${event.name} — ${lead.firstName} ${lead.lastName}`,
      description,
      start: { dateTime: booking.start },
      end: { dateTime: booking.end },
      attendees: lead.email ? [{ email: lead.email }] : [],
      location: event.location || undefined,
    };
    if (event.locationType === "google_meet")
      body.conferenceData = {
        createRequest: {
          requestId: booking.id,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    if (!old) body.id = deterministic;
    try {
      data = await providerFetch(
        `${base}${old ? "/" + old : ""}?sendUpdates=all&conferenceDataVersion=1`,
        { method: old ? "PATCH" : "POST", headers, body: JSON.stringify(body) },
      );
    } catch (e) {
      if (!old && String(e).includes("409")) {
        delete body.id;
        data = await providerFetch(
          `${base}/${deterministic}?sendUpdates=all&conferenceDataVersion=1`,
          { method: "PATCH", headers, body: JSON.stringify(body) },
        );
      } else throw e;
    }
    return {
      mode: "google",
      ...destination,
      externalEventId: data.id,
      meetingUrl: data.hangoutLink || event.location,
    };
  }
  const base =
    "https://graph.microsoft.com/v1.0/me/" +
    (!old && c.calendarId && c.calendarId !== "primary"
      ? "calendars/" + encodeURIComponent(c.calendarId) + "/"
      : "") +
    "events";
  if (booking.status === "cancelled") {
    if (old)
      try {
        await providerFetch(`${base}/${old}`, { method: "DELETE", headers });
      } catch (e) {
        if (!String(e).includes("404")) throw e;
      }
    return { mode: "microsoft", externalEventId: old, ...destination };
  }
  const body: any = {
    subject: `${event.name} — ${lead.firstName} ${lead.lastName}`,
    body: { contentType: "Text", content: description },
    start: { dateTime: booking.start, timeZone: "UTC" },
    end: { dateTime: booking.end, timeZone: "UTC" },
    attendees: lead.email
      ? [
          {
            emailAddress: { address: lead.email, name: lead.firstName },
            type: "required",
          },
        ]
      : [],
    location: { displayName: event.location || "" },
  };
  if (!old) {
    body.transactionId = booking.id;
    if (event.locationType === "teams") {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }
  }
  data = await providerFetch(`${base}${old ? "/" + old : ""}`, {
    method: old ? "PATCH" : "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    mode: "microsoft",
    ...destination,
    externalEventId: data.id,
    meetingUrl: data.onlineMeeting?.joinUrl || event.location,
  };
}
function esc(s: any) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function stamp(s: string) {
  return new Date(s)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z/, "Z");
}
export function ics(booking: Row, event: Row, lead: Row, host: Row) {
  const cancelled = booking.status === "cancelled";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CloseOS//Scheduler//FR",
    "CALSCALE:GREGORIAN",
    `METHOD:${cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT",
    `UID:${booking.id}@closeos`,
    `SEQUENCE:${booking.version || 0}`,
    `DTSTAMP:${stamp(now())}`,
    `DTSTART:${stamp(booking.start)}`,
    `DTEND:${stamp(booking.end)}`,
    `SUMMARY:${esc(event.name)}`,
    `DESCRIPTION:${esc(event.description + "\n" + publicBase() + "/manage/" + booking.manageToken)}`,
    `LOCATION:${esc(booking.meetingUrl || event.location || emailCopy[lang(event.language)].phoneCall)}`,
    `ORGANIZER;CN=${esc(host.name)}:mailto:${host.email}`,
    ...(lead.email
      ? [`ATTENDEE;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${lead.email}`]
      : []),
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return (
    lines
      .map((l) => {
        const parts: string[] = [];
        let chunk = "";
        for (const ch of l) {
          if (Buffer.byteLength(chunk + ch) > 73) {
            parts.push(chunk);
            chunk = " " + ch;
          } else chunk += ch;
        }
        parts.push(chunk);
        return parts.join("\r\n");
      })
      .join("\r\n") + "\r\n"
  );
}
