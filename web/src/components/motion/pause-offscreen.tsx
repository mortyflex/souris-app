"use client";

import { useEffect, useRef } from "react";

import { pauseWhenOffscreen } from "@/lib/motion";

/**
 * Pauses the ambient CSS loops of its PARENT element while it is off screen
 * (battery, GPU). Renders an empty, hidden span: drop it inside any element
 * whose animations follow `[data-offscreen="true"]`.
 */
export function PauseOffscreen() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const parent = ref.current?.parentElement;
    return parent ? pauseWhenOffscreen(parent) : undefined;
  }, []);
  return <span ref={ref} hidden />;
}
