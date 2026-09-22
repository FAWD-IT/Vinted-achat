import type { Page } from "playwright";
import { log } from "../util.js";

export type CheckoutProgress =
  | { step: "checkout_open"; url: string }
  | { step: "relay_required" }
  | { step: "payment_ready"; canPay: boolean }
  | { step: "payment_confirmed" }
  | { step: "blocked"; reason: string };

export type CheckoutOptions = {
  clickPay: boolean;
  preferredRelaySubstring?: string | null;
  phone?: string | null;
};

async function waitForCheckoutUrl(
  page: Page,
  timeoutMs = 20_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const url = page.url();
    if (url.includes("/checkout")) return url;
    await page.waitForTimeout(200);
  }
  return null;
}

function relayPickerModal(page: Page) {
  return page.locator(".ReactModal__Content").last();
}

async function needsRelaySelection(page: Page): Promise<boolean> {
  return page
    .getByRole("button", { name: /choisir un point relais/i })
    .isVisible()
    .catch(() => false);
}

async function waitForCheckoutUi(page: Page): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const choose = await page
      .getByRole("button", { name: /choisir un point relais/i })
      .isVisible()
      .catch(() => false);
    const pay = await page
      .getByRole("button", { name: /^payer$/i })
      .isVisible()
      .catch(() => false);
    const relay = await relayIsSelected(page);
    if (choose || pay || relay) return;
    await page.waitForTimeout(400);
  }
}

async function relayIsSelected(page: Page): Promise<boolean> {
  if (await needsRelaySelection(page)) return false;
  const deliveryDetails = page.getByRole("button", {
    name: /mondial relay|vinted go|bpost|chronopost|librairie|locker/i,
  });
  if (await deliveryDetails.first().isVisible().catch(() => false)) {
    return true;
  }
  const body = await page.locator("body").innerText().catch(() => "");
  if (body.toLowerCase().includes("choisir un point relais")) return false;
  return /librairie du coin|rue de la revolution/i.test(body);
}

async function selectPickupPoint(
  page: Page,
  preferredRelaySubstring: string | null | undefined,
): Promise<boolean> {
  if (await relayIsSelected(page)) {
    return true;
  }

  for (let tryNum = 1; tryNum <= 3; tryNum++) {
    const open = page.getByRole("button", {
      name: /choisir un point relais/i,
    });
    if (!(await open.isVisible().catch(() => false))) {
      return relayIsSelected(page);
    }

    log("info", `Ouverture du sélecteur de point relais (essai ${tryNum}/3)…`);
    await open.click();
    await page.waitForTimeout(1200);

    const modal = relayPickerModal(page);
    await modal.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});

    const needle = preferredRelaySubstring?.trim();
    let picked = false;

    if (needle) {
      const byText = modal.getByText(new RegExp(needle, "i")).first();
      if (await byText.isVisible().catch(() => false)) {
        await byText.click();
        picked = true;
      }
    }

    if (!picked) {
      const relayOptions = modal.getByRole("button").filter({
        hasText: /Vinted Go|Mondial Relay|bpost|Chronopost|LIBRAIRIE|Librairie/i,
      });
      const first = relayOptions.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click();
        picked = true;
      }
    }

    if (!picked) {
      log("warn", "Sélection relais échouée — nouvel essai…");
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
      continue;
    }

    await page.waitForTimeout(400);
    const confirm = page.getByRole("button", { name: /^confirmer$/i });
    if (!(await confirm.isVisible().catch(() => false))) {
      log("warn", "Confirmer introuvable — nouvel essai…");
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }
    await confirm.click();
    await page.waitForTimeout(1500);

    if (await relayIsSelected(page)) {
      log("info", "Point relais sélectionné.");
      return true;
    }
  }

  return relayIsSelected(page);
}

async function ensurePhoneNumber(
  page: Page,
  phone: string | null | undefined,
): Promise<void> {
  const raw = phone?.trim();
  if (!raw) return;

  const addPhone = page.getByRole("button", {
    name: /ajouter numéro de téléphone|add phone/i,
  });
  if (!(await addPhone.isVisible().catch(() => false))) {
    return;
  }

  log("info", "Saisie du numéro de téléphone checkout…");
  await addPhone.click();
  await page.waitForTimeout(600);

  const input = page
    .locator(
      'input[type="tel"], input[name*="phone" i], input[autocomplete="tel"]',
    )
    .first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(raw);
  } else {
    await page.getByRole("textbox").first().fill(raw).catch(() => {});
  }

  const save = page.getByRole("button", {
    name: /enregistrer|confirmer|continuer|save|ok/i,
  });
  if (await save.first().isVisible().catch(() => false)) {
    await save.first().click();
  }
  await page.waitForTimeout(800);
}

