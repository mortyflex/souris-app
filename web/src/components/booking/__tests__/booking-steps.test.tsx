import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { ChallengeState } from "@/features/booking/challenge";

import { BookingConfirmation, ReviewStep, SlotStep, type Professional } from "../booking-steps";

const professional: Professional = { name: "Studio Esthétique", address: "12 rue des Lilas, Lyon", phone: "04 78 00 00 00" };
const coupe = { id: "svc-coupe", name: "Coupe", durationMinutes: 45 };
const booking: ConfirmedBooking = {
  reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
  service: coupe,
  startsAt: "2026-11-16T13:00:00Z",
  endsAt: "2026-11-16T13:45:00Z",
  localDate: "2026-11-16",
  localTime: "14:00",
  timeZone: "Europe/Paris",
};
const details = { firstName: "Marie", lastName: "Dupont", email: "marie@example.test", phone: "06 12 34 56 78" };
const noop = () => undefined;
const ready: ChallengeState = { status: "ready", token: "0.turnstile-token" };
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("BookingConfirmation", () => {
  it("shows the server-confirmed reference, service, date, start and end, and the professional", () => {
    const html = text(renderToStaticMarkup(<BookingConfirmation booking={booking} professional={professional} profileHref="/r/studio" />));
    expect(html).toContain("4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21");
    expect(html).toContain("Coupe");
    expect(html).toContain("Lundi 16 novembre");
    expect(html).toContain("14:00 – 14:45");
    expect(html).toContain("à l’heure de Paris");
    expect(html).toContain("Studio Esthétique");
    expect(html).toContain("12 rue des Lilas, Lyon");
  });

  it("follows the professional's time zone, not the reader's", () => {
    const html = text(
      renderToStaticMarkup(
        <BookingConfirmation
          booking={{ ...booking, timeZone: "America/Martinique", localTime: "09:00" }}
          professional={professional}
          profileHref="/r/studio"
        />,
      ),
    );
    expect(html).toContain("09:00 – 09:45");
    expect(html).toContain("à l’heure locale (America/Martinique)");
  });

  it("never claims an email was sent", () => {
    const html = text(renderToStaticMarkup(<BookingConfirmation booking={booking} professional={professional} profileHref="/r/studio" />));
    expect(html).toContain("Aucun e-mail de confirmation n’est envoyé");
    expect(html).not.toMatch(/e-mail (vous )?a été envoyé|vous recevrez un e-mail/i);
  });
});

