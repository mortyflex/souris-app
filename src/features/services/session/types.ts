import type { Service } from '@/domain/appointments';
import type { ServiceCategory } from '@/domain/services';

export interface ServiceCategoryInput {
  readonly name: string;
  readonly description?: string;
}

export interface ServiceCatalogSessionValue {
  /** Complete management catalog, including inactive Services. */
  readonly services: readonly Service[];
  /** Current choices for new Appointment additions. */
  readonly activeServices: readonly Service[];
  readonly getServiceById: (serviceId: string | undefined) => Service | undefined;
  readonly addService: (service: Service) => void;
  readonly updateService: (service: Service) => void;
  readonly setServiceActive: (serviceId: string, active: boolean) => void;
  /** Removes the catalog record immutably; unknown ids are a no-op. */
  readonly deleteService: (serviceId: string) => void;

  /** The professional's categories, in their order. Empty for every Business until one is created. */
  readonly categories: readonly ServiceCategory[];
  readonly getCategoryById: (categoryId: string | undefined) => ServiceCategory | undefined;
  /**
   * Creates a category at the end of the list and returns it. Throws
   * `ServiceCategoryInvalidError` (blank name…) or the write guard / database
   * error; nothing changes then.
   */
  readonly addCategory: (input: ServiceCategoryInput) => ServiceCategory;
  /** Renames / re-describes a category; its id — what Services reference — never changes. */
  readonly updateCategory: (categoryId: string, input: ServiceCategoryInput) => void;
  /** Moves a category to `toIndex` of the ordered list (a drop); only the changed positions are written. */
  readonly moveCategory: (categoryId: string, toIndex: number) => void;
  /** How many Services a deletion would make uncategorized. */
  readonly countServicesInCategory: (categoryId: string) => number;
  /** Deletes the category; its Services become uncategorized (never deleted). */
  readonly deleteCategory: (categoryId: string) => void;
}
