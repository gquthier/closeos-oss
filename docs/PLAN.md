# CloseOS — plan de livraison

Application indépendante, installable localement, frontend Vercel (call.bizos.cc), API Railway avec volume SQLite persistant. Aucun paiement ni limite artificielle d'événements ou de membres.

1. Relever les parcours publics iClosed et leurs écrans : formulaire progressif avant calendrier, événements, disponibilité, équipes, leads, appels, règles, workflows, intégrations.
2. API /api/v1 avec authentification, espaces isolés, rôles, clés API révocables, OpenAPI et webhooks signés.
3. Leads partiels dès contact valide, qualification côté serveur, routing, attribution first/last touch (UTM, referrer, page, click IDs), pipeline et analytics.
4. Scheduling tenant-safe et host-safe, fuseaux horaires/DST, créneaux, buffers, délais, limite journalière, dates d'exception, round robin, annulation/report, invitations ICS et connecteurs calendriers.
5. Resend, Twilio et Brevo SMS avec clés chiffrées, workflows persistants, reprises, journal des livraisons et erreurs visibles.
6. Interface française proche du modèle de navigation iClosed : analytics, données globales, scheduler/événements/appels/disponibilités/calendriers/automatisations, équipe et paramètres.
7. SDK embed rapide : inline, bouton popup, widget flottant, préremplissage, attribution parent, événements postMessage, responsive, préservation des données partielles.
8. Vérification fonctionnelle API, concurrence, isolation, automations avec fournisseurs simulés, navigateur desktop/mobile et embeds cross-origin. Déploiement, DNS, smoke tests et documentation locale.

Dépendances externes : l'envoi réel utilise les clés configurées par chaque espace. L'accès Google/Microsoft nécessite un client OAuth autorisé et le consentement du titulaire. Ces étapes ne peuvent pas être remplacées par des données simulées en production.
