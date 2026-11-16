# CloseOS

Application de prise de rendez-vous et de gestion des prospects, installable localement, conçue autour d’une API. Interface française inspirée des parcours publics d’iClosed, identité propre et aucune facturation interne.

**Application : https://call.bizos.cc** · **API : https://call.bizos.cc/api/v1** · **OpenAPI : https://call.bizos.cc/api/v1/openapi.json**

## Démarrer en local

Node.js 24 LTS (ou 26) est requis.

```sh
npm ci
node scripts/setup.mjs
npm run dev
```

Ouvrir http://localhost:4320. Le script de configuration crée `.env` et `.local-access.txt` avec des secrets aléatoires, uniquement s’ils n’existent pas. Les fichiers sont privés et exclus de Git. L’utilisateur propriétaire et un premier événement sont créés au démarrage sur une base vide.

Pour changer le propriétaire initial, modifier `ADMIN_EMAIL`, `ADMIN_NAME` et `ADMIN_PASSWORD` **avant** le premier démarrage. Modifier ensuite le mot de passe depuis Paramètres → Sécurité. La variable de bootstrap ne réinitialise jamais un compte existant.

L’instance locale et l’instance hébergée utilisent des bases séparées.

### Docker

```sh
node scripts/setup.mjs
docker compose up --build -d
```

L’application écoute sur le port local 4320. Les données restent dans le volume `closeos-data`. `docker compose down` conserve les données ; ne pas utiliser `-v` pour un simple arrêt.

## Fonctionnalités

- Espaces de travail isolés, comptes et invitations d’équipe ; rôles propriétaire, administrateur, membre et observateur.
- Événements sans quota : durée, slug, hôtes, disponibilité, marges avant/après, préavis, horizon, limite journalière, logo, couleur, textes, redirections et mentions de confidentialité.
- Horaires hebdomadaires et plusieurs plages par jour, jours d’absence, exceptions datées, fuseaux horaires et changements d’heure.
- Capture progressive dès qu’un email ou téléphone valide est saisi. Conservation des données partielles, même sans clic sur Continuer. Restauration du formulaire dans la session du navigateur.
- En mode téléphone + email, seuls le téléphone, le prénom et le nom sont visibles au départ. L’email apparaît après un numéro complet. La sauvegarde reste silencieuse ; une pulsation discrète du téléphone s’arrête dès l’interaction. Les mentions au-dessus du titre et dans le pied de page sont désactivables séparément.
- Questions texte, nombre, email, téléphone, choix unique, choix multiple et liste ; réponses obligatoires, disqualification et routage par réponse, type d’email, téléphone ou fuseau.
- Réservation atomique avec revalidation des disponibilités, répartition round robin ou priorité, gestion des conflits entre événements d’un même hôte, report et annulation avec liens personnels.
- Calendriers Google / Microsoft : OAuth, renouvellement des jetons, contrôle des conflits et création / mise à jour / suppression des événements. Google Meet et Microsoft Teams lorsque le compte connecté le permet.
- Invitations ICS avec UID stable, versions et annulations. En cas de calendrier connecté, la notification native est utilisée pour éviter une deuxième invitation indépendante.
- Resend pour les emails ; Twilio ou Brevo pour les SMS. Les SMS exigent un consentement enregistré. Chaque espace fournit ses propres identifiants.
- Workflows multi-actions déclenchés par la capture, qualification, disqualification, réservation, début, fin, report et annulation. Délais, variables personnalisées et relances des formulaires abandonnés avec arrêt après réservation.
- File persistante : planification, tentatives, reprise après redémarrage, erreurs visibles. Les délais dépassés et rappels d’anciennes versions sont ignorés. Une livraison SMS incertaine n’est pas relancée automatiquement.
- Données globales : recherche, statuts, notes, étapes, tags, réponses, attribution complète, suppression et export CSV.
- Analytics des visites, prospects, qualifications et réservations, taux de conversion, évolution quotidienne, ventilation source / support / campagne. UTM source, medium, campaign, term, content, gclid, fbclid, msclkid, ttclid, référent et page d’entrée ; premier et dernier contact.
- Code d’embed inline, bouton popup, widget flottant et lien direct. SDK autonome, chargement paresseux, responsive, préremplissage et événements de conversion pour le site hôte / GTM.
- Clés API révocables, lecture ou lecture/écriture, OpenAPI 3.1 et webhooks signés avec journal et tentatives de livraison.

## Accès réservé aux membres annuels BizOS

La page d’accueil (`/`) présente CloseOS et ouvre l’accès par code email : l’email saisi doit correspondre à un abonnement **annuel, payant et actif** de la communauté Skool BizOS. Le serveur lit la page admin `skool.com/bizos/-/members?t=active&annual=true` (email `member.metadata.mbme`, intervalle `mmbp.recurring_interval = year`, montant > 0) avec `SKOOL_COOKIE_HEADER`, la même session admin que le bridge `bizos-membership-bridge`. Liste en cache 10 minutes, nouvelle lecture au plus une fois par minute pour un email inconnu. Skool indisponible = refus temporaire (503), jamais un accès accordé.

