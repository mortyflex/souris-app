"use client";

import { useEffect, useReducer, useRef, useState, type RefObject } from "react";

import { formatLongDate, type AvailableSlot, type BookableService } from "@/features/availability/availability";
import { createAvailabilityReader, newIdempotencyKey, submitBooking } from "@/features/booking/booking-client";
import {
  canShowStep,
  flowReducer,
  initialFlowState,
  isAttemptLocked,
  JOURNEY,
  planSend,
  type FlowAction,
  type FlowStep,
} from "@/features/booking/booking-flow";
import type { CustomerField } from "@/features/booking/booking-request";
import { CHECKING, type ChallengeState } from "@/features/booking/challenge";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

import {
  AppointmentSummary,
  BookingConfirmation,
  DetailsStep,
  FlowNoticeBox,
  ReviewStep,
  ServiceStep,
  SlotStep,
  type Professional,
  type SlotsView,
} from "./booking-steps";
import { TurnstileWidget } from "./turnstile-widget";

export interface BookingFlowProps {
  readonly slug: string;
  readonly professional: Professional;
  readonly profileHref: string;
  /** The Cloudflare Turnstile site key the server configured (public by nature). */
  readonly challengeSiteKey: string;
  /** What the server read for this page: the bookable services and the bookable window. */
  readonly initial: {
    readonly services: readonly BookableService[];
    readonly firstDate: string;
    readonly lastDate: string;
    readonly timeZone: string;
  };
}

/** The steps without a summary beside them keep a comfortable reading width. */
const NARROW = "w-full max-w-3xl";

const STEP_LABELS: Readonly<Record<Exclude<FlowStep, "done">, string>> = {
  service: "Prestation",
  slot: "Date et horaire",
  details: "Coordonnées",
  review: "Confirmation",
};

const PREVIOUS: Readonly<Partial<Record<FlowStep, FlowStep>>> = { slot: "service", details: "slot", review: "details" };

/** Notices shown above a step (the review shows its own, next to the button). */
const STEP_NOTICES = new Set(["SLOT_TAKEN", "SERVICE_GONE", "REQUEST_REFUSED", "CLOSED", "CLOSED_UNCERTAIN", "KEY_REUSED"]);

interface Catalog {
  readonly services: readonly BookableService[];
  readonly firstDate: string;
  readonly lastDate: string;
  readonly timeZone: string;
  /** The `servicesRevision` this list answers. */
  readonly revision: number;
}

