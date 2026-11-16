import React, { useState, useEffect, useRef } from "react";
import { api, Data, setApiLanguage } from "./api";
import { bookingText, BookingText, eventText, Lang } from "./bookingText";
import "@fontsource-variable/inter";
import "./booking.css";
const memory: Record<string, string> = {};
const safeStorage = {
  getItem: (k: string) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return memory[k] || null;
    }
  },
  setItem: (k: string, v: string) => {
    memory[k] = v;
    try {
      sessionStorage.setItem(k, v);
    } catch {}
  },
  removeItem: (k: string) => {
    delete memory[k];
    try {
      sessionStorage.removeItem(k);
    } catch {}
  },
};
const tz = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Paris";
const dateKey = (d: string | Date, zone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(d));
const fmt = (d: string, zone: string, locale: string) =>
  new Date(d).toLocaleString(locale, {
    timeZone: zone,
    dateStyle: "full",
    timeStyle: "short",
  });
const TZ_COUNTRY: Record<string, string> = {
  "Europe/Paris": "FR",
  "Europe/Brussels": "BE",
  "Europe/Zurich": "CH",
  "Europe/Luxembourg": "LU",
  "Europe/Monaco": "MC",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Madrid": "ES",
  "Europe/Lisbon": "PT",
  "Europe/Rome": "IT",
  "Europe/Berlin": "DE",
  "Europe/Amsterdam": "NL",
  "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Dakar": "SN",
  "Africa/Abidjan": "CI",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Singapore": "SG",
  "Asia/Hong_Kong": "HK",
  "Asia/Tokyo": "JP",
  "Asia/Kolkata": "IN",
  "Indian/Reunion": "RE",
  "Indian/Mauritius": "MU",
  "America/Martinique": "MQ",
  "America/Guadeloupe": "GP",
  "America/Montreal": "CA",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
};
const SHARED_CODE: Record<string, string> = {
  "1": "US",
  "7": "RU",
  "44": "GB",
  "47": "NO",
  "61": "AU",
  "212": "MA",
  "262": "RE",
  "590": "GP",
  "599": "CW",
};
function guessCountry() {
  const z = tz();
  if (TZ_COUNTRY[z]) return TZ_COUNTRY[z];
  if (z.startsWith("America/")) return "US";
  if (z.startsWith("Australia/")) return "AU";
  const r = (navigator.language || "").split("-")[1];
  return r && /^[A-Z]{2}$/.test(r) ? r : "FR";
}
const flag = (cc: string) =>
  String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => 127397 + c.charCodeAt(0)),
  );
