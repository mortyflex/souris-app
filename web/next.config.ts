import path from "node:path";

import type { NextConfig } from "next";

import { isIndexableDeployment, NOINDEX_HEADER } from "./src/lib/env/production-hosts";

const nextConfig: NextConfig = {
  // Every deployment that is not the production website — Staging, previews,
  // local development — answers « X-Robots-Tag: noindex » on EVERY response
  // (pages, 404s, API, assets). Decided from the configured canonical origin
  // (`NEXT_PUBLIC_SITE_URL`) and Vercel's own environment (`VERCEL_ENV`: a
  // Preview is never indexed), never from a request header.
  // See src/lib/env/indexing.ts.
  async headers() {
    if (isIndexableDeployment(process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_ENV)) return [];
    return [{ source: "/:path*", headers: [NOINDEX_HEADER] }];
  },
  // Development only (ignored by `next build`): the Android Emulator reaches
  // this dev server as 10.0.2.2, so its live-reload socket must be accepted
  // from that host. Refused, the browser retries, then reloads the page in a
  // loop. localhost (iOS Simulator, the computer itself) is always allowed.
  allowedDevOrigins: ["10.0.2.2"],
  // Cache Components is deliberately off: with it, a request-time lookup runs
  // after the prerendered shell is sent, so an unknown /r/<slug> could only
  // answer HTTP 200. Public profile pages must answer a real 404.
  turbopack: {
    // The repository root holds the mobile application and its own lockfile.
    // Pin the root here so the web build never resolves or watches it.
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
