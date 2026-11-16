import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import https from "node:https";
import { isIP } from "node:net";
import { DateTime } from "luxon";
import { all, get, put, enqueue, Row, now, db, uid } from "./db.js";
import { decrypt, publicBase, publicLead, publicBooking } from "./security.js";
import { integration, providerFetch, ics, syncCalendar } from "./calendar.js";
import { emailCopy, lang } from "./i18n.js";
export function trigger(
  workspace: string,
  type: string,
  lead: Row,
  event: Row,
  booking?: Row,
) {
  for (const hook of all("webhook", workspace).filter(
    (h) => h.enabled && (h.events.includes(type) || h.events.includes("*")),
  )) {
    const cleanBooking = booking ? publicBooking(booking) : undefined;
    if (cleanBooking) delete cleanBooking.manageToken;
    enqueue(workspace, "webhook", {
      webhookId: hook.id,
      type,
      body: {
        id: uid(),
        type,
        createdAt: now(),
        data: {
          lead: publicLead(lead),
          booking: cleanBooking,
          eventId: event.id,
        },
      },
    });
  }
  const triggers =
    booking && ["booking.created", "booking.rescheduled"].includes(type)
      ? [type, "booking.before", "booking.started", "booking.ended"]
      : [type];
  for (const wf of all("workflow", workspace).filter(
    (w) =>
      w.enabled &&
      triggers.includes(w.trigger) &&
      (!w.eventIds.length || w.eventIds.includes(event.id)),
  )) {
    let due = Date.now() + wf.delayMinutes * 60000;
    if (wf.trigger === "booking.before")
      due = Date.parse(booking!.start) - wf.delayMinutes * 60000;
    if (wf.trigger === "booking.started")
      due = Date.parse(booking!.start) + wf.delayMinutes * 60000;
    if (wf.trigger === "booking.ended")
      due = Date.parse(booking!.end) + wf.delayMinutes * 60000;
    if (wf.trigger === "booking.before" && due < Date.now()) continue;
    for (const action of wf.actions)
      enqueue(
        workspace,
        "message",
        {
          ...action,
          leadId: lead.id,
          eventId: event.id,
          bookingId: booking?.id,
          version: booking?.version,
          workflowId: wf.id,
          trigger: wf.trigger,
          skipIfBooked: wf.skipIfBooked,
        },
        new Date(due).toISOString(),
      );
  }
}
export function bookingJobs(
  b: Row,
  event: Row,
  lead: Row,
  type = "booking.created",
) {
  enqueue(b.workspace, "calendar", { bookingId: b.id, version: b.version });
  const notification = {
    leadId: lead.id,
    eventId: event.id,
    bookingId: b.id,
    version: b.version,
    channel: "email",
    recipient: "invitee",
    attachCalendar: true,
    trigger: type,
  };
  const cancelled = b.status === "cancelled",
    copy = emailCopy[lang(event.language)];
  if (
    cancelled
      ? event.notifications.cancellation
      : event.notifications.confirmation
  )
    enqueue(b.workspace, "message", {
      ...notification,
      subject: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
      body: cancelled ? copy.cancelledBody : copy.confirmedBody,
    });
  if (event.notifications.host)
    enqueue(b.workspace, "message", {
      ...notification,
      recipient: "host",
      subject: cancelled
        ? copy.hostCancelledSubject
        : type === "booking.rescheduled"
          ? copy.hostRescheduledSubject
          : copy.hostNewSubject,
      body: copy.hostBody,
    });
  if (!cancelled)
    for (const [channel, minutes] of [
      ["email", event.notifications.emailReminders],
      ["sms", event.notifications.smsReminders],
    ] as [string, number[]][]) {
      for (const delay of minutes) {
        const due = Date.parse(b.start) - delay * 60000;
        if (due > Date.now())
          enqueue(
            b.workspace,
            "message",
            {
              ...notification,
              channel,
              attachCalendar: false,
              trigger: "booking.before",
              subject: copy.reminderSubject,
              body: copy.reminderBody,
            },
            new Date(due).toISOString(),
          );
      }
    }
  trigger(b.workspace, type, lead, event, b);
}
export function variables(lead: Row, event: Row, booking?: Row, host?: Row) {
  const zone = lead.timezone || event.timezone,
    language = lang(event.language),
    copy = emailCopy[language];
  const date = booking
    ? DateTime.fromISO(booking.start)
        .setZone(zone)
        .setLocale(language === "en" ? "en-US" : "fr")
    : null;
  return {
    first_name: lead.firstName,
    last_name: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    event_name: event.name,
    host_name: host?.name || "",
    date: date?.toLocaleString(DateTime.DATE_FULL) || "",
    time: date?.toFormat(language === "en" ? "h:mm a" : "HH:mm") || "",
    timezone: zone,
    location:
      booking?.meetingUrl ||
      event.location ||
      (event.locationType === "phone" ? copy.phoneCall : copy.linkLater),
    event_link: `${publicBase()}/book/${event.slug}`,
    manage_link: booking ? `${publicBase()}/manage/${booking.manageToken}` : "",
    reschedule_link: booking
      ? `${publicBase()}/manage/${booking.manageToken}`
      : "",
    cancel_link: booking ? `${publicBase()}/manage/${booking.manageToken}` : "",
    answers: Object.entries(lead.answers || {})
      .map(
        ([k, v]) =>
          `${event.questions.find((q: Row) => q.id === k)?.label || k}: ${v}`,
      )
      .join("\n"),
  };
}
export function render(template: string, vars: Row) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) =>
    String(vars[k] ?? ""),
  );
}
export function privateAddress(ip: string) {
  return (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|224\.|240\.|255\.)/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    ip === "::" ||
    /^f[cd]/i.test(ip) ||
    /^fe[89ab]/i.test(ip) ||
    ip.toLowerCase().includes("::ffff:")
  );
}
export async function postWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443")
  )
    throw new Error("Webhook: HTTPS public sur le port 443 requis.");
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
    throw new Error("Webhook: adresse privée interdite.");
  const target = addresses[0];
  return new Promise<void>((resolve, reject) => {
    const req = https.request(
      u,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
        lookup: ((_h: any, _o: any, cb: any) =>
          cb(null, target.address, target.family)) as any,
      },
      (res) => {
        res.resume();
        res.on("end", () =>
          res.statusCode! >= 200 && res.statusCode! < 300
            ? resolve()
            : reject(new Error(`Webhook HTTP ${res.statusCode}`)),
        );
      },
    );
    req.setTimeout(15000, () => req.destroy(new Error("Webhook timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
export async function dispatch(job: Row) {
  const p = JSON.parse(job.payload);
  if (job.kind === "webhook") {
    const hook = get("webhook", p.webhookId, job.workspace);
    if (!hook?.enabled) return { skipped: true };
    const body = JSON.stringify(p.body),
      timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = createHmac("sha256", decrypt(hook.secret))
      .update(timestamp + "." + body)
      .digest("hex");
    await postWebhook(hook.url, body, {
      "X-CloseOS-Event": p.type,
      "X-CloseOS-Id": p.body.id,
      "X-CloseOS-Timestamp": timestamp,
      "X-CloseOS-Signature": `v1=${sig}`,
    });
    return { providerId: p.body.id };
  }
  if (job.kind === "calendar_cleanup") {
    const old = p.snapshot;
    const e = get("event", p.eventId, job.workspace),
      l = get("lead", p.leadId, job.workspace),
      h = db
        .prepare("SELECT id,name,email FROM users WHERE id=?")
        .get(old.hostId) as Row;
    if (!e || !l || !h) return { skipped: true };
    await syncCalendar(old, e, l, h);
    return { providerId: old.externalEventId };
  }
  const booking = p.bookingId
    ? get("booking", p.bookingId, job.workspace)
    : null;
  if (p.bookingId && !booking) return { skipped: true };
  if (booking && p.version !== booking.version) return { skipped: true };
  const event = get("event", booking?.eventId || p.eventId, job.workspace),
    lead = get("lead", booking?.leadId || p.leadId, job.workspace);
  if (!lead || !event) return { skipped: true };
  const host = booking
    ? (db
        .prepare("SELECT id,name,email FROM users WHERE id=?")
        .get(booking.hostId) as Row)
    : undefined;
  if (job.kind === "calendar") {
    try {
      const result = await syncCalendar(booking!, event, lead, host!);
      const latest = get("booking", booking!.id)!;
      if (latest.version !== booking!.version) {
        if (latest.hostId !== booking!.hostId && result.externalEventId) {
          enqueue(job.workspace, "calendar_cleanup", {
            snapshot: { ...booking!, ...result, status: "cancelled" },
            eventId: event.id,
            leadId: lead.id,
          });
          return { skipped: true };
        }
        // Retain the provider identifier so the queued newer version can
        // update/delete the event that was just created during this request.
        put(
          "booking",
          job.workspace,
          {
            ...latest,
            externalEventId: result.externalEventId || latest.externalEventId,
            calendarConnectionId:
              result.calendarConnectionId || latest.calendarConnectionId,
            externalCalendarId:
              result.externalCalendarId || latest.externalCalendarId,
          },
          latest.id,
        );
        return { skipped: true };
      }
      put(
        "booking",
        job.workspace,
        {
          ...get("booking", booking!.id)!,
          ...result,
          calendarStatus: result.mode === "ics" ? "ics" : "synced",
          calendarError: null,
        },
        booking!.id,
      );
      return { providerId: result.externalEventId || "ics" };
    } catch (e) {
      put(
        "booking",
        job.workspace,
        {
          ...get("booking", booking!.id)!,
          calendarStatus: "error",
          calendarError: String(e).slice(0, 300),
        },
        booking!.id,
      );
      throw e;
    }
  }
  if (p.workflowId) {
    const w = get("workflow", p.workflowId, job.workspace);
    if (!w?.enabled) return { skipped: true };
  }
  if (
    p.skipIfBooked &&
    p.trigger.startsWith("lead.") &&
    lead.status === "booked"
  )
    return { skipped: true };
  if (booking?.status === "cancelled" && p.trigger !== "booking.cancelled")
    return { skipped: true };
  if (
    booking &&
    ["pending", "error"].includes(booking.calendarStatus) &&
    all("calendar", job.workspace).some(
      (c) => c.userId === booking.hostId && c.writeEvents !== false,
    )
  ) {
    throw new Error(
      "Invitation calendrier en attente : la notification attend sa synchronisation.",
    );
  }
  if (
    p.trigger === "booking.before" &&
    Date.parse(booking!.start) <= Date.now()
  )
    return { skipped: true };
  const vars = variables(lead, event, booking || undefined, host),
    body = render(p.body, vars),
    subject = render(p.subject || "", vars);
  if (p.channel === "email") {
    const to = p.recipient === "host" ? host?.email : lead.email;
    if (!to) return { skipped: true };
    const c = integration(job.workspace, "resend");
    if (!c?.apiKey || !c.from)
      throw new Error(
        "Resend non configuré : ajoutez une clé API et une adresse expéditrice vérifiée.",
      );
    const payload: Row = { from: c.from, to: [to], subject, text: body };
    if (c.replyTo) payload.reply_to = c.replyTo;
    if (p.attachCalendar && booking && booking.calendarStatus !== "synced")
      payload.attachments = [
        {
          filename: "invitation.ics",
          content: Buffer.from(ics(booking, event, lead, host!)).toString(
            "base64",
          ),
          content_type:
            "text/calendar; charset=utf-8; method=" +
            (booking.status === "cancelled" ? "CANCEL" : "REQUEST"),
        },
      ];
    const data = await providerFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.id,
      },
      body: JSON.stringify(payload),
    });
    return { providerId: data.id };
  }
  if (!lead.smsConsent || !lead.phone) return { skipped: true };
  const twilio = integration(job.workspace, "twilio"),
    brevo = integration(job.workspace, "brevo");
  if (twilio?.accountSid && twilio?.authToken) {
    const data = await providerFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(twilio.accountSid + ":" + twilio.authToken).toString(
              "base64",
            ),
        },
        body: new URLSearchParams({
          To: lead.phone,
          From: twilio.from,
          Body: body,
        }),
      },
    );
    return { providerId: data.sid };
  }
  if (brevo?.apiKey) {
    const data = await providerFetch(
      "https://api.brevo.com/v3/transactionalSMS/sms",
      {
        method: "POST",
        headers: {
          "api-key": brevo.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: brevo.sender,
          recipient: lead.phone,
          content: body,
          type: "transactional",
          unicodeEnabled: true,
        }),
      },
    );
    return { providerId: String(data.messageId) };
  }
  throw new Error("SMS non configuré : connectez Twilio ou Brevo.");
}
let running = false;
export async function tick() {
  if (running) return;
  running = true;
  try {
    db.prepare(
      "UPDATE jobs SET status='retry',due=?,updated=? WHERE status='processing' AND updated<? AND kind!='message'",
    ).run(now(), now(), new Date(Date.now() - 120000).toISOString());
    db.prepare(
      "UPDATE jobs SET status='uncertain',error='Envoi interrompu : vérifier le fournisseur avant de relancer.',updated=? WHERE status='processing' AND updated<? AND kind='message'",
    ).run(now(), new Date(Date.now() - 120000).toISOString());
    const jobs = db
      .prepare(
        "SELECT * FROM jobs WHERE status IN ('pending','retry') AND due<=? ORDER BY CASE kind WHEN 'calendar' THEN 0 ELSE 1 END,due LIMIT 25",
      )
      .all(now()) as Row[];
    for (const job of jobs) {
      const claimed = db
        .prepare(
          "UPDATE jobs SET status='processing',attempts=attempts+1,updated=? WHERE id=? AND status IN ('pending','retry')",
        )
        .run(now(), job.id);
      if (!claimed.changes) continue;
      try {
        const result = await dispatch(job);
        db.prepare(
          "UPDATE jobs SET status=?,providerId=?,error=NULL,updated=? WHERE id=?",
        ).run(
          result.skipped ? "skipped" : "sent",
          result.providerId || null,
          now(),
          job.id,
        );
      } catch (e) {
        const message = String((e as Error).message).slice(0, 400),
          p = JSON.parse(job.payload);
        const uncertain =
          job.kind === "message" &&
          p.channel === "sms" &&
          /timeout|abort|fetch failed|socket/i.test(message);
        const blocked = /non configuré/.test(message);
        const attempts = job.attempts + 1;
        db.prepare(
          "UPDATE jobs SET status=?,error=?,due=?,updated=? WHERE id=?",
        ).run(
          uncertain
            ? "uncertain"
            : blocked
              ? "blocked"
              : attempts >= 5
                ? "failed"
                : "retry",
          message,
          new Date(
            Date.now() + Math.min(3600000, 30000 * 2 ** attempts),
          ).toISOString(),
          now(),
          job.id,
        );
      }
    }
  } finally {
    running = false;
  }
}
