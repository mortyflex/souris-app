"use client";

import { useEffect, useRef } from "react";

import { formatValue } from "./format-value";
import { DEMO_EVENT } from "./demo-scene";

/**
 * A figure of a demonstration: it counts up with its scene (`DemoScene`) and
 * rests on its real value. The server renders the FINAL value, so a reader
 * without JavaScript and reduced motion see it as it is; assistive
 * technologies always read the final value (the moving digits are hidden).
 *
 * The count follows a Web Animation (no visual effect of its own), so it
 * pauses, seeks and finishes with the rest of the scene.
 */
export function DemoNumber({
  value,
  format,
  delay = 0,
  duration = 900,
  className,
}: {
  value: number;
  format: "integer" | "euros" | "euros-cents";
  /** When it starts, in ms after the scene starts. */
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const text = formatValue(value, format);

  useEffect(() => {
    const element = ref.current;
    const scene = element?.closest("[data-demo-scene]");
    if (!element || !scene) return;
    let frame = 0;
    let timing: Animation | undefined;
    const write = (current: number) => {
      element.textContent = formatValue(current, format);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      timing?.cancel();
      timing = undefined;
    };
    const onReady = () => {
      stop();
      write(0);
    };
    const onPlay = () => {
      stop();
      write(0);
      const carrier = element.animate([{ opacity: 1 }, { opacity: 1 }], { duration, delay, fill: "both", easing: "linear" });
      timing = carrier;
      const tick = () => {
        const progress = carrier.effect?.getComputedTiming().progress ?? 1;
        write(value * (1 - Math.pow(1 - progress, 3)));
        if (carrier.playState !== "finished" && timing === carrier) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      carrier.finished.then(
        () => write(value),
        () => undefined,
      );
    };
    const onFinal = () => {
      stop();
      write(value);
    };
    scene.addEventListener(DEMO_EVENT.ready, onReady);
    scene.addEventListener(DEMO_EVENT.play, onPlay);
    scene.addEventListener(DEMO_EVENT.final, onFinal);
    return () => {
      stop();
      scene.removeEventListener(DEMO_EVENT.ready, onReady);
      scene.removeEventListener(DEMO_EVENT.play, onPlay);
      scene.removeEventListener(DEMO_EVENT.final, onFinal);
      write(value);
    };
  }, [value, format, delay, duration]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
