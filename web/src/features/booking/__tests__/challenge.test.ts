import { describe, expect, it, vi } from "vitest";

import {
  CHALLENGE_ACTION,
  CHALLENGE_HEADER,
  challengeSizeFor,
  createTurnstileLoader,
  isChallengeTokenShape,
  renderChallenge,
  TURNSTILE_SCRIPT_URL,
  type ChallengeState,
  type LoaderEnvironment,
  type TurnstileApi,
  type TurnstileOptions,
} from "../challenge";

/** Cloudflare's `window.turnstile`, recorded. */
function fakeApi({ widgetId = "widget-1" as string | null, throwOnRender = false, throwOnReset = false } = {}) {
  const rendered: TurnstileOptions[] = [];
  const api = {
    render: vi.fn((_container: HTMLElement, options: TurnstileOptions) => {
      if (throwOnRender) throw new Error("render failed");
      rendered.push(options);
      return widgetId;
    }),
    reset: vi.fn(() => {
      if (throwOnReset) throw new Error("reset failed");
    }),
    remove: vi.fn(),
  };
  return { api: api as TurnstileApi & typeof api, rendered };
}

const container = (clientWidth: number) => ({ clientWidth }) as HTMLElement;

function render(options: Parameters<typeof fakeApi>[0] = {}, width = 358) {
  const { api, rendered } = fakeApi(options);
  const states: ChallengeState[] = [];
  const handle = renderChallenge({ api, container: container(width), siteKey: "0x4AAAAAAAsiteKey", onChange: (state) => states.push(state) });
  return { api, rendered, states, handle, last: () => states[states.length - 1] };
}

describe("what the browser and the server share", () => {
  it("one header, one action", () => {
    expect(CHALLENGE_HEADER).toBe("X-Turnstile-Token");
    expect(CHALLENGE_ACTION).toBe("booking");
  });

  it.each<[unknown, boolean]>([
    ["0.abc_DEF-123.xyz", true],
    ["XXXX.DUMMY.TOKEN.XXXX", true],
    ["x".repeat(2048), true],
    ["x".repeat(2049), false],
    ["", false],
    ["0.abc def", false],
    ["0.abc\n", false],
    ["0.é", false],
    [undefined, false],
    [null, false],
    [42, false],
  ])("a token shaped %j: %s", (value, accepted) => {
    expect(isChallengeTokenShape(value)).toBe(accepted);
  });
});

describe("the widget's size: never wider than its container", () => {
  it.each([
    [0, "compact"],
    [288, "compact"], // a 320 px phone with 16 px gutters
    [299, "compact"],
    [300, "flexible"],
    [358, "flexible"], // a 390 px phone
    [720, "flexible"],
  ])("%i px → %s", (width, size) => {
    expect(challengeSizeFor(width)).toBe(size);
  });
});

