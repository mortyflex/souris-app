import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { BookableService } from "@/features/availability/availability";
import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { ChallengeState } from "@/features/booking/challenge";

import {
  AppointmentSummary,
  BookingConfirmation,
  FlowNoticeBox,
  ReviewStep,
  ServiceStep,
  SlotStep,
  type Professional,
} from "../booking-steps";
import { ServiceCardView } from "../service-card";
import { SELECTION_LIMIT_ID } from "../selection-summary";

/** The no-break spaces Intl writes in prices, built from code points. */
const SPACES = new RegExp("[" + String.fromCharCode(0xa0, 0x202f) + "]", "g");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(SPACES, " ").replace(/\s+/g, " ");
const noop = () => undefined;
const professional: Professional = { name: "Atelier Lumière", phone: "04 78 00 00 00" };
const ready: ChallengeState = { status: "ready", token: "0.turnstile-token" };

const coupe: BookableService = { id: "svc-coupe", name: "Coupe", durationMinutes: 45, priceCents: 4500, description: "Shampoing, coupe et coiffage." };
const couleur: BookableService = { id: "tech-couleur", name: "Couleur", durationMinutes: 90, priceCents: 8950 };
const diagnostic: BookableService = { id: "svc-diag", name: "Diagnostic", durationMinutes: 15, priceCents: 0 };
const eight = Array.from({ length: 8 }, (_, index) => ({ id: `svc-${index}`, name: `Soin ${index + 1}`, durationMinutes: 30, priceCents: 2000 }));
const ninth: BookableService = { id: "svc-extra", name: "Soin en plus", durationMinutes: 30, priceCents: 2000 };

const selection = (services: readonly BookableService[]) => ({ services, onAdd: noop, onRemove: noop, onChooseTimes: noop });
const serviceStep = (catalogue: readonly BookableService[], chosen: readonly BookableService[]) =>
  renderToStaticMarkup(<ServiceStep services={catalogue} professional={professional} onChoose={noop} selection={selection(chosen)} />);

