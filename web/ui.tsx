import React, { useState, useEffect, createContext, useContext } from "react";
import {
  X,
  Check,
  AlertCircle,
  Copy,
  Plus,
  ChevronDown,
  Search,
  Inbox,
} from "lucide-react";
import { api, Data, labels, copy } from "./api";
export const ToastContext = createContext<
  (message: string, error?: boolean) => void
>(() => {});
export const useToast = () => useContext(ToastContext);
export function useData(path: string) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = async () => {
    setError("");
    try {
      setData(await api(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [path]);
  return { data, error, loading, refresh, setData };
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Badge({ value }: { value: string }) {
  return (
    <span className={"badge status-" + value}>{labels[value] || value}</span>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-label">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label || "Activer"}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={"toggle " + (checked ? "on" : "")}
      >
        <span />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
export function Empty({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Inbox size={26} />
      </span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="alert error" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <span className="spinner" />
      Chargement…
    </div>
  );
}
export function CopyButton({
  value,
  label = "Copier",
}: {
  value: string;
  label?: string;
}) {
  const [done, setDone] = useState(false),
    toast = useToast();
  return (
    <button
      className="btn"
      onClick={async () => {
        try {
          await copy(value);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast(
            "Copie indisponible. Sélectionnez le texte manuellement.",
            true,
          );
        }
      }}
    >
      {done ? <Check size={15} /> : <Copy size={15} />} {done ? "Copié" : label}
    </button>
  );
}
export function PageHead({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Rechercher…",
}: {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Search size={16} />
      <input
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
export function ConfirmButton({
  onConfirm,
  children,
}: {
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  return (
    <>
      <button className="btn danger" onClick={() => setShow(true)}>
        {children}
      </button>
      {show && (
        <Modal title="Confirmer cette action" onClose={() => setShow(false)}>
          <p>Cette action s’appliquera immédiatement.</p>
          <div className="actions">
            <button className="btn" onClick={() => setShow(false)}>
              Retour
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setShow(false);
                onConfirm();
              }}
            >
              Confirmer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
