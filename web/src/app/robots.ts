import type { MetadataRoute } from "next";

import { robotsRules } from "@/lib/env/indexing";

/** robots.txt — only the production website may be crawled (`src/lib/env/indexing.ts`). */
export default function robots(): MetadataRoute.Robots {
  return robotsRules();
}
