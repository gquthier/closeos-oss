import React, { useState, useEffect } from "react";
import {
  Plus,
  Download,
  Users,
  Mail,
  Clock,
  Zap,
  ArrowRight,
  Trash2,
  ExternalLink,
  CalendarDays,
  ChevronRight,
  Phone,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  BellRing,
} from "lucide-react";
import { api, Data, labels, date, triggers, go } from "./api";
import {
  useData,
  useToast,
  PageHead,
  Loading,
  ErrorBox,
  SearchBox,
  Badge,
  Modal,
  Field,
  Toggle,
  Empty,
  CopyButton,
  ConfirmButton,
} from "./ui";
export default function Operations({
  section,
  me,
}: {
  section: string;
  me: Data;
}) {
  return section === "leads" ? (
    <Leads />
  ) : section === "calls" ? (
    <Calls />
  ) : section === "availability" ? (
    <Availability me={me} />
  ) : section === "automations" ? (
    <Automations me={me} />
  ) : (
    <Team me={me} />
  );
}
function Leads() {
  const [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<Data | null>(null),
    [offset, setOffset] = useState(0);
  const { data, error, loading, refresh } = useData(
      "/leads?limit=100&offset=" +
        offset +
        (filter ? "&status=" + filter : "") +
        "&q=" +
        encodeURIComponent(search),
    ),
    events = useData("/events"),
    toast = useToast();
  return (
    <>
      <PageHead
        title="Données globales"
        description="Chaque prospect compte. Retrouvez aussi ceux qui n’ont pas terminé leur réservation."
        action={
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await fetch("/api/v1/leads/export.csv", {
                  headers: {
                    "X-Workspace-Id":
                      localStorage.getItem("closeos.workspace") || "",
                  },
                });
                if (!r.ok) throw new Error("Export indisponible.");
                const url = URL.createObjectURL(await r.blob());
                const a = document.createElement("a");
                a.href = url;
                a.download = "closeos-leads.csv";
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <Download size={14} />
            Exporter CSV
          </button>
        }
      />
      <div className="tabs">
        {[
          ["", "Tous les prospects"],
          ["potential", "Potentiels"],
          ["qualified", "Qualifiés"],
          ["disqualified", "Disqualifiés"],
          ["booked", "Rendez-vous pris"],
        ].map(([v, l]) => (
          <button
            className={filter === v ? "active" : ""}
            key={v}
            onClick={() => {
              setFilter(v);
              setOffset(0);
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={(s) => {
            setSearch(s);
            setOffset(0);
          }}
          placeholder="Rechercher un nom, email, téléphone…"
        />
        <span className="muted" style={{ fontSize: 11 }}>
          {data?.total || 0} prospects
        </span>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : !data?.leads.length ? (
        <Empty
          title="Vos prochains clients arrivent ici"
          detail="Partagez un lien ou intégrez un calendrier. Les coordonnées seront capturées avant même la réservation."
          action={
            <button className="btn primary" onClick={() => go("/app/events")}>
              Voir mes événements
              <ArrowRight size={14} />
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Prospect",
                  "Téléphone",
                  "Statut",
                  "Événement",
                  "Source / Campagne",
                  "Créé le",
                  "",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.leads.map((l: Data) => (
                <tr key={l.id}>
                  <td>
                    <button
                      className="text-link cell-person"
                      onClick={() => setSelected(l)}
                    >
                      <span className="avatar">
                        {(l.firstName || l.email || "?")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                      <span>
                        <strong>
                          {[l.firstName, l.lastName]
                            .filter(Boolean)
                            .join(" ") || "Coordonnées partielles"}
                        </strong>
                        <small>{l.email || "Email non renseigné"}</small>
                      </span>
                    </button>
                  </td>
                  <td>{l.phone || "—"}</td>
                  <td>
                    <Badge value={l.status} />
                  </td>
                  <td>
                    {events.data?.events.find((e: Data) => e.id === l.eventId)
                      ?.name || "—"}
                  </td>
                  <td>
                    {l.firstTouch?.utm_source || "Direct"}
                    <small style={{ display: "block", marginTop: 4 }}>
                      {l.firstTouch?.utm_campaign || "—"}
                    </small>
                  </td>
                  <td>{date(l.createdAt)}</td>
                  <td>
                    <button
                      className="icon-btn"
                      aria-label="Voir le prospect"
                      onClick={() => setSelected(l)}
                    >
                      <ChevronRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(data?.total || 0) > 100 && (
        <div
          className="actions"
          style={{ justifyContent: "flex-end", marginTop: 18 }}
        >
          <button
            className="btn"
            disabled={!offset}
            onClick={() => setOffset(offset - 100)}
          >
            Précédent
          </button>
          <span>
            {offset + 1}–{Math.min(offset + 100, data!.total)}
          </span>
          <button
            className="btn"
            disabled={offset + 100 >= data!.total}
            onClick={() => setOffset(offset + 100)}
          >
            Suivant
          </button>
        </div>
      )}
      {selected && (
        <LeadDetail
          lead={selected}
          event={events.data?.events.find(
            (e: Data) => e.id === selected.eventId,
          )}
          onClose={() => setSelected(null)}
          onSaved={() => {
            refresh();
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
function LeadDetail({
  lead,
  event,
  onClose,
  onSaved,
}: {
  lead: Data;
  event?: Data;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [l, setL] = useState(lead),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={
        [l.firstName, l.lastName].filter(Boolean).join(" ") ||
        "Prospect en cours"
      }
      onClose={onClose}
      wide
    >
      <div className="detail-grid">
        <div className="detail-item">
          <small>Email</small>
          {l.email || "—"}
        </div>
        <div className="detail-item">
          <small>Téléphone</small>
          {l.phone || "—"}
        </div>
        <div className="detail-item">
          <small>Événement</small>
          {event?.name || "—"}
        </div>
        <div className="detail-item">
          <small>Statut</small>
          <Badge value={l.status} />
        </div>
        <div className="detail-item">
          <small>Première activité</small>
          {date(l.createdAt)}
        </div>
        <div className="detail-item">
          <small>Consentement SMS</small>
          {l.smsConsent ? "Accepté le " + date(l.consentAt) : "Non accepté"}
        </div>
      </div>
      <div className="detail-section">
        <h3>Réponses de qualification</h3>
        {Object.entries(l.answers || {}).length ? (
          Object.entries(l.answers).map(([k, v]) => (
            <div key={k} className="detail-item" style={{ marginBottom: 14 }}>
              <small>
                {event?.questions.find((q: Data) => q.id === k)?.label || k}
              </small>
              {Array.isArray(v) ? v.join(", ") : String(v)}
            </div>
          ))
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>
            Ce prospect n’a pas encore répondu aux questions.
          </p>
        )}
      </div>
      {[
        ["firstTouch", "Premier contact"],
        ["lastTouch", "Dernier contact"],
      ].map(([k, label]) => (
        <div className="detail-section" key={k}>
          <h3>Attribution · {label}</h3>
          <div className="detail-grid">
            {Object.entries(l[k] || {})
              .filter(([_, v]) => !!v)
              .map(([key, v]) => (
                <div className="detail-item" key={key}>
                  <small>{key}</small>
                  {String(v)}
                </div>
              ))}
          </div>
        </div>
      ))}
      <div className="detail-section">
        <div className="form-grid">
          <Field label="Étape personnalisée">
            <input
              value={l.stage || ""}
              onChange={(e) => setL({ ...l, stage: e.target.value })}
              placeholder="À rappeler, Offre envoyée…"
            />
          </Field>
          <Field label="Tags (séparés par des virgules)">
            <input
              value={(l.tags || []).join(", ")}
              onChange={(e) =>
                setL({
                  ...l,
                  tags: e.target.value.split(",").map((s) => s.trim()),
                })
              }
            />
          </Field>
        </div>
        <Field label="Notes internes">
          <textarea
            value={l.notes || ""}
            onChange={(e) => setL({ ...l, notes: e.target.value })}
          />
        </Field>
        <ErrorBox message={error} />
        <div className="actions">
          <ConfirmButton
            onConfirm={async () => {
              try {
                await api("/leads/" + l.id, "DELETE");
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Supprimer les données du prospect
          </ConfirmButton>
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/leads/" + l.id, "PATCH", {
                  notes: l.notes,
                  tags: l.tags,
                  stage: l.stage,
                });
                onSaved();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Enregistrer
          </button>
        </div>
      </div>
    </Modal>
  );
}
function Calls() {
  const { data, error, loading, refresh } = useData("/bookings"),
    toast = useToast();
  const [tab, setTab] = useState("upcoming"),
    [outcome, setOutcome] = useState<Data | null>(null);
  const bookings = (data?.bookings || [])
    .filter((b: Data) =>
      tab === "cancelled"
        ? b.status === "cancelled"
        : b.status === "confirmed" &&
          (tab === "upcoming"
            ? b.start >= new Date().toISOString()
            : b.start < new Date().toISOString()),
    )
    .sort((a: Data, b: Data) =>
      tab === "upcoming"
        ? a.start.localeCompare(b.start)
        : b.start.localeCompare(a.start),
    );
  return (
    <>
      <PageHead
        title="Appels planifiés"
        description="Préparez vos prochaines conversations et suivez le résultat de chaque rendez-vous."
      />
      <div className="tabs">
        {[
          ["upcoming", "À venir"],
          ["past", "Passés"],
          ["cancelled", "Annulés"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : !bookings.length ? (
        <Empty
          title="Aucun rendez-vous dans cette vue"
          detail="Vos réservations apparaîtront ici avec les coordonnées du prospect et les informations du calendrier."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Prospect",
                  "Événement",
                  "Date et heure",
                  "Hôte",
                  "Calendrier",
                  "Résultat",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((b: Data) => (
                <tr key={b.id}>
                  <td>
                    <strong>
                      {b.lead.firstName} {b.lead.lastName}
                    </strong>
                    <small style={{ display: "block", marginTop: 4 }}>
                      {b.lead.email || b.lead.phone}
                    </small>
                  </td>
                  <td>{b.event}</td>
                  <td>{date(b.start)}</td>
                  <td>{b.host?.name}</td>
                  <td>
                    <Badge
                      value={
                        b.calendarStatus === "synced"
                          ? "Confirmé"
                          : b.calendarStatus === "ics"
                            ? "Invitation ICS"
                            : b.calendarStatus === "error"
                              ? "failed"
                              : "pending"
                      }
                    />
                    {b.calendarError && (
                      <small title={b.calendarError}> · erreur</small>
                    )}
                  </td>
                  <td>
                    {b.outcome ? (
                      <Badge value={b.outcome.result} />
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <div className="actions">
                      {b.status === "confirmed" && (
                        <a
                          className="btn small"
                          href={"/manage/" + b.manageToken}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Gérer
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        className="btn small"
                        onClick={() => setOutcome(b)}
                      >
                        Résultat
                      </button>
                      {b.meetingUrl && (
                        <a
                          className="btn small primary"
                          href={b.meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Rejoindre
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {outcome && (
        <Modal title="Résultat du rendez-vous" onClose={() => setOutcome(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/bookings/" + outcome.id + "/outcome", "PATCH", {
                  result: f.get("result"),
                  value: Number(f.get("value")),
                  currency: f.get("currency"),
                  notes: f.get("notes"),
                });
                setOutcome(null);
                refresh();
                toast("Résultat enregistré.");
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <Field label="Résultat">
              <select
                name="result"
                defaultValue={outcome.outcome?.result || "sale"}
              >
                {["sale", "no_sale", "no_show", "follow_up", "unqualified"].map(
                  (k) => (
                    <option key={k} value={k}>
                      {labels[k]}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Montant de la vente">
                <input
                  type="number"
                  name="value"
                  min="0"
                  step="0.01"
                  defaultValue={outcome.outcome?.value || 0}
                />
              </Field>
              <Field label="Devise">
                <select
                  name="currency"
                  defaultValue={outcome.outcome?.currency || "EUR"}
                >
                  {["EUR", "USD", "GBP", "AED", "CHF", "CAD"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes / objection">
              <textarea
                name="notes"
                defaultValue={outcome.outcome?.notes || ""}
              />
            </Field>
            <button className="btn primary">Enregistrer le résultat</button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Availability({ me }: { me: Data }) {
  const { data, error, loading, refresh } = useData("/availability"),
    team = useData("/team"),
    toast = useToast();
  const [userId, setUserId] = useState(me.user.id),
    [schedule, setSchedule] = useState<Data | null>(null),
    [override, setOverride] = useState(false),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data) {
      const a = data.schedules.find((s: Data) => s.userId === userId);
      setSchedule(
        a || {
          userId,
          timezone: me.workspace.timezone,
          name: "Horaires de travail",
          weekly: Object.fromEntries(
            Array.from({ length: 7 }, (_, i) => [
              i + 1,
              i < 5 ? [{ start: "09:00", end: "18:00" }] : [],
            ]),
          ),
          overrides: {},
        },
      );
    }
  }, [data, userId]);
  const save = async () => {
    setSaving(true);
    try {
      await api("/availability/" + userId, "PUT", schedule);
      refresh();
      toast("Disponibilités enregistrées.");
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHead
        title="Disponibilités"
        description="Définissez quand vous êtes disponible. Vos prospects voient les horaires dans leur fuseau."
        action={
          <button
            className="btn primary"
            disabled={saving || !schedule}
            onClick={save}
          >
            {saving ? "Enregistrement…" : "Enregistrer les horaires"}
          </button>
        }
      />
      <ErrorBox message={error} />
      {loading || !schedule ? (
        <Loading />
      ) : (
        <>
          <div className="toolbar">
            <div className="left">
              <select
                aria-label="Hôte"
                style={{ width: 220 }}
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
              >
                {team.data?.members
                  .filter(
                    (m: Data) =>
                      ["owner", "admin"].includes(me.role) ||
                      m.id === me.user.id,
                  )
                  .map((m: Data) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
              <span className="badge">Horaires de travail</span>
            </div>
          </div>
          <div className="two-col">
            <section className="card">
              <div className="card-header">
                <h3>Horaires hebdomadaires</h3>
                <Clock size={16} />
              </div>
              <div className="card-body">
                <Field label="Fuseau horaire">
                  <input
                    value={schedule.timezone}
                    onChange={(e) =>
                      setSchedule({ ...schedule, timezone: e.target.value })
                    }
                    list="zones"
                  />
                  <datalist id="zones">
                    {[
                      "Europe/Paris",
                      "Europe/London",
                      "Asia/Dubai",
                      "America/Montreal",
                      "America/New_York",
                      "Africa/Casablanca",
                      "UTC",
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </datalist>
                </Field>
                {[
                  "Lundi",
                  "Mardi",
                  "Mercredi",
                  "Jeudi",
                  "Vendredi",
                  "Samedi",
                  "Dimanche",
                ].map((day, i) => {
                  const key = String(i + 1),
                    blocks = schedule.weekly[key] || [];
                  const set = (b: Data[]) =>
                    setSchedule({
                      ...schedule,
                      weekly: { ...schedule.weekly, [key]: b },
                    });
                  return (
                    <div className="schedule-day" key={key}>
                      <Toggle
                        checked={!!blocks.length}
                        label={day}
                        onChange={(v) =>
                          set(v ? [{ start: "09:00", end: "18:00" }] : [])
                        }
                      />
                      <div>
                        {!blocks.length ? (
                          <small>Indisponible</small>
                        ) : (
                          blocks.map((b: Data, j: number) => (
                            <div className="time-block" key={j}>
                              <input
                                type="time"
                                aria-label={day + " début " + j}
                                value={b.start}
                                onChange={(e) =>
                                  set(
                                    blocks.map((x: Data, k: number) =>
                                      j === k
                                        ? { ...x, start: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                              <span className="muted">—</span>
                              <input
                                type="time"
                                aria-label={day + " fin " + j}
                                value={b.end}
                                onChange={(e) =>
                                  set(
                                    blocks.map((x: Data, k: number) =>
                                      j === k
                                        ? { ...x, end: e.target.value }
                                        : x,
                                    ),
                                  )
                                }
                              />
                              <button
                                className="icon-btn"
                                aria-label="Retirer la plage"
                                onClick={() =>
                                  set(
                                    blocks.filter(
                                      (_: any, k: number) => j !== k,
                                    ),
                                  )
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          ))
                        )}
                        {!!blocks.length && (
                          <button
                            className="text-link"
                            style={{ fontSize: 11 }}
                            onClick={() =>
                              set([...blocks, { start: "18:00", end: "20:00" }])
                            }
                          >
                            + Ajouter une plage
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <section className="card" style={{ height: "fit-content" }}>
              <div className="card-header">
                <h3>Dates spécifiques</h3>
                <CalendarDays size={16} />
              </div>
              <div className="card-body">
                <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
                  Ajoutez des congés ou des horaires exceptionnels pour une
                  journée.
                </p>
                <button className="btn" onClick={() => setOverride(true)}>
                  <Plus size={14} />
                  Ajouter une exception
                </button>
                <div className="spacer" />
                {Object.entries(schedule.overrides)
                  .sort()
                  .map(([day, blocks]) => (
                    <div className="question-row" key={day}>
                      <span>
                        <strong>{day}</strong>
                        <small>
                          {(blocks as Data[]).length
                            ? (blocks as Data[])
                                .map((b) => b.start + " – " + b.end)
                                .join(", ")
                            : "Indisponible toute la journée"}
                        </small>
                      </span>
                      <button
                        className="icon-btn"
                        aria-label="Supprimer l’exception"
                        onClick={() => {
                          const v = { ...schedule.overrides };
                          delete v[day];
                          setSchedule({ ...schedule, overrides: v });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          </div>
          {override && (
            <Modal
              title="Ajouter une date spécifique"
              onClose={() => setOverride(false)}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setSchedule({
                    ...schedule,
                    overrides: {
                      ...schedule.overrides,
                      [String(f.get("date"))]: f.get("off")
                        ? []
                        : [{ start: f.get("start"), end: f.get("end") }],
                    },
                  });
                  setOverride(false);
                }}
              >
                <Field label="Date">
                  <input type="date" required name="date" />
                </Field>
                <label className="inline-check">
                  <input type="checkbox" name="off" defaultChecked />
                  Indisponible toute la journée
                </label>
                <div className="form-grid">
                  <Field label="Début">
                    <input type="time" name="start" defaultValue="09:00" />
                  </Field>
                  <Field label="Fin">
                    <input type="time" name="end" defaultValue="18:00" />
                  </Field>
                </div>
                <button className="btn primary">Ajouter</button>
              </form>
            </Modal>
          )}
        </>
      )}
    </>
  );
}
function Automations({ me }: { me: Data }) {
  const { data, error, loading, refresh } = useData("/workflows"),
    events = useData("/events"),
    toast = useToast();
  const [editing, setEditing] = useState<Data | null>(null),
    [tab, setTab] = useState("all");
  const canEdit = ["owner", "admin"].includes(me.role);
  const workflows = (data?.workflows || []).filter(
    (w: Data) => tab === "all" || (tab === "active" ? w.enabled : !w.enabled),
  );
  const save = async (w: Data) => {
    try {
      await api(
        "/workflows" + (w.id ? "/" + w.id : ""),
        w.id ? "PUT" : "POST",
        w,
      );
      refresh();
      setEditing(null);
      toast("Workflow enregistré.");
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <>
      <PageHead
        title="Automatisations"
        description="La bonne attention, au bon moment. Construisez vos séquences avant et après rendez-vous."
        action={
          canEdit ? (
            <button
              className="btn primary"
              onClick={() =>
                setEditing({
                  name: "",
                  enabled: true,
                  eventIds: [],
                  trigger: "booking.before",
                  delayMinutes: 1440,
                  skipIfBooked: true,
                  actions: [
                    {
                      channel: "email",
                      recipient: "invitee",
                      subject: "À demain, {{first_name}}",
                      body: "Bonjour {{first_name}},\nNous avons rendez-vous pour {{event_name}} le {{date}} à {{time}}.\nLien : {{location}}\nÀ bientôt,\n{{host_name}}",
                    },
                  ],
                })
              }
            >
              <Plus size={14} />
              Créer un workflow
            </button>
          ) : undefined
        }
      />
      <div className="tabs">
        {[
          ["all", "Tous les workflows"],
          ["active", "Actifs"],
          ["inactive", "Inactifs"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : !workflows.length ? (
        <Empty
          title="Des suivis qui travaillent pour vous"
          detail="Relancez les prospects qui n’ont pas réservé, envoyez des rappels personnalisés et préparez chaque appel."
        />
      ) : (
        workflows.map((w: Data) => (
          <div className="card workflow-card" key={w.id}>
            <span className="workflow-icon">
              <Zap size={22} />
            </span>
            <div className="body">
              <h3>{w.name}</h3>
              <p>
                {triggers[w.trigger]} ·{" "}
                {w.delayMinutes
                  ? `${w.delayMinutes >= 1440 ? w.delayMinutes / 1440 + " jour(s)" : w.delayMinutes >= 60 ? w.delayMinutes / 60 + " heure(s)" : w.delayMinutes + " minute(s)"}`
                  : "Immédiatement"}{" "}
                · {w.actions.length} action(s)
              </p>
              <p>
                {w.eventIds.length
                  ? w.eventIds
                      .map(
                        (id: string) =>
                          events.data?.events.find((e: Data) => e.id === id)
                            ?.name,
                      )
                      .join(", ")
                  : "Tous les événements"}
              </p>
            </div>
            <Toggle
              checked={w.enabled}
              disabled={!canEdit}
              onChange={(v) => save({ ...w, enabled: v })}
            />
            {canEdit && (
              <button className="btn" onClick={() => setEditing(w)}>
                Modifier
              </button>
            )}
          </div>
        ))
      )}
      <div className="alert info" style={{ marginTop: 24 }}>
        <Mail size={16} />
        Personnalisez chaque message avec les variables du prospect. Les envois
        et éventuelles erreurs apparaissent dans le journal.
      </div>
      <WorkflowTemplates
        canEdit={canEdit}
        existing={data?.workflows || []}
        onUse={(w) => setEditing(w)}
      />
      {editing && (
        <WorkflowEditor
          workflow={editing}
          events={events.data?.events || []}
          onClose={() => setEditing(null)}
          save={save}
          remove={async () => {
            try {
              await api("/workflows/" + editing.id, "DELETE");
              setEditing(null);
              refresh();
            } catch (e) {
              toast((e as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}
function WorkflowTemplates({
  canEdit,
  existing,
  onUse,
}: {
  canEdit: boolean;
  existing: Data[];
  onUse: (w: Data) => void;
}) {
  const { data } = useData("/workflows/templates");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  if (!data) return null;
  const email = data.channels.email;
  const groups: [string, number][] = [
    ["1 heure avant le rendez-vous", 60],
    ["5 minutes avant le rendez-vous", 5],
  ];
  return (
    <section className="wf-templates">
      <div className="wf-templates-head">
        <h3 className="section-title">Modèles de rappels</h3>
        <div className="wf-lang" role="group" aria-label="Langue des modèles">
          {(
            [
              ["fr", "Français"],
              ["en", "English"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={language === k ? "active" : ""}
              aria-pressed={language === k}
              onClick={() => setLanguage(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="muted wf-templates-lead">
        Des messages prêts à l’emploi pour réduire les absences. Choisissez un
        modèle, ajustez-le si besoin, puis activez-le.
      </p>
      {email.connected ? (
        <div className="alert">
          <CheckCircle2 size={16} />
          API email connectée · les rappels partiront de {email.from}.
        </div>
      ) : (
        <div className="alert error wf-connect">
          <AlertTriangle size={16} />
          <span>
            Connectez votre API email (Resend) pour activer ces modèles : les
            rappels partent depuis votre propre domaine.
          </span>
          <button className="btn" onClick={() => go("/app/integrations")}>
            Connecter mon API email
          </button>
        </div>
      )}
      {groups.map(([label, minutes]) => (
        <div key={minutes}>
          <h4 className="wf-group">{label}</h4>
          <div className="grid wf-grid">
            {data.templates
              .filter(
                (t: Data) =>
                  t.delayMinutes === minutes && t.language === language,
              )
              .map((t: Data) => {
                const added = existing.some((w) => w.name === t.name);
                return (
                  <div className="card wf-template" key={t.id}>
                    <div className="wf-template-head">
                      <span className="workflow-icon">
                        <BellRing size={16} />
                      </span>
                      <Badge
                        value={
                          t.recipient === "host" ? "Pour l’hôte" : "Prospect"
                        }
                      />
                    </div>
                    <h4>{t.name}</h4>
                    <p>{t.description}</p>
                    <div className="wf-preview">
                      <strong>{t.subject}</strong>
                      <span>{t.body}</span>
                    </div>
                    {canEdit &&
                      (added ? (
                        <span className="wf-added">
                          <CheckCircle2 size={14} /> Déjà ajouté
                        </span>
                      ) : email.connected ? (
                        <button
                          className="btn primary"
                          onClick={() =>
                            onUse({
                              name: t.name,
                              enabled: true,
                              eventIds: [],
                              trigger: "booking.before",
                              delayMinutes: t.delayMinutes,
                              skipIfBooked: true,
                              actions: [
                                {
                                  channel: "email",
                                  recipient: t.recipient,
                                  subject: t.subject,
                                  body: t.body,
                                },
                              ],
                            })
                          }
                        >
                          Utiliser ce modèle
                        </button>
                      ) : (
                        <button
                          className="btn"
                          onClick={() => go("/app/integrations")}
                        >
                          Connecter mon API d’abord
                        </button>
                      ))}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}
function WorkflowEditor({
  workflow,
  events,
  onClose,
  save,
  remove,
}: {
  workflow: Data;
  events: Data[];
  onClose: () => void;
  save: (w: Data) => Promise<void>;
  remove: () => void;
}) {
  const [w, setW] = useState(workflow),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={w.id ? "Modifier le workflow" : "Nouveau workflow"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await save(w);
          setBusy(false);
        }}
      >
        <Field label="Nom du workflow">
          <input
            required
            value={w.name}
            onChange={(e) => setW({ ...w, name: e.target.value })}
            placeholder="Rappel personnalisé · J-1"
          />
        </Field>
        <div className="form-grid">
          <Field label="Déclencheur">
            <select
              value={w.trigger}
              onChange={(e) => setW({ ...w, trigger: e.target.value })}
            >
              {Object.entries(triggers).map(([k, l]) => (
                <option value={k} key={k}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={
              w.trigger === "booking.before"
                ? "Minutes avant le rendez-vous"
                : "Délai après le déclencheur (minutes)"
            }
          >
            <input
              type="number"
              min="0"
              max="525600"
              value={w.delayMinutes}
              onChange={(e) =>
                setW({ ...w, delayMinutes: Number(e.target.value) })
              }
            />
          </Field>
        </div>
        <Field label="Événements concernés">
          <div className="subtle">
            Aucun événement sélectionné = tous les événements.
          </div>
          {events.map((e) => (
            <label className="inline-check" key={e.id}>
              <input
                type="checkbox"
                checked={w.eventIds.includes(e.id)}
                onChange={(v) =>
                  setW({
                    ...w,
                    eventIds: v.target.checked
                      ? [...w.eventIds, e.id]
                      : w.eventIds.filter((id: string) => id !== e.id),
                  })
                }
              />
              {e.name}
            </label>
          ))}
        </Field>
        {w.trigger.startsWith("lead.") && (
          <Toggle
            checked={w.skipIfBooked}
            label="Ignorer si le prospect a réservé entre-temps"
            onChange={(v) => setW({ ...w, skipIfBooked: v })}
          />
        )}
        <h3 className="section-title">Actions</h3>
        {w.actions.map((a: Data, i: number) => {
          const set = (k: string, v: any) =>
            setW({
              ...w,
              actions: w.actions.map((x: Data, j: number) =>
                i === j ? { ...x, [k]: v } : x,
              ),
            });
          return (
            <div className="rule-row" key={i}>
              <div className="form-grid">
                <Field label="Canal">
                  <select
                    value={a.channel}
                    onChange={(e) => set("channel", e.target.value)}
                  >
                    <option value="email">Email via Resend</option>
                    <option value="sms">SMS via Twilio / Brevo</option>
                  </select>
                </Field>
                <Field label="Destinataire">
                  <select
                    value={a.recipient}
                    onChange={(e) => set("recipient", e.target.value)}
                  >
                    <option value="invitee">Prospect</option>
                    {a.channel === "email" &&
                      !w.trigger.startsWith("lead.") && (
                        <option value="host">Hôte du rendez-vous</option>
                      )}
                  </select>
                </Field>
              </div>
              {a.channel === "email" && (
                <Field label="Objet">
                  <input
                    value={a.subject}
                    onChange={(e) => set("subject", e.target.value)}
                  />
                </Field>
              )}
              <Field label="Message">
                <textarea
                  required
                  rows={6}
                  value={a.body}
                  onChange={(e) => set("body", e.target.value)}
                />
              </Field>
              <div
                className="actions"
                style={{ marginTop: 0, justifyContent: "space-between" }}
              >
                <small>
                  {
                    "{{first_name}} · {{last_name}} · {{event_name}} · {{date}} · {{time}} · {{location}} · {{manage_link}} · {{event_link}}"
                  }
                </small>
                {w.actions.length > 1 && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Supprimer l’action"
                    onClick={() =>
                      setW({
                        ...w,
                        actions: w.actions.filter(
                          (_: any, j: number) => i !== j,
                        ),
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="btn"
          onClick={() =>
            setW({
              ...w,
              actions: [
                ...w.actions,
                {
                  channel: "email",
                  recipient: "invitee",
                  subject: "",
                  body: "",
                },
              ],
            })
          }
        >
          <Plus size={14} />
          Ajouter une action
        </button>
        <div className="actions">
          {w.id && (
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (confirm("Supprimer ce workflow ?")) remove();
              }}
            >
              Supprimer
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            Enregistrer le workflow
          </button>
        </div>
      </form>
    </Modal>
  );
}
function Team({ me }: { me: Data }) {
  const { data, error, loading, refresh } = useData("/team"),
    toast = useToast();
  const [invite, setInvite] = useState(false),
    [url, setUrl] = useState(""),
    [emailed, setEmailed] = useState("");
  return (
    <>
      <PageHead
        title="Votre équipe"
        description="Invitez vos collaborateurs et répartissez les rendez-vous. Sans limite de membres."
        action={
          ["owner", "admin"].includes(me.role) ? (
            <button
              className="btn primary"
              onClick={() => {
                setUrl("");
                setInvite(true);
              }}
            >
              <Plus size={14} />
              Inviter un membre
            </button>
          ) : undefined
        }
      />
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Membre</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data?.members.map((m: Data) => (
                <tr key={m.id}>
                  <td>
                    <div className="cell-person">
                      <span className="avatar">{m.name.slice(0, 1)}</span>
                      <span>
                        <strong>
                          {m.name}
                          {m.id === me.user.id ? " (vous)" : ""}
                        </strong>
                        <small>{m.email}</small>
                      </span>
                    </div>
                  </td>
                  <td>
                    {me.role === "owner" && m.role !== "owner" ? (
                      <select
                        aria-label={"Rôle de " + m.name}
                        style={{ width: 160 }}
                        value={m.role}
                        onChange={async (e) => {
                          try {
                            await api("/team/" + m.id, "PATCH", {
                              role: e.target.value,
                            });
                            refresh();
                          } catch (e) {
                            toast((e as Error).message, true);
                          }
                        }}
                      >
                        {["admin", "member", "viewer"].map((r) => (
                          <option value={r} key={r}>
                            {labels[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      labels[m.role]
                    )}
                  </td>
                  <td>
                    <Badge value="Actif" />
                  </td>
                  <td>
                    {me.role === "owner" && m.role !== "owner" && (
                      <ConfirmButton
                        onConfirm={async () => {
                          try {
                            await api("/team/" + m.id, "DELETE");
                            refresh();
                          } catch (e) {
                            toast((e as Error).message, true);
                          }
                        }}
                      >
                        Retirer
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.invites.filter((i: Data) => !i.accepted).length > 0 && (
        <>
          <h3 className="section-title">Invitations en attente</h3>
          {data!.invites
            .filter((i: Data) => !i.accepted)
            .map((i: Data) => (
              <div className="question-row" key={i.id}>
                <span>
                  {i.email} <small>{labels[i.role]}</small>
                </span>
                <small>Expire le {date(i.expires)}</small>
              </div>
            ))}
        </>
      )}
      {invite && (
        <Modal title="Inviter un membre" onClose={() => setInvite(false)}>
          {url ? (
            <>
              <div className="alert">
                {emailed
                  ? `Invitation envoyée par email à ${emailed}. Vous pouvez aussi lui transmettre ce lien personnel, valable 7 jours.`
                  : "Invitation créée. Transmettez ce lien personnel au collaborateur ; il est valable 7 jours."}
              </div>
              <pre className="code">{url}</pre>
              <div className="actions">
                <CopyButton value={url} label="Copier l’invitation" />
              </div>
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  const r = await api("/team/invites", "POST", {
                    email: f.get("email"),
                    role: f.get("role"),
                  });
                  setUrl(r.url);
                  setEmailed(r.emailed ? String(f.get("email")) : "");
                  refresh();
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }}
            >
              <Field label="Adresse email">
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="collegue@entreprise.fr"
                />
              </Field>
              <Field label="Rôle">
                <select name="role" defaultValue="member">
                  {me.role === "owner" && (
                    <option value="admin">Administrateur</option>
                  )}
                  <option value="member">Membre</option>
                  <option value="viewer">Observateur (lecture seule)</option>
                </select>
              </Field>
              <button className="btn primary">Créer l’invitation</button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
