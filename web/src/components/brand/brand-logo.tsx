import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The official BeautIzzy logo. The files under public/brand are unmodified
 * copies of the repository's assets/brand originals; never redraw them.
 */
const LOGO = { src: "/brand/logo-primary.png", width: 1489, height: 541 } as const;

function BrandLogo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src={LOGO.src}
      width={LOGO.width}
      height={LOGO.height}
      alt="BeautIzzy"
      priority={priority}
      sizes="160px"
      className={cn("h-9 w-auto", className)}
    />
  );
}

export { BrandLogo };
