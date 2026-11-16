import React, { useState, useEffect } from "react";
import {
  Plus,
  CalendarDays,
  Users,
  Clock,
  Video,
  ExternalLink,
  Link,
  Code,
  MoreHorizontal,
  Copy,
  ChevronLeft,
  Check,
  HelpCircle,
  Settings,
  MessageSquare,
  ShieldCheck,
  Mail,
  Palette,
  ArrowRight,
  GitBranch,
  Trash2,
  GripVertical,
} from "lucide-react";
import { api, go, Data, copy } from "./api";
import { eventDefaults } from "./bookingText";
import {
  useData,
  useToast,
  Loading,
  PageHead,
  SearchBox,
  Toggle,
  Modal,
  Field,
  ErrorBox,
  CopyButton,
  ConfirmButton,
} from "./ui";
export default function Events({ me, path }: { me: Data; path: string }) {
  const eventId = path.split("/")[3];
  const { data, error, loading, refresh } = useData("/events"),
    team = useData("/team"),
    toast = useToast();
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [creating, setCreating] = useState(false),
    [embed, setEmbed] = useState<Data | null>(null),
    [menu, setMenu] = useState("");
  const admin = ["admin", "owner"].includes(me.role);
  const events = (data?.events || []).filter(
    (e: Data) =>
      (filter === "all" || (filter === "active" ? e.active : !e.active)) &&
      e.name.toLowerCase().includes(search.toLowerCase()),
  );
  const save = async (e: Data) => {
    try {
      await api("/events/" + e.id, "PUT", e);
      refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  if (eventId)
    return (
      <EventEditor
        id={eventId}
        me={me}
        team={team.data?.members || []}
        onEmbed={setEmbed}
        embed={embed}
        closeEmbed={() => setEmbed(null)}
      />
    );
  return (
    <>
      <PageHead
        title="Événements"
        description="Créez vos liens de réservation et transformez vos visiteurs en conversations."
        action={
          admin ? (
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Plus size={15} />
              Créer un événement
            </button>
          ) : undefined
        }
      />
      <div className="tabs">
        {[
          ["all", "Tous les événements"],
          ["active", "Actifs"],
          ["inactive", "Inactifs"],
        ].map(([v, l]) => (
          <button
            key={v}
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
          >
            {l}
            {v === "all" && (
              <span className="count">{data?.events.length || 0}</span>
            )}
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Rechercher un événement…"
        />
        <span className="muted" style={{ fontSize: 11 }}>
          {events.length} événement{events.length > 1 ? "s" : ""}
        </span>
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="grid events">
          {events.map((e: Data) => (
            <article
              className="card event-card"
              key={e.id}
              style={{ "--event-color": e.color } as React.CSSProperties}
            >
              <div className="inside">
                <div className="top">
                  <span className="event-type">
                    <Users size={13} />
                    {e.type === "discovery"
                      ? "Événement découverte"
                      : e.type === "collective"
                        ? "Événement collectif"
                        : "Événement stratégie"}
                  </span>
                  <Toggle
                    checked={e.active}
                    disabled={!admin}
                    label={undefined}
                    onChange={(v) => save({ ...e, active: v })}
                  />
                </div>
                <h3 onClick={() => go("/app/events/" + e.id)}>{e.name}</h3>
                <div className="metadata">
                  <span>
                    <Clock size={13} />
                    {e.duration} min
                  </span>
                  <span>
                    <Video size={13} />
                    {e.locationType === "phone"
                      ? "Téléphone"
                      : e.locationType === "google_meet"
                        ? "Google Meet"
                        : e.locationType === "teams"
                          ? "Microsoft Teams"
                          : "Lieu personnalisé"}
                  </span>
                </div>
                <div className="host-line">
                  <div className="avatars">
                    {e.hostIds.slice(0, 3).map((id: string) => (
                      <span
                        key={id}
                        className="avatar"
                        title={
                          team.data?.members.find((m: Data) => m.id === id)
                            ?.name
                        }
                      >
                        {(
                          team.data?.members.find((m: Data) => m.id === id)
                            ?.name || "?"
                        ).slice(0, 1)}
                      </span>
                    ))}
                    <span>
                      {e.hostIds.length} hôte{e.hostIds.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={"Options " + e.name}
                    onClick={() => setMenu(menu === e.id ? "" : e.id)}
                  >
                    <MoreHorizontal size={17} />
                  </button>
                </div>
                {menu === e.id && (
                  <div className="actions" style={{ marginTop: 10 }}>
                    <button
                      className="btn small"
                      onClick={() => go("/app/events/" + e.id)}
                    >
                      Modifier
                    </button>
                    {admin && (
                      <button
                        className="btn small"
                        onClick={async () => {
                          try {
                            await api(
                              "/events/" + e.id + "/duplicate",
                              "POST",
                              {},
                            );
                            refresh();
                            toast("Événement dupliqué.");
                          } catch (e) {
                            toast((e as Error).message, true);
                          }
                          setMenu("");
                        }}
                      >
                        <Copy size={12} />
                        Dupliquer
                      </button>
                    )}
                  </div>
                )}
              </div>
              <footer className="card-footer">
                <button
                  className="btn ghost"
                  onClick={async () => {
                    await copy(location.origin + "/book/" + e.slug);
                    toast("Lien de réservation copié.");
                  }}
                >
                  <Link size={13} />
                  Copier le lien
                </button>
                <button className="btn small" onClick={() => setEmbed(e)}>
                  <Code size={13} />
                  Intégrer
                </button>
                <a
                  className="icon-btn"
                  href={"/book/" + e.slug}
                  target="_blank"
                  rel="noreferrer"
                  title="Ouvrir le calendrier"
                >
                  <ExternalLink size={14} />
                </a>
              </footer>
            </article>
          ))}
          {admin && (
            <button
              className="new-event-card"
              onClick={() => setCreating(true)}
            >
              <span className="plus-circle">
                <Plus size={23} />
              </span>
              <strong>Créer un nouvel événement</strong>
              <span style={{ fontSize: 11 }}>
                Une nouvelle occasion d’échanger
              </span>
            </button>
          )}
        </div>
      )}
      <div className="helper-row">
        <HelpCircle size={13} />
        Partagez votre lien ou intégrez votre calendrier sur n’importe quel
        site.
      </div>
      {creating && (
        <CreateEvent
          me={me}
          onClose={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false);
            refresh();
            go("/app/events/" + e.id);
          }}
        />
      )}
      {embed && <Embed event={embed} onClose={() => setEmbed(null)} />}
    </>
  );
}
function CreateEvent({
  me,
  onClose,
  onCreated,
}: {
  me: Data;
  onClose: () => void;
  onCreated: (e: Data) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="Créer un événement" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget),
            name = String(f.get("name"));
          const slug =
            name
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 70) +
            "-" +
            crypto.randomUUID().slice(0, 6);
          try {
            const r = await api("/events", "POST", {
              name,
              slug,
              type: f.get("type"),
              duration: Number(f.get("duration")),
              hostIds: [me.user.id],
              brandName: me.workspace.name,
              timezone: me.workspace.timezone,
              locationType: "phone",
            });
            onCreated(r.event);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox message={error} />
        <Field label="Nom de l’événement">
          <input
            name="name"
            required
            autoFocus
            placeholder="Ex. Appel stratégique"
          />
        </Field>
        <div className="form-grid">
          <Field label="Type d’événement">
            <select name="type">
              <option value="strategy">Stratégie</option>
              <option value="discovery">Découverte</option>
            </select>
          </Field>
          <Field label="Durée">
            <select name="duration">
              {[15, 20, 30, 45, 60, 90].map((n) => (
                <option value={n} key={n}>
                  {n} minutes
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="subtle">
          Ajoutez ensuite vos hôtes, vos questions de qualification et vos
          notifications.
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Création…" : "Créer et personnaliser"}
            <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Embed({
  event,
  onClose,
}: {
  event: Data;
  onClose: () => void;
}) {
  const [type, setType] = useState("inline"),
    [label, setLabel] = useState("Réserver un rendez-vous");
  const base = location.origin,
    slug = event.slug;
  const escaped = label
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
  const code =
    type === "inline"
      ? `<div data-closeos-inline="${slug}" style="width:100%"></div>\n<script src="${base}/embed.js" async></script>`
      : type === "popup"
        ? `<button data-closeos-popup="${slug}">${escaped}</button>\n<script src="${base}/embed.js" async></script>`
        : type === "widget"
          ? `<script src="${base}/embed.js" data-event="${slug}" data-widget data-label="${escaped}" data-color="${event.color}" async></script>`
          : `${base}/book/${slug}`;
  return (
    <Modal title="Intégrer votre calendrier" onClose={onClose} wide>
      <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
        Choisissez le format adapté à votre site. Compatible avec WordPress,
        Webflow, Systeme.io, Shopify et les sites sur mesure.
      </p>
      <div className="tabs">
        {[
          ["inline", "Dans la page"],
          ["popup", "Bouton & popup"],
          ["widget", "Widget flottant"],
          ["link", "Lien direct"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={type === k ? "active" : ""}
            onClick={() => setType(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="embed-preview">
        {type === "inline" ? (
          <div className="embed-mini">
            <div>
              <strong style={{ fontSize: 10 }}>{event.name}</strong>
              <i />
              <i />
              <i style={{ background: event.color, marginTop: 20 }} />
            </div>
            <div className="cal">
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
          </div>
        ) : (
          <button
            className="btn primary"
            style={{ borderRadius: type === "widget" ? 25 : 7 }}
            onClick={() => window.open("/book/" + slug, "_blank", "noopener")}
          >
            {label}
            <ArrowRight size={14} />
          </button>
        )}
      </div>
      {["popup", "widget"].includes(type) && (
        <Field label="Texte du bouton">
          <input value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>
      )}
      <pre className="code">{code}</pre>
      <div className="actions">
        <a
          className="btn"
          href={"/book/" + slug + "?utm_source=preview&utm_medium=embed"}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={14} />
          Voir le calendrier
        </a>
        <CopyButton
          value={code}
          label={type === "link" ? "Copier le lien" : "Copier le code"}
        />
      </div>
      <div className="alert info" style={{ marginTop: 20, marginBottom: 0 }}>
        <Check size={15} />
        Chargement à la demande, adaptation mobile et transmission automatique
        des UTM de votre page. Les conversions sont également disponibles dans
        dataLayer et via les événements closeos.*.
      </div>
    </Modal>
  );
}
const editorTabs = [
  ["details", "Détails de l’événement", CalendarDays],
  ["hosts", "Hôtes", Users],
  ["time", "Horaires & limites", Clock],
  ["questions", "Questions du formulaire", MessageSquare],
  ["disqualification", "Disqualification", ShieldCheck],
  ["routing", "Routage conditionnel", GitBranch],
  ["notifications", "Notifications", Mail],
  ["confirmation", "Page de confirmation", Check],
  ["customization", "Personnalisation", Palette],
] as const;
function EventEditor({
  id,
  me,
  team,
  onEmbed,
  embed,
  closeEmbed,
}: {
  id: string;
  me: Data;
  team: Data[];
  onEmbed: (e: Data) => void;
  embed: Data | null;
  closeEmbed: () => void;
}) {
  const { data, error, loading } = useData("/events/" + id);
  const [e, setE] = useState<Data | null>(null),
    [tab, setTab] = useState("details"),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false),
    [localError, setLocalError] = useState(""),
    [question, setQuestion] = useState<Data | null>(null);
  const toast = useToast(),
    canEdit = ["owner", "admin"].includes(me.role);
  useEffect(() => {
    if (data) setE(data.event);
  }, [data]);
  useEffect(() => {
    const fn = (ev: BeforeUnloadEvent) => {
      if (dirty) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    };
    addEventListener("beforeunload", fn);
    return () => removeEventListener("beforeunload", fn);
  }, [dirty]);
  if (loading || !e)
    return (
      <>
        <ErrorBox message={error} />
        <Loading />
      </>
    );
  const set = (key: string, value: any) => {
    setE({ ...e, [key]: value });
    setDirty(true);
  };
  const save = async () => {
    setSaving(true);
    setLocalError("");
    try {
      const r = await api("/events/" + id, "PUT", e);
      setE(r.event);
      setDirty(false);
      toast("Modifications enregistrées.");
    } catch (err) {
      setLocalError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const current = editorTabs.find((t) => t[0] === tab)!;
  return (
    <>
      <div className="page-head">
        <div className="actions">
          <button
            className="btn"
            onClick={() => {
              if (
                !dirty ||
                confirm("Quitter sans enregistrer les modifications ?")
              )
                go("/app/events");
            }}
          >
            <ChevronLeft size={15} />
            Retour
          </button>
          <h1 style={{ fontSize: 22 }}>{e.name}</h1>
        </div>
        <div className="actions">
          <a
            className="btn"
            href={"/book/" + e.slug}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            Aperçu
          </a>
          <button className="btn" onClick={() => onEmbed(e)}>
            <Code size={14} />
            Intégrer
          </button>
          {canEdit && (
            <button className="btn primary" disabled={saving} onClick={save}>
              {saving
                ? "Enregistrement…"
                : dirty
                  ? "Enregistrer *"
                  : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
      <ErrorBox message={localError} />
      {!canEdit && (
        <div className="alert info">
          Vous consultez cet événement en lecture seule.
        </div>
      )}
      <div className="editor">
        <nav className="editor-nav">
          {editorTabs.map(([k, l, Icon]) => (
            <button
              key={k}
              className={tab === k ? "active" : ""}
              onClick={() => setTab(k)}
            >
              <Icon size={16} />
              {l}
            </button>
          ))}
        </nav>
        <section className="card editor-panel">
          <div className="card-header">
            <h2>{current[1]}</h2>
            <Toggle
              checked={e.active}
              disabled={!canEdit}
              label="Actif"
              onChange={(v) => set("active", v)}
            />
          </div>
          <fieldset
            disabled={!canEdit}
            className="card-body"
            style={{ border: 0, margin: 0 }}
          >
            {tab === "details" && (
              <>
                <div className="form-grid">
                  <Field label="Nom de l’événement *">
                    <input
                      value={e.name}
                      onChange={(v) => set("name", v.target.value)}
                    />
                  </Field>
                  <Field label="Couleur">
                    <input
                      type="color"
                      value={e.color}
                      onChange={(v) => set("color", v.target.value)}
                    />
                  </Field>
                </div>
                <Field
                  label="Langue de la page de réservation"
                  hint="Formulaire, calendrier, page de gestion et emails envoyés au prospect."
                >
                  <select
                    aria-label="Langue de la page de réservation"
                    value={e.language || "fr"}
                    onChange={(v) => {
                      const next = v.target.value as "fr" | "en",
                        prev = next === "en" ? "fr" : "en";
                      const swapped: Data = { ...e, language: next };
                      for (const k of [
                        "buttonText",
                        "confirmationMessage",
                        "disqualifyMessage",
                      ] as const)
                        if (!e[k] || e[k] === eventDefaults[prev][k])
                          swapped[k] = eventDefaults[next][k];
                      setE(swapped);
                      setDirty(true);
                    }}
                  >
                    <option value="fr">🇫🇷 Français</option>
                    <option value="en">🇬🇧 English</option>
                  </select>
                </Field>
                <Field
                  label="Lien de réservation"
                  hint={location.origin + "/book/" + e.slug}
                >
                  <input
                    value={e.slug}
                    onChange={(v) => set("slug", v.target.value)}
                  />
                </Field>
                <Field label="Lieu du rendez-vous">
                  <select
                    value={e.locationType}
                    onChange={(v) => set("locationType", v.target.value)}
                  >
                    <option value="phone">Appel téléphonique</option>
                    <option value="google_meet">Google Meet</option>
                    <option value="teams">Microsoft Teams</option>
                    <option value="custom">
                      Lien personnalisé (Zoom, etc.)
                    </option>
                    <option value="in_person">En personne</option>
                  </select>
                </Field>
                {["custom", "in_person"].includes(e.locationType) && (
                  <Field label="Lien ou adresse">
                    <input
                      value={e.location}
                      onChange={(v) => set("location", v.target.value)}
                    />
                  </Field>
                )}
                {["google_meet", "teams"].includes(e.locationType) && (
                  <div className="alert info">
                    Le lien de visioconférence sera créé via le calendrier
                    connecté de l’hôte.{" "}
                    <button
                      className="text-link"
                      onClick={() => go("/app/calendars")}
                    >
                      Gérer les connexions
                    </button>
                  </div>
                )}
                <Field
                  label="Description / Instructions"
                  hint="Ce texte apparaît à gauche du formulaire de réservation."
                >
                  <textarea
                    rows={7}
                    value={e.description}
                    onChange={(v) => set("description", v.target.value)}
                  />
                </Field>
              </>
            )}
            {tab === "hosts" && (
              <>
                <p className="muted" style={{ marginBottom: 20 }}>
                  Sélectionnez les membres qui pourront recevoir les
                  rendez-vous.
                </p>
                {team.map((m) => (
                  <label className="question-row" key={m.id}>
                    <span className="cell-person">
                      <span className="avatar">{m.name.slice(0, 1)}</span>
                      <span>
                        <strong>{m.name}</strong>
                        <small>{m.email}</small>
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={e.hostIds.includes(m.id)}
                      onChange={(v) =>
                        set(
                          "hostIds",
                          v.target.checked
                            ? [...e.hostIds, m.id]
                            : e.hostIds.filter((id: string) => id !== m.id),
                        )
                      }
                    />
                  </label>
                ))}
                <div className="spacer" />
                <Field label="Répartition des rendez-vous">
                  <select
                    value={e.routingMode}
                    onChange={(v) => set("routingMode", v.target.value)}
                  >
                    <option value="round_robin">
                      Round robin — équilibrer entre les hôtes disponibles
                    </option>
                    <option value="priority">
                      Priorité — premier hôte disponible dans la liste
                    </option>
                  </select>
                </Field>
                <button className="btn" onClick={() => go("/app/team")}>
                  <Plus size={14} />
                  Gérer mon équipe
                </button>
              </>
            )}
            {tab === "time" && (
              <>
                <div className="form-grid">
                  {[
                    ["duration", "Durée (minutes)", 5, 480],
                    [
                      "slotInterval",
                      "Intervalle des créneaux (minutes)",
                      5,
                      120,
                    ],
                    ["noticeMinutes", "Délai minimum (minutes)", 0, 43200],
                    ["horizonDays", "Réservation à l’avance (jours)", 1, 365],
                    ["bufferBefore", "Marge avant (minutes)", 0, 240],
                    ["bufferAfter", "Marge après (minutes)", 0, 240],
                    [
                      "dailyLimit",
                      "Limite par hôte / jour (0 = illimitée)",
                      0,
                      1000,
                    ],
                  ].map(([key, label, min, max]) => (
                    <Field key={key} label={String(label)}>
                      <input
                        type="number"
                        min={Number(min)}
                        max={Number(max)}
                        value={e[key]}
                        onChange={(v) =>
                          set(String(key), Number(v.target.value))
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Fuseau horaire de l’événement">
                  <input
                    value={e.timezone}
                    onChange={(v) => set("timezone", v.target.value)}
                    list="timezones"
                  />
                  <datalist id="timezones">
                    {[
                      "Europe/Paris",
                      "Asia/Dubai",
                      "Europe/London",
                      "America/New_York",
                      "America/Montreal",
                      "Africa/Casablanca",
                      "UTC",
                    ].map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </datalist>
                </Field>
                <div className="alert info">
                  Les créneaux respectent les horaires, les exceptions et les
                  conflits calendrier de chaque hôte.{" "}
                  <button
                    className="text-link"
                    onClick={() => go("/app/availability")}
                  >
                    Modifier les disponibilités
                  </button>
                </div>
              </>
            )}
            {tab === "questions" && (
              <>
                <h3 className="section-title" style={{ marginTop: 0 }}>
                  Coordonnées principales
                </h3>
                <Field label="Informations demandées">
                  <select
                    value={e.primaryContact}
                    onChange={(v) => set("primaryContact", v.target.value)}
                  >
                    <option value="both">Téléphone, puis email</option>
                    <option value="email">Email uniquement</option>
                    <option value="phone">Téléphone uniquement</option>
                  </select>
                </Field>
                <div className="subtle">
                  Prénom et nom obligatoires. Les coordonnées sont sauvegardées
                  dès leur saisie, avant les questions et le calendrier.
                </div>
                <h3 className="section-title">Questions de qualification</h3>
                {e.questions.map((q: Data, i: number) => (
                  <div className="question-row" key={q.id}>
                    <span className="actions">
                      <GripVertical size={14} className="muted" />
                      <span>
                        <strong>{q.label}</strong>
                        <small>
                          {q.type} ·{" "}
                          {q.required ? "Obligatoire" : "Facultative"}
                        </small>
                      </span>
                    </span>
                    <div className="actions">
                      <button
                        className="icon-btn"
                        title="Monter"
                        disabled={!i}
                        onClick={() => {
                          const qs = [...e.questions];
                          [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
                          set("questions", qs);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        className="btn small"
                        onClick={() => setQuestion(q)}
                      >
                        Modifier
                      </button>
                      <button
                        className="icon-btn"
                        title="Supprimer"
                        onClick={() =>
                          set(
                            "questions",
                            e.questions.filter((x: Data) => x.id !== q.id),
                          )
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
                <button
                  className="btn"
                  onClick={() =>
                    setQuestion({
                      id: crypto.randomUUID(),
                      label: "",
                      type: "radio",
                      required: true,
                      options: ["Option 1", "Option 2"],
                    })
                  }
                >
                  <Plus size={14} />
                  Ajouter une question
                </button>
              </>
            )}
            {(tab === "disqualification" || tab === "routing") && (
              <>
                <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
                  {tab === "disqualification"
                    ? "Si l’une des règles est satisfaite, le prospect est conservé mais ne peut pas réserver."
                    : "Orientez les prospects vers les bons hôtes selon leurs réponses. La première règle correspondante s’applique."}
                </p>
                <Rules
                  event={e}
                  field={tab === "routing" ? "routing" : "disqualify"}
                  set={set}
                  team={team}
                />
                {tab === "disqualification" && (
                  <>
                    <div className="spacer" />
                    <Field label="Message affiché aux prospects disqualifiés">
                      <textarea
                        value={e.disqualifyMessage}
                        onChange={(v) =>
                          set("disqualifyMessage", v.target.value)
                        }
                      />
                    </Field>
                    <Field label="Redirection après disqualification (facultatif)">
                      <input
                        type="url"
                        placeholder="https://…"
                        value={e.disqualifyRedirect}
                        onChange={(v) =>
                          set("disqualifyRedirect", v.target.value)
                        }
                      />
                    </Field>
                  </>
                )}
              </>
            )}
            {tab === "notifications" && (
              <>
                <div className="alert info">
                  Connectez Resend pour les emails et Twilio ou Brevo pour les
                  SMS. Les SMS sont envoyés uniquement aux prospects qui y ont
                  consenti.
                </div>
                {[
                  ["confirmation", "Confirmation au prospect"],
                  ["host", "Notification à l’hôte"],
                  ["cancellation", "Confirmation d’annulation"],
                ].map(([k, l]) => (
                  <div className="question-row" key={k}>
                    <strong>{l}</strong>
                    <Toggle
                      checked={e.notifications[k]}
                      onChange={(v) =>
                        set("notifications", { ...e.notifications, [k]: v })
                      }
                    />
                  </div>
                ))}
                <div className="spacer" />
                <Field
                  label="Rappels email — minutes avant le rendez-vous"
                  hint="Séparez les délais par des virgules : 1440 = 24 heures, 60 = 1 heure."
                >
                  <input
                    defaultValue={e.notifications.emailReminders.join(", ")}
                    onBlur={(v) =>
                      set("notifications", {
                        ...e.notifications,
                        emailReminders: v.target.value
                          .split(",")
                          .filter((x) => x.trim())
                          .map(Number),
                      })
                    }
                  />
                </Field>
                <Field label="Rappels SMS — minutes avant le rendez-vous">
                  <input
                    placeholder="1440, 60"
                    defaultValue={e.notifications.smsReminders.join(", ")}
                    onBlur={(v) =>
                      set("notifications", {
                        ...e.notifications,
                        smsReminders: v.target.value
                          .split(",")
                          .filter((x) => x.trim())
                          .map(Number),
                      })
                    }
                  />
                </Field>
                <button className="btn" onClick={() => go("/app/automations")}>
                  <Mail size={14} />
                  Personnaliser les séquences dans Automatisations
                </button>
              </>
            )}
            {tab === "confirmation" && (
              <>
                <Field label="Message de confirmation">
                  <textarea
                    value={e.confirmationMessage}
                    onChange={(v) => set("confirmationMessage", v.target.value)}
                  />
                </Field>
                <Field
                  label="Page de redirection (facultatif)"
                  hint="Après réservation, le visiteur est redirigé vers cette page avec booking_id dans l’URL."
                >
                  <input
                    type="url"
                    placeholder="https://monsite.fr/merci"
                    value={e.redirectUrl}
                    onChange={(v) => set("redirectUrl", v.target.value)}
                  />
                </Field>
                <div className="subtle">
                  La confirmation comprend les détails du rendez-vous, le
                  fichier calendrier et les liens pour reporter ou annuler.
                </div>
              </>
            )}
            {tab === "customization" && (
              <>
                <div className="form-grid">
                  <Field label="Nom affiché">
                    <input
                      value={e.brandName}
                      onChange={(v) => set("brandName", v.target.value)}
                    />
                  </Field>
                  <Field label="Couleur principale">
                    <input
                      type="color"
                      value={e.color}
                      onChange={(v) => set("color", v.target.value)}
                    />
                  </Field>
                </div>
                <Field label="URL du logo (facultatif)">
                  <input
                    type="url"
                    value={e.logoUrl}
                    onChange={(v) => set("logoUrl", v.target.value)}
                    placeholder="https://monsite.fr/logo.png"
                  />
                </Field>
                <Field label="Texte du bouton">
                  <input
                    value={e.buttonText}
                    onChange={(v) => set("buttonText", v.target.value)}
                  />
                </Field>
                <Field label="Lien de confidentialité">
                  <input
                    type="url"
                    value={e.privacyUrl}
                    onChange={(v) => set("privacyUrl", v.target.value)}
                  />
                </Field>
                <Field label="Lien des conditions">
                  <input
                    type="url"
                    value={e.termsUrl}
                    onChange={(v) => set("termsUrl", v.target.value)}
                  />
                </Field>
                <Toggle
                  checked={e.showOrganizerBrand !== false}
                  label="Afficher le nom ou le logo au-dessus du titre"
                  onChange={(v) => set("showOrganizerBrand", v)}
                />
                <Toggle
                  checked={e.showBranding}
                  label="Afficher « Propulsé par CloseOS »"
                  onChange={(v) => set("showBranding", v)}
                />
                <div className="spacer" />
                <ConfirmButton
                  onConfirm={async () => {
                    try {
                      await api("/events/" + e.id, "DELETE");
                      go("/app/events");
                      toast("Événement supprimé ou archivé.");
                    } catch (e) {
                      toast((e as Error).message, true);
                    }
                  }}
                >
                  Supprimer cet événement
                </ConfirmButton>
              </>
            )}
          </fieldset>
        </section>
      </div>
      {question && (
        <QuestionEditor
          question={question}
          onClose={() => setQuestion(null)}
          onSave={(q) => {
            set(
              "questions",
              e.questions.some((x: Data) => x.id === q.id)
                ? e.questions.map((x: Data) => (x.id === q.id ? q : x))
                : [...e.questions, q],
            );
            setQuestion(null);
          }}
        />
      )}
      {embed && <Embed event={embed} onClose={closeEmbed} />}
    </>
  );
}
function Rules({
  event,
  field,
  set,
  team,
}: {
  event: Data;
  field: string;
  set: (k: string, v: any) => void;
  team: Data[];
}) {
  const list = event[field],
    update = (id: string, k: string, v: any) =>
      set(
        field,
        list.map((r: Data) => (r.id === id ? { ...r, [k]: v } : r)),
      );
  return (
    <>
      {list.map((r: Data) => (
        <div className="rule-row" key={r.id}>
          <div className="rule-inputs">
            <Field label="Si">
              <select
                value={r.field}
                onChange={(e) => update(r.id, "field", e.target.value)}
              >
                <option value="">Choisir une question</option>
                {event.questions.map((q: Data) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
                <option value="email_type">Type d’email</option>
                <option value="phone_country">Téléphone (préfixe)</option>
                <option value="timezone">Fuseau horaire</option>
              </select>
            </Field>
            <Field label="Condition">
              <select
                value={r.operator}
                onChange={(e) => update(r.id, "operator", e.target.value)}
              >
                {[
                  ["equals", "Égal à"],
                  ["not_equals", "Différent de"],
                  ["contains", "Contient"],
                  ["less_than", "Inférieur à"],
                  ["greater_than", "Supérieur à"],
                  ["in", "Parmi (virgules)"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valeur">
              <input
                value={r.value}
                onChange={(e) => update(r.id, "value", e.target.value)}
                placeholder={
                  r.field === "email_type"
                    ? "personal ou business"
                    : "Réponse attendue"
                }
                list={"choices-" + r.id}
              />
              <datalist id={"choices-" + r.id}>
                {event.questions
                  .find((q: Data) => q.id === r.field)
                  ?.options.map((o: string) => (
                    <option key={o}>{o}</option>
                  ))}
              </datalist>
            </Field>
            <button
              className="icon-btn"
              aria-label="Supprimer la règle"
              style={{ marginBottom: 22 }}
              onClick={() =>
                set(
                  field,
                  list.filter((x: Data) => x.id !== r.id),
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </div>
          {field === "routing" && (
            <div>
              <small>Attribuer aux hôtes :</small>
              {team
                .filter((m) => event.hostIds.includes(m.id))
                .map((m) => (
                  <label className="inline-check" key={m.id}>
                    <input
                      type="checkbox"
                      checked={r.hostIds.includes(m.id)}
                      onChange={(e) =>
                        update(
                          r.id,
                          "hostIds",
                          e.target.checked
                            ? [...r.hostIds, m.id]
                            : r.hostIds.filter((id: string) => id !== m.id),
                        )
                      }
                    />
                    {m.name}
                  </label>
                ))}
            </div>
          )}
        </div>
      ))}
      <button
        className="btn"
        onClick={() =>
          set(field, [
            ...list,
            {
              id: crypto.randomUUID(),
              field: event.questions[0]?.id || "email_type",
              operator: "equals",
              value: "",
              hostIds: [],
            },
          ])
        }
      >
        <Plus size={14} />
        Ajouter une règle
      </button>
    </>
  );
}
function QuestionEditor({
  question,
  onClose,
  onSave,
}: {
  question: Data;
  onClose: () => void;
  onSave: (q: Data) => void;
}) {
  const [q, setQ] = useState(question);
  return (
    <Modal title="Question du formulaire" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(q);
        }}
      >
        <Field label="Intitulé">
          <input
            value={q.label}
            required
            autoFocus
            onChange={(e) => setQ({ ...q, label: e.target.value })}
          />
        </Field>
        <Field label="Type de réponse">
          <select
            value={q.type}
            onChange={(e) => setQ({ ...q, type: e.target.value })}
          >
            {[
              ["radio", "Choix unique"],
              ["checkbox", "Choix multiple"],
              ["select", "Liste déroulante"],
              ["text", "Texte court"],
              ["textarea", "Texte long"],
              ["number", "Nombre"],
              ["email", "Email"],
              ["phone", "Téléphone"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        {["radio", "checkbox", "select"].includes(q.type) && (
          <Field label="Réponses possibles (une par ligne)">
            <textarea
              value={q.options.join("\n")}
              required
              onChange={(e) =>
                setQ({ ...q, options: e.target.value.split("\n") })
              }
            />
          </Field>
        )}
        <Toggle
          checked={q.required}
          label="Réponse obligatoire"
          onChange={(v) => setQ({ ...q, required: v })}
        />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button className="btn primary">Enregistrer la question</button>
        </div>
      </form>
    </Modal>
  );
}
