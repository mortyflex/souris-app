import { BrandLogo } from "@/components/brand/brand-logo";
import { Container } from "@/components/ui/container";
import { publicEnv } from "@/lib/env/public";
import { site } from "@/lib/site";

/**
 * Legal pages (privacy, terms, legal notice) are not written yet. Their links
 * are added here when the routes exist under src/app/(marketing)/ — never a
 * link to a page that does not exist.
 */
function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-lavender-25">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          <BrandLogo className="h-8" />
          <p className="type-body-small max-w-sm text-foreground/70">{site.tagline}.</p>
        </div>
        <div className="type-body-small flex flex-col gap-2 text-foreground/70 sm:items-end">
          {publicEnv.contactEmail ? (
            <a
              href={`mailto:${publicEnv.contactEmail}`}
              className="font-medium text-lavender-700 underline-offset-4 hover:underline"
            >
              {publicEnv.contactEmail}
            </a>
          ) : null}
          <p>© BeautIzzy</p>
        </div>
      </Container>
    </footer>
  );
}

export { SiteFooter };
