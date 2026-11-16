/**
 * The bot challenge of the booking flow — Cloudflare Turnstile, managed mode.
 *
 * What the browser and the server share (the header, the action, the token
 * rule), and the browser's side: loading Cloudflare's script once, rendering
 * ONE widget, following its state. The server's side — the secret and
 * Siteverify — lives in `turnstile.ts` (server-only).
 *
 * Pure of React; the browser globals are injected, so it is tested without a
 * DOM.
 *
 * A token is SINGLE-USE and lives 300 seconds (Cloudflare's rules). It is
 * never part of the booking request: it travels in its own header, so a
 * frozen request is re-sent unchanged — same body, same idempotency key —
 * with a NEW token.
 */

/** The request header carrying the token. Never in the JSON body. */
export const CHALLENGE_HEADER = "X-Turnstile-Token";

/** The widget's action, checked by the server: a token minted for anything else is refused. */
export const CHALLENGE_ACTION = "booking";

/** Cloudflare's longest token. */
export const MAX_CHALLENGE_TOKEN_LENGTH = 2048;

/** A token as it may travel: 1 to 2048 visible ASCII characters, no space. Its validity is Cloudflare's answer. */
export function isChallengeTokenShape(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_CHALLENGE_TOKEN_LENGTH && /^[\x21-\x7E]+$/.test(value);
}

/**
 * Cloudflare's script, explicit rendering. Loaded from this exact address,
 * never proxied nor cached (Cloudflare's requirement).
 */
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_TIMEOUT_MS = 15_000;

/** The part of Cloudflare's `window.turnstile` this flow uses. */
export interface TurnstileApi {
  render(container: HTMLElement, options: TurnstileOptions): string | null | undefined;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

export type ChallengeSize = "flexible" | "compact";

export interface TurnstileOptions {
  readonly sitekey: string;
  readonly action: string;
  readonly language: "fr";
  readonly theme: "light";
  readonly size: ChallengeSize;
  /** Nothing is shown unless Cloudflare asks the customer for an interaction. */
  readonly appearance: "interaction-only";
  readonly execution: "render";
  readonly retry: "auto";
  readonly "refresh-expired": "auto";
  readonly "refresh-timeout": "auto";
  /** No hidden form field: the token is read through the callback only. */
  readonly "response-field": false;
  readonly callback: (token: string) => void;
  readonly "expired-callback": () => void;
  readonly "timeout-callback": () => void;
  readonly "error-callback": () => void;
  readonly "unsupported-callback": () => void;
  readonly "before-interactive-callback": () => void;
  readonly "after-interactive-callback": () => void;
}

export type ChallengeState =
  /** Loading or checking — usually invisible and short. */
  | { readonly status: "checking" }
  /** Cloudflare asks the customer for an interaction: the widget is visible. */
  | { readonly status: "interactive" }
  /** A fresh token: the booking can be confirmed. */
  | { readonly status: "ready"; readonly token: string }
  /** The challenge could not run (script blocked, network, unsupported browser…). */
  | { readonly status: "error" };

export const CHECKING: ChallengeState = { status: "checking" };

/**
 * The widget's size for its container: `flexible` fills it but never narrower
 * than 300 px; below that, `compact` (150 px) — no horizontal overflow on a
 * narrow phone.
 */
export function challengeSizeFor(containerWidth: number): ChallengeSize {
  return containerWidth >= 300 ? "flexible" : "compact";
}

export interface ChallengeHandle {
  /** A new token: the previous one is spent or abandoned. A widget that failed to render is rendered again. */
  reset(): void;
  remove(): void;
}

/** Renders ONE widget into `container` and reports every change of its state. */
export function renderChallenge({
  api,
  container,
  siteKey,
  onChange,
}: {
  api: TurnstileApi;
  container: HTMLElement;
  siteKey: string;
  onChange: (state: ChallengeState) => void;
}): ChallengeHandle {
  let widgetId: string | undefined;

  const render = () => {
    onChange(CHECKING);
    try {
      widgetId =
        api.render(container, {
          sitekey: siteKey,
          action: CHALLENGE_ACTION,
          language: "fr",
          theme: "light",
          size: challengeSizeFor(container.clientWidth),
          appearance: "interaction-only",
          execution: "render",
          retry: "auto",
          "refresh-expired": "auto",
          "refresh-timeout": "auto",
          "response-field": false,
          callback: (token) => onChange(isChallengeTokenShape(token) ? { status: "ready", token } : { status: "error" }),
          // Cloudflare refreshes an expired or timed-out challenge itself: wait for the new token.
          "expired-callback": () => onChange(CHECKING),
          "timeout-callback": () => onChange(CHECKING),
          "error-callback": () => onChange({ status: "error" }),
          "unsupported-callback": () => onChange({ status: "error" }),
          "before-interactive-callback": () => onChange({ status: "interactive" }),
          "after-interactive-callback": () => onChange(CHECKING),
        }) ?? undefined;
    } catch {
      widgetId = undefined;
    }
    if (widgetId === undefined) onChange({ status: "error" });
  };

  render();

  return {
    reset() {
      if (widgetId === undefined) {
        render();
        return;
      }
      onChange(CHECKING);
      try {
        api.reset(widgetId);
      } catch {
        onChange({ status: "error" });
      }
    },
    remove() {
      if (widgetId === undefined) return;
      try {
        api.remove(widgetId);
      } catch {
        // Already gone with its container.
      }
      widgetId = undefined;
    },
  };
}

interface ScriptElement {
  src: string;
  async: boolean;
  defer: boolean;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove(): void;
}

export interface LoaderEnvironment {
  readonly win: { turnstile?: TurnstileApi };
  readonly doc: { createElement(tag: "script"): ScriptElement; head: { appendChild(node: ScriptElement): unknown } };
}

/**
 * Loads Cloudflare's script at most once at a time. A failed or timed-out load
 * removes its script and rejects, so a later call tries again.
 */
export function createTurnstileLoader(environment?: LoaderEnvironment, timeoutMs = SCRIPT_TIMEOUT_MS) {
  let pending: Promise<TurnstileApi> | undefined;
  return function loadTurnstile(): Promise<TurnstileApi> {
    const { win, doc } = environment ?? { win: window as LoaderEnvironment["win"], doc: document as unknown as LoaderEnvironment["doc"] };
    if (win.turnstile !== undefined) return Promise.resolve(win.turnstile);
    if (pending !== undefined) return pending;
    pending = new Promise<TurnstileApi>((resolve, reject) => {
      const script = doc.createElement("script");
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        pending = undefined;
        script.remove();
        reject(new Error("Turnstile unavailable"));
      };
      const timer = setTimeout(fail, timeoutMs);
      script.onload = () => {
        if (win.turnstile === undefined) return fail();
        settled = true;
        clearTimeout(timer);
        resolve(win.turnstile);
      };
      script.onerror = fail;
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      doc.head.appendChild(script);
    });
    return pending;
  };
}
