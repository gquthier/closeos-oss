import React, { useState } from "react";
import {
  Plus,
  Plug,
  Mail,
  Phone,
  CalendarDays,
  ExternalLink,
  KeyRound,
  Code,
  Webhook,
  Trash2,
  RefreshCw,
  Check,
  ShieldCheck,
  ArrowUpRight,
  Copy,
  Activity,
} from "lucide-react";
import { api, Data, date, go } from "./api";
import {
  useData,
  useToast,
  PageHead,
  Loading,
  ErrorBox,
  Field,
  Modal,
  CopyButton,
  Toggle,
  Badge,
  Empty,
  ConfirmButton,
} from "./ui";
export default function SettingsPage({
  section,
  me,
  reload,
}: {
  section: string;
  me: Data;
  reload: () => void;
}) {
  if (section === "integrations") return <Integrations />;
  if (section === "calendars") return <Calendars me={me} />;
  if (section === "developers") return <Developers />;
  if (section === "deliveries") return <Deliveries />;
  return <SettingsForm me={me} reload={reload} />;
}
const providers: Data[] = [
  {
    id: "resend",
    name: "Resend",
    symbol: "R",
    description:
      "Envoyez confirmations, invitations calendrier et séquences email depuis votre domaine.",
    fields: [
      ["apiKey", "Clé API Resend", "password"],
      ["from", "Expéditeur vérifié", "text"],
      ["replyTo", "Adresse de réponse (facultatif)", "email"],
    ],
    docs: "https://resend.com/api-keys",
  },
  {
    id: "twilio",
    name: "Twilio",
    symbol: "⠿",
    description:
      "Envoyez vos rappels et séquences par SMS avec votre propre numéro Twilio.",
    fields: [
      ["accountSid", "Account SID (AC…)", "text"],
      ["authToken", "Auth Token", "password"],
      ["from", "Numéro expéditeur (+…)", "tel"],
    ],
    docs: "https://console.twilio.com/",
  },
  {
    id: "brevo",
    name: "Brevo SMS",
    symbol: "B",
    description:
      "Une alternative à Twilio pour vos SMS transactionnels et rappels de rendez-vous.",
    fields: [
      ["apiKey", "Clé API Brevo", "password"],
      ["sender", "Nom expéditeur (11 caractères maximum)", "text"],
    ],
    docs: "https://app.brevo.com/settings/keys/api",
  },
  {
    id: "google",
    name: "Google Calendar",
    symbol: "G",
    description:
      "Synchronisez les disponibilités, créez les invitations et générez les liens Google Meet.",
    fields: [
      ["clientId", "Client ID OAuth", "text"],
      ["clientSecret", "Client Secret OAuth", "password"],
    ],
    docs: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "microsoft",
    name: "Microsoft Outlook",
    symbol: "▦",
    description:
      "Connectez les calendriers Outlook et créez des rendez-vous avec Microsoft Teams.",
    fields: [
      ["clientId", "Application / Client ID", "text"],
      ["clientSecret", "Client Secret", "password"],
    ],
    docs: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
];
function Integrations() {
  const { data, error, loading, refresh } = useData("/integrations"),
    toast = useToast();
  const [selected, setSelected] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [localError, setLocalError] = useState("");
  return (
    <>
      <PageHead
        title="Intégrations"
        description="Connectez vos outils avec vos propres clés. Vos données et vos envois restent sous votre contrôle."
      />
      <ErrorBox message={error} />
      <div className="alert info">
        <ShieldCheck size={17} />
        Les clés sont chiffrées côté serveur et ne sont jamais exposées dans les
        pages ou widgets publics.
      </div>
      {loading ? (
        <Loading />
      ) : (
        <div className="grid integration-grid">
          {providers.map((p) => {
            const c = data?.integrations.find((i: Data) => i.provider === p.id);
            return (
              <div className="card integration-card" key={p.id}>
                <div
                  className="integration-logo"
                  style={{
                    color:
                      p.id === "google"
                        ? "#4285f4"
                        : p.id === "twilio"
                          ? "#eb4c5d"
                          : p.id === "microsoft"
                            ? "#3875b8"
                            : "#233c2a",
                  }}
                >
                  {p.symbol}
                </div>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <div className="bottom">
                  <span className={"badge " + (c ? "status-qualified" : "")}>
                    {c ? "Configuré" : "À connecter"}
                  </span>
                  <button
                    className="btn"
                    onClick={() => {
                      setLocalError("");
                      setSelected({ ...p, config: c });
                    }}
                  >
                    {c ? "Configurer" : "Connecter"}
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          <div className="card integration-card">
            <div className="integration-logo">
              <Webhook size={24} />
            </div>
            <h3>Webhooks & API</h3>
            <p>
              Branchez n8n, Make, Zapier ou votre CRM. Recevez les leads et
              réservations en temps réel.
            </p>
            <button className="btn" onClick={() => go("/app/developers")}>
              Configurer
              <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      )}
      {selected && (
        <Modal
          title={"Connecter " + selected.name}
          onClose={() => setSelected(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setLocalError("");
              const f = new FormData(e.currentTarget),
                body = Object.fromEntries(f.entries());
              try {
                await api("/integrations/" + selected.id, "PUT", body);
                refresh();
                setSelected(null);
                toast("Connexion configurée.");
              } catch (e) {
                setLocalError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox message={localError} />
            {selected.fields.map(([key, label, type]: string[]) => (
              <Field
                key={key}
                label={label}
                hint={
                  selected.config && type === "password"
                    ? "Laissez vide pour conserver la clé actuelle."
                    : undefined
                }
              >
                <input
                  name={key}
                  type={type}
                  required={!selected.config && !label.includes("facultatif")}
                  autoComplete="off"
                  defaultValue={
                    type === "password" ? "" : selected.config?.[key] || ""
                  }
                  placeholder={
                    selected.config && type === "password"
                      ? "•••••••• (clé enregistrée)"
                      : key === "from" && selected.id === "resend"
                        ? "Mon équipe <rdv@mondomaine.fr>"
                        : ""
                  }
                />
              </Field>
            ))}
            {["google", "microsoft"].includes(selected.id) && (
              <>
                <div className="subtle">
                  Ajoutez cette URL de redirection dans votre application OAuth,
                  puis chaque membre pourra connecter son compte dans
                  Calendriers.
                </div>
                <pre className="code" style={{ marginTop: 12 }}>
                  {location.origin +
                    "/api/v1/oauth/" +
                    selected.id +
                    "/callback"}
                </pre>
                <CopyButton
                  value={
                    location.origin +
                    "/api/v1/oauth/" +
                    selected.id +
                    "/callback"
                  }
                />
              </>
            )}
            {selected.id === "resend" && (
              <p className="muted" style={{ fontSize: 11 }}>
                L’adresse expéditrice doit appartenir à un domaine vérifié dans
                Resend.
              </p>
            )}
            <div className="actions">
              <a
                className="btn"
                href={selected.docs}
                target="_blank"
                rel="noreferrer"
              >
                Obtenir mes identifiants
                <ExternalLink size={13} />
              </a>
              <button className="btn primary" disabled={busy}>
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </form>
          {selected.config && (
            <div className="detail-section">
              <ConfirmButton
                onConfirm={async () => {
                  try {
                    await api("/integrations/" + selected.id, "DELETE");
                    setSelected(null);
                    refresh();
                    toast("Intégration déconnectée.");
                  } catch (e) {
                    toast((e as Error).message, true);
                  }
                }}
              >
                Déconnecter {selected.name}
              </ConfirmButton>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
function Calendars({ me }: { me: Data }) {
  const { data, error, loading, refresh } = useData("/calendars"),
    toast = useToast();
  const [busy, setBusy] = useState(""),
    [edit, setEdit] = useState<Data | null>(null),
    [calendarList, setCalendarList] = useState<Data[]>([]);
  const connect = async (p: string) => {
    setBusy(p);
    try {
      const r = await api("/calendars/connect/" + p, "POST", {});
      location.href = r.url;
    } catch (e) {
      toast((e as Error).message, true);
      setBusy("");
    }
  };
  return (
    <>
      <PageHead
        title="Connexions calendrier"
        description="Évitez les doublons et ajoutez automatiquement vos rendez-vous à votre agenda."
      />
      <ErrorBox message={error} />
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          marginBottom: 26,
        }}
      >
        {[
          { id: "google", name: "Google Calendar", icon: "G" },
          { id: "microsoft", name: "Microsoft Outlook", icon: "▦" },
        ].map((p) => (
          <div className="card pad" key={p.id}>
            <div className="actions" style={{ marginBottom: 15 }}>
              <div className="integration-logo" style={{ margin: 0 }}>
                {p.icon}
              </div>
              <h3>{p.name}</h3>
            </div>
            <p className="muted" style={{ fontSize: 12, marginBottom: 20 }}>
              Synchronisez les conflits et envoyez de véritables invitations
              calendrier.
            </p>
            {data?.configured.includes(p.id) ? (
              <button
                className="btn primary"
                disabled={!!busy}
                onClick={() => connect(p.id)}
              >
                {busy === p.id ? "Connexion…" : "Connecter mon calendrier"}
                <ArrowUpRight size={13} />
              </button>
            ) : (
              <button className="btn" onClick={() => go("/app/integrations")}>
                Configurer le client OAuth
              </button>
            )}
          </div>
        ))}
      </div>
      {loading ? (
        <Loading />
      ) : data?.calendars.length ? (
        <div className="card">
          <div className="card-header">
            <h3>Calendriers connectés</h3>
            <Badge value={data.calendars.length + " connexion(s)"} />
          </div>
          <div className="card-body">
            {data.calendars.map((c: Data) => (
              <div className="question-row" key={c.id}>
                <div>
                  <strong>{c.email}</strong>
                  <small>
                    {c.provider === "google"
                      ? "Google Calendar"
                      : "Microsoft Outlook"}{" "}
                    ·{" "}
                    {c.checkConflicts
                      ? "Conflits vérifiés"
                      : "Conflits ignorés"}
                  </small>
                  {c.error && (
                    <div
                      style={{ color: "#b76c50", fontSize: 11, marginTop: 8 }}
                    >
                      {c.error}
                    </div>
                  )}
                  {c.lastChecked && (
                    <small>Vérifié le {date(c.lastChecked)}</small>
                  )}
                </div>
                <div className="actions">
                  <button
                    className="btn small"
                    onClick={async () => {
                      try {
                        const r = await api("/calendars/" + c.id + "/list");
                        setCalendarList(r.calendars);
                        setEdit(c);
                      } catch (e) {
                        toast((e as Error).message, true);
                      }
                    }}
                  >
                    Configurer
                  </button>
                  <ConfirmButton
                    onConfirm={async () => {
                      try {
                        await api("/calendars/" + c.id, "DELETE");
                        refresh();
                      } catch (e) {
                        toast((e as Error).message, true);
                      }
                    }}
                  >
                    Déconnecter
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="subtle">
          Sans calendrier connecté, CloseOS réserve les créneaux selon vos
          disponibilités et prépare des invitations ICS. Connectez votre agenda
          pour vérifier aussi les rendez-vous créés ailleurs.
        </div>
      )}
      {edit && (
        <Modal title="Paramètres du calendrier" onClose={() => setEdit(null)}>
          <Field label="Ajouter les rendez-vous dans">
            <select
              value={edit.calendarId}
              onChange={(e) => setEdit({ ...edit, calendarId: e.target.value })}
            >
              <option value="primary">Calendrier principal</option>
              {calendarList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Toggle
            checked={edit.checkConflicts}
            label="Vérifier les conflits"
            onChange={(v) => setEdit({ ...edit, checkConflicts: v })}
          />
          <div className="spacer" />
          <Toggle
            checked={edit.writeEvents}
            label="Créer les invitations dans ce calendrier"
            onChange={(v) => setEdit({ ...edit, writeEvents: v })}
          />
          {edit.provider === "google" && (
            <>
              <h3 className="section-title">Calendriers à vérifier</h3>
              {calendarList.map((c) => (
                <label className="inline-check" key={c.id}>
                  <input
                    type="checkbox"
                    checked={(
                      edit.conflictCalendarIds || [edit.calendarId]
                    ).includes(c.id)}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        conflictCalendarIds: e.target.checked
                          ? [...(edit.conflictCalendarIds || []), c.id]
                          : (edit.conflictCalendarIds || []).filter(
                              (id: string) => id !== c.id,
                            ),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </>
          )}
          <div className="actions">
            <button
              className="btn primary"
              onClick={async () => {
                try {
                  await api("/calendars/" + edit.id, "PATCH", {
                    calendarId: edit.calendarId,
                    conflictCalendarIds: edit.conflictCalendarIds,
                    checkConflicts: edit.checkConflicts,
                    writeEvents: edit.writeEvents,
                  });
                  setEdit(null);
                  refresh();
                  toast("Calendrier configuré.");
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }}
            >
              Enregistrer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function Developers() {
  const keys = useData("/api-keys"),
    hooks = useData("/webhooks"),
    toast = useToast();
  const [tab, setTab] = useState("keys"),
    [modal, setModal] = useState(""),
    [secret, setSecret] = useState("");
  return (
    <>
      <PageHead
        title="API & Webhooks"
        description="Pilotez votre activité par API et transmettez les données à tous vos outils."
        action={
          <a
            className="btn"
            href="/api/v1/openapi.json"
            target="_blank"
            rel="noreferrer"
          >
            <Code size={15} />
            Schéma OpenAPI
            <ExternalLink size={13} />
          </a>
        }
      />
      <div className="tabs">
        {[
          ["keys", "Clés API"],
          ["webhooks", "Webhooks"],
          ["examples", "Guide d’intégration"],
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
      <ErrorBox message={keys.error || hooks.error} />
      {tab === "keys" && (
        <>
          <div className="toolbar">
            <p className="muted" style={{ fontSize: 12 }}>
              Chaque clé est limitée à l’espace de travail courant.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                setModal("key");
                setSecret("");
              }}
            >
              <Plus size={14} />
              Créer une clé API
            </button>
          </div>
          {!keys.data?.keys.length ? (
            <Empty
              title="Une API pour tout connecter"
              detail="Créez une clé pour accéder aux prospects, événements, rendez-vous et automatisations."
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Préfixe</th>
                    <th>Accès</th>
                    <th>Dernière utilisation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {keys.data?.keys.map((k: Data) => (
                    <tr key={k.id}>
                      <td>
                        <strong>{k.name}</strong>
                      </td>
                      <td className="mono">{k.prefix}…</td>
                      <td>
                        {k.scope === "read"
                          ? "Lecture seule"
                          : "Lecture & écriture"}
                      </td>
                      <td>{k.lastUsed ? date(k.lastUsed) : "Jamais"}</td>
                      <td>
                        <ConfirmButton
                          onConfirm={async () => {
                            try {
                              await api("/api-keys/" + k.id, "DELETE");
                              keys.refresh();
                              toast("Clé révoquée.");
                            } catch (e) {
                              toast((e as Error).message, true);
                            }
                          }}
                        >
                          Révoquer
                        </ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === "webhooks" && (
        <>
          <div className="toolbar">
            <p className="muted" style={{ fontSize: 12 }}>
              Les livraisons sont signées, journalisées et relancées en cas
              d’échec.
            </p>
            <button
              className="btn primary"
              onClick={() => {
                setModal("webhook");
                setSecret("");
              }}
            >
              <Plus size={14} />
              Ajouter un webhook
            </button>
          </div>
          {!hooks.data?.webhooks.length ? (
            <Empty
              title="Votre CRM, mis à jour automatiquement"
              detail="Ajoutez l’URL de réception de votre outil pour recevoir les coordonnées dès leur capture et suivre les réservations."
            />
          ) : (
            hooks.data.webhooks.map((h: Data) => (
              <div className="card workflow-card" key={h.id}>
                <span className="workflow-icon">
                  <Webhook size={21} />
                </span>
                <div className="body">
                  <h3>{h.name}</h3>
                  <p style={{ wordBreak: "break-all" }}>{h.url}</p>
                  <small>{h.events.join(", ")}</small>
                </div>
                <Toggle
                  checked={h.enabled}
                  onChange={async (v) => {
                    try {
                      await api("/webhooks/" + h.id, "PATCH", { enabled: v });
                      hooks.refresh();
                    } catch (e) {
                      toast((e as Error).message, true);
                    }
                  }}
                />
                <ConfirmButton
                  onConfirm={async () => {
                    await api("/webhooks/" + h.id, "DELETE");
                    hooks.refresh();
                  }}
                >
                  Supprimer
                </ConfirmButton>
              </div>
            ))
          )}
        </>
      )}
      {tab === "examples" && (
        <>
          <section className="card pad">
            <h3>1. Appeler l’API</h3>
            <p className="muted" style={{ fontSize: 12, marginTop: 9 }}>
              Utilisez votre clé dans l’en-tête Authorization. Aucune clé privée
              n’est nécessaire dans les embeds.
            </p>
            <pre className="code">{`curl '${location.origin}/api/v1/leads' \\\n  -H 'Authorization: Bearer cos_VOTRE_CLE'\n\ncurl '${location.origin}/api/v1/events' \\\n  -H 'Authorization: Bearer cos_VOTRE_CLE'`}</pre>
            <h3 className="section-title">2. Recevoir les événements</h3>
            <p className="muted" style={{ fontSize: 12 }}>
              Événements disponibles : lead.captured, lead.updated,
              lead.qualified, lead.disqualified, booking.created,
              booking.rescheduled et booking.cancelled.
            </p>
            <pre className="code">
              {
                'X-CloseOS-Id: identifiant_unique\nX-CloseOS-Event: lead.captured\nX-CloseOS-Timestamp: 1793000000\nX-CloseOS-Signature: v1=HMAC_SHA256(secret, timestamp + "." + corps_brut)\n\n// Vérifiez la signature en temps constant, limitez la dérive à 5 minutes,\n// et dédupliquez les livraisons par X-CloseOS-Id.'
              }
            </pre>
            <h3 className="section-title">
              3. Suivre les conversions de vos embeds
            </h3>
            <pre className="code">{`window.addEventListener('closeos.booked', function (event) {\n  console.log(event.detail.bookingId);\n});\n\n// Aussi : closeos.lead_captured, closeos.qualified,\n// closeos.disqualified, closeos.rescheduled, closeos.cancelled.\n// Si dataLayer existe, ces événements y sont envoyés automatiquement.`}</pre>
            <h3 className="section-title">4. Préremplir le calendrier</h3>
            <pre className="code">{`${location.origin}/book/votre-evenement?first_name=Alex&email=alex%40example.com&utm_source=newsletter&utm_campaign=octobre\n\nCloseOS.popup('votre-evenement', {\n  prefill: { first_name: 'Alex', email: 'alex@example.com' }\n});`}</pre>
          </section>
        </>
      )}
      {modal && (
        <Modal
          title={
            secret
              ? "Copiez votre secret maintenant"
              : modal === "key"
                ? "Nouvelle clé API"
                : "Nouveau webhook"
          }
          onClose={() => setModal("")}
        >
          {secret ? (
            <>
              <div className="alert">
                Ce secret ne sera plus affiché. Conservez-le dans un endroit
                sûr.
              </div>
              <pre className="code">{secret}</pre>
              <CopyButton value={secret} />
            </>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                try {
                  if (modal === "key") {
                    const r = await api("/api-keys", "POST", {
                      name: f.get("name"),
                      scope: f.get("scope"),
                    });
                    setSecret(r.key);
                    keys.refresh();
                  } else {
                    const r = await api("/webhooks", "POST", {
                      name: f.get("name"),
                      url: f.get("url"),
                      events: f.getAll("events"),
                      enabled: true,
                    });
                    setSecret(r.signingSecret);
                    hooks.refresh();
                  }
                } catch (e) {
                  toast((e as Error).message, true);
                }
              }}
            >
              <Field label="Nom">
                <input
                  name="name"
                  required
                  placeholder={
                    modal === "key" ? "Mon CRM" : "n8n — Nouveaux prospects"
                  }
                />
              </Field>
              {modal === "key" ? (
                <Field label="Permissions">
                  <select name="scope">
                    <option value="write">Lecture & écriture</option>
                    <option value="read">Lecture seule</option>
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="URL de réception HTTPS">
                    <input
                      name="url"
                      type="url"
                      required
                      placeholder="https://…"
                    />
                  </Field>
                  <h3 className="section-title">Événements à transmettre</h3>
                  {[
                    "lead.captured",
                    "lead.updated",
                    "lead.qualified",
                    "lead.disqualified",
                    "booking.created",
                    "booking.rescheduled",
                    "booking.cancelled",
                  ].map((e, i) => (
                    <label className="inline-check" key={e}>
                      <input
                        type="checkbox"
                        name="events"
                        value={e}
                        defaultChecked
                      />
                      {e}
                    </label>
                  ))}
                </>
              )}
              <button className="btn primary">
                Créer {modal === "key" ? "la clé" : "le webhook"}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
function Deliveries() {
  const { data, error, loading, refresh } = useData("/jobs"),
    toast = useToast();
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Data | null>(null);
  const jobs = (data?.jobs || []).filter((j: Data) =>
    filter === "all" || filter === "issues"
      ? filter === "all" ||
        ["blocked", "failed", "uncertain"].includes(j.status)
      : j.status === filter,
  );
  return (
    <>
      <PageHead
        title="Journal des envois"
        description="Suivez vos emails, SMS, invitations calendrier et webhooks. Aucun échec ne passe inaperçu."
        action={
          <button className="btn" onClick={refresh}>
            <RefreshCw size={14} />
            Actualiser
          </button>
        }
      />
      <div className="tabs">
        {[
          ["all", "Tous"],
          ["pending", "En attente"],
          ["sent", "Acceptés"],
          ["issues", "À traiter"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={filter === k ? "active" : ""}
            onClick={() => setFilter(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : !jobs.length ? (
        <Empty
          title="Aucun envoi dans cette vue"
          detail="Les notifications planifiées et les livraisons de vos intégrations apparaîtront ici."
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Type",
                  "Déclencheur / Objet",
                  "Statut",
                  "Prévu le",
                  "Tentatives",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j: Data) => (
                <tr key={j.id}>
                  <td>
                    {j.kind === "message"
                      ? j.payload.channel === "sms"
                        ? "SMS"
                        : "Email"
                      : j.kind === "calendar"
                        ? "Calendrier"
                        : "Webhook"}
                  </td>
                  <td>
                    <button
                      className="text-link"
                      onClick={() => setSelected(j)}
                    >
                      {j.payload.subject ||
                        j.payload.trigger ||
                        j.payload.type ||
                        "Synchronisation"}
                    </button>
                  </td>
                  <td>
                    <Badge value={j.status} />
                  </td>
                  <td>{date(j.due)}</td>
                  <td>{j.attempts}</td>
                  <td>
                    {["blocked", "failed", "uncertain"].includes(j.status) && (
                      <button
                        className="btn small"
                        onClick={async () => {
                          if (
                            j.status === "uncertain" &&
                            !confirm(
                              "Vérifiez d’abord chez le fournisseur que le message n’a pas été envoyé. Relancer pourrait créer un doublon. Continuer ?",
                            )
                          )
                            return;
                          try {
                            await api("/jobs/" + j.id + "/retry", "POST", {});
                            refresh();
                            toast("Nouvelle tentative programmée.");
                          } catch (e) {
                            toast((e as Error).message, true);
                          }
                        }}
                      >
                        <RefreshCw size={12} />
                        Relancer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <Modal title="Détail de l’envoi" onClose={() => setSelected(null)}>
          <div className="detail-grid">
            <div>
              <small>Statut</small>
              <p>
                <Badge value={selected.status} />
              </p>
            </div>
            <div>
              <small>Identifiant fournisseur</small>
              <p className="mono" style={{ fontSize: 10 }}>
                {selected.providerId || "—"}
              </p>
            </div>
          </div>
          {selected.error && (
            <div style={{ marginTop: 20 }}>
              <ErrorBox message={selected.error} />
            </div>
          )}
          <pre className="code">
            {JSON.stringify(selected.payload, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}
function SettingsForm({ me, reload }: { me: Data; reload: () => void }) {
  const toast = useToast();
  return (
    <>
      <PageHead
        title="Paramètres"
        description="Personnalisez votre espace et sécurisez votre compte."
      />
      <div className="two-col">
        {["owner", "admin"].includes(me.role) && (
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/workspace", "PATCH", Object.fromEntries(f));
                reload();
                toast("Espace mis à jour.");
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <div className="card-header">
              <h3>Espace de travail</h3>
            </div>
            <div className="card-body">
              <Field label="Nom de l’espace">
                <input name="name" defaultValue={me.workspace.name} required />
              </Field>
              <Field label="Fuseau horaire par défaut">
                <input
                  name="timezone"
                  defaultValue={me.workspace.timezone}
                  required
                />
              </Field>
              <Field label="Devise">
                <select name="currency" defaultValue={me.workspace.currency}>
                  {["EUR", "USD", "GBP", "AED", "CHF", "CAD"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <button className="btn primary">Enregistrer</button>
            </div>
          </form>
        )}
        <div>
          <form
            className="card"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api("/me", "PATCH", { name: f.get("name") });
                reload();
                toast("Profil mis à jour.");
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <div className="card-header">
              <h3>Votre profil</h3>
            </div>
            <div className="card-body">
              <Field label="Nom">
                <input name="name" defaultValue={me.user.name} required />
              </Field>
              <Field label="Email">
                <input value={me.user.email} readOnly />
              </Field>
              <button className="btn">Enregistrer le profil</button>
            </div>
          </form>
          <form
            className="card"
            style={{ marginTop: 20 }}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget,
                f = new FormData(form);
              try {
                await api("/me", "PATCH", {
                  currentPassword: f.get("currentPassword"),
                  password: f.get("password"),
                });
                form.reset();
                toast(
                  "Mot de passe modifié. Les autres sessions ont été déconnectées.",
                );
              } catch (e) {
                toast((e as Error).message, true);
              }
            }}
          >
            <div className="card-header">
              <h3>Sécurité</h3>
              <KeyRound size={15} />
            </div>
            <div className="card-body">
              <Field label="Mot de passe actuel">
                <input
                  type="password"
                  name="currentPassword"
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Field label="Nouveau mot de passe">
                <input
                  type="password"
                  name="password"
                  minLength={12}
                  required
                  autoComplete="new-password"
                />
              </Field>
              <button className="btn">Changer le mot de passe</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
