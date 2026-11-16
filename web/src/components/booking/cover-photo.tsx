"use client";

import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * A professional's published cover photo. It always takes precedence over the
 * Nacre artwork, which lies underneath: Nacre shows while the photo loads and
 * stays if the photo cannot be read. Static — at most ONE quiet reveal (700 ms
 * fade, a 1.8 % scale settle) when it arrives after the page; none if it is
 * already there, none under reduced motion.
 */
export function CoverPhoto({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = ref.current;
    if (image === null) return;
    const fail = () => {
      image.hidden = true;
    };
    if (image.complete) {
      if (image.naturalWidth === 0) fail();
      return;
    }
    if (!prefersReducedMotion()) image.dataset.arriving = "true";
    const arrive = () => {
      if (image.dataset.arriving === "true") requestAnimationFrame(() => (image.dataset.arriving = "done"));
    };
    image.addEventListener("load", arrive, { once: true });
    image.addEventListener("error", fail, { once: true });
    return () => {
      image.removeEventListener("load", arrive);
      image.removeEventListener("error", fail);
    };
  }, []);

  return (
    // A remote image of a fixed, already-optimized size (≤ 1600 px, set by the
    // mobile application): the Next.js image optimizer is not needed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      fetchPriority="high"
      className="cover-photo absolute inset-0 h-full w-full object-cover object-center"
    />
  );
}
