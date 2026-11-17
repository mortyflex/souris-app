"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, type ComponentProps } from "react";

import { handleHomeLinkClick, settleHomeArrival } from "@/lib/home-scroll";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * The BeautIzzy logo as a link home: a real `<a href="/">` (keyboard, new
 * tab, prefetch), that always ends at the very top of the home page
 * (src/lib/home-scroll.ts) — however the visitor got where they are.
 */
export function HomeLink(props: Omit<ComponentProps<typeof Link>, "href" | "onClick">) {
  const pathname = usePathname();

  // Arrived from another page through the logo: start at the top, before the first paint.
  useLayoutEffect(() => {
    settleHomeArrival(pathname, window);
  }, [pathname]);

  return <Link {...props} href="/" onClick={(event) => handleHomeLinkClick(pathname, event, window, prefersReducedMotion())} />;
}
