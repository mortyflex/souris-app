import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The official BeautIzzy logo. The files under public/brand are unmodified
 * copies of the repository's assets/brand originals; never redraw them.
 * Only the height is set: the width follows, so the proportions never change.
 */
const LOGO = { src: "/brand/logo-primary.png", width: 1489, height: 541 } as const;

function BrandLogo({
  className,
  priority = false,
  sizes = "160px",
}: {
  className?: string;
  priority?: boolean;
  /** The rendered width(s), for the responsive image candidates. */
  sizes?: string;
}) {
  return (
    <Image
      src={LOGO.src}
      width={LOGO.width}
      height={LOGO.height}
      alt="BeautIzzy"
      priority={priority}
      sizes={sizes}
      className={cn("h-9 w-auto", className)}
    />
  );
}

export { BrandLogo };
