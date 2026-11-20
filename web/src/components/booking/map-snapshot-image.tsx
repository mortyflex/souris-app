"use client";

import { useEffect, useRef } from "react";

/**
 * The map of a published location: an Apple Maps Web Snapshot, asked by the
 * visitor's browser from Apple with the URL the server signed
 * (`src/features/location/map-snapshot.ts`). It lies OVER the page's own
 * artwork, which shows while it loads and stays if it cannot be read — an
 * expired or refused signature (401), a quota (429), an outage, no network:
 * the image hides itself and its frame (`[data-location-map]`) is marked
 * `failed`. Never a broken image, never a retry, never another source.
 *
 * Shown whole, never cropped: the image is asked in the frame's own 2 : 1, so
 * the attribution Apple draws on its map stays visible — the page adds no
 * caption of its own. A plain `<img>` on purpose: the image optimizer would
 * download, transform and cache Apple's image on this server.
 */
export function MapSnapshotImage({ src, width, height }: { src: string; width: number; height: number }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = ref.current;
    if (image === null) return;
    const frame = image.closest<HTMLElement>("[data-location-map]");
    const fail = () => {
      image.hidden = true;
      frame?.setAttribute("data-map-state", "failed");
    };
    const show = () => frame?.setAttribute("data-map-state", "shown");
    if (image.complete) {
      if (image.naturalWidth === 0) fail();
      else show();
      return;
    }
    image.addEventListener("load", show, { once: true });
    image.addEventListener("error", fail, { once: true });
    return () => {
      image.removeEventListener("load", show);
      image.removeEventListener("error", fail);
    };
  }, [src]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
