import { AgendaSection } from "@/components/marketing/agenda-section";
import { CashSection } from "@/components/marketing/cash-section";
import { ClientsSection } from "@/components/marketing/clients-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { OnlineBookingSection } from "@/components/marketing/online-booking-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { ProductOverview } from "@/components/marketing/product-overview";
import { ProductsSection } from "@/components/marketing/products-section";
import { TrendsSection } from "@/components/marketing/trends-section";

/**
 * The landing page: BeautIzzy as a whole — agenda, cash register, insights,
 * products, clients — then online booking (in preparation), the price, the
 * questions and one invitation. Every screen shown is a real capture on
 * fictional data, and says so.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <ProductOverview />
      <AgendaSection />
      <CashSection />
      <TrendsSection />
      <ProductsSection />
      <ClientsSection />
      <OnlineBookingSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
