import React, { useState, useEffect, lazy, Suspense } from "react";
import {
  LayoutDashboard,
  Database,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Users,
  Plug,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  Search,
  Bell,
  ArrowUpRight,
  TrendingUp,
  MousePointerClick,
  UserRound,
  CalendarCheck,
  Check,
  Activity,
  ExternalLink,
  Plus,
} from "lucide-react";
import { api, go, Data, labels } from "./api";
import { AccessForm, InviteJoin } from "./Access";
import {
  ToastContext,
  useData,
  Loading,
  PageHead,
  ErrorBox,
  Field,
  Modal,
} from "./ui";
const Events = lazy(() => import("./Events"));
const Operations = lazy(() => import("./Operations"));
const SettingsPage = lazy(() => import("./Settings"));
export default function Admin({ path }: { path: string }) {
  const [me, setMe] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [menu, setMenu] = useState(false),
    [workspaceModal, setWorkspaceModal] = useState(false);
  const notify = (message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 5000);
  };
  const load = async () => {
    try {
      setMe(await api("/me"));
    } catch (e) {
      if ((e as any).status !== 401) notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  let section = path.split("/")[2] || "events";
  if (path === "/" || path === "/app") section = "events";
  const nav = (p: string) => {
    go("/app/" + p);
    setMenu(false);
  };
  const titles: Data = {
    analytics: "Analytics",
    leads: "Données globales",
    events: "Événements",
    calls: "Appels planifiés",
    availability: "Disponibilités",
    calendars: "Calendriers",
    automations: "Automatisations",
    team: "Équipe",
    integrations: "Intégrations",
    settings: "Paramètres",
    developers: "API & Webhooks",
    deliveries: "Journal des envois",
  };
  if (loading) return <Loading />;
  if (!me)
    return (
      <ToastContext.Provider value={notify}>
        <Login path={path} onLogin={load} />
        {toast && (
          <div className={"toast " + (toast.error ? "error" : "")}>
            {toast.message}
          </div>
        )}
      </ToastContext.Provider>
    );
  return (
    <ToastContext.Provider value={notify}>
      <div className="shell">
        <aside className={"sidebar " + (menu ? "open" : "")}>
          <div className="brand">
            <span className="brand-mark">↗</span>CloseOS
          </div>
          <div className="workspace-select">
            <span className="avatar">{me.workspace.name.slice(0, 1)}</span>
            <select
              aria-label="Espace de travail"
              value={me.workspace.id}
              onChange={(e) => {
                if (e.target.value === "new") {
                  setWorkspaceModal(true);
                  return;
                }
                localStorage.setItem("closeos.workspace", e.target.value);
                location.reload();
              }}
            >
              {me.workspaces.map((w: Data) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
              <option value="new">+ Nouvel espace</option>
            </select>
          </div>
          <nav>
            <div className="nav-caption">Espace de travail</div>
            <button
              className={
                "nav-link " + (section === "analytics" ? "active" : "")
              }
              onClick={() => nav("analytics")}
            >
              <LayoutDashboard size={17} />
              Analytics
            </button>
            <button
              className={"nav-link " + (section === "leads" ? "active" : "")}
              onClick={() => nav("leads")}
            >
              <Database size={17} />
              Données globales
            </button>
            <div className="nav-link nav-parent">
              <CalendarDays size={17} />
              Scheduler
              <ChevronDown size={13} style={{ marginLeft: "auto" }} />
            </div>
            {[
              ["events", "Événements"],
              ["calls", "Appels planifiés"],
              ["availability", "Disponibilités"],
              ["calendars", "Calendriers"],
              ["automations", "Automatisations"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={"nav-link sub " + (section === key ? "active" : "")}
                onClick={() => nav(key)}
              >
                {section === key && <span className="nav-dot" />}
                {label}
              </button>
            ))}
            <div className="nav-caption">Organisation</div>
            <button
              className={"nav-link " + (section === "team" ? "active" : "")}
              onClick={() => nav("team")}
            >
              <Users size={17} />
              Équipe
            </button>
            {["owner", "admin"].includes(me.role) && (
              <>
                <button
                  className={
                    "nav-link " + (section === "integrations" ? "active" : "")
                  }
                  onClick={() => nav("integrations")}
                >
                  <Plug size={17} />
                  Intégrations
                </button>
                <button
                  className={
                    "nav-link " + (section === "developers" ? "active" : "")
                  }
                  onClick={() => nav("developers")}
                >
                  <Activity size={17} />
                  API & Webhooks
                </button>
                <button
                  className={
                    "nav-link " + (section === "deliveries" ? "active" : "")
                  }
                  onClick={() => nav("deliveries")}
                >
                  <Bell size={17} />
                  Journal des envois
                </button>
              </>
            )}
          </nav>
          <div className="sidebar-bottom">
            <button
              className={"nav-link " + (section === "settings" ? "active" : "")}
              onClick={() => nav("settings")}
            >
              <Settings size={17} />
              Paramètres
            </button>
            <div className="sidebar-note">
              <strong>Votre espace, sans limites</strong>Événements et équipe
              illimités.
              <br />
              Vos outils, vos connexions.
            </div>
            <div className="profile">
              <span className="avatar">
                {me.user.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="info">
                <strong>{me.user.name}</strong>
                <small>{labels[me.role]}</small>
              </div>
              <button
                aria-label="Se déconnecter"
                title="Se déconnecter"
                className="icon-btn"
                onClick={async () => {
                  await api("/auth/logout", "POST", {});
                  setMe(null);
                  go("/login");
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <button
              className="icon-btn mobile-menu"
              aria-label="Ouvrir le menu"
              onClick={() => setMenu(!menu)}
            >
              <Menu size={19} />
            </button>
            <span>
              {[
                "events",
                "calls",
                "availability",
                "calendars",
                "automations",
              ].includes(section)
                ? "Scheduler"
                : "Espace de travail"}
            </span>
            <ChevronRight size={13} />
            <span className="breadcrumb">
              {titles[section] || "Événements"}
            </span>
            <div className="right">
              <span className="workspace-pill">
                <span className="dot" />
                Espace actif
              </span>
              <a
                className="btn small"
                href="/api/v1/openapi.json"
                target="_blank"
                rel="noreferrer"
              >
                Documentation API
                <ArrowUpRight size={12} />
              </a>
            </div>
          </header>
          <div className="content">
            <Suspense fallback={<Loading />}>
              {section === "analytics" ? (
                <Analytics />
              ) : section === "events" ? (
                <Events me={me} path={path} />
              ) : [
                  "leads",
                  "calls",
                  "availability",
                  "automations",
                  "team",
                ].includes(section) ? (
                <Operations section={section} me={me} />
              ) : (
                <SettingsPage section={section} me={me} reload={load} />
              )}
            </Suspense>
          </div>
        </main>
      </div>
      {toast && (
        <div role="status" className={"toast " + (toast.error ? "error" : "")}>
          {toast.message}
        </div>
      )}
      {workspaceModal && (
        <Modal
          title="Créer un espace de travail"
          onClose={() => setWorkspaceModal(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await api("/workspaces", "POST", {
                  name: f.get("name"),
                });
                localStorage.setItem("closeos.workspace", r.workspace.id);
                location.reload();
              } catch (e) {
                notify((e as Error).message, true);
              }
            }}
          >
            <Field label="Nom de l’espace">
              <input name="name" required autoFocus placeholder="Mon agence" />
            </Field>
            <button className="btn primary">Créer l’espace</button>
          </form>
        </Modal>
      )}
    </ToastContext.Provider>
  );
}
function Login({ path, onLogin }: { path: string; onLogin: () => void }) {
  const invite = path.startsWith("/invite/") ? path.split("/")[2] : null;
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [withPassword, setWithPassword] = useState(false);
  if (invite)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-mark">↗</span>CloseOS
          </div>
          <h1>Rejoignez votre équipe</h1>
          <p>Confirmez votre email pour accéder à l’espace partagé.</p>
          <InviteJoin
            token={invite}
            onJoined={() => {
              go("/app/events");
              onLogin();
            }}
          />
        </div>
      </div>
    );
  if (!withPassword)
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-mark">↗</span>CloseOS
          </div>
          <h1>Ravi de vous retrouver</h1>
          <p>Recevez un code de connexion sur l’email de votre compte.</p>
          <AccessForm
            onSignedIn={() => {
              go("/app/events");
              onLogin();
            }}
          />
          <small
            style={{ display: "block", textAlign: "center", marginTop: 22 }}
          >
            <button
              type="button"
              className="access-link"
              onClick={() => setWithPassword(true)}
            >
              Se connecter avec un mot de passe
            </button>
          </small>
        </div>
      </div>
    );
  return (
    <div className="auth-page">
      <form
        className="auth-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          setBusy(true);
          const f = new FormData(e.currentTarget);
          try {
            await api("/auth/login", "POST", {
              email: f.get("email"),
              password: f.get("password"),
            });
            go("/app/events");
            onLogin();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="brand">
          <span className="brand-mark">↗</span>CloseOS
        </div>
        <h1>Ravi de vous retrouver</h1>
        <p>Vos prospects, vos rendez-vous et votre équipe, au même endroit.</p>
        <ErrorBox message={error} />
        <Field label="Adresse email">
          <input
            type="email"
            name="email"
            required
            autoComplete="username"
            placeholder="vous@entreprise.fr"
          />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <button className="btn primary" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
          <ArrowUpRight size={14} />
        </button>
        <small style={{ display: "block", textAlign: "center", marginTop: 25 }}>
          Un calendrier simple. Des conversations qui comptent.
        </small>
      </form>
    </div>
  );
}
function Analytics() {
  const [days, setDays] = useState("30");
  const { data, error, loading } = useData("/analytics?days=" + days);
  if (loading) return <Loading />;
  const t = data?.totals || {},
    daily = data?.daily || [],
    max = Math.max(1, ...daily.map((d: Data) => d.leads));
  return (
    <>
      <PageHead
        title="Vue d’ensemble"
        description="Comprenez votre acquisition, du premier clic au rendez-vous."
        action={
          <select
            aria-label="Période"
            style={{ width: 180 }}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          >
            <option value="7">7 derniers jours</option>
            <option value="30">30 derniers jours</option>
            <option value="90">90 derniers jours</option>
          </select>
        }
      />
      <ErrorBox message={error} />
      <div className="stats">
        {[
          {
            label: "Prospects capturés",
            value: t.leads,
            sub: "Formulaires commencés, inclus",
            icon: UserRound,
          },
          {
            label: "Rendez-vous réservés",
            value: t.bookings,
            sub: "Réservations confirmées",
            icon: CalendarCheck,
          },
          {
            label: "Taux de réservation",
            value: (t.conversion || 0) + " %",
            sub: "Rendez-vous / prospects",
            icon: TrendingUp,
          },
          {
            label: "Visiteurs uniques",
            value: t.visits,
            sub: "Par événement et session",
            icon: MousePointerClick,
          },
        ].map((s) => (
          <div className="stat" key={s.label}>
            <div className="label">
              {s.label}
              <s.icon size={16} />
            </div>
            <div className="number">{s.value ?? 0}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="two-col">
        <section className="card">
          <div className="card-header">
            <h3>Acquisition & rendez-vous</h3>
            <div className="legend">
              <span>
                <i style={{ background: "#d1e9dc" }} />
                Prospects
              </span>
              <span>
                <i />
                Rendez-vous
              </span>
            </div>
          </div>
          <div className="card-body">
            <div className="chart">
              {daily.map((d: Data) => (
                <div
                  className="bar-col"
                  key={d.date}
                  title={`${d.date} : ${d.leads} prospects, ${d.bookings} rendez-vous`}
                >
                  <div
                    className="bar"
                    style={{ height: (d.leads / max) * 90 + "%" }}
                  />
                  <div
                    className="bar bookings"
                    style={{ height: (d.bookings / max) * 90 + "%" }}
                  />
                </div>
              ))}
            </div>
            <div className="chart-labels">
              <span>{daily[0]?.date}</span>
              <span>{daily.at(-1)?.date}</span>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="card-header">
            <h3>Votre parcours de conversion</h3>
            <Activity size={16} className="muted" />
          </div>
          <div className="card-body">
            {[
              ["Visiteurs", t.visits],
              ["Prospects capturés", t.leads],
              ["Prospects qualifiés", t.qualified],
              ["Rendez-vous réservés", t.bookings],
            ].map(([label, value], i) => (
              <div className="funnel-row" key={label}>
                <div className="line">
                  <span>{label}</span>
                  <strong>{value || 0}</strong>
                </div>
                <div className="track">
                  <div
                    className="fill"
                    style={{
                      width:
                        Math.min(
                          100,
                          ((value || 0) / Math.max(1, t.visits, t.leads)) * 100,
                        ) + "%",
                      opacity: 0.5 + i * 0.16,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="page-head" style={{ marginTop: 30, marginBottom: 17 }}>
        <div>
          <h2>D’où viennent vos prospects ?</h2>
          <p>
            Attribution au premier contact · Source, support et campagne UTM.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[
                "Source",
                "Support",
                "Campagne",
                "Prospects",
                "Qualifiés",
                "Rendez-vous",
                "Conversion",
              ].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data?.sources.length ? (
              data.sources.map((s: Data, i: number) => (
                <tr key={i}>
                  <td>
                    <strong>{s.source}</strong>
                  </td>
                  <td>{s.medium}</td>
                  <td>{s.campaign}</td>
                  <td>{s.leads}</td>
                  <td>{s.qualified}</td>
                  <td>{s.bookings}</td>
                  <td>{Math.round((s.bookings / s.leads) * 100)} %</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  style={{ textAlign: "center", padding: 35, color: "#93a197" }}
                >
                  Les sources apparaîtront dès vos premiers prospects.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="subtle" style={{ marginTop: 18 }}>
        Les liens de réservation et les widgets conservent les paramètres UTM,
        les identifiants de clic et la page d’origine.
      </div>
    </>
  );
}
