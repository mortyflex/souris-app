import type { Metadata } from "next";

// Online booking is not live yet: keep the public pages out of search results until it is.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The public booking pages. Each page draws its own header (the profile has a
 * quiet link for professionals, the booking flow only the wordmark), its own
 * footer (`PublicFooter`, same two variants) and its own width (`page.tsx`,
 * `reserver/page.tsx`).
 */
export default function BookingLayout({ children }: LayoutProps<"/r/[slug]">) {
  return children;
}
