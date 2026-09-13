import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Service } from '@/domain/appointments';
import {
  deleteService as removeService,
  insertService,
  setServiceActive as persistServiceActive,
  updateService as persistService,
} from '@/persistence/stores/services';
import { usePersistence } from '@/providers/PersistenceProvider';

import type { ServiceCatalogSessionValue } from './types';

const ServiceCatalogContext = createContext<ServiceCatalogSessionValue | null>(null);

function copyService(service: Service): Service {
  return {
    ...service,
    phases: service.phases.map((phase) => ({ ...phase })),
  };
}

/**
 * The single Service source shared by management and Appointments. Hydrated
 * once from the persisted snapshot; every mutation is written to SQLite
 * first and reflected in state only after success.
 */
export function ServiceCatalogProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const [services, setServices] = useState<readonly Service[]>(() =>
    snapshot.services.map(copyService),
  );

  const getServiceById = (serviceId: string | undefined) => {
    if (!serviceId) return undefined;
    return services.find((service) => service.id === serviceId);
  };

  const addService = (service: Service) => {
    if (services.some((candidate) => candidate.id === service.id)) {
      throw new Error(`A Service with id "${service.id}" already exists`);
    }
    const next = copyService(service);
    insertService(database, next);
    setServices((current) => [...current, next]);
  };

  const updateService = (service: Service) => {
    const existing = services.find((candidate) => candidate.id === service.id);
    if (!existing) return;
    const next = copyService({
      ...service,
      id: existing.id,
      businessId: existing.businessId,
    });
    persistService(database, next);
    setServices((current) =>
      current.map((candidate) => (candidate.id === next.id ? next : candidate)),
    );
  };

  const setServiceActive = (serviceId: string, active: boolean) => {
    persistServiceActive(database, serviceId, active);
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, active } : service,
      ),
    );
  };

  const deleteService = (serviceId: string) => {
    removeService(database, serviceId);
    setServices((current) =>
      current.filter((service) => service.id !== serviceId),
    );
  };

  return (
    <ServiceCatalogContext.Provider
      value={{
        services,
        activeServices: services.filter((service) => service.active),
        getServiceById,
        addService,
        updateService,
        setServiceActive,
        deleteService,
      }}
    >
      {children}
    </ServiceCatalogContext.Provider>
  );
}

export function useServiceCatalog(): ServiceCatalogSessionValue {
  const value = useContext(ServiceCatalogContext);
  if (!value) {
    throw new Error('useServiceCatalog must be used inside ServiceCatalogProvider');
  }
  return value;
}
