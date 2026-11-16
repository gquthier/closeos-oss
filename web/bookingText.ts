// Copy of the public booking and booking-management pages, in the event's language.
export type Lang = "fr" | "en";

const fr = {
  locale: "fr-FR",
  prevMonth: "Mois précédent",
  nextMonth: "Mois suivant",
  chooseDay: "Choisir le ",
  searchingSlots: "Recherche des créneaux…",
  email: "Email *",
  invalidEmail: "Veuillez utiliser une adresse e-mail valide",
  phoneCheckFailed:
    "La vérification du numéro n’a pas pu charger. Actualisez la page pour réessayer.",
  phoneIncomplete:
    "Saisissez un numéro international complet, avec son indicatif.",
  contactRequired: "Saisissez un email ou un numéro international valide.",
  unavailableTitle: "Ce lien n’est pas disponible",
  loadingCalendar: "Chargement du calendrier…",
  stepConfirmed: "Rendez-vous confirmé",
  stepForm: "Remplir le formulaire",
  stepBook: "Réservez votre événement",
  cancelledTitle: "Rendez-vous annulé",
  confirmedTitle: "Votre rendez-vous est confirmé",
  bookAgainText: "Vous pouvez réserver un nouveau créneau.",
  yourHost: "Votre hôte",
  joinMeeting: "Rejoindre le rendez-vous ↗",
  addToCalendar: "Ajouter à mon calendrier",
  rescheduleOrCancel: "Reporter ou annuler",
  reschedule: "Reporter",
  cancel: "Annuler",
  pickNewSlot: "Choisir un nouveau créneau",
  timezone: "Fuseau horaire",
  cancelTitle: "Annuler ce rendez-vous ?",
  cancelReasonLabel: "Motif d’annulation",
  cancelReasonPlaceholder: "Motif de l’annulation (facultatif)",
  keepBooking: "Conserver mon rendez-vous",
  confirmCancel: "Confirmer l’annulation",
  thanksTitle: "Merci pour vos réponses",
  minutes: "minutes",
  phoneCall: "Appel téléphonique",
  videoCall: "Visioconférence",
  phone: "Téléphone *",
  countryCode: "Indicatif du pays",
  phonePlaceholder: "Numéro de téléphone ici",
  firstName: "Prénom *",
  lastName: "Nom de famille *",
  consentStart:
    "En saisissant vos informations, vous acceptez que vos données soient enregistrées conformément à nos",
  terms: "conditions",
  privacy: "politique de confidentialité",
  saving: "Enregistrement…",
  back: "‹ Retour",
  selectAnswer: "Sélectionnez une réponse",
  checking: "Vérification…",
  chooseSlot: "Choisir mon créneau",
  yourTimezone: "Votre fuseau horaire",
  lockMessage:
    "Merci de remplir le formulaire avant de choisir votre créneau horaire.",
  noSlots: "Aucun créneau disponible ce mois-ci",
  noSlotsHint: "Essayez le mois suivant ou contactez l’organisateur.",
  booking: "Réservation…",
  confirmReschedule: "Confirmer le report",
  confirmBooking: "Confirmer le rendez-vous",
  poweredBy: "Propulsé par",
};
export type BookingText = typeof fr;

const en: BookingText = {
  locale: "en-US",
  prevMonth: "Previous month",
  nextMonth: "Next month",
  chooseDay: "Choose ",
  searchingSlots: "Finding available times…",
  email: "Email *",
  invalidEmail: "Please use a valid email address",
  phoneCheckFailed:
    "Phone number validation couldn’t load. Please refresh the page and try again.",
  phoneIncomplete:
    "Enter a complete international number, including the country code.",
  contactRequired: "Please enter a valid email or international phone number.",
  unavailableTitle: "This link isn’t available",
  loadingCalendar: "Loading calendar…",
  stepConfirmed: "Booking confirmed",
  stepForm: "Fill out the form",
  stepBook: "Book your event",
  cancelledTitle: "Booking cancelled",
  confirmedTitle: "Your booking is confirmed",
  bookAgainText: "You can book a new time.",
  yourHost: "Your host",
  joinMeeting: "Join the meeting ↗",
  addToCalendar: "Add to my calendar",
  rescheduleOrCancel: "Reschedule or cancel",
  reschedule: "Reschedule",
  cancel: "Cancel",
  pickNewSlot: "Choose a new time",
  timezone: "Time zone",
  cancelTitle: "Cancel this booking?",
  cancelReasonLabel: "Reason for cancelling",
  cancelReasonPlaceholder: "Reason for cancelling (optional)",
  keepBooking: "Keep my booking",
  confirmCancel: "Confirm cancellation",
  thanksTitle: "Thank you for your answers",
  minutes: "minutes",
  phoneCall: "Phone call",
  videoCall: "Video call",
  phone: "Phone *",
  countryCode: "Country code",
  phonePlaceholder: "Enter your phone number",
  firstName: "First name *",
  lastName: "Last name *",
  consentStart:
    "By entering your information, you consent to your data being saved in accordance with our",
  terms: "Terms",
  privacy: "Privacy Policy",
  saving: "Saving…",
  back: "‹ Back",
  selectAnswer: "Select an answer",
  checking: "Checking…",
  chooseSlot: "Choose my time",
  yourTimezone: "Your time zone",
  lockMessage: "Please fill out the form before choosing your time slot.",
  noSlots: "No times available this month",
  noSlotsHint: "Try next month or contact the organizer.",
  booking: "Booking…",
  confirmReschedule: "Confirm new time",
  confirmBooking: "Confirm booking",
  poweredBy: "Powered by",
};

export const bookingText: Record<Lang, BookingText> = { fr, en };

// Default event texts are shown in the page language when left untouched.
const defaults = {
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
export type DefaultKey = keyof typeof defaults.fr;
export const eventDefaults = defaults;
export function eventText(
  value: string | undefined,
  key: DefaultKey,
  lang: Lang,
) {
  const other = lang === "en" ? "fr" : "en";
  if (!value || value === defaults[other][key]) return defaults[lang][key];
  return value;
}
