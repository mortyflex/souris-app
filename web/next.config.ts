import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
