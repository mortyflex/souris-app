import type { Service } from '@/domain/appointments';

export interface ServiceCatalogSessionValue {
  /** Complete management catalog, including inactive Services. */
  readonly services: readonly Service[];
  /** Current choices for new Appointment additions. */
  readonly activeServices: readonly Service[];
  readonly getServiceById: (serviceId: string | undefined) => Service | undefined;
  readonly addService: (service: Service) => void;
  readonly updateService: (service: Service) => void;
  readonly setServiceActive: (serviceId: string, active: boolean) => void;
  /**
   * Reflects Service updates ALREADY committed by another transaction
   * (Appointment Creation catalog defaults). Memory only — never call it for
   * updates that were not persisted.
   */
  readonly applyCommittedServiceUpdates: (services: readonly Service[]) => void;
  /** Removes the catalog record immutably; unknown ids are a no-op. */
  readonly deleteService: (serviceId: string) => void;
}
