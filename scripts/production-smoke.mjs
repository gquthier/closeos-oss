import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import http from "node:http";
const base = "https://call.bizos.cc",
  env = parseEnv(readFileSync(".env", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let eventId, leadId, manageToken;
let server;
const request = async (path, method = "GET", data) => {
  const r = await context.request.fetch(base + "/api/v1" + path, {
    method,
    data,
    headers: { "Content-Type": "application/json" },
  });
  assert.ok(r.ok(), `${method} ${path}: ${r.status()} ${await r.text()}`);
  return r.json();
};
try {
  await page.goto(base + "/login");
  await page
    .getByRole("button", { name: "Se connecter avec un mot de passe" })
    .click();
  await page.getByLabel("Adresse email", { exact: true }).fill(env.ADMIN_EMAIL);
  await page
    .getByLabel("Mot de passe", { exact: true })
    .fill(env.ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page
    .getByRole("heading", { name: "Événements", exact: true })
    .waitFor();
  const me = await request("/me");
  const baseline = await request("/events");
  assert.ok(
    baseline.events.some((e) => e.slug === "decouverte-21e51acc"),
    "Existing event persists across deploys",
  );
  const spec = await request("/openapi.json");
  assert.ok(Object.keys(spec.paths).length >= 45);
  const e = (
    await request("/events", "POST", {
      name: "Vérification technique temporaire",
      slug: "verification-" + Date.now(),
      duration: 30,
      noticeMinutes: 0,
      horizonDays: 30,
      hostIds: [me.user.id],
      primaryContact: "both",
      locationType: "phone",
      brandName: "BizOS · Calls",
      questions: [
        {
          id: "project",
          label: "Votre projet",
          type: "radio",
          required: true,
          options: ["Lancer", "Développer"],
        },
      ],
      notifications: {
        confirmation: false,
        host: false,
        cancellation: false,
        emailReminders: [],
        smsReminders: [],
      },
    })
  ).event;
  eventId = e.id;
  server = http
    .createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font:16px system-ui;margin:25px"><h1>Vérification du calendrier intégré</h1><button data-closeos-popup="${e.slug}">Ouvrir le calendrier</button><div data-closeos-inline="${e.slug}" style="max-width:1000px"></div><script>window.dataLayer=[];window.booked=false;addEventListener('closeos.booked',()=>window.booked=true)</script><script src="${base}/embed.js" async></script></body></html>`,
      );
    })
    .listen(4324, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  await page.goto(
    "http://127.0.0.1:4324/?utm_source=qa&utm_medium=embed&utm_campaign=production-verification&gclid=qa-click",
  );
  const frame = page.frameLocator("iframe").first();
  await frame.getByLabel("Téléphone *").waitFor();
  assert.equal(await frame.getByLabel("Email *").count(), 0);
  assert.equal(
    await frame.locator(".booking-brand, .booking-footer").count(),
    0,
  );
  const phoneSaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") && r.request().method() === "POST" && r.ok(),
  );
  await frame.getByLabel("Téléphone *").fill("+12025550147");
  await frame.getByLabel("Email *").waitFor();
  await phoneSaved;
  const phonePartial = await request(
    "/leads?q=" + encodeURIComponent("+12025550147"),
  );
  const capturedPhone = phonePartial.leads.find((l) => l.eventId === e.id);
  assert.ok(capturedPhone);
  leadId = capturedPhone.id;
  assert.equal(capturedPhone.email, "");
  assert.equal(capturedPhone.status, "potential");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") && r.request().method() === "POST" && r.ok(),
  );
  await frame.getByLabel("Email *").fill("qa-closeos@example.com");
  await saved;
  assert.equal(await frame.getByText("Informations enregistrées").count(), 0);
  const partial = await request("/leads?q=qa-closeos@example.com");
  assert.equal(partial.leads[0].status, "potential");
  leadId = partial.leads[0].id;
  assert.equal(partial.leads[0].firstTouch.utm_source, "qa");
  assert.equal(partial.leads[0].firstTouch.gclid, "qa-click");
  assert.match(partial.leads[0].firstTouch.landingPage, /:4324/);
  await frame.getByLabel("Prénom *").fill("Vérification");
  await frame.getByLabel("Nom *", { exact: true }).fill("Technique");
  await frame.getByRole("button", { name: "Continuer" }).click();
  await frame.getByLabel("Développer", { exact: true }).check();
  await frame.getByRole("button", { name: "Choisir mon créneau" }).click();
  await frame.locator(".slot-grid button").first().click();
  await frame.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await frame
    .getByRole("heading", { name: "Votre rendez-vous est confirmé" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.booked), true);
  const bookings = await request("/bookings");
  const b = bookings.bookings.find((b) => b.leadId === leadId);
  assert.ok(b);
  manageToken = b.manageToken;
  const file = await context.request.get(
    base + "/api/v1/public/bookings/" + manageToken + "/calendar.ics",
  );
  assert.equal(file.status(), 200);
  assert.match(await file.text(), /METHOD:REQUEST/);
  await page.getByRole("button", { name: "Ouvrir le calendrier" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: "Fermer le calendrier" }).click();
  await page.evaluate(
    (slug) => CloseOS.widget(slug, { label: "Widget de vérification" }),
    e.slug,
  );
  await page.getByRole("button", { name: "Widget de vérification" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  const analytics = await request("/analytics");
  assert.ok(
    analytics.sources.some((s) => s.source === "qa" && s.bookings === 1),
  );
  await page.goto(base + "/manage/" + manageToken);
  await page.getByRole("button", { name: "Reporter", exact: true }).click();
  await page.locator(".slot-grid button").last().click();
  await page.getByRole("button", { name: "Confirmer le report" }).click();
  await page
    .getByRole("heading", { name: "Votre rendez-vous est confirmé" })
    .waitFor();
  const changed = await request("/public/bookings/" + manageToken);
  assert.notEqual(changed.booking.start, b.start);
  assert.equal(changed.booking.version, b.version + 1);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
  await page.getByRole("heading", { name: "Rendez-vous annulé" }).waitFor();
  const cancellation = await context.request.get(
    base + "/api/v1/public/bookings/" + manageToken + "/calendar.ics",
  );
  assert.match(await cancellation.text(), /METHOD:CANCEL/);
  assert.deepEqual(errors, []);
  writeFileSync(
    "docs/proofs/production-functional.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        origin: base,
        checks: {
          login: true,
          persistedAcrossDeploy: true,
          publicOpenAPI: true,
          partialLeadCapture: true,
          phoneBeforeEmail: true,
          silentCapture: true,
          optionalBranding: true,
          parentUTM: true,
          gclid: true,
          crossOriginInline: true,
          popup: true,
          floatingWidget: true,
          qualification: true,
          booking: true,
          conversionPostMessage: true,
          ics: true,
          reschedule: true,
          cancellation: true,
          attributionAnalytics: true,
        },
        javascriptErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Production checks passed: login, persisted data, OpenAPI, partial capture, parent UTM/click ID, cross-origin inline, popup, floating widget, qualification, booking, reschedule, cancellation, ICS and analytics.",
  );
} finally {
  if (manageToken)
    await request("/public/bookings/" + manageToken + "/cancel", "POST", {
      reason: "Fin de vérification technique",
    });
  if (leadId) await request("/leads/" + leadId, "DELETE");
  if (eventId) await request("/events/" + eventId, "DELETE");
  server?.close();
  await browser.close();
  console.log("Temporary verification records removed.");
}
