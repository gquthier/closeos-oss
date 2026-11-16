import { z } from "zod";
import { eventDefaults } from "./i18n.js";
import { DateTime } from "luxon";
const text = z.string().max(10000);
export const zone = z
  .string()
  .refine((x) => DateTime.now().setZone(x).isValid, "Fuseau horaire invalide");
const url = z.union([
  z.literal(""),
  z.url().refine((s) => /^https?:\/\//.test(s), "URL HTTP(S) requise"),
]);
export const question = z.object({
  id: z.string().min(1).max(100),
  label: z.string().min(1).max(300),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "number",
    "select",
    "radio",
    "checkbox",
  ]),
  required: z.boolean().default(false),
  options: z.array(z.string().max(200)).max(100).default([]),
});
export const rule = z.object({
  id: z.string(),
  field: z.string(),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "less_than",
    "greater_than",
    "in",
  ]),
  value: z.string(),
  hostIds: z.array(z.string()).default([]),
});
export const eventSchema = z.object({
  name: z.string().min(1).max(160),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9-]+$/),
  description: text.default(""),
  duration: z.number().int().min(5).max(480).default(30),
  type: z.enum(["strategy", "discovery", "collective"]).default("strategy"),
  locationType: z
    .enum(["phone", "google_meet", "teams", "custom", "in_person"])
    .default("google_meet"),
  location: z.string().max(1000).default(""),
  active: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#147d70"),
  timezone: zone.default("Asia/Dubai"),
  language: z.enum(["fr", "en"]).default("fr"),
  hostIds: z.array(z.string()).min(1),
  routingMode: z.enum(["round_robin", "priority"]).default("round_robin"),
  bufferBefore: z.number().int().min(0).max(240).default(0),
  bufferAfter: z.number().int().min(0).max(240).default(0),
  noticeMinutes: z.number().int().min(0).max(43200).default(120),
  horizonDays: z.number().int().min(1).max(365).default(30),
  slotInterval: z.number().int().min(5).max(120).default(30),
  dailyLimit: z.number().int().min(0).max(1000).default(0),
  questions: z.array(question).max(100).default([]),
  disqualify: z.array(rule).default([]),
  routing: z.array(rule).default([]),
  disqualifyMessage: text.default(eventDefaults.fr.disqualifyMessage),
  disqualifyRedirect: url.default(""),
  confirmationMessage: text.default(eventDefaults.fr.confirmationMessage),
  redirectUrl: url.default(""),
  logoUrl: url.default(""),
  brandName: z.string().max(100).default("CloseOS"),
  buttonText: z.string().max(80).default(eventDefaults.fr.buttonText),
  primaryContact: z.enum(["email", "phone", "both"]).default("both"),
  showBranding: z.boolean().default(false),
  showOrganizerBrand: z.boolean().default(false),
  privacyUrl: url.default(""),
  termsUrl: url.default(""),
  notifications: z
    .object({
      confirmation: z.boolean().default(true),
      host: z.boolean().default(true),
      cancellation: z.boolean().default(true),
      emailReminders: z
        .array(z.number().int().min(1).max(43200))
        .max(20)
        .default([1440, 60]),
      smsReminders: z
        .array(z.number().int().min(1).max(43200))
        .max(20)
        .default([]),
    })
    .default({
      confirmation: true,
      host: true,
      cancellation: true,
      emailReminders: [1440, 60],
      smsReminders: [],
    }),
});
export const block = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine((b) => b.end > b.start, "La fin doit suivre le début.");
export const availabilitySchema = z.object({
  userId: z.string(),
  name: z.string().min(1).max(100).default("Horaires de travail"),
  timezone: zone,
  weekly: z.record(z.string().regex(/^[1-7]$/), z.array(block).max(14)),
  overrides: z
    .record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.array(block).max(14))
    .default({}),
});
export const workflowSchema = z.object({
  name: z.string().min(1).max(160),
  enabled: z.boolean().default(true),
  eventIds: z.array(z.string()).default([]),
  trigger: z.enum([
    "lead.captured",
    "lead.qualified",
    "lead.disqualified",
    "booking.created",
    "booking.before",
    "booking.started",
    "booking.ended",
    "booking.cancelled",
    "booking.rescheduled",
  ]),
  delayMinutes: z.number().int().min(0).max(525600).default(0),
  skipIfBooked: z.boolean().default(true),
  actions: z
    .array(
      z.object({
        channel: z.enum(["email", "sms"]),
        recipient: z.enum(["invitee", "host"]).default("invitee"),
        subject: z.string().max(300).default(""),
        body: z.string().min(1).max(20000),
      }),
    )
    .min(1)
    .max(30),
});
export const attributionSchema = z.object({
  utm_source: z.string().max(500).optional(),
  utm_medium: z.string().max(500).optional(),
  utm_campaign: z.string().max(500).optional(),
  utm_term: z.string().max(500).optional(),
  utm_content: z.string().max(500).optional(),
  gclid: z.string().max(500).optional(),
  fbclid: z.string().max(500).optional(),
  msclkid: z.string().max(500).optional(),
  ttclid: z.string().max(500).optional(),
  referrer: z.string().max(2000).optional(),
  landingPage: z.string().max(2000).optional(),
  pageUrl: z.string().max(2000).optional(),
});
export const captureSchema = z
  .object({
    email: z.union([z.email(), z.literal("")]).default(""),
    phone: z.string().max(30).default(""),
    firstName: z.string().max(100).default(""),
    lastName: z.string().max(100).default(""),
    token: z.string().max(100).optional(),
    visitorId: z.string().max(100),
    attribution: attributionSchema.default({}),
    smsConsent: z.boolean().default(false),
    website: z.string().max(100).default(""),
  })
  .refine(
    (x) => !!x.email || /^\+[1-9]\d{6,14}$/.test(x.phone),
    "Un email ou téléphone international valide est requis.",
  );
export function defaultAvailability(userId: string, timezone = "Asia/Dubai") {
  return {
    userId,
    name: "Horaires de travail",
    timezone,
    weekly: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        i + 1,
        i < 5 ? [{ start: "09:00", end: "18:00" }] : [],
      ]),
    ),
    overrides: {},
  };
}
