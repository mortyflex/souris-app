import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { publicEnv } from "@/lib/env/public";

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-lavender-50 to-background">
      <Container className="grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="flex flex-col items-start gap-6">
          <Badge>Application mobile pour les professionnelles de la beauté</Badge>
          <h1 className="font-serif text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Votre journée, <em className="text-accent">simplement</em> organisée.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-foreground/75">
            BeautIzzy réunit l&apos;agenda, les clientes et la caisse dans une application
            claire et rapide — l&apos;essentiel pour bien travailler, sans la lourdeur d&apos;un
            logiciel de salon.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="#fonctionnalites">Découvrir les fonctionnalités</Link>
            </Button>
            {publicEnv.contactEmail ? (
              <Button asChild size="lg" variant="secondary">
                <a href={`mailto:${publicEnv.contactEmail}`}>Nous écrire</a>
              </Button>
            ) : null}
          </div>
        </div>
        <div aria-hidden="true" className="hidden justify-center lg:flex">
          <div className="flex aspect-square w-80 items-center justify-center rounded-[3rem] bg-lavender-100 shadow-lifted">
            <Image
              src="/brand/symbol.png"
              width={811}
              height={1097}
              alt=""
              sizes="160px"
              className="h-48 w-auto"
            />
          </div>
        </div>
      </Container>
    </section>
  );
}

export { Hero };