describe("renderChallenge", () => {
  it("renders ONE managed widget: French, light, invisible unless an interaction is needed, refreshed automatically, no hidden form field", () => {
    const { rendered, states } = render();
    expect(rendered).toHaveLength(1);
    expect(rendered[0]).toMatchObject({
      sitekey: "0x4AAAAAAAsiteKey",
      action: "booking",
      language: "fr",
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      execution: "render",
      retry: "auto",
      "refresh-expired": "auto",
      "refresh-timeout": "auto",
      "response-field": false,
    });
    expect(states).toEqual([{ status: "checking" }]);
  });

  it("chooses the compact widget in a narrow container", () => {
    expect(render({}, 288).rendered[0].size).toBe("compact");
  });

  it("follows Cloudflare's callbacks", () => {
    const { rendered, last } = render();
    const options = rendered[0];
    options.callback("0.fresh-token");
    expect(last()).toEqual({ status: "ready", token: "0.fresh-token" });
    options["expired-callback"]();
    expect(last()).toEqual({ status: "checking" });
    options["before-interactive-callback"]();
    expect(last()).toEqual({ status: "interactive" });
    options["after-interactive-callback"]();
    expect(last()).toEqual({ status: "checking" });
    options["timeout-callback"]();
    expect(last()).toEqual({ status: "checking" });
    options["error-callback"]();
    expect(last()).toEqual({ status: "error" });
    options.callback("0.recovered");
    expect(last()).toEqual({ status: "ready", token: "0.recovered" });
    options["unsupported-callback"]();
    expect(last()).toEqual({ status: "error" });
  });

  it("never offers a token that could not travel", () => {
    const { rendered, last } = render();
    rendered[0].callback("not a token");
    expect(last()).toEqual({ status: "error" });
  });

  it("reset asks Cloudflare for a new token and forgets the spent one", () => {
    const { api, rendered, handle, last } = render();
    rendered[0].callback("0.spent");
    handle.reset();
    expect(api.reset).toHaveBeenCalledWith("widget-1");
    expect(last()).toEqual({ status: "checking" });
  });

  it.each([
    ["Cloudflare renders nothing", { widgetId: null }],
    ["rendering throws", { throwOnRender: true }],
  ])("reports an error when %s — and a retry renders again", (_label, options) => {
    const { api, states, handle, last } = render(options);
    expect(last()).toEqual({ status: "error" });
    expect(states).toEqual([{ status: "checking" }, { status: "error" }]);
    handle.reset();
    expect(api.reset).not.toHaveBeenCalled();
    expect(api.render).toHaveBeenCalledTimes(2);
  });

  it("reports an error when a reset fails", () => {
    const { handle, last } = render({ throwOnReset: true });
    handle.reset();
    expect(last()).toEqual({ status: "error" });
  });

  it("remove takes the widget away once", () => {
    const { api, handle } = render();
    handle.remove();
    handle.remove();
    expect(api.remove).toHaveBeenCalledTimes(1);
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });
});

describe("createTurnstileLoader", () => {
  function environment(existing?: TurnstileApi) {
    const scripts: { src: string; async: boolean; defer: boolean; onload: (() => void) | null; onerror: (() => void) | null; removed: boolean; remove(): void }[] = [];
    const win: { turnstile?: TurnstileApi } = existing ? { turnstile: existing } : {};
    const env: LoaderEnvironment = {
      win,
      doc: {
        createElement: () => {
          const script = { src: "", async: false, defer: false, onload: null, onerror: null, removed: false, remove: () => (script.removed = true) };
          scripts.push(script as (typeof scripts)[number]);
          return script as unknown as ReturnType<LoaderEnvironment["doc"]["createElement"]>;
        },
        head: { appendChild: (node) => node },
      },
    };
    return { env, win, scripts };
  }

  it("uses Cloudflare's script already on the page", async () => {
    const { api } = fakeApi();
    const { env, scripts } = environment(api);
    await expect(createTurnstileLoader(env)()).resolves.toBe(api);
    expect(scripts).toHaveLength(0);
  });

  it("loads Cloudflare's script ONCE, from its exact address, explicit rendering", async () => {
    const { env, win, scripts } = environment();
    const load = createTurnstileLoader(env);
    const first = load();
    const second = load();
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatchObject({ src: TURNSTILE_SCRIPT_URL, async: true, defer: true });
    expect(TURNSTILE_SCRIPT_URL).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
    const { api } = fakeApi();
    win.turnstile = api;
    scripts[0].onload?.();
    await expect(first).resolves.toBe(api);
    await expect(second).resolves.toBe(api);
  });

  it("a blocked script fails — and the next attempt loads it again", async () => {
    const { env, scripts } = environment();
    const load = createTurnstileLoader(env);
    const first = load();
    scripts[0].onerror?.();
    await expect(first).rejects.toThrow("Turnstile unavailable");
    expect(scripts[0].removed).toBe(true);
    void load().catch(() => undefined);
    expect(scripts).toHaveLength(2);
  });

  it("a script that loads without Cloudflare's API fails", async () => {
    const { env, scripts } = environment();
    const first = createTurnstileLoader(env)();
    scripts[0].onload?.();
    await expect(first).rejects.toThrow("Turnstile unavailable");
  });

  it("a script that never arrives fails after its timeout", async () => {
    const { env, scripts } = environment();
    const first = createTurnstileLoader(env, 10)();
    await expect(first).rejects.toThrow("Turnstile unavailable");
    expect(scripts[0].removed).toBe(true);
  });
});
