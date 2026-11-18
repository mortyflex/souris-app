import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { ChallengeState } from "@/features/booking/challenge";

import { BookingConfirmation, ReviewStep, ServiceStep, SlotStep, type Professional } from "../booking-steps";

const professional: Professional = { name: "Studio Esthétique", address: "12 rue des Lilas, Lyon", phone: "04 78 00 00 00" };
const coupe = { id: "svc-coupe", name: "Coupe", durationMinutes: 45 };
const booking: ConfirmedBooking = {
  kind: "single",
  reference: "4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21",
  services: [coupe],
  durationMinutes: 45,
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
          services={[coupe]}
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
        services={[coupe]}
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
        services={[coupe]}
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
        services={[coupe]}
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
      services: [coupe],
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

describe("SlotStep — the approved date and time design", () => {
  const base = {
    services: [coupe],
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
  const at = (localTime: string, startsAt: string, endsAt: string) => ({ localTime, startsAt, endsAt });
  const ready = {
    status: "ready" as const,
    slots: [at("09:15", "2026-11-17T08:15:00Z", "2026-11-17T09:00:00Z"), at("14:30", "2026-11-17T13:30:00Z", "2026-11-17T14:15:00Z"), at("18:00", "2026-11-17T17:00:00Z", "2026-11-17T17:45:00Z")],
  };

  it("groups the server's times by part of the day", () => {
    const html = text(renderToStaticMarkup(<SlotStep {...base} slots={ready} />));
    expect(html).toMatch(/Matin 1 horaire .*Après-midi 1 horaire .*Soir 1 horaire/);
  });

  it("draws two-line date chips with ONE Tab stop — the chosen date — and arrows kept out of the Tab order", () => {
    const markup = renderToStaticMarkup(<SlotStep {...base} slots={ready} />);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/id="booking-date-2026-11-17"[^>]*aria-pressed="true"[^>]*aria-label="Mardi 17 novembre"[^>]*tabindex="0"/);
    expect(markup).toMatch(/aria-label="Dates précédentes"[^>]*aria-controls="booking-date-strip"[^>]*tabindex="-1"|tabindex="-1"[^>]*aria-label="Dates précédentes"/);
    expect(text(markup)).toContain("mar. 17");
  });

  it("sizes the loading grid from the last day seen, and says it is loading", () => {
    const markup = renderToStaticMarkup(<SlotStep {...base} slots={{ status: "loading" }} loadingCount={20} />);
    expect(markup).toContain('aria-busy="true"');
    expect(text(markup)).toContain("Chargement des horaires…");
    // 20 times + one title placeholder per group (2).
    expect(markup.match(/class="skeleton /g)).toHaveLength(22);
  });

  it("keeps the selection and « Continuer » within reach: a summary beside the step, a sticky bar on a phone — never a price", () => {
    const markup = renderToStaticMarkup(<SlotStep {...base} slots={ready} slot={ready.slots[1]} />);
    const html = text(markup);
    expect(html).toContain("Votre rendez-vous");
    expect(html).toContain("Studio Esthétique");
    expect(html).toContain("14:30 – 15:15");
    expect(markup).toContain("data-sticky-cta");
    expect(html).toContain("Mar. 17 nov. · 14:30");
    expect(html).not.toMatch(/€|prix|tarif/i);
  });
});

describe("ReviewStep — while a request is in flight", () => {
  const props = {
    services: [coupe],
    date: "2026-11-16",
    slot: { startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" },
    timeZone: "Europe/Paris",
    details,
    professional,
    retrying: false,
    challenge: ready,
    onEdit: noop,
    onBack: noop,
    onConfirm: noop,
    onRetryChallenge: noop,
  };

  it("keeps « Modifier » in place, disabled — nothing moves, nothing can be changed", () => {
    const markup = renderToStaticMarkup(<ReviewStep {...props} sending locked challenge={{ status: "checking" }} />);
    expect(markup.match(/<button[^>]*disabled=""[^>]*>Modifier<\/button>/g)).toHaveLength(3);
  });

  it("turns a small ring before the label by CSS only (the accessible name never changes)", () => {
    const markup = renderToStaticMarkup(<ReviewStep {...props} sending locked challenge={{ status: "checking" }} />);
    expect(markup).toMatch(/<button[^>]*class="[^"]*busy-glyph[^"]*"[^>]*aria-busy="true"[^>]*>Réservation en cours…<\/button>/);
  });

  it("says a long request is still on its way — only when it is long", () => {
    const slow = text(renderToStaticMarkup(<ReviewStep {...props} sending locked slow challenge={{ status: "checking" }} />));
    expect(slow).toContain("Ne fermez pas cette page");
    expect(text(renderToStaticMarkup(<ReviewStep {...props} sending locked challenge={{ status: "checking" }} />))).not.toContain("Ne fermez pas");
    expect(text(renderToStaticMarkup(<ReviewStep {...props} sending={false} locked={false} slow />))).not.toContain("Ne fermez pas");
  });

  it("reserves the status line in every state: the confirmation button never jumps", () => {
    for (const challenge of [ready, { status: "checking" } as ChallengeState, { status: "interactive" } as ChallengeState]) {
      const markup = renderToStaticMarkup(<ReviewStep {...props} sending={false} locked={false} challenge={challenge} />);
      expect(markup).toContain('class="flex min-h-6 items-center gap-2');
    }
  });
});

describe("ServiceStep — the list read again", () => {
  const services = [coupe];
  it("says it is updating, without hiding the list", () => {
    const html = text(renderToStaticMarkup(<ServiceStep services={services} loading professional={professional} onChoose={noop} />));
    expect(html).toContain("Mise à jour des prestations…");
    expect(html).toContain("Coupe");
  });

  it("never fails silently: a notice and a way to read it again", () => {
    const html = text(renderToStaticMarkup(<ServiceStep services={services} issue="error" onRetry={noop} professional={professional} onChoose={noop} />));
    expect(html).toContain("La liste des prestations n’a pas pu être mise à jour.");
    expect(html).toContain("Réessayer");
  });
});
