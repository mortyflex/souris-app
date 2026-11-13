import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";

/** Online booking is announced as upcoming: no date, no screenshot, no link to a booking page. */
function BookingTeaser() {
  return (
    <section id="reservation-en-ligne" className="scroll-mt-20 pb-16 sm:pb-24">
      <Container>
        <div className="flex flex-col items-start gap-5 rounded-[2rem] bg-lavender-50 p-8 sm:p-12">
          <Badge>Bientôt</Badge>
          <h2 className="max-w-2xl font-serif text-4xl leading-tight tracking-tight text-balance sm:text-5xl">
            La réservation en ligne arrive.
          </h2>
          <p className="max-w-2xl text-lg leading-relaxed text-foreground/75">
            Vos clientes pourront bientôt prendre rendez-vous depuis votre page BeautIzzy,
            directement dans votre agenda. Cette fonctionnalité est en préparation et n&apos;est
            pas encore disponible.
          </p>
        </div>
      </Container>
    </section>
  );
}

export { BookingTeaser };
