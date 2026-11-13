import Link from "next/link";

import { BrandLogo } from "@/components/brand/brand-logo";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center py-16">
      <Container className="flex max-w-xl flex-col items-start gap-6">
        <BrandLogo />
        <h1 className="font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
          Cette page est introuvable.
        </h1>
        <p className="text-lg leading-relaxed text-foreground/75">
          L&apos;adresse a peut-être changé, ou la page n&apos;existe pas.
        </p>
        <Button asChild>
          <Link href="/">Retour à l&apos;accueil</Link>
        </Button>
      </Container>
    </main>
  );
}