Code à 6 chiffres envoyé par Resend (`RESEND_API_KEY`, expéditeur `AUTH_EMAIL_FROM`, domaine bizos.cc), haché, valable 10 minutes, à usage unique, invalidé après 5 erreurs ; un envoi toutes les 30 s et 6 par heure au plus par email. Le premier code valide crée le compte, son espace et un premier événement. Les comptes créés ainsi sont revérifiés à chaque demande de code ; le propriétaire et les membres invités ne dépendent pas de Skool et gardent aussi la connexion par mot de passe (`/login`).

Si la session Skool du bridge est renouvelée, mettre à jour `SKOOL_COOKIE_HEADER` sur les deux services.

## Configurer les connexions

### Emails et SMS

Dans **Intégrations**, connecter Resend avec la clé API et une adresse expéditrice appartenant à un domaine vérifié. Twilio demande un Account SID, un Auth Token et le numéro expéditeur ; Brevo demande une clé API et un nom expéditeur. Sans configuration, les messages sont marqués « Configuration requise », jamais comme envoyés. L’ajout des clés remet les tâches bloquées en attente ; les rappels périmés sont ignorés.

Le statut « Accepté par le fournisseur » indique que l’API du fournisseur a accepté le message. Il ne garantit pas la livraison finale en boîte de réception ou sur le téléphone. Les frais de vos fournisseurs et hébergeurs restent ceux de vos propres comptes.

### Google Calendar

1. Créer un client OAuth de type application web dans Google Cloud et activer Google Calendar API.
2. Configurer l’écran de consentement et les utilisateurs de test si l’application est en mode test.
3. Ajouter `https://call.bizos.cc/api/v1/oauth/google/callback` aux URI de redirection autorisés. En local, utiliser `http://localhost:4320/api/v1/oauth/google/callback`.
4. Enregistrer Client ID / Secret dans Intégrations, puis cliquer sur **Calendriers → Connecter mon calendrier**.
5. Choisir le calendrier de destination et ceux à vérifier pour les conflits.

Les autorisations demandées couvrent l’identité email, la lecture des calendriers et l’écriture des événements. Les comptes doivent autoriser l’accès hors ligne pour le renouvellement des jetons.

### Microsoft Outlook / Teams

Créer une inscription d’application Microsoft Entra prenant en charge les comptes concernés. Ajouter l’URI web `https://call.bizos.cc/api/v1/oauth/microsoft/callback`, un secret client, et les permissions déléguées `User.Read`, `Calendars.ReadWrite`, `offline_access`. Enregistrer ces identifiants dans Intégrations puis connecter le compte depuis Calendriers. La génération Teams dépend de la disponibilité du service sur le compte Microsoft.

**Les connecteurs sont implémentés et testés avec des réponses de fournisseurs simulées. Aucun compte calendrier ni fournisseur d’envoi réel n’a été connecté à votre place. Le consentement OAuth et vos clés sont nécessaires pour activer et vérifier leurs effets réels.**

## Embeds

Inline :

```html
<div data-closeos-inline="votre-evenement" style="width:100%"></div>
<script src="https://call.bizos.cc/embed.js" async></script>
```

Bouton popup :

```html
<button data-closeos-popup="votre-evenement">Prendre rendez-vous</button>
<script src="https://call.bizos.cc/embed.js" async></script>
```

Widget flottant :

```html
<script src="https://call.bizos.cc/embed.js"
  data-event="votre-evenement" data-widget
  data-label="Réserver un rendez-vous" data-color="#147d70" async></script>
```

Remplacer `votre-evenement` par le slug affiché dans les détails de l’événement. Le bouton **Intégrer** génère ces codes avec le bon slug. Une même page peut contenir plusieurs embeds. Charger le SDK une seule fois suffit.

Le script récupère l’attribution sur la page hôte et la transmet à l’iframe via `postMessage`. Il vérifie l’origine et la fenêtre des réponses. Aucune clé API n’est exposée. Les visiteurs n’ont pas besoin d’un compte ou d’un cookie d’authentification.

```js
window.addEventListener('closeos.booked', ({ detail }) => {
  console.log(detail.bookingId, detail.eventId, detail.start);
});
// closeos.lead_captured, closeos.qualified, closeos.disqualified,
// closeos.rescheduled et closeos.cancelled sont également émis.
// Si window.dataLayer existe, les événements y sont ajoutés.

// Attendre closeos.loaded lorsque le SDK est chargé avec async.
window.addEventListener('closeos.loaded', () => {
  CloseOS.popup('votre-evenement', {
    prefill: { first_name: 'Alex', email: 'alex@example.com' }
  });
});
```