describe("the service card — « Ajouter » / « Retirer »", () => {
  const card = (props: Partial<Parameters<typeof ServiceCardView>[0]>) =>
    renderToStaticMarkup(
      <ServiceCardView
        service={coupe}
        selected={false}
        headingLevel={3}
        onChoose={noop}
        truncated
        onOpenDetail={noop}
        selectionAction={{ canAdd: true, limitId: SELECTION_LIMIT_ID, onAdd: noop, onRemove: noop }}
        {...props}
      />,
    );

  it("adds a service — its name in the button's accessible name, the detail a separate control", () => {
    const markup = card({});
    expect(text(markup)).toContain("Ajouter Coupe à votre sélection");
    expect(markup).not.toContain("Choisir");
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup).toContain('aria-haspopup="dialog"');
  });

  it("a selected service shows its place in her order, « Ajoutée » and « Retirer »", () => {
    const markup = card({ selectionAction: { position: 2, canAdd: true, onAdd: noop, onRemove: noop } });
    expect(text(markup)).toContain("2e prestation de votre sélection");
    expect(text(markup)).toContain("Ajoutée");
    expect(text(markup)).toContain("Retirer Coupe de votre sélection");
    expect(markup).toContain("border-accent");
    expect(text(card({ selectionAction: { position: 1, canAdd: true, onAdd: noop, onRemove: noop } }))).toContain("1re prestation");
  });

  it("when the selection is full, « Ajouter » is disabled and points to the message saying why", () => {
    const markup = card({ selectionAction: { canAdd: false, limitId: SELECTION_LIMIT_ID, onAdd: noop, onRemove: noop } });
    expect(markup).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*aria-describedby="${SELECTION_LIMIT_ID}"`));
  });
});

describe("the services step — several services", () => {
  it("lists her selection in order with the combined length, the indicative total and « Choisir un horaire »", () => {
    const page = text(serviceStep([coupe, couleur, diagnostic], [couleur, coupe]));
    expect(page).toContain("Choisissez vos prestations");
    expect(page).toContain("Jusqu’à 8 prestations");
    expect(page).toContain("Votre sélection");
    expect(page.indexOf("Couleur 1 h 30 · 89,50 €")).toBeLessThan(page.indexOf("Coupe 45 min · 45 €"));
    expect(page).toContain("Durée totale 2 h 15");
    expect(page).toContain("Total indicatif 134,50 €");
    expect(page).toContain("Tarifs indicatifs · aucun paiement en ligne.");
    // The phone's sticky summary.
    expect(page).toContain("2 prestations · 2 h 15");
    expect(page).toContain("Choisir un horaire");
  });

  it("never presents a 0 price as free: « Tarif à confirmer », and « Total à confirmer »", () => {
    const page = text(serviceStep([coupe, diagnostic], [coupe, diagnostic]));
    expect(page).toContain("Tarif à confirmer");
    expect(page).toContain("Total à confirmer");
    expect(page).not.toContain("Total indicatif");
    expect(page).not.toMatch(/gratuit|0 €|0,00 €/i);
  });

  it("an unknown price never makes up a total", () => {
    const page = text(serviceStep([coupe, { ...couleur, priceCents: undefined }], [coupe, { ...couleur, priceCents: undefined }]));
    expect(page).toContain("Total à confirmer");
    expect(page).not.toContain("134,50");
  });

  it("at eight services, says it is the maximum and disables every other « Ajouter »", () => {
    const markup = serviceStep([...eight, ninth], eight);
    expect(text(markup)).toContain("le maximum pour un même rendez-vous en ligne");
    expect(markup).toContain(`id="${SELECTION_LIMIT_ID}"`);
    expect(markup.match(/aria-describedby="booking-selection-limit"/g)).toHaveLength(1);
    expect(text(markup)).toContain("8 / 8");
    expect(text(markup)).toContain("8 prestations · 4 h");
  });

  it("with nothing selected: no sticky summary, and the way to start", () => {
    const markup = serviceStep([coupe, couleur], []);
    expect(markup).not.toContain("data-sticky-cta");
    expect(text(markup)).toContain("Ajoutez une ou plusieurs prestations");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Choisir un horaire<\/button>/);
  });

  it("over 12 hours: « Choisir un horaire » is not offered, and says why", () => {
    const long = [
      { ...coupe, durationMinutes: 400 },
      { ...couleur, durationMinutes: 400 },
    ];
    const markup = serviceStep(long, long);
    expect(text(markup)).toContain("Votre sélection dépasse 12 h");
    expect(markup).not.toMatch(/<button(?![^>]*disabled)[^>]*>Choisir un horaire<\/button>/);
  });

  it("the single-service flow keeps « Choisir » and no selection summary", () => {
    const markup = renderToStaticMarkup(<ServiceStep services={[coupe, couleur]} professional={professional} onChoose={noop} />);
    expect(text(markup)).toContain("Choisissez une prestation");
    expect(markup).not.toContain("Votre sélection");
    expect(markup).not.toContain("Ajouter");
  });
});

describe("the times of a selection", () => {
  const base = {
    services: [couleur, coupe],
    selectionMode: true,
    window: { firstDate: "2026-11-16", lastDate: "2026-11-30" },
    date: "2026-11-17",
    timeZone: "Europe/Paris",
    professional,
    onChangeService: noop,
    onChooseDate: noop,
    onChooseSlot: noop,
    onRetry: noop,
    onBack: noop,
    onContinue: noop,
  };

  it("are read for the whole selection: its count and the server's combined length, and a way to edit it", () => {
    const page = text(renderToStaticMarkup(<SlotStep {...base} durationMinutes={135} slots={{ status: "ready", slots: [] }} />));
    expect(page).toContain("2 prestations · 2 h 15");
    expect(page).toContain("Modifier la sélection");
  });

  it("a selection longer than every opening: said once, with the way out — no date to search through", () => {
    const markup = renderToStaticMarkup(
      <SlotStep {...base} slots={{ status: "does_not_fit", durationMinutes: 450, longestIntervalMinutes: 240 }} />,
    );
    const page = text(markup);
    expect(page).toContain("Votre sélection est trop longue pour un seul rendez-vous.");
    expect(page).toContain("Elle dure 7 h 30, alors que chez Atelier Lumière, les plages d’ouverture durent au plus 4 h.");
    expect(page).toContain("Modifier ma sélection");
    expect(markup).not.toContain("Horaires du");
    expect(markup).not.toContain('role="listbox"');
  });

  it("names the professional with « chez », whatever her name — never a « de » + name to elide", () => {
    const view = { status: "does_not_fit", durationMinutes: 450, longestIntervalMinutes: 240 } as const;
    for (const name of ["Atelier Lumière", "Élodie Martin", "Institut Zen", "Le Salon d’Hélène", "studio m"]) {
      const page = text(renderToStaticMarkup(<SlotStep {...base} professional={{ name }} slots={view} />));
      expect(page).toContain(`alors que chez ${name}, les plages d’ouverture durent au plus 4 h.`);
      expect(page).not.toContain(`de ${name}`);
    }
    const anonymous = text(renderToStaticMarkup(<SlotStep {...base} professional={undefined} slots={view} />));
    expect(anonymous).toContain("Elle dure 7 h 30, alors que les plages d’ouverture durent au plus 4 h.");
  });

  it("a selection over 12 hours: said once", () => {
    const page = text(renderToStaticMarkup(<SlotStep {...base} slots={{ status: "too_long", durationMinutes: 800 }} />));
    expect(page).toContain("Votre sélection dépasse 12 h.");
    expect(page).toContain("Elle dure 13 h 20");
  });

  it("the summary beside the step lists each service with its price, the combined length and the total", () => {
    const page = text(
      renderToStaticMarkup(<AppointmentSummary services={[couleur, coupe]} durationMinutes={135} showPrices professional={professional} timeZone="Europe/Paris" />),
    );
    expect(page).toContain("Prestations (2)");
    expect(page).toContain("Durée totale 2 h 15");
    expect(page).toContain("Total indicatif 134,50 €");
  });
});

describe("the review of a selection", () => {
  const props = {
    services: [couleur, coupe, diagnostic],
    durationMinutes: 150,
    selectionMode: true,
    date: "2026-11-16",
    slot: { startsAt: "2026-11-16T13:00:00Z", endsAt: "2026-11-16T15:30:00Z", localTime: "14:00" },
    timeZone: "Europe/Paris",
    details: { firstName: "Marie", lastName: "Dupont", email: "marie@example.test", phone: "06 12 34 56 78" },
    professional,
    sending: false,
    retrying: false,
    locked: false,
    challenge: ready,
    onEdit: noop,
    onBack: noop,
    onConfirm: noop,
    onRetryChallenge: noop,
  };

  it("shows every service in order with its length and price, the combined length, the total or « à confirmer », and no payment", () => {
    const markup = renderToStaticMarkup(<ReviewStep {...props} />);
    const page = text(markup);
    expect(page).toContain("Vos prestations (3)");
    expect(page.indexOf("Couleur")).toBeLessThan(page.indexOf("Coupe"));
    expect(page.indexOf("Coupe")).toBeLessThan(page.indexOf("Diagnostic"));
    expect(page).toContain("Couleur 1 h 30 · 89,50 €");
    expect(page).toContain("Diagnostic 15 min · Tarif à confirmer");
    expect(page).toContain("Durée totale 2 h 30");
    expect(page).toContain("Total à confirmer");
    expect(page).toContain("Aucun paiement n’est demandé en ligne.");
    expect(page).toContain("14:00 – 16:30");
    expect(page).toContain("Atelier Lumière");
    expect(markup).toContain('aria-label="Modifier vos prestations"');
  });

  it("with every price known: the indicative total", () => {
    const page = text(renderToStaticMarkup(<ReviewStep {...props} services={[couleur, coupe]} durationMinutes={135} />));
    expect(page).toContain("Total indicatif 134,50 €");
  });
});

describe("the confirmation of a selection", () => {
  const booking: ConfirmedBooking = {
    kind: "selection",
    reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
    services: eight.map(({ id, name, durationMinutes }) => ({ id, name, durationMinutes })),
    durationMinutes: 240,
    startsAt: "2026-11-16T08:00:00Z",
    endsAt: "2026-11-16T12:00:00Z",
    localDate: "2026-11-16",
    localTime: "09:00",
    timeZone: "Europe/Paris",
  };

  it("shows ONE appointment with every booked service, the start, the combined length — and no payment", () => {
    const page = text(renderToStaticMarkup(<BookingConfirmation booking={booking} professional={professional} profileHref="/r/atelier" />));
    expect(page).toContain("Votre rendez-vous est réservé.");
    expect(page).toContain("vous attend le lundi 16 novembre à 09:00 pour vos 8 prestations, soit 4 h en tout");
    expect(page).toContain("Prestations (8)");
    for (const service of eight) expect(page).toContain(service.name);
    expect(page).toContain("Durée totale 4 h");
    expect(page).toContain("09:00 – 13:00");
    expect(page).toContain("Aucun paiement n’a été effectué en ligne.");
    expect(page).not.toContain("€");
  });
});

describe("the notice of a selection that changed", () => {
  it("says nothing was booked and lists what changed", () => {
    const page = text(
      renderToStaticMarkup(
        <FlowNoticeBox
          notice="SELECTION_CHANGED"
          professional={professional}
          changes={[
            { id: "svc-coupe", name: "Coupe", price: { from: 4500, to: 5000 } },
            { id: "tech-couleur", name: "Couleur", duration: { from: 90, to: 105 } },
          ]}
        />,
      ),
    );
    expect(page).toContain("Votre sélection a changé.");
    expect(page).toContain("Rien n’a été réservé.");
    expect(page).toContain("Coupe : tarif 45 € → 50 €");
    expect(page).toContain("Couleur : durée 1 h 30 → 1 h 45");
  });

  it("names a service that is no longer offered", () => {
    const page = text(renderToStaticMarkup(<FlowNoticeBox notice="SERVICE_GONE" professional={professional} services={["Couleur"]} />));
    expect(page).toContain("« Couleur » n’est plus proposée en ligne.");
    expect(page).toContain("retirée de votre sélection");
  });
});