type PhoneLib = typeof import("libphonenumber-js/min");
function Chevron({ dir = "right" }: { dir?: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
const zones = [
  "Europe/Paris",
  "Europe/London",
  "Europe/Brussels",
  "Europe/Zurich",
  "Africa/Casablanca",
  "Africa/Abidjan",
  "Asia/Dubai",
  "America/New_York",
  "America/Montreal",
  "America/Los_Angeles",
  "Asia/Singapore",
  "UTC",
];
function track(name: string, detail: Data = {}) {
  if (window.parent !== window)
    window.parent.postMessage({ type: "closeos." + name, ...detail }, "*");
  window.dispatchEvent(new CustomEvent("closeos." + name, { detail }));
}
const embedded = (() => {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
})();
function go(url: string) {
  if (!/^https?:\/\//i.test(url)) return;
  if (embedded) track("navigate", { url });
  else location.href = url;
}
function attribution() {
  const q = new URLSearchParams(location.search),
    a: Data = {
      referrer: document.referrer,
      landingPage: location.href,
      pageUrl: location.href,
    };
  for (const k of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "fbclid",
    "msclkid",
    "ttclid",
  ])
    if (q.get(k)) a[k] = q.get(k);
  return a;
}
function visitor() {
  let id = safeStorage.getItem("closeos.visitor");
  if (!id) {
    id = crypto.randomUUID();
    safeStorage.setItem("closeos.visitor", id);
  }
  return id;
}
function Calendar({
  month,
  setMonth,
  selected,
  onSelect,
  slots,
  zone,
  disabled = false,
  loading = false,
  t,
}: {
  t: BookingText;
  month: Date;
  setMonth: (d: Date) => void;
  selected: string;
  onSelect: (s: string) => void;
  slots: Data[];
  zone: string;
  disabled?: boolean;
  loading?: boolean;
}) {
  const y = month.getUTCFullYear(),
    m = month.getUTCMonth(),
    days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(),
    offset = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const today = dateKey(new Date(), zone),
    previewEnd = dateKey(new Date(Date.now() + 6 * 864e5), zone);
  const available = new Set(slots.map((s) => dateKey(s.start, zone)));
  return (
    <div className={"booking-calendar " + (disabled ? "locked" : "")}>
      <div className="month-nav">
        <strong>
          {month.toLocaleDateString(t.locale, {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </strong>
        <div>
          <button
            type="button"
            aria-label={t.prevMonth}
            disabled={
              disabled ||
              new Date(Date.UTC(y, m, 1)) <=
                new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
            onClick={() => setMonth(new Date(Date.UTC(y, m - 1, 1)))}
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            aria-label={t.nextMonth}
            disabled={disabled}
            onClick={() => setMonth(new Date(Date.UTC(y, m + 1, 1)))}
          >
            <Chevron />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {Array.from({ length: 7 }, (_, i) =>
          new Date(Date.UTC(2023, 0, 1 + i)).toLocaleDateString(t.locale, {
            weekday: "short",
            timeZone: "UTC",
          }),
        ).map((d, i) => (
          <span className="day-label" key={i}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"empty" + i} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const day = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`,
            weekday = (offset + i) % 7,
            can = disabled
              ? day >= today && day <= previewEnd && weekday > 0 && weekday < 6
              : available.has(day);
          return (
            <button
              type="button"
              key={day}
              aria-label={t.chooseDay + day}
              disabled={disabled || !can}
              onClick={() => onSelect(day)}
              className={
                (can ? "available " : "") + (selected === day ? "selected" : "")
              }
            >
              {i + 1}
              {day === today && <i />}
            </button>
          );
        })}
      </div>
      {loading && (
        <div className="calendar-loading">
          <span className="spinner" /> {t.searchingSlots}
        </div>
      )}
    </div>
  );
}
function EmailField({
  form,
  setForm,
  touched,
  setTouched,
  className = "",
  t,
}: {
  t: BookingText;
  form: Data;
  setForm: (f: Data) => void;
  touched: boolean;
  setTouched: (t: boolean) => void;
  className?: string;
}) {
  const invalid =
    touched && !!form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  return (
    <label className={"booking-field " + className}>
      <span className="booking-sr">{t.email}</span>
      <input
        type="email"
        autoComplete="email"
        placeholder={t.email}
        value={form.email}
        aria-invalid={invalid || undefined}
        onBlur={() => setTouched(true)}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      {invalid && <em className="booking-field-error">{t.invalidEmail}</em>}
    </label>
  );
}
export default function Booking() {
  const isManage = location.pathname.startsWith("/manage/"),
    id = decodeURIComponent(location.pathname.split("/")[2] || "");
  const [event, setEvent] = useState<Data | null>(null),
    [managed, setManaged] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState("contact");
  const [month, setMonth] = useState(
      new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1)),
    ),
    [selected, setSelected] = useState(""),
    [slot, setSlot] = useState(""),
    [slotList, setSlotList] = useState<Data[]>([]),
    [slotsLoading, setSlotsLoading] = useState(false),
    [zone, setZone] = useState(tz());
  const L: Lang = event
    ? event.language === "en"
      ? "en"
      : "fr"
    : /^fr\b/i.test(navigator.language || "fr")
      ? "fr"
      : "en";
  const t = bookingText[L];
  useEffect(() => {
    setApiLanguage(L);
    document.documentElement.lang = L;
  }, [L]);
  const storeKey = "closeos.form." + id;
  const initial = (() => {
    try {
      return JSON.parse(safeStorage.getItem(storeKey) || "{}");
    } catch {
      return {};
    }
  })();
  const q = new URLSearchParams(location.search);
  const [form, setForm] = useState<Data>({
    firstName: initial.firstName || q.get("first_name") || "",
    lastName: initial.lastName || q.get("last_name") || "",
    email: initial.email || q.get("email") || "",
    phone: initial.phone || q.get("phone") || "",
    smsConsent: initial.smsConsent || false,
    website: "",
  });
  const [leadToken, setLeadToken] = useState(initial.token || "");
  const tokenRef = useRef(initial.token || "");
  const [answers, setAnswers] = useState<Data>(initial.answers || {});
  const [phoneEngaged, setPhoneEngaged] = useState(false);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [emailRevealed, setEmailRevealed] = useState(
    Boolean(
      initial.email ||
      q.get("email") ||
      initial.firstName ||
      initial.lastName ||
      q.get("first_name") ||
      q.get("last_name"),
    ),
  );
  const [phoneComplete, setPhoneComplete] = useState(false);
  const [country, setCountry] = useState(guessCountry);
  const [phoneLib, setPhoneLib] = useState<PhoneLib | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  useEffect(() => {
    if (!event || event.primaryContact === "email") return;
    let current = true;
    void import("libphonenumber-js/min")
      .then((lib) => {
        if (!current) return;
        setPhoneLib(lib);
        setForm((f: Data) => {
          if (f.phone) return f;
          try {
            return {
              ...f,
              phone: "+" + lib.getCountryCallingCode(country as any),
            };
          } catch {
            return f;
          }
        });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [event]);
  useEffect(() => {
    if (!phoneLib || !form.phone.startsWith("+")) return;
    const digits = form.phone.slice(1);
    try {
      if (digits.startsWith(phoneLib.getCountryCallingCode(country as any)))
        return;
    } catch {}
    for (const len of [3, 2, 1]) {
      const code = digits.slice(0, len);
      if (code.length < len) continue;
      const match = phoneLib
        .getCountries()
        .filter((c) => phoneLib.getCountryCallingCode(c) === code);
      if (match.length) {
        setCountry(
          match.includes(SHARED_CODE[code] as any)
            ? SHARED_CODE[code]
            : match[0],
        );
        return;
      }
    }
  }, [form.phone, phoneLib]);
  const countryOptions = React.useMemo(() => {
    if (!phoneLib) return [];
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([L], { type: "region" });
    } catch {}
    return phoneLib
      .getCountries()
      .map((c) => ({
        c,
        code: phoneLib.getCountryCallingCode(c),
        name: names?.of(c) || c,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, L));
  }, [phoneLib, L]);
  useEffect(() => {
    let current = true;
    setPhoneComplete(false);
    if (form.phone)
      void import("libphonenumber-js/min")
        .then(({ isPossiblePhoneNumber }) => {
          if (current) setPhoneComplete(isPossiblePhoneNumber(form.phone));
        })
        .catch(() => {
          if (current) setError(t.phoneCheckFailed);
        });
    return () => {
      current = false;
    };
  }, [form.phone]);
  useEffect(() => {
    if (phoneComplete) setEmailRevealed(true);
    phoneInput.current?.setCustomValidity(
      form.phone && !phoneComplete ? t.phoneIncomplete : "",
    );
  }, [phoneComplete, form.phone, event, step]);
  const attr = useRef<Data>(attribution()),
    saving = useRef<Promise<any> | null>(null),
    active = useRef(true),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmation, setConfirmation] = useState<Data | null>(null);
  useEffect(() => {
    if (event?.name) document.title = event.name;
  }, [event?.name]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isManage) {
          const d = await api("/public/bookings/" + id);
          if (mounted) {
            setManaged(d);
            setEvent(d.event);
            setStep("manage");
          }
        } else {
          const d = await api("/public/events/" + id);
          if (mounted) setEvent(d.event);
          await api("/public/events/" + id + "/visits", "POST", {
            visitorId: visitor(),
            attribution: attr.current,
          });
        }
      } catch (e) {
        if (mounted) setError((e as Error).message);
      }
    })();
    const receive = (e: MessageEvent) => {
      if (e.source !== window.parent || e.data?.type !== "closeos.context")
        return;
      attr.current = { ...attr.current, ...e.data.attribution };
    };
    addEventListener("message", receive);
    track("ready", { slug: id });
    const measure = () => {
      const root = document.querySelector(".booking-root");
      return Math.ceil(
        root
          ? root.getBoundingClientRect().height
          : document.body.getBoundingClientRect().height,
      );
    };
    const resize = new ResizeObserver(() =>
      track("resize", { height: measure() }),
    );
    resize.observe(document.body);
    const rootEl = document.querySelector(".booking-root");
    if (rootEl) resize.observe(rootEl);
    return () => {
      mounted = false;
      removeEventListener("message", receive);
      resize.disconnect();
    };
  }, [id]);
  const capture = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) && !phoneComplete)
      return null;
    if (saving.current) await saving.current;
    const promise = api("/public/events/" + id + "/leads", "POST", {
      ...form,
      phone: /^\+\d{0,4}$/.test(form.phone) ? "" : form.phone,
      token: tokenRef.current || undefined,
      visitorId: visitor(),
      attribution: attr.current,
    });
    saving.current = promise;
    try {
      const result = await promise;
      tokenRef.current = result.token;
      setLeadToken(result.token);
      safeStorage.setItem(
        storeKey,
        JSON.stringify({ ...form, token: result.token, answers }),
      );
      track("lead_captured", { leadId: result.id });
      return result.token;
    } finally {
      if (saving.current === promise) saving.current = null;
    }
  };
  useEffect(() => {
    if (isManage || !event || step !== "contact" || busy) return;
    timer.current = setTimeout(() => {
      void capture().catch(() => {});
    }, 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, event, step, phoneComplete]);
  const qualify = async (t: string) => {
    const r = await api("/public/events/" + id + "/qualify", "POST", {
      token: t,
      answers,
      timezone: zone,
    });
    track(r.status, { leadId: undefined });
    if (r.status === "disqualified") {
      setStep("disqualified");
      if (r.redirectUrl) setTimeout(() => go(r.redirectUrl), 1800);
    } else {
      setStep("slots");
    }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (timer.current) clearTimeout(timer.current);
    try {
      const t = await capture();
      if (!t) throw new Error(t.contactRequired);
      if (event!.questions.length && step === "contact") setStep("questions");
      else await qualify(t);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const submitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      safeStorage.setItem(
        storeKey,
        JSON.stringify({ ...form, token: tokenRef.current, answers }),
      );
      await qualify(tokenRef.current);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!["slots", "reschedule"].includes(step) || !event) return;
    let mounted = true;
    setSlotsLoading(true);
    setSlot("");
    const from = month.toISOString().slice(0, 10);
    const endpoint = isManage
      ? `/public/bookings/${id}/slots?from=${from}`
      : `/public/events/${id}/slots?token=${encodeURIComponent(leadToken)}&from=${from}&days=31`;
    api(endpoint)
      .then((r) => {
        if (!mounted) return;
        setSlotList(r.slots);
        const first = r.slots[0];
        if (first) setSelected(dateKey(first.start, zone));
        else setSelected("");
        setError("");
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      })
      .finally(() => {
        if (mounted) setSlotsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [step, month, leadToken, zone]);
  const reserve = async () => {
    if (!slot) return;
    setBusy(true);
    setError("");
    try {
      if (isManage) {
        await api("/public/bookings/" + id + "/reschedule", "POST", {
          start: slot,
        });
        const result = await api("/public/bookings/" + id);
        setManaged(result);
        setStep("manage");
        track("rescheduled", { bookingId: result.booking.id });
      } else {
        const r = await api("/public/events/" + id + "/bookings", "POST", {
          token: leadToken,
          start: slot,
        });
        setConfirmation(r);
        setStep("confirmed");
        safeStorage.removeItem(storeKey);
        track("booked", {
          bookingId: r.booking.id,
          eventId: event!.id,
          start: r.booking.start,
        });
        if (event!.redirectUrl) {
          const u = new URL(event!.redirectUrl);
          u.searchParams.set("booking_id", r.booking.id);
          setTimeout(() => go(u.toString()), 2500);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!event)
    return (
      <div className={"booking-root" + (embedded ? " embed" : "")}>
        <div className="booking-loading">
          {error ? (
            <>
              <h2>{t.unavailableTitle}</h2>
              <p>{error}</p>
            </>
          ) : (
            <>
              <span className="spinner" />
              {t.loadingCalendar}
            </>
          )}
        </div>
      </div>
    );
  const done = step === "confirmed" || step === "manage";
  const b = confirmation?.booking || managed?.booking;
  const link = confirmation?.manageUrl || location.href;
  const currentSlots = slotList.filter(
    (s) => dateKey(s.start, zone) === selected,
  );
  return (
    <div
      className={"booking-root" + (embedded ? " embed" : "")}
      style={
        {
          "--accent": event.color,
          "--accent-dark": event.color,
        } as React.CSSProperties
      }
    >
      <div
        className={
          "booking-widget " +
          (done || step === "disqualified" ? "complete" : "")
        }
      >
        <div className="booking-steps">
          <span
            className={
              ["contact", "questions"].includes(step) ? "active" : "done"
            }
          >
            <i />
            {done ? t.stepConfirmed : t.stepForm}
          </span>
          {!done && (
            <span
              className={["slots", "reschedule"].includes(step) ? "active" : ""}
            >
              <i />
              {t.stepBook}
            </span>
          )}
        </div>
        {done ? (
          <div className="booking-confirmation">
            <div
              className={
                "success-circle " +
                (b.status === "cancelled" ? "cancelled" : "")
              }
            >
              {b.status === "cancelled" ? "×" : "✓"}
            </div>
            <h1>
              {b.status === "cancelled" ? t.cancelledTitle : t.confirmedTitle}
            </h1>
            <p>
              {b.status === "cancelled"
                ? t.bookAgainText
                : eventText(
                    event.confirmationMessage,
                    "confirmationMessage",
                    L,
                  )}
            </p>
            <div className="confirmation-details">
              <h2>{event.name}</h2>
              <p>◷ {fmt(b.start, zone, t.locale)}</p>
              <p>◉ {zone}</p>
              <p>♙ {managed?.host?.name || t.yourHost}</p>
              {(b.meetingUrl || event.location) && (
                <a
                  href={b.meetingUrl || event.location}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t.joinMeeting}
                </a>
              )}
            </div>
            <div className="booking-buttons">
              {b.status !== "cancelled" && (
                <a
                  className="btn primary"
                  href={
                    "/api/v1/public/bookings/" + b.manageToken + "/calendar.ics"
                  }
                >
                  {t.addToCalendar}
                </a>
              )}
              {!isManage && (
                <a className="btn" href={link}>
                  {t.rescheduleOrCancel}
                </a>
              )}
              {isManage && b.status === "confirmed" && (
                <>
                  <button className="btn" onClick={() => setStep("reschedule")}>
                    {t.reschedule}
                  </button>
                  <button
                    className="btn danger"
                    onClick={() => setStep("cancel")}
                  >
                    {t.cancel}
                  </button>
                </>
              )}
              {b.status === "cancelled" && (
                <a className="btn primary" href={"/book/" + event.slug}>
                  {t.pickNewSlot}
                </a>
              )}
            </div>
            <label className="booking-timezone">
              {t.timezone}{" "}
              <select value={zone} onChange={(e) => setZone(e.target.value)}>
                {[...new Set([tz(), ...zones])].map((z) => (
                  <option key={z}>{z}</option>
                ))}
              </select>
            </label>
          </div>
        ) : step === "cancel" ? (
          <div className="booking-confirmation">
            <h1>{t.cancelTitle}</h1>
            <p>
              {event.name} · {fmt(managed!.booking.start, zone, t.locale)}
            </p>
            <textarea
              aria-label={t.cancelReasonLabel}
              placeholder={t.cancelReasonPlaceholder}
              onChange={(e) => setAnswers({ reason: e.target.value })}
            />
            <div className="booking-buttons">
              <button className="btn" onClick={() => setStep("manage")}>
                {t.keepBooking}
              </button>
              <button
                className="btn danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/public/bookings/" + id + "/cancel", "POST", {
                      reason: answers.reason || "",
                    });
                    setManaged(await api("/public/bookings/" + id));
                    setStep("manage");
                    track("cancelled");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t.confirmCancel}
              </button>
            </div>
          </div>
        ) : step === "disqualified" ? (
          <div className="booking-confirmation">
            <div className="success-circle">✓</div>
            <h1>{t.thanksTitle}</h1>
            <p>{eventText(event.disqualifyMessage, "disqualifyMessage", L)}</p>
          </div>
        ) : (
          <div className="booking-columns">
            <section className="booking-info">
              {event.showOrganizerBrand !== false && (
                <div className="booking-brand">
                  {event.logoUrl ? (
                    <img
                      src={event.logoUrl}
                      alt={event.brandName}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <>
                      <span>◈</span> {event.brandName || "CloseOS"}
                    </>
                  )}
                </div>
              )}
              <h1>{event.name}</h1>
              {["slots", "reschedule"].includes(step) && (
                <div className="booking-meta">
                  <span>
                    ◷ {event.duration} {t.minutes}
                  </span>
                  <span>
                    ◉{" "}
                    {event.locationType === "phone"
                      ? t.phoneCall
                      : event.locationType === "in_person"
                        ? event.location
                        : t.videoCall}
                  </span>
                </div>
              )}
              <div className="booking-description">{event.description}</div>
              {step === "contact" && (
                <form onSubmit={submit} className="booking-form">
                  <div className="honeypot" aria-hidden="true">
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      name="website"
                      value={form.website}
                      onChange={(e) =>
                        setForm({ ...form, website: e.target.value })
                      }
                    />
                  </div>
                  {event.primaryContact !== "email" && (
                    <div
                      className={
                        "booking-field booking-phone" +
                        (!phoneEngaged && !phoneComplete ? " phone-prompt" : "")
                      }
                    >
                      <label className="booking-sr" htmlFor="closeos-phone">
                        {t.phone}
                      </label>
                      <div className="phone-country">
                        <span aria-hidden="true">{flag(country)}</span>
                        <i aria-hidden="true" />
                        <select
                          aria-label={t.countryCode}
                          value={country}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCountry(next);
                            if (phoneLib)
                              setForm({
                                ...form,
                                phone:
                                  "+" +
                                  phoneLib.getCountryCallingCode(next as any),
                              });
                            phoneInput.current?.focus();
                          }}
                        >
                          {!countryOptions.length && (
                            <option value={country}>{country}</option>
                          )}
                          {countryOptions.map((o) => (
                            <option key={o.c} value={o.c}>
                              {o.name} +{o.code}
                            </option>
                          ))}
                        </select>
                      </div>
                      <input
                        id="closeos-phone"
                        type="tel"
                        ref={phoneInput}
                        autoComplete="tel"
                        placeholder={t.phonePlaceholder}
                        value={form.phone}
                        onChange={(e) => {
                          setPhoneEngaged(true);
                          let v = e.target.value.replace(/[^\d+]/g, "");
                          if (v && !v.startsWith("+"))
                            v = "+" + v.replace(/\+/g, "");
                          setForm({ ...form, phone: v });
                        }}
                        required
                        pattern="\+[1-9][0-9]{6,14}"
                      />
                    </div>
                  )}
                  {event.primaryContact === "email" && (
                    <EmailField
                      t={t}
                      form={form}
                      setForm={setForm}
                      touched={emailTouched}
                      setTouched={setEmailTouched}
                    />
                  )}
                  {(event.primaryContact === "email" ||
                    emailRevealed ||
                    phoneComplete) && (
                    <div
                      className={
                        "booking-names" +
                        (event.primaryContact === "email"
                          ? ""
                          : " booking-email-reveal")
                      }
                    >
                      <label className="booking-field">
                        <span className="booking-sr">{t.firstName}</span>
                        <input
                          autoComplete="given-name"
                          placeholder={t.firstName}
                          value={form.firstName}
                          onChange={(e) =>
                            setForm({ ...form, firstName: e.target.value })
                          }
                          required
                        />
                      </label>
                      <label className="booking-field">
                        <span className="booking-sr">{t.lastName}</span>
                        <input
                          autoComplete="family-name"
                          placeholder={t.lastName}
                          value={form.lastName}
                          onChange={(e) =>
                            setForm({ ...form, lastName: e.target.value })
                          }
                          required
                        />
                      </label>
                    </div>
                  )}
                  {event.primaryContact === "both" &&
                    (emailRevealed || phoneComplete) && (
                      <EmailField
                        t={t}
                        className="booking-email-reveal"
                        form={form}
                        setForm={setForm}
                        touched={emailTouched}
                        setTouched={setEmailTouched}
                      />
                    )}
                  <p className="booking-privacy">
                    {t.consentStart}{" "}
                    {event.termsUrl ? (
                      <a href={event.termsUrl} target="_blank" rel="noreferrer">
                        {t.terms}
                      </a>
                    ) : (
                      <strong>{t.terms}</strong>
                    )}{" "}
                    &amp;{" "}
                    {event.privacyUrl ? (
                      <a
                        href={event.privacyUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t.privacy}
                      </a>
                    ) : (
                      <strong>{t.privacy}</strong>
                    )}
                    .
                  </p>
                  <button className="booking-continue" disabled={busy}>
                    {busy
                      ? t.saving
                      : eventText(event.buttonText, "buttonText", L)}{" "}
                    <Chevron />
                  </button>
                </form>
              )}
              {step === "questions" && (
                <form onSubmit={submitAnswers}>
                  <button
                    type="button"
                    className="booking-back"
                    onClick={() => setStep("contact")}
                  >
                    {t.back}
                  </button>
                  {event.questions.map((q: Data) => (
                    <div
                      className="booking-field"
                      role="group"
                      aria-label={q.label}
                      key={q.id}
                    >
                      <span>
                        {q.label} {q.required && "*"}
                      </span>
                      {q.type === "textarea" ? (
                        <textarea
                          aria-label={q.label}
                          value={answers[q.id] || ""}
                          required={q.required}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        />
                      ) : q.type === "select" ? (
                        <select
                          aria-label={q.label}
                          value={answers[q.id] || ""}
                          required={q.required}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        >
                          <option value="">{t.selectAnswer}</option>
                          {q.options.map((o: string) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : ["radio", "checkbox"].includes(q.type) ? (
                        <div className="booking-options">
                          {q.options.map((o: string) => (
                            <label key={o}>
                              <input
                                type={q.type}
                                name={q.id}
                                required={q.type === "radio" && q.required}
                                checked={
                                  q.type === "checkbox"
                                    ? (answers[q.id] || []).includes(o)
                                    : answers[q.id] === o
                                }
                                onChange={() =>
                                  setAnswers({
                                    ...answers,
                                    [q.id]:
                                      q.type === "checkbox"
                                        ? (answers[q.id] || []).includes(o)
                                          ? answers[q.id].filter(
                                              (v: string) => v !== o,
                                            )
                                          : [...(answers[q.id] || []), o]
                                        : o,
                                  })
                                }
                              />
                              {o}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <input
                          type={q.type === "phone" ? "tel" : q.type}
                          aria-label={q.label}
                          value={answers[q.id] || ""}
                          required={q.required}
                          onChange={(e) =>
                            setAnswers({ ...answers, [q.id]: e.target.value })
                          }
                        />
                      )}
                    </div>
                  ))}
                  <button className="booking-continue" disabled={busy}>
                    {busy ? t.checking : t.chooseSlot} <Chevron />
                  </button>
                </form>
              )}
              {["slots", "reschedule"].includes(step) && (
                <>
                  <div className="booking-summary">
                    <strong>
                      {isManage ? managed?.lead.firstName : form.firstName}{" "}
                      {isManage ? managed?.lead.lastName : form.lastName}
                    </strong>
                    <span>
                      {isManage
                        ? managed?.lead.email
                        : form.email || form.phone}
                    </span>
                  </div>
                  <label className="booking-timezone">
                    {t.yourTimezone}
                    <select
                      value={zone}
                      onChange={(e) => setZone(e.target.value)}
                    >
                      {[...new Set([tz(), ...zones, event.timezone])].map(
                        (z) => (
                          <option key={z}>{z}</option>
                        ),
                      )}
                    </select>
                  </label>
                </>
              )}
            </section>
            <section className="booking-calendar-pane">
              <Calendar
                t={t}
                month={month}
                setMonth={setMonth}
                selected={selected}
                onSelect={(d) => {
                  setSelected(d);
                  setSlot("");
                }}
                slots={slotList}
                zone={zone}
                disabled={!["slots", "reschedule"].includes(step)}
                loading={slotsLoading}
              />
              {!["slots", "reschedule"].includes(step) && (
                <div className="calendar-lock-message">
                  <span>{t.lockMessage}</span>
                </div>
              )}
              {["slots", "reschedule"].includes(step) && !slotsLoading && (
                <div className="slots">
                  <h3>
                    {selected
                      ? new Date(selected + "T12:00:00Z").toLocaleDateString(
                          t.locale,
                          {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                            timeZone: "UTC",
                          },
                        )
                      : t.noSlots}
                  </h3>
                  {!selected && <p>{t.noSlotsHint}</p>}
                  <div className="slot-grid">
                    {currentSlots.map((s) => (
                      <button
                        key={s.start}
                        onClick={() => setSlot(s.start)}
                        className={slot === s.start ? "chosen" : ""}
                      >
                        {new Date(s.start).toLocaleTimeString(t.locale, {
                          timeZone: zone,
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </button>
                    ))}
                  </div>
                  {slot && (
                    <button
                      className="booking-continue"
                      disabled={busy}
                      onClick={reserve}
                    >
                      {busy
                        ? t.booking
                        : isManage
                          ? t.confirmReschedule
                          : t.confirmBooking}{" "}
                      <Chevron />
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
        {error && (
          <div className="booking-error" role="alert">
            {error}
          </div>
        )}
        {event.showBranding !== false && (
          <footer className="booking-footer">
            {t.poweredBy}{" "}
            <strong>
              <span>◈</span> CloseOS
            </strong>
          </footer>
        )}
      </div>
    </div>
  );
}
