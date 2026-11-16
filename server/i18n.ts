// Prospect-facing copy in French and English. The admin interface stays in French; each
// event chooses the language of its booking page, its emails and its public errors.
export type Lang = "fr" | "en";
export const lang = (v: unknown): Lang => (v === "en" ? "en" : "fr");

// Default texts of an event, per language (the editor swaps untouched defaults).
export const eventDefaults = {
  fr: {
    buttonText: "Continuer",
    confirmationMessage:
      "Votre rendez-vous est confirmé. Nous avons hâte de vous rencontrer.",
    disqualifyMessage:
      "Merci pour votre intérêt. Notre accompagnement ne correspond pas encore à votre situation.",
  },
  en: {
    buttonText: "Continue",
    confirmationMessage:
      "Your booking is confirmed. We look forward to speaking with you.",
    disqualifyMessage:
      "Thank you for your interest. Our program isn’t the right fit for your situation just yet.",
  },
};

export const emailCopy = {
  fr: {
    confirmedSubject: "Rendez-vous confirmé · {{event_name}}",
    confirmedBody:
      "Bonjour {{first_name}},\nVotre rendez-vous {{event_name}} avec {{host_name}} est confirmé pour le {{date}} à {{time}} ({{timezone}}).\nLieu : {{location}}\nReporter ou annuler : {{manage_link}}",
    cancelledSubject: "Rendez-vous annulé · {{event_name}}",
    cancelledBody:
      "Bonjour {{first_name}}, votre rendez-vous {{event_name}} du {{date}} à {{time}} a été annulé.\nRéserver un autre créneau : {{event_link}}",
    hostNewSubject: "Nouveau rendez-vous · {{first_name}} {{last_name}}",
    hostRescheduledSubject:
      "Rendez-vous reporté · {{first_name}} {{last_name}}",
    hostCancelledSubject: "Rendez-vous annulé · {{first_name}} {{last_name}}",
    hostBody:
      "{{event_name}} le {{date}} à {{time}} ({{timezone}}).\n{{first_name}} {{last_name}} · {{email}} · {{phone}}\n{{answers}}\n{{manage_link}}",
    reminderSubject: "Rappel · {{event_name}}",
    reminderBody:
      "Bonjour {{first_name}}, rappel pour {{event_name}} le {{date}} à {{time}} ({{timezone}}).\n{{location}}\nGérer le rendez-vous : {{manage_link}}",
    phoneCall: "Appel téléphonique",
    linkLater: "Le lien sera précisé par votre hôte",
    manage: "Gérer",
  },
  en: {
    confirmedSubject: "Booking confirmed · {{event_name}}",
    confirmedBody:
      "Hi {{first_name}},\nYour {{event_name}} with {{host_name}} is confirmed for {{date}} at {{time}} ({{timezone}}).\nLocation: {{location}}\nReschedule or cancel: {{manage_link}}",
    cancelledSubject: "Booking cancelled · {{event_name}}",
    cancelledBody:
      "Hi {{first_name}}, your {{event_name}} on {{date}} at {{time}} has been cancelled.\nBook another time: {{event_link}}",
    hostNewSubject: "New booking · {{first_name}} {{last_name}}",
    hostRescheduledSubject:
      "Booking rescheduled · {{first_name}} {{last_name}}",
    hostCancelledSubject: "Booking cancelled · {{first_name}} {{last_name}}",
    hostBody:
      "{{event_name}} on {{date}} at {{time}} ({{timezone}}).\n{{first_name}} {{last_name}} · {{email}} · {{phone}}\n{{answers}}\n{{manage_link}}",
    reminderSubject: "Reminder · {{event_name}}",
    reminderBody:
      "Hi {{first_name}}, a quick reminder for {{event_name}} on {{date}} at {{time}} ({{timezone}}).\n{{location}}\nManage your booking: {{manage_link}}",
    phoneCall: "Phone call",
    linkLater: "Your host will share the link",
    manage: "Manage",
  },
};

const errorsEn: Record<string, string> = {
  "Cet événement est indisponible.": "This event is not available.",
  "Événement indisponible.": "This event is not available.",
  "Cet événement est désactivé.": "This event is no longer accepting bookings.",
  "Formulaire invalide.": "The form is invalid. Please refresh the page.",
  "Session de formulaire invalide.":
    "Your session has expired. Please refresh the page.",
  "Ce formulaire a déjà abouti à un rendez-vous.":
    "This form has already been used to book a call.",
  "Ce prospect a déjà réservé.": "You have already booked a call.",
  "Prénom et nom requis.": "First and last name are required.",
  "Email requis.": "Email is required.",
  "Téléphone international requis.":
    "Please enter an international phone number.",
  "Terminez la qualification pour accéder aux créneaux.":
    "Please complete the form to see available times.",
  "Terminez le formulaire avant de réserver.":
    "Please complete the form before booking.",
  "Rendez-vous introuvable.": "Booking not found.",
  "Rendez-vous annulé.": "This booking has been cancelled.",
  "Ce rendez-vous ne peut plus être reporté.":
    "This booking can no longer be rescheduled.",
  "Date invalide.": "Invalid date.",
  "Créneau invalide.": "Invalid time slot.",
  "Ce créneau vient d’être réservé ou n’est plus disponible. Choisissez-en un autre.":
    "This time was just booked or is no longer available. Please choose another one.",
  "Ce prospect possède déjà un rendez-vous. Utilisez son lien de report.":
    "You already have a booking. Use the link in your confirmation email to reschedule.",
  "Réponse invalide.": "Invalid answer.",
  "Choix invalide.": "Invalid choice.",
  "Nombre invalide.": "Invalid number.",
  "Un email ou téléphone international valide est requis.":
    "Please enter a valid email or international phone number.",
};

// Returns the English version of a public error, or a neutral English sentence.
export function translateError(message: string, status: number) {
  if (errorsEn[message]) return errorsEn[message];
  const answer = message.match(/^Répondez à « (.+) »\.$/);
  if (answer) return `Please answer “${answer[1]}”.`;
  if (status === 429)
    return "Too many attempts. Please wait a moment and try again.";
  if (status >= 500) return "Something went wrong. Please try again shortly.";
  return "Please check the information you entered and try again.";
}
