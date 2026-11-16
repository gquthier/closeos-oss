// Ready-made reminder automations. Each one becomes a regular workflow once applied, so
// it can be edited like any other. Bodies use the same {{variables}} as every message.
export interface WorkflowTemplate {
  id: string;
  language: "fr" | "en";
  name: string;
  description: string;
  delayMinutes: number;
  recipient: "invitee" | "host";
  subject: string;
  body: string;
}

export const workflowTemplates: WorkflowTemplate[] = [
  {
    language: "fr",
    id: "reminder-1h",
    name: "Rappel 1 h avant · Classique",
    description:
      "Un rappel clair et chaleureux avec l’heure, le lien et la possibilité de reporter.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "Dans 1 heure : {{event_name}} avec {{host_name}}",
    body: `Bonjour {{first_name}},

Petit rappel : votre rendez-vous {{event_name}} avec {{host_name}} commence dans 1 heure.

📅 {{date}} à {{time}} ({{timezone}})
📍 {{location}}

Un empêchement ? Vous pouvez reporter ou annuler en un clic : {{manage_link}}

À tout à l’heure,
{{host_name}}`,
  },
  {
    language: "fr",
    id: "reminder-1h-prep",
    name: "Rappel 1 h avant · Préparation",
    description:
      "Rappel qui engage le prospect : il arrive préparé, l’appel est plus productif.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "{{first_name}}, on se parle dans 1 heure",
    body: `Bonjour {{first_name}},

On se retrouve dans 1 heure, à {{time}}, pour {{event_name}}.

Pour profiter au maximum de ces quelques minutes ensemble :
1. Installez-vous dans un endroit calme, avec une bonne connexion.
2. Notez votre objectif principal et ce qui vous bloque aujourd’hui.
3. Si une autre personne participe aux décisions, invitez-la à vous rejoindre.

Lien de l’appel : {{location}}

Si ce créneau ne vous convient plus, prévenez-nous ici : {{manage_link}}

À très vite,
{{host_name}}`,
  },
  {
    language: "fr",
    id: "reminder-1h-short",
    name: "Rappel 1 h avant · Court et direct",
    description:
      "Trois lignes, lisibles sur mobile. Idéal pour les appels découverte.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "Rappel : {{event_name}} à {{time}}",
    body: `{{first_name}}, c’est toujours bon pour {{time}} ?

{{event_name}} commence dans 1 heure : {{location}}
Besoin de décaler ? {{manage_link}}

{{host_name}}`,
  },
  {
    language: "fr",
    id: "reminder-5min",
    name: "Rappel 5 min avant · Lien de connexion",
    description:
      "Envoyé juste avant l’appel avec le lien à cliquer. Réduit fortement les absences.",
    delayMinutes: 5,
    recipient: "invitee",
    subject: "On commence dans 5 minutes ⏱",
    body: `Bonjour {{first_name}},

{{host_name}} vous attend dans 5 minutes pour {{event_name}}.

👉 Rejoindre l’appel : {{location}}

À tout de suite !`,
  },
  {
    language: "fr",
    id: "reminder-5min-phone",
    name: "Rappel 5 min avant · Appel téléphonique",
    description:
      "Pour les rendez-vous par téléphone : le prospect sait qu’on va l’appeler et garde son téléphone à portée.",
    delayMinutes: 5,
    recipient: "invitee",
    subject: "{{host_name}} vous appelle dans 5 minutes",
    body: `Bonjour {{first_name}},

{{host_name}} va vous appeler dans 5 minutes au {{phone}} pour {{event_name}}.

Gardez votre téléphone à portée de main et installez-vous au calme. Si vous ne pouvez plus répondre, prévenez-nous vite ici : {{manage_link}}

À tout de suite !`,
  },
  {
    language: "fr",
    id: "host-brief-5min",
    name: "Brief hôte 5 min avant",
    description:
      "Envoyé à l’hôte : les coordonnées et réponses du prospect pour démarrer l’appel préparé.",
    delayMinutes: 5,
    recipient: "host",
    subject: "Dans 5 min : {{first_name}} {{last_name}} · {{event_name}}",
    body: `Votre rendez-vous {{event_name}} commence dans 5 minutes ({{time}}, {{timezone}}).

Prospect : {{first_name}} {{last_name}}
Email : {{email}}
Téléphone : {{phone}}
Lieu : {{location}}

Réponses au formulaire :
{{answers}}`,
  },
  {
    language: "en",
    id: "reminder-1h-en",
    name: "1-hour reminder · Classic",
    description:
      "A clear, friendly reminder with the time, the link and an easy way to reschedule.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "In 1 hour: {{event_name}} with {{host_name}}",
    body: `Hi {{first_name}},

Just a quick reminder: your {{event_name}} with {{host_name}} starts in 1 hour.

📅 {{date}} at {{time}} ({{timezone}})
📍 {{location}}

Can’t make it anymore? Reschedule or cancel in one click: {{manage_link}}

Talk soon,
{{host_name}}`,
  },
  {
    language: "en",
    id: "reminder-1h-prep-en",
    name: "1-hour reminder · Get prepared",
    description:
      "Gets the prospect ready for the call so the conversation is more productive.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "{{first_name}}, we’re speaking in 1 hour",
    body: `Hi {{first_name}},

We’re meeting in 1 hour, at {{time}}, for {{event_name}}.

To get the most out of our time together:
1. Find a quiet spot with a good connection.
2. Write down your main goal and what’s holding you back today.
3. If someone else is involved in the decision, invite them to join.

Call link: {{location}}

If this time no longer works for you, let us know here: {{manage_link}}

See you soon,
{{host_name}}`,
  },
  {
    language: "en",
    id: "reminder-1h-short-en",
    name: "1-hour reminder · Short and direct",
    description:
      "Three lines, easy to read on mobile. Great for discovery calls.",
    delayMinutes: 60,
    recipient: "invitee",
    subject: "Reminder: {{event_name}} at {{time}}",
    body: `{{first_name}}, still good for {{time}}?

{{event_name}} starts in 1 hour: {{location}}
Need to move it? {{manage_link}}

{{host_name}}`,
  },
  {
    language: "en",
    id: "reminder-5min-en",
    name: "5-minute reminder · Join link",
    description:
      "Sent right before the call with the link to click. Cuts no-shows significantly.",
    delayMinutes: 5,
    recipient: "invitee",
    subject: "We’re starting in 5 minutes ⏱",
    body: `Hi {{first_name}},

{{host_name}} is ready for you in 5 minutes for {{event_name}}.

👉 Join the call: {{location}}

See you in a minute!`,
  },
  {
    language: "en",
    id: "reminder-5min-phone-en",
    name: "5-minute reminder · Phone call",
    description:
      "For phone appointments: the prospect knows we’ll call and keeps their phone close.",
    delayMinutes: 5,
    recipient: "invitee",
    subject: "{{host_name}} will call you in 5 minutes",
    body: `Hi {{first_name}},

{{host_name}} will call you in 5 minutes at {{phone}} for {{event_name}}.

Keep your phone nearby and find a quiet place. If you can’t pick up anymore, let us know right away: {{manage_link}}

Talk in a minute!`,
  },
  {
    language: "en",
    id: "host-brief-5min-en",
    name: "Host brief · 5 minutes before",
    description:
      "Sent to the host: the prospect’s details and answers, to start the call prepared.",
    delayMinutes: 5,
    recipient: "host",
    subject: "In 5 min: {{first_name}} {{last_name}} · {{event_name}}",
    body: `Your {{event_name}} starts in 5 minutes ({{time}}, {{timezone}}).

Prospect: {{first_name}} {{last_name}}
Email: {{email}}
Phone: {{phone}}
Location: {{location}}

Form answers:
{{answers}}`,
  },
];
export function templateWorkflow(t: WorkflowTemplate, eventIds: string[] = []) {
  return {
    name: t.name,
    enabled: true,
    eventIds,
    trigger: "booking.before" as const,
    delayMinutes: t.delayMinutes,
    skipIfBooked: true,
    actions: [
      {
        channel: "email" as const,
        recipient: t.recipient,
        subject: t.subject,
        body: t.body,
      },
    ],
  };
}
