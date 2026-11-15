import { Container } from "@/components/ui/container";

/** Capabilities that exist in the mobile application today. Nothing upcoming is listed here. */
const FEATURES = [
  {
    title: "Un agenda pensé pour vos prestations",
    body: "Planifiez vos rendez-vous en quelques gestes, prestation par prestation, et retrouvez votre journée d'un coup d'œil.",
  },
  {
    title: "Le temps de pose, enfin compris",
    body: "Pendant qu'une couleur ou un soin pose, l'agenda sait que vous êtes disponible pour une autre cliente.",
  },
  {
    title: "Vos clientes, leur historique",
    body: "Coordonnées, notes, rendez-vous passés et à venir, achats : tout ce qui compte est sur la fiche cliente.",
  },
  {
    title: "Une caisse claire",
    body: "Encaissez vos rendez-vous et vos ventes de produits, puis consultez le résumé de votre journée.",
  },
  {
    title: "Produits et stock",
    body: "Gérez votre catalogue de revente et suivez votre stock sans tableur.",
  },
  {
    title: "Des rappels par e-mail",
    body: "Vos clientes reçoivent un rappel avant leur rendez-vous, sans que vous ayez à y penser.",
  },
] as const;

function FeatureGrid() {
  return (
    <section id="fonctionnalites" className="scroll-mt-20 py-16 sm:py-24">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="type-headline">L&apos;essentiel, très bien fait.</h2>
          <p className="type-lead text-foreground/75">
            Peu de fonctionnalités, mais celles dont vous vous servez toute la journée.
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-6 shadow-card"
            >
              <h3 className="type-subtitle">{feature.title}</h3>
              <p className="type-body text-foreground/75">{feature.body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

export { FeatureGrid };
