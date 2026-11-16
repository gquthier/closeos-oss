import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, MailCheck } from "lucide-react";
import { api } from "./api";
import "./access.css";

const SKOOL_URL = "https://www.skool.com/bizos";

// Email → 6-digit code → session. Shared by the landing page and /login.
export function AccessForm({
  onSignedIn = () => location.assign("/app/events"),
}: {
  onSignedIn?: () => void;
}) {
  const [step, setStep] = useState<"email" | "code" | "denied">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const request = async () => {
    setError("");
    setBusy(true);
    try {
      await api("/auth/code", "POST", { email });
      setStep("code");
      setCode("");
      setWait(30);
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      if ((e as any).status === 403) setStep("denied");
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async (value = code) => {
    if (!/^\d{6}$/.test(value) || busy) return;
    setError("");
    setBusy(true);
    try {
      await api("/auth/code/verify", "POST", { email, code: value });
      onSignedIn();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (step === "denied")
    return (
      <div className="access-card" role="alert">
        <p className="access-title">Accès réservé aux membres annuels</p>
        <p className="access-text">
          <strong>{email}</strong> n’est associé à aucun abonnement annuel BizOS
          actif. Utilisez l’email de votre compte Skool, ou passez au plan
          annuel.
        </p>
        <div className="access-actions">
          <a
            className="access-btn"
            href={SKOOL_URL}
            target="_blank"
            rel="noreferrer"
          >
            Rejoindre BizOS sur Skool <ArrowRight size={16} />
          </a>
          <button
            type="button"
            className="access-link"
            onClick={() => {
              setStep("email");
              setError("");
            }}
          >
            Essayer un autre email
          </button>
        </div>
      </div>
    );

  if (step === "code")
    return (
      <form
        className="access-card"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <p className="access-title">
          <MailCheck size={18} /> Vérifiez votre boîte mail
        </p>
        <p className="access-text">
          Code à 6 chiffres envoyé à <strong>{email}</strong>. Il expire dans 10
          minutes.
        </p>
        <label className="access-sr" htmlFor="access-code">
          Code de connexion
        </label>
        <div className="access-row">
          <input
            id="access-code"
            ref={codeInput}
            className="access-input access-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
            required
          />
          <button className="access-btn" disabled={busy || code.length !== 6}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
        </div>
        {error && <p className="access-error">{error}</p>}
        <div className="access-meta">
          <button
            type="button"
            className="access-link"
            disabled={wait > 0 || busy}
            onClick={() => void request()}
          >
            {wait > 0 ? `Renvoyer le code (${wait} s)` : "Renvoyer le code"}
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            className="access-link"
            onClick={() => {
              setStep("email");
              setError("");
            }}
          >
            Changer d’email
          </button>
        </div>
      </form>
    );

  return (
    <form
      className="access-card"
      onSubmit={(e) => {
        e.preventDefault();
        void request();
      }}
    >
      <label className="access-sr" htmlFor="access-email">
        Email de votre compte Skool
      </label>
      <div className="access-row">
        <input
          id="access-email"
          className="access-input"
          type="email"
          autoComplete="email"
          placeholder="Email de votre compte Skool"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button className="access-btn" disabled={busy}>
          {busy ? "Vérification…" : "Recevoir mon code"}
          {!busy && <ArrowRight size={16} />}
        </button>
      </div>
      {error && <p className="access-error">{error}</p>}
      <p className="access-hint">
        Pas de mot de passe : un code de connexion vous est envoyé par email.
      </p>
    </form>
  );
}

// Invitation link → code sent to the invited email → joins the team's workspace.
export function InviteJoin({
  token,
  onJoined,
}: {
  token: string;
  onJoined: () => void;
}) {
  const [info, setInfo] = useState<{
    email: string;
    workspace: string;
    hasAccount: boolean;
  } | null>(null);
  const [step, setStep] = useState<"start" | "code">("start");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api("/auth/invite/" + token)
      .then(setInfo)
      .catch((e) => setError((e as Error).message));
  }, [token]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const request = async () => {
    setError("");
    setBusy(true);
    try {
      await api("/auth/invite/code", "POST", { token });
      setStep("code");
      setCode("");
      setWait(30);
      setTimeout(() => codeInput.current?.focus(), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const join = async (value = code) => {
    if (!/^\d{6}$/.test(value) || busy) return;
    setError("");
    setBusy(true);
    try {
      const r = await api("/auth/accept-invite", "POST", {
        token,
        code: value,
        ...(info?.hasAccount ? {} : { name }),
      });
      localStorage.setItem("closeos.workspace", r.workspace);
      onJoined();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
      codeInput.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  if (!info)
    return error ? (
      <p className="access-error" role="alert">
        {error}
      </p>
    ) : (
      <p className="access-text">Chargement de l’invitation…</p>
    );

  if (step === "code")
    return (
      <form
        className="access-card"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <p className="access-title">
          <MailCheck size={18} /> Vérifiez votre boîte mail
        </p>
        <p className="access-text">
          Code à 6 chiffres envoyé à <strong>{info.email}</strong>. Il expire
          dans 10 minutes.
        </p>
        <label className="access-sr" htmlFor="invite-code">
          Code de connexion
        </label>
        <div className="access-row">
          <input
            id="invite-code"
            ref={codeInput}
            className="access-input access-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              if (v.length === 6) void join(v);
            }}
            required
          />
          <button className="access-btn" disabled={busy || code.length !== 6}>
            {busy ? "Connexion…" : "Rejoindre"}
          </button>
        </div>
        {error && <p className="access-error">{error}</p>}
        <div className="access-meta">
          <button
            type="button"
            className="access-link"
            disabled={wait > 0 || busy}
            onClick={() => void request()}
          >
            {wait > 0 ? `Renvoyer le code (${wait} s)` : "Renvoyer le code"}
          </button>
        </div>
      </form>
    );

  return (
    <form
      className="access-card"
      onSubmit={(e) => {
        e.preventDefault();
        void request();
      }}
    >
      <p className="access-text">
        Invitation pour <strong>{info.email}</strong>
        {info.workspace && (
          <>
            {" "}
            · espace <strong>{info.workspace}</strong>
          </>
        )}
      </p>
      {!info.hasAccount && (
        <>
          <label className="access-sr" htmlFor="invite-name">
            Votre nom
          </label>
          <input
            id="invite-name"
            className="access-input"
            autoComplete="name"
            placeholder="Votre nom et prénom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </>
      )}
      <button className="access-btn" disabled={busy}>
        {busy ? "Envoi…" : "Recevoir mon code"}
        {!busy && <ArrowRight size={16} />}
      </button>
      {error && <p className="access-error">{error}</p>}
      <p className="access-hint">
        Pas de mot de passe : un code vous est envoyé par email.
      </p>
    </form>
  );
}
