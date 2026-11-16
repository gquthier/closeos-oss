# Références et choix de conception

Recherche effectuée le 27 octobre 2026. Le compte iClosed présent dans Arc redirige vers la facturation : aucun contournement de l’accès payant n’a été utilisé. Les références ci-dessous sont publiques ; les captures du logiciel final sont dans `proofs/`.

## Parcours observés

| Référence publique | Observation utilisée | Implémentation CloseOS |
| --- | --- | --- |
| [Présentation du fondateur](https://docs.iclosed.io/en/articles/9832728-introduction-to-iclosed-from-the-founder) | Collecter les coordonnées avant le choix d’un créneau et conserver les abandons | Sauvegarde progressive du contact, statut potentiel, qualification séparée |
| [Premiers pas administrateur](https://docs.iclosed.io/en/articles/9835763-getting-started-super-admin) et [guide interactif du créateur d’événement](https://app.guideflow.com/embed/yr4m9odt4r) | Navigation scheduler ; sections de réglage événement, hôtes, délais, questions, qualification, messages, confirmation, apparence | Même organisation fonctionnelle, interface française et palette verte |
| [Disponibilités](https://docs.iclosed.io/en/articles/9822372-availability) | Horaires récurrents, plusieurs plages, fuseaux et exceptions datées | Plages hebdomadaires par hôte, date overrides, contrôle des conflits |
| [Routage conditionnel](https://docs.iclosed.io/en/articles/9859017-conditional-routing) | Orienter selon les réponses ou les données de contact | Règles ordonnées et pool d’hôtes autorisés, round robin ou priorité |
| [Workflows](https://docs.iclosed.io/en/articles/9835792-workflows) | Déclencheur, délai et actions email/SMS ; variables de personnalisation | Workflows persistants, destinataire prospect/hôte, messages et journal |
| [Intégration du scheduler](https://docs.iclosed.io/en/articles/9915264-embedding-the-scheduler-on-your-website) | Inline et popup comme modes d’intégration principaux | SDK inline, popup par bouton, widget flottant et lien public |
| [Notifications](https://docs.iclosed.io/en/articles/9850595-how-to-add-and-customize-email-or-sms-reminders) | Confirmations, annulations et plusieurs rappels | Paramètres événement et séquences distinctes |
| [Site produit](https://www.iclosed.io/) | Regrouper acquisition, qualification, routage et suivi | Analytics et données globales, avec attribution au premier et dernier contact |

La capture fournie par l’utilisateur sert de référence pour le scheduler à deux colonnes : formulaire à gauche, calendrier atténué à droite avant qualification, progression en haut. L’identité visuelle et le nom CloseOS restent propres à cette application.

## Contrats fournisseurs

- [Resend : envoi et idempotence](https://resend.com/features/email-api) : clé portée par le serveur, expéditeur vérifié, pièce jointe et clé d’idempotence.
- [Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference) : free/busy pour les conflits ; événements natifs avec notifications aux invités et conférences Meet.
- [Microsoft Graph : calendriers](https://learn.microsoft.com/en-us/graph/api/calendar-list-events?view=graph-rest-1.0) : vue des occurrences pour les conflits, événement et participants ; calendrier de destination configurable.
- [Twilio Messages](https://www.twilio.com/docs/messaging/api/message-resource) : numéro expéditeur, destinataire et corps ; le succès API est distingué d’une livraison au téléphone.

Les tests utilisent des fournisseurs simulés et vérifient les requêtes émises. Les effets externes réels restent conditionnés aux identifiants et consentements OAuth de l’utilisateur.

## Ajustement du formulaire progressif

La [documentation des questions invité](https://docs.iclosed.io/en/articles/9858951-invitee-questions) décrit les questions primaires (téléphone ou email et nom) puis les questions secondaires. À la demande de Gauthier, le mode téléphone + email montre d’abord téléphone, prénom et nom ; l’email apparaît dès que le numéro a une longueur possible pour son indicatif, même avant la saisie du nom. Une fois révélé, le champ reste présent pendant les corrections du numéro.

La démo publique `https://app.iclosed.io/e/sales-iclosed/15-min-call-with-an-expert`, liée depuis la page officielle de prise de rendez-vous, a été inspectée à nouveau le 27 octobre 2026. Son script `main.c61b7d74.js` renvoyait du HTML et provoquait `Unexpected token '<'`. L’animation d’origine n’a donc pas pu être vérifiée image par image pendant cette passe. La pulsation légère implémentée repose sur la description de l’utilisateur : bordure et halo discrets, arrêt au focus, trois cycles maximum, respect de la préférence de mouvement réduit. Les états initial, pulsation et email révélé ont été capturés dans `docs/proofs/phone-first-*.png`.

La sauvegarde automatique ne présente plus de message sous Continuer. Les mentions de marque en haut et en bas disposent de réglages séparés et sont désactivées par défaut pour les nouveaux événements.