describe("ReviewStep", () => {
  const review = (overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}) =>
    text(
      renderToStaticMarkup(
        <ReviewStep
          service={coupe}
          date="2026-11-16"
          slot={{ startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" }}
          timeZone="Europe/Paris"
          details={details}
          professional={professional}
          sending={false}
          retrying={false}
          locked={false}
          challenge={ready}
          onEdit={noop}
          onBack={noop}
          onConfirm={noop}
          onRetryChallenge={noop}
          {...overrides}
        />,
      ),
    );
  const reviewMarkup = (overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}) =>
    renderToStaticMarkup(
      <ReviewStep
        service={coupe}
        date="2026-11-16"
        slot={{ startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" }}
        timeZone="Europe/Paris"
        details={details}
        professional={professional}
        sending={false}
        retrying={false}
        locked={false}
        challenge={ready}
        onEdit={noop}
        onBack={noop}
        onConfirm={noop}
        onRetryChallenge={noop}
        {...overrides}
      />,
    );

  it("summarizes the request with what can be changed", () => {
    const html = review();
    expect(html).toContain("Lundi 16 novembre 14:00 – 14:45");
    expect(html).toContain("Marie Dupont");
    expect(html).toContain("Confirmer le rendez-vous");
    expect(html.match(/Modifier/g)).toHaveLength(3);
    expect(html).not.toMatch(/€|prix|tarif/i);
  });

  it("after an unknown outcome: only a retry, nothing to change", () => {
    const html = review({ locked: true, retrying: true, notice: "UNCERTAIN" });
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Modifier");
    expect(html).toContain("Il a peut-être été enregistré");
  });

  it("while sending: one disabled button", () => {
    const markup = reviewMarkup({ sending: true, locked: true, challenge: { status: "checking" } });
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-busy="true"[^>]*>Réservation en cours…<\/button>/);
    // The next check is already running, silently: no second message while the request is in flight.
    expect(text(markup)).not.toContain("Vérification de sécurité");
  });
});

describe("ReviewStep — the security check (Cloudflare Turnstile)", () => {
  const reviewMarkup = (overrides: Partial<Parameters<typeof ReviewStep>[0]> = {}) =>
    renderToStaticMarkup(
      <ReviewStep
        service={coupe}
        date="2026-11-16"
        slot={{ startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" }}
        timeZone="Europe/Paris"
        details={details}
        professional={professional}
        sending={false}
        retrying={false}
        locked={false}
        challenge={ready}
        onEdit={noop}
        onBack={noop}
        onConfirm={noop}
        onRetryChallenge={noop}
        {...overrides}
      />,
    );
  const confirmButton = (markup: string) => /<button[^>]*>(Confirmer le rendez-vous|Réessayer)<\/button>/.exec(markup)?.[0] ?? "";

  it("renders the widget's place just before the confirmation", () => {
    const markup = reviewMarkup({ challengeSlot: <div data-testid="challenge-slot" /> });
    expect(markup.indexOf('data-testid="challenge-slot"')).toBeGreaterThan(markup.indexOf("Vos coordonnées lui sont transmises"));
    expect(markup.indexOf('data-testid="challenge-slot"')).toBeLessThan(markup.indexOf("Confirmer le rendez-vous"));
  });

  it("while checking: the button waits, and says why", () => {
    const markup = reviewMarkup({ challenge: { status: "checking" } });
    expect(confirmButton(markup)).toMatch(/disabled=""/);
    expect(confirmButton(markup)).toContain('aria-describedby="booking-challenge-status"');
    expect(markup).toMatch(/<p id="booking-challenge-status" role="status"[^>]*>Vérification de sécurité en cours…<\/p>/);
  });

  it("when Cloudflare asks for an interaction: the customer is told what to do", () => {
    const markup = reviewMarkup({ challenge: { status: "interactive" } });
    expect(confirmButton(markup)).toMatch(/disabled=""/);
    expect(text(markup)).toContain("Pour confirmer, complétez la vérification de sécurité ci-dessus.");
  });

  it("with a fresh token: the button is enabled, the success only announced", () => {
    const markup = reviewMarkup();
    expect(confirmButton(markup)).not.toMatch(/disabled=""/);
    expect(confirmButton(markup)).not.toContain("aria-describedby");
    expect(markup).toMatch(/<p id="booking-challenge-status" role="status" class="[^"]*sr-only[^"]*">Vérification de sécurité terminée\.<\/p>/);
  });

  it("when the check cannot run: an alert, a way to try again and the professional's contact — never a way around it", () => {
    const markup = reviewMarkup({ challenge: { status: "error" } });
    expect(confirmButton(markup)).toMatch(/disabled=""/);
    expect(markup).toMatch(/<div id="booking-challenge-status" role="alert"/);
    const html = text(markup);
    expect(html).toContain("La vérification de sécurité n’a pas pu aboutir.");
    expect(html).toContain("Votre rendez-vous n’est pas encore réservé.");
    expect(html).toContain("Relancer la vérification");
    expect(html).toContain("04 78 00 00 00");
  });

  it("after an unknown outcome, the retry also waits for a new token", () => {
    const markup = reviewMarkup({ locked: true, retrying: true, notice: "UNCERTAIN", challenge: { status: "checking" } });
    expect(confirmButton(markup)).toMatch(/disabled=""[^>]*>Réessayer/);
    expect(text(markup)).toContain("Il a peut-être été enregistré");
  });

  it("a refused token says a new check is running and nothing is booked yet", () => {
    const html = text(reviewMarkup({ retrying: true, notice: "CHALLENGE_FAILED", challenge: { status: "checking" } }));
    expect(html).toContain("La vérification de sécurité a expiré.");
    expect(html).toContain("Votre rendez-vous n’est pas encore réservé.");
  });
});

describe("SlotStep", () => {
  it("labels every time with its start and end in the professional's zone", () => {
    const html = renderToStaticMarkup(
      <SlotStep
        service={coupe}
        window={{ firstDate: "2026-11-16", lastDate: "2026-11-18" }}
        date="2026-11-16"
        slots={{ status: "ready", slots: [{ startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" }] }}
        timeZone="Europe/Paris"
        onChangeService={noop}
        onChooseDate={noop}
        onChooseSlot={noop}
        onRetry={noop}
        onBack={noop}
        onContinue={noop}
      />,
    );
    expect(html).toContain('aria-label="De 14:00 à 14:45"');
    expect(html).toContain('aria-pressed="true"'); // the chosen date
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continuer<\/button>/); // no time chosen yet
  });

  it("an empty day offers the next one; a failed read offers a retry, never an empty day", () => {
    const base = {
      service: coupe,
      window: { firstDate: "2026-11-16", lastDate: "2026-11-18" },
      date: "2026-11-16",
      timeZone: "Europe/Paris",
      onChangeService: noop,
      onChooseDate: noop,
      onChooseSlot: noop,
      onRetry: noop,
      onBack: noop,
      onContinue: noop,
    };
    expect(text(renderToStaticMarkup(<SlotStep {...base} slots={{ status: "ready", slots: [] }} />))).toContain("Voir le mardi 17 novembre");
    const failed = text(renderToStaticMarkup(<SlotStep {...base} slots={{ status: "error" }} />));
    expect(failed).toContain("Les horaires n’ont pas pu être chargés.");
    expect(failed).not.toContain("Aucun horaire disponible");
  });
});
