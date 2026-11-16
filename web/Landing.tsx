import React, { useEffect, useState } from "react";
import { ArrowRight, Code2, Route, UserRoundCheck } from "lucide-react";
import "@fontsource-variable/inter";
import { api } from "./api";
import { AccessForm } from "./Access";
import "./landing.css";

const features = [
  {
    icon: UserRoundCheck,
    title: "Chaque visiteur devient un prospect",
    text: "Le contact est enregistré dès la saisie du téléphone, même sans réservation.",
  },
  {
    icon: Route,
    title: "Qualifiés avant l’appel",
    text: "Questions, disqualification et routage vers le bon closer, automatiquement.",
  },
  {
    icon: Code2,
    title: "Sur votre site en une ligne",
    text: "Inline, popup ou bouton flottant, avec UTM et rappels email et SMS.",
  },
];

function Preview() {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <div className="lp-preview" aria-hidden="true">
      <div className="lp-steps">
        <span className="on">
          <i /> Remplir le formulaire
        </span>
        <span>
          <i /> Réservez votre événement
        </span>
      </div>
      <div className="lp-cols">
        <div className="lp-form">
          <b>Appel découverte</b>
          <small>30 min · Appel téléphonique</small>
          <div className="lp-field lp-blink">
            <em>🇫🇷</em>+33
          </div>
          <div className="lp-pair">
            <div className="lp-field">Prénom *</div>
            <div className="lp-field">Nom *</div>
          </div>
          <div className="lp-cta">
            Continuer <ArrowRight size={12} />
          </div>
        </div>
        <div className="lp-cal">
          <b>novembre 2026</b>
          <div className="lp-grid">
            {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
              <span key={"h" + i} className="lp-dow">
                {d}
              </span>
            ))}
            {days.map((d) => (
              <span
                key={d}
                className={
                  [3, 4, 5, 10, 11, 12].includes(d)
                    ? "lp-day open"
                    : d === 6
                      ? "lp-day picked"
                      : "lp-day"
                }
              >
                {d}
              </span>
            ))}
          </div>
          <div className="lp-slots">
            <span>10:00</span>
            <span className="picked">11:30</span>
            <span>14:00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    document.title = "CloseOS · Le calendrier de conversion des membres BizOS";
    api("/me")
      .then(() => setSignedIn(true))
      .catch(() => {});
  }, []);
  return (
    <div className="lp">
      <header className="lp-top">
        <a className="lp-brand" href="/">
          <span>↗</span> CloseOS
        </a>
        <a className="lp-top-link" href={signedIn ? "/app/events" : "#acces"}>
          {signedIn ? "Ouvrir mon espace" : "Se connecter"}
        </a>
      </header>
      <main className="lp-hero">
        <div className="lp-copy">
          <span className="lp-badge">
            <i /> Inclus dans l’abonnement annuel BizOS
          </span>
          <h1>Vos visiteurs deviennent des rendez-vous qualifiés.</h1>
          <p className="lp-lead">
            Le calendrier de prise de rendez-vous pensé pour la vente : capture
            des prospects, qualification, routage et rappels. Réservé aux
            membres annuels de la communauté BizOS.
          </p>
          <div id="acces" className="lp-access">
            {signedIn ? (
              <a className="access-btn lp-open" href="/app/events">
                Ouvrir mon espace CloseOS <ArrowRight size={16} />
              </a>
            ) : (
              <AccessForm />
            )}
          </div>
        </div>
        <Preview />
      </main>
      <section className="lp-features">
        {features.map(({ icon: Icon, title, text }) => (
          <div key={title} className="lp-feature">
            <span className="lp-icon">
              <Icon size={18} />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
        ))}
      </section>
      <footer className="lp-footer">
        <span>
          Accès réservé aux membres du plan annuel{" "}
          <a
            href="https://www.skool.com/bizos"
            target="_blank"
            rel="noreferrer"
          >
            BizOS sur Skool
          </a>
          .
        </span>
        <a href="/login">Connexion équipe</a>
      </footer>
    </div>
  );
}