## API et webhooks

Créer une clé dans **API & Webhooks**, puis utiliser `Authorization: Bearer cos_…`. La clé est liée à son espace et aux droits de son créateur. Une clé en lecture seule refuse toute écriture.

```sh
curl 'https://call.bizos.cc/api/v1/events' \
  -H 'Authorization: Bearer cos_VOTRE_CLE'

curl 'https://call.bizos.cc/api/v1/leads?limit=100&offset=0' \
  -H 'Authorization: Bearer cos_VOTRE_CLE'
```

Le schéma public `/api/v1/openapi.json` décrit les routes disponibles. Les mutations acceptent du JSON et retournent `{error: "…"}` lors d’un échec. Les listes de prospects acceptent `q`, `status`, `eventId`, `limit` (maximum 500) et `offset`.

Parcours public : `GET /public/events/:slug` → `POST /public/events/:slug/leads` (retourne un jeton opaque) → `POST /public/events/:slug/qualify` → `GET /public/events/:slug/slots?token=…&from=YYYY-MM-DD&days=7` → `POST /public/events/:slug/bookings`. La qualification est contrôlée côté serveur, y compris pour un client API. Fournir `Idempotency-Key` lors de la réservation pour rejouer la même demande sans doublon. Un même jeton ne peut avoir qu’un rendez-vous confirmé.

Événements webhook : `lead.captured`, `lead.updated`, `lead.qualified`, `lead.disqualified`, `booking.created`, `booking.rescheduled`, `booking.cancelled`. `lead.updated` permet à un CRM de compléter progressivement une fiche créée avant que le prospect ait saisi son nom.

Vérifier `X-CloseOS-Signature` en calculant `HMAC-SHA256(secret, timestamp + '.' + corps_brut)` ; le résultat est préfixé par `v1=`. Utiliser une comparaison en temps constant, rejeter les horodatages éloignés de plus de cinq minutes et dédupliquer par `X-CloseOS-Id`. Les URL sont limitées aux destinations HTTPS publiques, sans redirections.

## Déploiement et données

- Frontend Vercel, projet `closeos`, domaine `call.bizos.cc`. Les routes `/api/*` sont transférées au backend Railway, ce qui permet une session HttpOnly sur la même origine.
- Backend Railway, projet `closeos`, service `closeos-api`, une réplique avec un volume persistant `/data`. Docker Node 24 ; la base SQLite est en mode WAL.
- `ENCRYPTION_KEY` chiffre les identifiants fournisseurs avec AES-256-GCM. Conserver cette clé avec les sauvegardes : perdre la clé rend les connexions enregistrées illisibles.
- Les mots de passe utilisent scrypt ; les sessions, clés API et jetons publics sont vérifiés à partir d’empreintes. Les liens de gestion des rendez-vous sont des secrets d’accès, à partager uniquement avec les participants.
- La réservation et l’enregistrement des tâches sont atomiques dans une transaction. Le worker traite la file toutes les cinq secondes.

Sauvegarde locale cohérente : `npm run backup`. Copier l’archive et `.env` dans votre sauvegarde privée. Pour une restauration, arrêter l’application et remplacer la base par une sauvegarde cohérente. Ne jamais copier seulement le fichier principal pendant une écriture sans checkpoint ou sauvegarde SQLite.

La configuration Railway est fournie dans `.railway/railway.ts`. Les variables sont gérées hors de Git. Pour Vercel : `vercel deploy --prod`. Pour Railway : `railway up --service closeos-api --detach` dans votre propre projet.

## Vérification

```sh
npm test
npm run build
npm run test:e2e
```

Les tests navigateur utilisent Chrome, une base temporaire et un site externe sur les ports 4322 / 4323. Ils ne touchent pas les données de production. Les preuves visuelles sont dans `docs/proofs`.

Les contrôles couvrent la qualification, les créneaux concurrents, les exceptions horaires, l’attribution, la capture inachevée, l’isolation des espaces, les clés révocables, le report / annulation, les invitations, les contrats fournisseurs, les vues de gestion, le mobile et les trois modes d’embed.

## Portée de cette version

Il s’agit d’une application indépendante, pas d’un accès au code propriétaire d’iClosed. La comparaison et les sources publiques sont dans `docs/RESEARCH.md`. Cette version ne prétend pas reproduire les services propriétaires externes tels que le scoring de crédit, l’empreinte antifraude iClosed Shield, les agents vocaux IA, l’inbox WhatsApp ou l’enrichissement commercial. Les intégrations CRM passent par API et webhooks (n8n, Make, Zapier, intégration sur mesure). Aucun écran de ces services n’est présenté comme connecté sans intégration réelle.