function Progress({ current }: { current: Exclude<FlowStep, "done"> }) {
  const index = JOURNEY.indexOf(current);
  return (
    <nav aria-label="Étapes de la réservation" className="flex flex-col gap-2">
      <ol className="flex gap-2">
        {JOURNEY.map((step, position) => (
          <li key={step} aria-current={step === current ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-2">
            <span aria-hidden="true" className={cn("h-1.5 rounded-full", position <= index ? "bg-accent" : "bg-lavender-100")} />
            <span
              className={cn(
                "type-meta sr-only sm:not-sr-only",
                step === current ? "text-lavender-700" : position < index ? "text-foreground/75" : "text-foreground/55",
              )}
            >
              {position + 1}. {STEP_LABELS[step]}
            </span>
          </li>
        ))}
      </ol>
      <p aria-hidden="true" className="type-meta text-lavender-700 sm:hidden">
        Étape {index + 1} sur {JOURNEY.length} · {STEP_LABELS[current]}
      </p>
    </nav>
  );
}

function focusWithoutJump(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}

/**
 * The public booking flow of ONE professional: service → date and time →
 * details → review → confirmation. All rules are in
 * `src/features/booking/booking-flow.ts`; this component wires them to the
 * network (the website's own endpoints only), the browser history (Back
 * returns to the previous step) and the focus (each step's heading).
 */
export function BookingFlow({ slug, professional, profileHref, challengeSiteKey, initial }: BookingFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, undefined, () => initialFlowState());
  const [catalog, setCatalog] = useState<Catalog>({ ...initial, revision: 0 });
  const [slotResult, setSlotResult] = useState<{ key: string; view: SlotsView }>();
  const [slotRetry, setSlotRetry] = useState(0);
  const [popCount, setPopCount] = useState(0);
  /** The security check of the review step, and a counter that asks it for a new token. */
  const [challenge, setChallenge] = useState<ChallengeState>(CHECKING);
  const [challengeReset, setChallengeReset] = useState(0);
  /** The number of times of the last day seen, per service: the loading grid is drawn at that size. */
  const [lastCounts, setLastCounts] = useState<Readonly<Record<string, number>>>({});
  /** The list of services could not be read again (it may be out of date), and the retry of that read. */
  const [catalogIssue, setCatalogIssue] = useState<"error" | "limited">();
  const [catalogRetry, setCatalogRetry] = useState(0);
  /** Each send is numbered; a send still in flight after a while says so (`slowSend` = its number). */
  const [sendSerial, setSendSerial] = useState(0);
  const [slowSend, setSlowSend] = useState(-1);

  const topRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fieldRefs: Record<CustomerField, RefObject<HTMLInputElement | null>> = {
    firstName: useRef<HTMLInputElement>(null),
    lastName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
  };
  const slotsReaderRef = useRef<ReturnType<typeof createAvailabilityReader>>(null);
  const catalogReaderRef = useRef<ReturnType<typeof createAvailabilityReader>>(null);
  const sendingRef = useRef(false);
  const historyModeRef = useRef<"push" | "replace">("replace");
  const poppedRef = useRef(false);
  const focusIssuesRef = useRef(false);
  const firstStepRenderRef = useRef(true);

  const { step, date, slot } = state;
  const serviceId = state.service?.id;
  // The latest name and duration the server gave for the chosen service, else the one chosen.
  const service = catalog.services.find((candidate) => candidate.id === serviceId) ?? state.service;
  const slotKey = serviceId !== undefined && date !== undefined ? `${serviceId}|${date}|${state.slotsRevision}|${slotRetry}` : undefined;
  const onSlotStep = step === "slot";
  const slots: SlotsView = slotResult !== undefined && slotResult.key === slotKey ? slotResult.view : { status: "loading" };
  const locked = isAttemptLocked(state);

  /** A step change the customer asked for: a new history entry, so Back returns here. */
  const navigate = (action: FlowAction) => {
    historyModeRef.current = "push";
    dispatch(action);
  };
  const back = () => {
    const previous = PREVIOUS[step];
    if (previous === undefined) return;
    historyModeRef.current = "replace";
    dispatch({ type: "GO_TO", step: previous });
  };

  // ---- Browser history: one entry per step; Back / Forward move between steps.
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, bookingStep: "service" }, "");
    const onPopState = (event: PopStateEvent) => {
      const target = (event.state as { bookingStep?: FlowStep } | null)?.bookingStep;
      // Not a step of this flow (Back from the first step): the router leaves the page — touch nothing.
      if (target === undefined) return;
      poppedRef.current = true;
      dispatch({ type: "GO_TO", step: target });
      setPopCount((count) => count + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const popped = poppedRef.current;
    poppedRef.current = false;
    const mode = historyModeRef.current;
    historyModeRef.current = "replace";
    const entryStep = (window.history.state as { bookingStep?: FlowStep } | null)?.bookingStep;
    if (entryStep === step) return;
    if (popped && step === "done") {
      // Back from the confirmation leaves the flow: it is never sent again from here.
      window.location.assign(profileHref);
      return;
    }
    if (popped) {
      // The step Back pointed to is not reachable (a request is frozen, or a choice was cleared): stay.
      window.history.pushState({ bookingStep: step }, "");
      return;
    }
    if (mode === "push") window.history.pushState({ bookingStep: step }, "");
    else window.history.replaceState({ ...window.history.state, bookingStep: step }, "");
  }, [step, popCount, profileHref]);

  // ---- Focus: each new step starts at its heading (or at the field the server refused).
  useEffect(() => {
    if (firstStepRenderRef.current) {
      firstStepRenderRef.current = false;
      return;
    }
    topRef.current?.scrollIntoView({ block: "start" });
    const refused = step === "details" && state.refusedField !== undefined ? fieldRefs[state.refusedField].current : null;
    focusWithoutJump(refused ?? headingRef.current);
    // Only a step change moves the focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!focusIssuesRef.current) return;
    focusIssuesRef.current = false;
    const first = (["firstName", "lastName", "email", "phone"] as const).find((field) => state.issues[field] !== undefined);
    if (first !== undefined) fieldRefs[first].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.issues]);

  // ---- The times of the chosen service and date — read again whenever the key changes.
  useEffect(() => {
    if (!onSlotStep || slotKey === undefined || serviceId === undefined || date === undefined) return;
    slotsReaderRef.current ??= createAvailabilityReader(slug);
    let active = true;
    void slotsReaderRef.current.read({ serviceId, date }).then((result) => {
      if (!active || result.status === "STALE") return;
      if (result.status === "OK") {
        const availability = result.availability;
        setCatalog((previous) => ({
          ...previous,
          services: availability.services,
          firstDate: availability.firstDate,
          lastDate: availability.lastDate,
          timeZone: availability.timeZone,
        }));
        if (availability.status === "UNKNOWN_SERVICE") {
          dispatch({ type: "SERVICE_UNAVAILABLE" });
          return;
        }
        if (availability.status === "SLOTS" && availability.slots.length > 0) {
          const count = availability.slots.length;
          setLastCounts((previous) => ({ ...previous, [serviceId]: count }));
        }
        setSlotResult({
          key: slotKey,
          view:
            availability.status === "OUT_OF_WINDOW"
              ? { status: "out_of_window" }
              : availability.status === "SLOTS"
                ? { status: "ready", slots: availability.slots }
                : { status: "error" },
        });
        return;
      }
      if (result.status === "UNAVAILABLE") {
        dispatch({ type: "CLOSED" });
        setSlotResult({ key: slotKey, view: { status: "ready", slots: [] } });
        return;
      }
      setSlotResult({ key: slotKey, view: { status: result.status === "RATE_LIMITED" ? "limited" : "error" } });
    });
    return () => {
      active = false;
    };
  }, [slug, onSlotStep, slotKey, serviceId, date]);

  // ---- The list of services, read again after the server said one is gone.
  useEffect(() => {
    const revision = state.servicesRevision;
    if (revision === 0) return;
    catalogReaderRef.current ??= createAvailabilityReader(slug);
    let active = true;
    void catalogReaderRef.current.read({}).then((result) => {
      if (!active || result.status === "STALE") return;
      if (result.status === "OK") {
        const availability = result.availability;
        setCatalog({
          services: availability.services,
          firstDate: availability.firstDate,
          lastDate: availability.lastDate,
          timeZone: availability.timeZone,
          revision,
        });
        setCatalogIssue(undefined);
        return;
      }
      if (result.status === "UNAVAILABLE") dispatch({ type: "CLOSED" });
      // The list may be out of date: say so, and offer to read it again (never silently).
      if (result.status === "ERROR" || result.status === "RATE_LIMITED") setCatalogIssue(result.status === "RATE_LIMITED" ? "limited" : "error");
      setCatalog((previous) => ({ ...previous, revision }));
    });
    return () => {
      active = false;
    };
  }, [slug, state.servicesRevision, catalogRetry]);

  // ---- A send still in flight after 8 s says it is on its way (the request itself is never repeated).
  const sending = state.attempt?.sending === true;
  useEffect(() => {
    if (!sending) return;
    const serial = sendSerial;
    const timer = setTimeout(() => setSlowSend(serial), 8000);
    return () => clearTimeout(timer);
  }, [sending, sendSerial]);

  // ---- Leaving while a request is in flight, or frozen after an unknown outcome, would lose it: ask first.
  useEffect(() => {
    if (!locked) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [locked]);

  useEffect(
    () => () => {
      slotsReaderRef.current?.cancel();
      catalogReaderRef.current?.cancel();
    },
    [],
  );

  // ---- Confirm: ONE request in flight at most; a pending attempt is re-sent unchanged,
  // with a NEW security token (a token is single-use and is not part of the request).
  const confirm = async () => {
    if (sendingRef.current) return;
    if (challenge.status !== "ready") return;
    const plan = planSend(state, newIdempotencyKey);
    if (plan === undefined) return;
    const challengeToken = challenge.token;
    sendingRef.current = true;
    setSendSerial((serial) => serial + 1);
    // This send spends the token, whatever its outcome: ask for the next one now.
    setChallenge(CHECKING);
    setChallengeReset((count) => count + 1);
    dispatch({ type: "SENDING", attempt: plan.attempt });
    try {
      const response = await submitBooking(slug, plan.attempt.request, plan.attempt.key, challengeToken);
      historyModeRef.current = "replace";
      dispatch({ type: "ANSWER", response });
    } finally {
      sendingRef.current = false;
    }
  };

  const catalogLoading = catalog.revision !== state.servicesRevision;
  const stepNotice = state.notice !== undefined && STEP_NOTICES.has(state.notice) && step !== "review" ? state.notice : undefined;
  const day = date === undefined ? "" : ` le ${formatLongDate(date)}`;
  const announcement =
    step === "slot" && slots.status === "loading" && date !== undefined
      ? `Chargement des horaires du ${formatLongDate(date)}…`
      : step === "slot" && slots.status === "ready"
        ? slots.slots.length === 0
          ? `Aucun horaire disponible${day}.`
          : `${slots.slots.length} horaire${slots.slots.length > 1 ? "s" : ""} disponible${slots.slots.length > 1 ? "s" : ""}${day}.`
        : step === "review" && state.attempt?.sending
          ? "Réservation en cours…"
          : "";

  return (
    <div ref={topRef} className="flex scroll-mt-6 flex-col gap-8">
      <header className="flex flex-col gap-5">
        {locked ? (
          // A request in flight or frozen must not be left by accident: the name is no longer a link.
          <span className="type-body-small self-start font-medium text-lavender-700">{professional.name}</span>
        ) : (
          <a
            href={profileHref}
            className="type-body-small inline-flex min-h-8 items-center gap-2 self-start font-semibold text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700"
          >
            <ArrowLeftIcon size={16} />
            {professional.name}
          </a>
        )}
        <h1 className="type-headline">{step === "done" ? "Rendez-vous confirmé" : "Prendre rendez-vous"}</h1>
        {step !== "done" ? <Progress current={step} /> : null}
      </header>

      {stepNotice ? (
        <div className={step === "slot" ? undefined : NARROW}>
          <FlowNoticeBox notice={stepNotice} professional={professional} />
        </div>
      ) : null}

      {step === "service" ? (
        <div className={NARROW}>
          <ServiceStep
            headingRef={headingRef}
            services={catalog.services}
            selectedId={serviceId}
            loading={catalogLoading}
            issue={catalogLoading ? undefined : catalogIssue}
            onRetry={() => {
              setCatalogIssue(undefined);
              setCatalogRetry((count) => count + 1);
            }}
            professional={professional}
            onChoose={(chosen) => navigate({ type: "CHOOSE_SERVICE", service: chosen, firstDate: catalog.firstDate })}
          />
        </div>
      ) : null}

      {step === "slot" && service !== undefined ? (
        <SlotStep
          headingRef={headingRef}
          service={service}
          window={catalog}
          date={date}
          slot={slot}
          slots={slots}
          timeZone={catalog.timeZone}
          professional={professional}
          loadingCount={serviceId === undefined ? undefined : lastCounts[serviceId]}
          onChangeService={back}
          onChooseDate={(chosen) => dispatch({ type: "CHOOSE_DATE", date: chosen })}
          onChooseSlot={(chosen: AvailableSlot) => dispatch({ type: "CHOOSE_SLOT", slot: chosen })}
          onRetry={() => setSlotRetry((count) => count + 1)}
          onBack={back}
          onContinue={() => navigate({ type: "GO_TO", step: "details" })}
        />
      ) : null}

      {step === "details" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <div className="min-w-0 lg:rounded-[1.75rem] lg:bg-background lg:p-9 lg:shadow-card lg:ring-1 lg:ring-border/65">
            <DetailsStep
              headingRef={headingRef}
              fieldRefs={fieldRefs}
              details={state.details}
              issues={state.issues}
              professional={professional}
              onEdit={(field, value) => dispatch({ type: "EDIT_DETAIL", field, value })}
              onBack={back}
              onContinue={() => {
                focusIssuesRef.current = true;
                navigate({ type: "REVIEW_DETAILS" });
              }}
            />
          </div>
          {service !== undefined ? (
            <AppointmentSummary service={service} professional={professional} date={date} slot={slot} timeZone={catalog.timeZone} className="hidden lg:flex" />
          ) : null}
        </div>
      ) : null}

      {step === "review" && service !== undefined && date !== undefined && slot !== undefined ? (
        <div className={NARROW}>
          <ReviewStep
            headingRef={headingRef}
            service={service}
            date={date}
            slot={slot}
            timeZone={catalog.timeZone}
            details={state.details}
            professional={professional}
            notice={state.notice}
            sending={state.attempt?.sending === true}
            retrying={state.attempt !== undefined}
            locked={locked}
            challenge={challenge}
            challengeSlot={<TurnstileWidget siteKey={challengeSiteKey} resetSignal={challengeReset} onChange={setChallenge} />}
            onEdit={(target) => {
              if (canShowStep(state, target)) navigate({ type: "GO_TO", step: target });
            }}
            onBack={back}
            onConfirm={() => void confirm()}
            onRetryChallenge={() => setChallengeReset((count) => count + 1)}
            slow={slowSend === sendSerial}
          />
        </div>
      ) : null}

      {step === "done" && state.confirmation !== undefined ? (
        <div className={NARROW}>
          <BookingConfirmation
            headingRef={headingRef}
            booking={state.confirmation}
            professional={professional}
            profileHref={profileHref}
            onRestart={() => {
              historyModeRef.current = "replace";
              dispatch({ type: "RESTART" });
            }}
          />
        </div>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
