import { BookingTeaser } from "@/components/marketing/booking-teaser";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { Hero } from "@/components/marketing/hero";

export default function HomePage() {
  return (
    <>
      <Hero />
      <FeatureGrid />
      <BookingTeaser />
    </>
  );
}
