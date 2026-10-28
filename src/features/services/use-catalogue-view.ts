// BeautIzzy — the catalogue organisation of the current Business (presentation only)

import type { ServiceCategory } from '@/domain/services';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import { useServiceCatalog } from '@/features/services/session/ServiceCatalogProvider';

import { getCataloguePresentation, type CataloguePresentation } from './catalogue-presentation';

export interface CatalogueView {
  readonly presentation: CataloguePresentation;
  readonly categories: readonly ServiceCategory[];
}

/** The profession's presentation and the professional's categories, for the screens that list prestations. */
export function useCatalogueView(): CatalogueView {
  const business = useCurrentBusiness();
  const { categories } = useServiceCatalog();
  return { presentation: getCataloguePresentation(business.activityType), categories };
}
