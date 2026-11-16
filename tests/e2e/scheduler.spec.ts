import { test, expect, Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
const email = "test@closeos.local",
  password = "E2E_Test_Password_12345";
async function login(page: Page) {
  await page.goto("/login");
  await page
    .getByRole("button", { name: "Se connecter avec un mot de passe" })
    .click();
  await page.getByLabel("Adresse email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(
    page.getByRole("heading", { name: "Événements", exact: true }),
  ).toBeVisible();
}
async function eventFor(page: Page, name: string) {
  const me = await (await page.request.get("/api/v1/me")).json();
  const body = {
    name,
    slug: "test-" + crypto.randomUUID().slice(0, 8),
    duration: 30,
    hostIds: [me.user.id],
    timezone: "Europe/Paris",
    noticeMinutes: 0,
    primaryContact: "email",
    locationType: "phone",
    description: "Parlons de votre projet et de vos objectifs.",
    brandName: "Studio Test",
    questions: [
      {
        id: "budget",
        label: "Votre budget",
        type: "radio",
        required: true,
        options: ["Moins de 1000 €", "Plus de 1000 €"],
      },
    ],
    disqualify: [
      {
        id: "rule",
        field: "budget",
        operator: "equals",
        value: "Moins de 1000 €",
        hostIds: [],
      },
    ],
  };
  const r = await page.request.post("/api/v1/events", { data: body });
  expect(r.status()).toBe(201);
  return (await r.json()).event;
}
test("administration: create event, edit questions, workflow, API key, all screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page
    .getByRole("button", { name: "Créer un événement", exact: true })
    .click();
  await page.getByLabel("Nom de l’événement").fill("Audit de croissance");
  await page.getByRole("button", { name: "Créer et personnaliser" }).click();
  await expect(
    page.getByRole("heading", { name: "Audit de croissance" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Questions du formulaire", exact: true })
    .click();
  await page.getByRole("button", { name: "Ajouter une question" }).click();
  await page.getByLabel("Intitulé").fill("Votre priorité ?");
  await page.getByLabel("Réponses possibles").fill("Acquisition\nConversion");
  await page.getByRole("button", { name: "Enregistrer la question" }).click();
  await page
    .getByRole("button", { name: "Enregistrer *", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Modifications enregistrées.",
  );
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Audit de croissance" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Automatisations", exact: true })
    .click();
  // Without a connected email API, reminder automations cannot be activated.
  await expect(
    page.getByRole("button", { name: "Connecter mon API email" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Créer un workflow" }).click();
  await page.getByLabel("Nom du workflow").fill("Rappel personnalisé");
  await page.getByRole("button", { name: "Enregistrer le workflow" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connectez votre API email",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  const connected = await page.request.put("/api/v1/integrations/resend", {
    data: { apiKey: "re_e2e_test_key_123", from: "Studio <rdv@example.com>" },
  });
  expect(connected.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText("API email connectée")).toBeVisible();
  const template = page
    .locator(".wf-template")
    .filter({ hasText: "Rappel 5 min avant · Lien de connexion" });
  await template.getByRole("button", { name: "Utiliser ce modèle" }).click();
  await expect(page.getByLabel("Nom du workflow")).toHaveValue(
    "Rappel 5 min avant · Lien de connexion",
  );
  await page.getByRole("button", { name: "Enregistrer le workflow" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Rappel 5 min avant · Lien de connexion",
    }),
  ).toBeVisible();
  await expect(template.getByText("Déjà ajouté")).toBeVisible();
  await page.screenshot({
    path: "docs/proofs/automation-templates.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Créer un workflow" }).click();
  await page.getByLabel("Nom du workflow").fill("Rappel personnalisé");
  await page.getByRole("button", { name: "Enregistrer le workflow" }).click();
  await expect(
    page.getByRole("heading", { name: "Rappel personnalisé" }),
  ).toBeVisible();
  for (const route of [
    "analytics",
    "leads",
    "calls",
    "availability",
    "calendars",
    "team",
    "integrations",
    "developers",
    "deliveries",
    "settings",
  ]) {
    await page.goto("/app/" + route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".loading")).toHaveCount(0);
  }
  await page.goto("/app/events");
  await expect(
    page.getByRole("heading", { name: "Audit de croissance" }),
  ).toBeVisible();
  mkdirSync("docs/proofs", { recursive: true });
  await page.screenshot({
    path: "docs/proofs/events-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("lead captured before continue, qualification blocks low budget, qualified flow books and cancels", async ({
  page,
}) => {
  await login(page);
  const e = await eventFor(page, "Découverte produit");
  await page.goto(
    "/book/" + e.slug + "?utm_source=google&utm_medium=cpc&utm_campaign=autumn",
  );
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") && r.request().method() === "POST" && r.ok(),
  );
  await page.getByLabel("Email *").fill("partial@example.com");
  await saved;
  await expect(page.getByText("Informations enregistrées")).toHaveCount(0);
  const partial = await (
    await page.request.get("/api/v1/leads?q=partial@example.com")
  ).json();
  expect(partial.total).toBe(1);
  expect(partial.leads[0].status).toBe("potential");
  expect(partial.leads[0].firstTouch.utm_source).toBe("google");
  await page.getByLabel("Prénom *").fill("Alex");
  await page.getByLabel("Nom de famille *").fill("Martin");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Moins de 1000 €").check();
  await page.getByRole("button", { name: "Choisir mon créneau" }).click();
  await expect(
    page.getByRole("heading", { name: "Merci pour vos réponses" }),
  ).toBeVisible();
  const lead = await (
    await page.request.get("/api/v1/leads?q=partial@example.com")
  ).json();
  expect(lead.leads[0].status).toBe("disqualified");
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/book/" + e.slug);
  await page.getByLabel("Email *").fill("booked@example.com");
  await page.getByLabel("Prénom *").fill("Camille");
  await page.getByLabel("Nom de famille *").fill("Durand");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Plus de 1000 €").check();
  await page.getByRole("button", { name: "Choisir mon créneau" }).click();
  await expect(page.locator(".slot-grid button").first()).toBeVisible();
  await page.locator(".slot-grid button").first().click();
  await page.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Reporter ou annuler" }).click();
  await page.getByRole("button", { name: "Reporter", exact: true }).click();
  await expect(page.locator(".slot-grid button").first()).toBeVisible();
  await page.locator(".slot-grid button").last().click();
  await page.getByRole("button", { name: "Confirmer le report" }).click();
  await expect(
    page.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page.getByRole("button", { name: "Confirmer l’annulation" }).click();
  await expect(
    page.getByRole("heading", { name: "Rendez-vous annulé" }),
  ).toBeVisible();
});
test("cross-origin inline and popup embeds capture parent UTMs and emit conversion events", async ({
  page,
}) => {
  await login(page);
  const e = await eventFor(page, "Embed externe");
  await page.goto(
    "http://127.0.0.1:4323/?event=" +
      e.slug +
      "&utm_source=facebook&utm_campaign=widget-launch&fbclid=click-123",
  );
  const frame = page.frameLocator("iframe").first();
  await expect(frame.getByRole("heading", { name: e.name })).toBeVisible();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") && r.request().method() === "POST" && r.ok(),
  );
  await frame.getByLabel("Email *").fill("embed@example.com");
  await saved;
  await expect(frame.getByText("Informations enregistrées")).toHaveCount(0);
  await frame.getByLabel("Prénom *").fill("Jules");
  await frame.getByLabel("Nom de famille *").fill("Petit");
  await frame.getByRole("button", { name: "Continuer" }).click();
  await frame.getByLabel("Plus de 1000 €").check();
  await frame.getByRole("button", { name: "Choisir mon créneau" }).click();
  await frame.locator(".slot-grid button").first().click();
  await frame.getByRole("button", { name: "Confirmer le rendez-vous" }).click();
  await expect(
    frame.getByRole("heading", { name: "Votre rendez-vous est confirmé" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).closeosEvents.some(
          (e: any) => e.type === "closeos.booked",
        ),
      ),
    )
    .toBe(true);
  const r = await page.request.get(
    "http://127.0.0.1:4322/api/v1/leads?q=embed@example.com",
  );
  const lead = (await r.json()).leads[0];
  expect(lead.firstTouch.utm_source).toBe("facebook");
  expect(lead.firstTouch.fbclid).toBe("click-123");
  expect(lead.firstTouch.landingPage).toContain(":4323");
  await page.getByRole("button", { name: "Prendre rendez-vous" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Fermer le calendrier" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate((slug) => {
    (window as any).CloseOS.widget(slug, { label: "Parlons de votre projet" });
  }, e.slug);
  await page.getByRole("button", { name: "Parlons de votre projet" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("mobile public scheduler fits, preserves unfinished form on reload, and loads only public chunks", async ({
  page,
}) => {
  await login(page);
  const e = await eventFor(page, "Réservation mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  const loaded: string[] = [];
  page.on("request", (r) => {
    if (r.resourceType() === "script") loaded.push(r.url());
  });
  await page.goto("/book/" + e.slug);
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") &&
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.firstName === "Marie" &&
      r.ok(),
  );
  await page.getByLabel("Email *").fill("mobile@example.com");
  await page.getByLabel("Prénom *").fill("Marie");
  await saved;
  await expect(page.getByText("Informations enregistrées")).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel("Prénom *")).toHaveValue("Marie");
  await expect(page.getByLabel("Email *")).toHaveValue("mobile@example.com");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(loaded.some((u) => /Admin-|Operations-|Settings-/.test(u))).toBe(
    false,
  );
  await page.screenshot({
    path: "docs/proofs/booking-mobile.png",
    fullPage: true,
  });
});
test("phone-first form reveals email only after a complete phone and captures silently", async ({
  page,
}) => {
  await login(page);
  const created = await eventFor(page, "Formulaire progressif");
  const response = await page.request.put("/api/v1/events/" + created.id, {
    data: {
      ...created,
      primaryContact: "both",
      showBranding: false,
      showOrganizerBrand: false,
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/book/" + created.slug);
  const phone = page.getByLabel("Téléphone *");
  await expect(phone).toBeVisible();
  await expect(page.getByLabel("Prénom *")).toHaveCount(0);
  await expect(page.getByLabel("Nom de famille *")).toHaveCount(0);
  await expect(page.getByLabel("Email *")).toHaveCount(0);
  await expect(page.locator(".booking-consent")).toHaveCount(0);
  await expect(page.getByText("En saisissant vos informations")).toBeVisible();
  await expect(page.locator(".booking-brand")).toHaveCount(0);
  await expect(page.locator(".booking-footer")).toHaveCount(0);
  await expect(phone).toHaveCSS("animation-name", "phone-invitation");
  await expect(page.locator(".booking-calendar")).toHaveClass(/locked/);
  await page.screenshot({
    path: "docs/proofs/phone-first-initial.png",
    fullPage: true,
  });
  await phone.evaluate((el) => {
    const pulse = el.getAnimations()[0];
    pulse.pause();
    pulse.currentTime = 1400;
  });
  await page.screenshot({
    path: "docs/proofs/phone-first-pulse.png",
    fullPage: true,
  });

  // A French number missing its last digits must not reveal the email.
  await phone.fill("+33612345");
  await expect(page.getByLabel("Email *")).toHaveCount(0);
  await expect(page.getByLabel("Prénom *")).toHaveCount(0);
  await expect(phone).toHaveCSS("animation-name", "none");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/leads") && r.request().method() === "POST" && r.ok(),
  );
  await phone.fill("+33612345678");
  await expect(page.getByLabel("Email *")).toBeVisible();
  await expect(page.getByLabel("Prénom *")).toBeVisible();
  await expect(page.getByLabel("Nom de famille *")).toBeVisible();
  await saved;
  await expect(page.getByText("Informations enregistrées")).toHaveCount(0);
  await expect(page.locator(".save-state")).toHaveCount(0);
  const leads = await (
    await page.request.get(
      "/api/v1/leads?q=" + encodeURIComponent("+33612345678"),
    )
  ).json();
  const lead = leads.leads.find((l: any) => l.eventId === created.id);
  expect(lead.status).toBe("potential");
  expect(lead.email).toBe("");
  await page.screenshot({
    path: "docs/proofs/phone-first-email.png",
    fullPage: true,
  });

  await page.getByLabel("Email *").fill("phone-first@example.com");
  await phone.fill("+33612345");
  await expect(page.getByLabel("Email *")).toHaveValue(
    "phone-first@example.com",
  );
  await phone.fill("+33612345678");
  await page.getByLabel("Prénom *").fill("Alex");
  await page.getByLabel("Nom de famille *").fill("Martin");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Plus de 1000 €").check();
  await page.getByRole("button", { name: "Choisir mon créneau" }).click();
  await expect(page.locator(".slot-grid button").first()).toBeVisible();

  await page.evaluate(() => sessionStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/book/" + created.slug);
  await expect(phone).toHaveCSS("animation-name", "none");
  await expect(page.getByLabel("Email *")).toHaveCount(0);
  await phone.fill("+971501234567");
  await expect(page.getByLabel("Email *")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/proofs/phone-first-mobile.png",
    fullPage: true,
  });

  await page.evaluate(() => sessionStorage.clear());
  await page.goto(
    "/book/" +
      created.slug +
      "?phone=%2B33612345678&email=prefilled%40example.com",
  );
  await expect(page.getByLabel("Email *")).toHaveValue("prefilled@example.com");
  await page.request.put("/api/v1/events/" + created.id, {
    data: { ...created, primaryContact: "phone" },
  });
  await page.reload();
  await expect(phone).toBeVisible();
  await expect(page.getByLabel("Email *")).toHaveCount(0);
});
test("an English event shows the whole booking page in English", async ({
  page,
}) => {
  await login(page);
  const created = await eventFor(page, "Discovery call");
  const r = await page.request.put("/api/v1/events/" + created.id, {
    data: {
      ...created,
      language: "en",
      primaryContact: "both",
      buttonText: "Continuer",
    },
  });
  expect(r.ok()).toBe(true);
  await page.goto("/book/" + created.slug);
  const phone = page.getByLabel("Phone *");
  await expect(phone).toBeVisible();
  await expect(page.getByPlaceholder("Enter your phone number")).toBeVisible();
  await expect(
    page.getByText("Fill out the form", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Book your event", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "By entering your information, you consent to your data being saved",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Please fill out the form before choosing your time slot."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Continue/ })).toBeVisible();
  await expect(page.locator(".day-label").first()).toHaveText("Sun");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await phone.fill("+14155550123");
  await expect(page.getByLabel("First name *")).toBeVisible();
  await expect(page.getByLabel("Last name *")).toBeVisible();
  await expect(page.getByLabel("Email *")).toBeVisible();
  await page.screenshot({
    path: "docs/proofs/booking-english.png",
    fullPage: true,
  });
  const body = await page.locator(".booking-root").innerText();
  expect(body).not.toMatch(/Remplir|Réservez|Prénom|Téléphone|Continuer/);

  // The event editor exposes the language choice.
  await page.goto("/app/events/" + created.id);
  await expect(page.getByLabel("Langue de la page de réservation")).toHaveValue(
    "en",
  );
});
