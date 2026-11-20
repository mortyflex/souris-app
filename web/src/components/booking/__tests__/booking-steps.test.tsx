import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ConfirmedBooking } from "@/features/booking/booking-answer";
import type { ChallengeState } from "@/features/booking/challenge";
import type { LocationView } from "@/features/location/location-view";

import { AppointmentSummary, BookingConfirmation, DetailsStep, ReviewStep, ServiceStep, SlotStep, type Professional } from "../booking-steps";

const DESTINATION = "12%20rue%20des%20Lilas%2C%2069001%20Lyon";
/** A published complete address, as the server hands it to the flow (a visitor on Android). */
const address: LocationView = {
  kind: "address",
  lines: ["12 rue des Lilas", "69001 Lyon"],
  spoken: "12 rue des Lilas, 69001 Lyon",
  directions: {
    primary: { provider: "google", providerName: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${DESTINATION}` },
  },
};
const cityOnly: LocationView = { kind: "city", city: "Lyon" };
const professional: Professional = { name: "Studio Esthétique", location: address, phone: "04 78 00 00 00" };
/** The same professional on a page that publishes a city, and on one that publishes no place. */
const inCity: Professional = { ...professional, location: cityOnly };
const withoutPlace: Professional = { name: professional.name, phone: professional.phone };
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
    expect(html).toContain("12 rue des Lilas");
    expect(html).toContain("69001 Lyon");
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

describe("the location through the booking flow — a booking never shows more than the page publishes", () => {
  const slot = { startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" };
  const summary = (who: Professional) =>
    renderToStaticMarkup(<AppointmentSummary services={[coupe]} professional={who} date="2026-11-16" slot={slot} timeZone="Europe/Paris" />);
  const review = (who: Professional) =>
    renderToStaticMarkup(
      <ReviewStep
        services={[coupe]}
        date="2026-11-16"
        slot={slot}
        timeZone="Europe/Paris"
        details={details}
        professional={who}
        sending={false}
        retrying={false}
        locked={false}
        challenge={ready}
        onEdit={noop}
        onBack={noop}
        onConfirm={noop}
        onRetryChallenge={noop}
      />,
    );
  const confirmation = (who: Professional, confirmed: ConfirmedBooking = booking) =>
    renderToStaticMarkup(<BookingConfirmation booking={confirmed} professional={who} profileHref="/r/studio" />);
  const multi: ConfirmedBooking = {
    ...booking,
    kind: "selection",
    services: [coupe, { id: "tech-couleur", name: "Couleur", durationMinutes: 90 }],
    durationMinutes: 135,
  };
  const steps = (who: Professional) => ({ summary: summary(who), review: review(who), confirmation: confirmation(who), multi: confirmation(who, multi) });
  const GOOGLE = `href="https://www.google.com/maps/dir/?api=1&amp;destination=${DESTINATION}"`;
  /** Anything that would be a place, a map or a way to one. */
  const PLACE = /Lilas|69001|Lyon|maps\.apple|google\.com\/maps|waze\.com|apple-mapkit|Itinéraire|data-location|data-directions|latitude|longitude/;

  describe("a complete published address", () => {
    const pages = steps(professional);

    it("the appointment summary: « Adresse », its two lines, « Itinéraire »", () => {
      const html = text(pages.summary);
      expect(html).toMatch(/Avec Studio Esthétique Adresse 12 rue des Lilas 69001 Lyon Itinéraire/);
      expect(pages.summary).toContain(GOOGLE);
      // An Android visitor: Google Maps directly — never Apple Plans, never a second link.
      expect(pages.summary).not.toMatch(/maps\.apple\.com|Apple Plans|Ouvrir dans|waze/i);
    });

    it("the review: the same address under « Adresse », with its directions — and nothing the customer could edit there", () => {
      expect(text(pages.review)).toMatch(/Avec Studio Esthétique Adresse 12 rue des Lilas 69001 Lyon Itinéraire Vos coordonnées/);
      expect(pages.review).toContain(GOOGLE);
      // Still three « Modifier »: the service, the time, her own details — never the professional's place.
      expect(pages.review.match(/>Modifier<\/button>/g)).toHaveLength(3);
    });

    it("the confirmation: « Lieu du rendez-vous », the address, the directions, the map — in ONE or several services alike", () => {
      for (const page of [pages.confirmation, pages.multi]) {
        expect(page).toMatch(/<section aria-labelledby="booking-location-heading" data-location="address"/);
        expect(text(page)).toMatch(/Lieu du rendez-vous 12 rue des Lilas 69001 Lyon Itinéraire/);
        expect(text(page)).not.toMatch(/Ouvrir dans|Waze/);
        expect(page).toContain(GOOGLE);
        expect(page).toContain("booking-place-lilac");
        expect(text(page)).not.toContain("Pour connaître le lieu");
        expect(text(page)).not.toContain("Pour l’adresse exacte");
      }
    });

    it("opens directions in a new tab everywhere: the flow — and a request in flight — is never left", () => {
      for (const page of Object.values(pages)) {
        const links = [...page.matchAll(/<a ([^>]*maps[^>]*)>/g)].map((match) => match[1] ?? "");
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) expect(link).toMatch(/target="_blank" rel="noopener noreferrer"/);
      }
    });
  });

  describe("a published city", () => {
    const pages = steps(inCity);

    it("every step says the city under « Lieu » — never a street, a postal code, a destination or a link", () => {
      for (const page of Object.values(pages)) {
        expect(text(page)).toContain("Lyon");
        expect(page).not.toMatch(/Lilas|69001|maps\.apple|google\.com\/maps|waze\.com|Itinéraire|data-directions|Adresse /);
      }
      expect(text(pages.summary)).toMatch(/Avec Studio Esthétique Lieu Lyon/);
      expect(text(pages.review)).toMatch(/Avec Studio Esthétique Lieu Lyon Vos coordonnées/);
    });

    it("the confirmation says whom to ask for the exact address", () => {
      for (const page of [pages.confirmation, pages.multi]) {
        expect(page).toContain('data-location="city"');
        expect(text(page)).toContain("Pour l’adresse exacte, contactez Studio Esthétique.");
        expect(text(page)).not.toContain("Pour connaître le lieu");
      }
    });
  });

  describe("no published location — hidden, or never chosen", () => {
    const pages = steps(withoutPlace);

    it("no step shows a place, a map, a marker or a way to one", () => {
      for (const page of Object.values(pages)) expect(page).not.toMatch(PLACE);
      expect(text(pages.summary)).not.toMatch(/Adresse|Lieu/);
      expect(text(pages.review)).toMatch(/Avec Studio Esthétique Vos coordonnées/);
    });

    it("the confirmation points to the professional — never to a location", () => {
      for (const page of [pages.confirmation, pages.multi]) {
        expect(text(page)).toContain("Pour connaître le lieu du rendez-vous, contactez Studio Esthétique.");
        expect(page).not.toContain("booking-location-heading");
        expect(page).not.toMatch(PLACE);
      }
    });

    it("everything else of the booking is unchanged", () => {
      expect(text(pages.confirmation)).toContain("4b0a1d0e-3c1f-4f7a-9d39-2a8f4f1c6e21");
      expect(text(pages.confirmation)).toContain("14:00 – 14:45");
      expect(text(pages.multi)).toContain("Durée totale");
      expect(text(pages.review)).toContain("Confirmer le rendez-vous");
    });
  });
});

describe("the date step on a phone or a tablet says WHERE (Step 196) — the line the desktop summary holds", () => {
  const slot = { startsAt: booking.startsAt, endsAt: booking.endsAt, localTime: "14:00" };
  const dateStep = (who: Professional) =>
    renderToStaticMarkup(
      <SlotStep
        services={[coupe]}
        window={{ firstDate: "2026-11-16", lastDate: "2026-11-18" }}
        date="2026-11-16"
        slots={{ status: "ready", slots: [slot] }}
        timeZone="Europe/Paris"
        professional={who}
        onChangeService={noop}
        onChooseDate={noop}
        onChooseSlot={noop}
        onRetry={noop}
        onBack={noop}
        onContinue={noop}
      />,
    );
  /** The phone's line: a <dl> under the heading, hidden from the desktop breakpoint up. */
  const phoneLine = (markup: string) => /<dl data-location-summary="(\w+)" class="([^"]*)">([\s\S]*?)<\/dl>/.exec(markup);
  /** The desktop summary beside the step, hidden below that breakpoint. */
  const desktopSummary = (markup: string) => markup.slice(markup.indexOf('<aside aria-labelledby="booking-summary-title"'));

  it("a complete address: « Adresse », its two lines and « Itinéraire » — under the heading, before the dates", () => {
    const markup = dateStep(professional);
    const line = phoneLine(markup)!;
    expect(line[1]).toBe("address");
    expect(line[2].split(" ")).toContain("lg:hidden");
    expect(text(line[3])).toMatch(/Adresse 12 rue des Lilas 69001 Lyon Itinéraire/);
    expect(line[3]).toContain(`href="https://www.google.com/maps/dir/?api=1&amp;destination=${DESTINATION}"`);
    expect(line[3]).toMatch(/<a [^>]*maps[^>]*target="_blank" rel="noopener noreferrer"/);
    const heading = markup.indexOf("Choisissez une date et un horaire");
    expect(heading).toBeLessThan(markup.indexOf("data-location-summary"));
    expect(markup.indexOf("data-location-summary")).toBeLessThan(markup.indexOf("Horaires du"));
  });

  it("the same words as the desktop summary — each shown on its own screens only, so never twice", () => {
    const markup = dateStep(professional);
    const summary = desktopSummary(markup);
    expect(summary).toMatch(/^<aside [^>]*class="[^"]*hidden lg:flex/);
    const said = (html: string) => text(html).match(/Adresse 12 rue des Lilas 69001 Lyon Itinéraire/)?.[0];
    expect(said(phoneLine(markup)![3])).toBe(said(summary));
  });

  it("a city: « Lieu » and the city alone — no street, no postal code, no link, no directions", () => {
    const line = phoneLine(dateStep(inCity))!;
    expect(line[1]).toBe("city");
    expect(text(line[3]).trim()).toBe("Lieu Lyon");
    expect(line[3]).not.toMatch(/Lilas|69001|maps\.apple|google\.com\/maps|<a |Itinéraire|data-directions/);
  });

  it("no published location: no line at all, nothing that would be a place", () => {
    const markup = dateStep(withoutPlace);
    expect(phoneLine(markup)).toBeNull();
    expect(markup).not.toMatch(/data-location-summary|Lilas|69001|maps\.apple|google\.com\/maps|Itinéraire|data-directions/);
  });

  it("the date step keeps everything else: the dates, the times, « Continuer »", () => {
    const html = text(dateStep(professional));
    expect(html).toContain("Horaires du");
    expect(html).toContain("Continuer");
  });
});

describe("the details step on a phone or a tablet says WHERE too (Step 197) — the line the desktop summary holds beside it", () => {
  const empty = { firstName: "", lastName: "", email: "", phone: "" };
  const detailsStep = (who: Professional, values = empty) =>
    renderToStaticMarkup(<DetailsStep details={values} issues={{}} professional={who} onEdit={noop} onBack={noop} onContinue={noop} />);
  const line = (markup: string) => /<dl data-location-summary="(\w+)" class="([^"]*)">([\s\S]*?)<\/dl>/.exec(markup);

  it("a complete address: the same compact line as the date step — under the heading, before the form, phone and tablet only", () => {
    const markup = detailsStep(professional);
    const found = line(markup)!;
    expect(found[1]).toBe("address");
    expect(found[2].split(" ")).toContain("lg:hidden");
    expect(text(found[3])).toMatch(/Adresse 12 rue des Lilas 69001 Lyon Itinéraire/);
    expect(found[3]).toContain(`href="https://www.google.com/maps/dir/?api=1&amp;destination=${DESTINATION}"`);
    expect(markup.indexOf("Vos coordonnées")).toBeLessThan(markup.indexOf("data-location-summary"));
    expect(markup.indexOf("data-location-summary")).toBeLessThan(markup.indexOf("<form"));
    // Compact: no map, no artwork, ONE line.
    expect(markup.match(/data-location-summary/g)).toHaveLength(1);
    expect(markup).not.toMatch(/data-location-map|apple-mapkit|nacre/i);
  });

  it("a city: « Lieu » and the city alone — no street, no postal code, no link", () => {
    const found = line(detailsStep(inCity))!;
    expect(found[1]).toBe("city");
    expect(text(found[3]).trim()).toBe("Lieu Lyon");
    expect(found[3]).not.toMatch(/Lilas|69001|<a |Itinéraire|data-directions/);
  });

  it("no published location: nothing that would be a place", () => {
    const markup = detailsStep(withoutPlace);
    expect(line(markup)).toBeNull();
    expect(markup).not.toMatch(/data-location-summary|Lilas|69001|maps\.apple|google\.com\/maps|Itinéraire/);
  });

  it("the form keeps what she typed and every field: the line is presentation only", () => {
    const markup = detailsStep(professional, { firstName: "Marie", lastName: "Dupont", email: "marie@example.test", phone: "06 12 34 56 78" });
    for (const value of ["Marie", "Dupont", "marie@example.test", "06 12 34 56 78"]) expect(markup).toContain(`value="${value}"`);
    expect(markup.match(/<input /g)).toHaveLength(4);
  });
});
