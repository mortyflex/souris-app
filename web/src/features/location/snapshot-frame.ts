/**
 * The frame of a map: 2 : 1. ONE size, in points, for the image the server
 * asks Apple for (`map-snapshot.ts`) and for the box the page draws it in
 * (`location-card.tsx`) — so the image is shown whole, never cropped.
 * Each side stays within Apple's 50 – 640.
 */
export const SNAPSHOT_FRAME = { width: 600, height: 300 } as const;
