"use client";

import { useEffect, useReducer, useRef, useState, type RefObject } from "react";

import type { AvailableSlot, BookableService } from "@/features/availability/availability";
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
import { cn } from "@/lib/utils";

import {
  BookingConfirmation,
  DetailsStep,
  FlowNoticeBox,
  ReviewStep,
  ServiceStep,
  SlotStep,
  type Professional,
  type SlotsView,
} from "./booking-steps";

export interface BookingFlowProps {
  readonly slug: string;
  readonly professional: Professional;
  readonly profileHref: string;
  /** What the server read for this page: the bookable services and the bookable window. */
  readonly initial: {
    readonly services: readonly BookableService[];
    readonly firstDate: string;
    readonly lastDate: string;
    readonly timeZone: string;
  };
}

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
export function BookingFlow({ slug, professional, profileHref, initial }: BookingFlowProps) {
  const [state, dispatch] = useReducer(flowReducer, undefined, () => initialFlowState());
  const [catalog, setCatalog] = useState<Catalog>({ ...initial, revision: 0 });
  const [slotResult, setSlotResult] = useState<{ key: string; view: SlotsView }>();
  const [slotRetry, setSlotRetry] = useState(0);
  const [popCount, setPopCount] = useState(0);

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

  // ---- The chosen date stays in view in the horizontal list (a narrow screen shows a few dates only).
  useEffect(() => {
    if (!onSlotStep || date === undefined) return;
    document.getElementById(`booking-date-${date}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [onSlotStep, date]);

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
        return;
      }
      if (result.status === "UNAVAILABLE") dispatch({ type: "CLOSED" });
      setCatalog((previous) => ({ ...previous, revision }));
    });
    return () => {
      active = false;
    };
  }, [slug, state.servicesRevision]);

  useEffect(
    () => () => {
      slotsReaderRef.current?.cancel();
      catalogReaderRef.current?.cancel();
    },
    [],
  );

  // ---- Confirm: ONE request in flight at most; a pending attempt is re-sent unchanged.
  const confirm = async () => {
    if (sendingRef.current) return;
    const plan = planSend(state, newIdempotencyKey);
    if (plan === undefined) return;
    sendingRef.current = true;
    dispatch({ type: "SENDING", attempt: plan.attempt });
    try {
      const response = await submitBooking(slug, plan.attempt.request, plan.attempt.key);
      historyModeRef.current = "replace";
      dispatch({ type: "ANSWER", response });
    } finally {
      sendingRef.current = false;
    }
  };

  const catalogLoading = catalog.revision !== state.servicesRevision;
  const stepNotice = state.notice !== undefined && STEP_NOTICES.has(state.notice) && step !== "review" ? state.notice : undefined;
  const announcement =
    step === "slot" && slots.status === "ready"
      ? slots.slots.length === 0
        ? "Aucun horaire disponible ce jour-là."
        : `${slots.slots.length} horaire${slots.slots.length > 1 ? "s" : ""} disponible${slots.slots.length > 1 ? "s" : ""}.`
      : step === "review" && state.attempt?.sending
        ? "Réservation en cours…"
        : "";

  return (
    <div ref={topRef} className="flex scroll-mt-6 flex-col gap-8">
      <header className="flex flex-col gap-5">
        <a
          href={profileHref}
          className="type-body-small self-start font-medium text-lavender-700 underline decoration-lavender-200 decoration-2 underline-offset-4 hover:decoration-lavender-700"
        >
          {professional.name}
        </a>
        <h1 className="type-headline">{step === "done" ? "Rendez-vous confirmé" : "Prendre rendez-vous"}</h1>
        {step !== "done" ? <Progress current={step} /> : null}
      </header>

      {stepNotice ? <FlowNoticeBox notice={stepNotice} professional={professional} /> : null}

      {step === "service" ? (
        <ServiceStep
          headingRef={headingRef}
          services={catalog.services}
          selectedId={serviceId}
          loading={catalogLoading}
          professional={professional}
          onChoose={(chosen) => navigate({ type: "CHOOSE_SERVICE", service: chosen, firstDate: catalog.firstDate })}
        />
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
          onChangeService={back}
          onChooseDate={(chosen) => dispatch({ type: "CHOOSE_DATE", date: chosen })}
          onChooseSlot={(chosen: AvailableSlot) => dispatch({ type: "CHOOSE_SLOT", slot: chosen })}
          onRetry={() => setSlotRetry((count) => count + 1)}
          onBack={back}
          onContinue={() => navigate({ type: "GO_TO", step: "details" })}
        />
      ) : null}

      {step === "details" ? (
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
      ) : null}

      {step === "review" && service !== undefined && date !== undefined && slot !== undefined ? (
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
          onEdit={(target) => {
            if (canShowStep(state, target)) navigate({ type: "GO_TO", step: target });
          }}
          onBack={back}
          onConfirm={() => void confirm()}
        />
      ) : null}

      {step === "done" && state.confirmation !== undefined ? (
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
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