async function ensureSavedCardSelected(page: Page): Promise<void> {
  const visa = page.getByRole("radio", { name: /visa|mastercard|carte/i }).first();
  if (await visa.isVisible().catch(() => false)) {
    await visa.click().catch(() => {});
    return;
  }

  const cardButton = page.getByRole("button", {
    name: /carte bancaire|payer par carte/i,
  });
  if (await cardButton.isVisible().catch(() => false)) {
    await cardButton.click().catch(() => {});
  }
}

/** Après « Payer », attente validation Revolut / 3-D Secure (action manuelle sur le téléphone). */
export async function waitForRevolutOrPaymentConfirmation(
  page: Page,
  timeoutMs = 180_000,
): Promise<boolean> {
  log(
    "info",
    "Paiement envoyé — valide maintenant dans l'app Revolut sur ton téléphone.",
  );

  const deadline = Date.now() + timeoutMs;
  let lastLog = 0;
  while (Date.now() < deadline) {
    const url = page.url();
    if (
      /\/inbox|\/member\/|\/conversation|order|success|confirmed|receipt|purchased/i.test(
        url,
      ) &&
      !url.includes("/checkout")
    ) {
      log("info", "Commande confirmée (redirection Vinted).");
      return true;
    }

    const body = await page.locator("body").innerText().catch(() => "");
    if (
      /commande confirm|paiement réussi|merci pour ton achat|payment successful|félicitations|tu as acheté|achat confirm|transaction confirm/i.test(
        body,
      )
    ) {
      log("info", "Paiement confirmé sur Vinted.");
      return true;
    }

    if (!url.includes("/checkout")) {
      log("info", "Navigation hors checkout — paiement probablement OK.");
      return true;
    }

    const stillOnCheckout = await page
      .getByRole("button", { name: /^payer$/i })
      .isVisible()
      .catch(() => false);
    if (!stillOnCheckout && url.includes("/checkout")) {
      log("info", "Checkout terminé (bouton Payer absent).");
      return true;
    }

    if (Date.now() - lastLog > 20_000) {
      log("info", "Toujours en attente de validation Revolut…");
      lastLog = Date.now();
    }

    await page.waitForTimeout(2500);
  }

  log(
    "warn",
    "Délai dépassé en attente Revolut — vérifie l'app Revolut et la page Vinted.",
  );
  return false;
}

export async function advanceCheckoutBeforePayment(
  page: Page,
  options: CheckoutOptions,
): Promise<CheckoutProgress> {
  const checkoutUrl = page.url().includes("/checkout")
    ? page.url()
    : await waitForCheckoutUrl(page);
  if (!checkoutUrl) {
    return {
      step: "blocked",
      reason: "URL checkout non atteinte après Acheter",
    };
  }

  log("info", `Checkout : ${checkoutUrl}`);

  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await waitForCheckoutUi(page);
  await page.waitForTimeout(800);

  const relayOk = await selectPickupPoint(page, options.preferredRelaySubstring);
  if (!relayOk) {
    return { step: "relay_required" };
  }

  await ensurePhoneNumber(page, options.phone);
  await ensureSavedCardSelected(page);
  await page.waitForTimeout(400);

  const payButton = page.getByRole("button", { name: /^payer$/i });
  const canPay = await payButton.isVisible().catch(() => false);
  const disabled = canPay
    ? await payButton.isDisabled().catch(() => true)
    : true;

  if (!options.clickPay) {
    log(
      "info",
      canPay
        ? `Prêt au paiement (Payer disabled=${disabled}) — arrêt avant clic.`
        : "Payer absent — vérifie téléphone / moyen de paiement.",
    );
    return { step: "payment_ready", canPay: canPay && !disabled };
  }

  if (!canPay || disabled) {
    return {
      step: "blocked",
      reason: "Payer indisponible (relai, carte ou téléphone ?)",
    };
  }

  log("info", "Clic sur Payer — ouvre Revolut si demandé.");
  await payButton.click({ timeout: 10_000 });
  await page.waitForTimeout(2000);

  const confirmed = await waitForRevolutOrPaymentConfirmation(page);
  if (confirmed) {
    return { step: "payment_confirmed" };
  }
  return { step: "payment_ready", canPay: true };
}
