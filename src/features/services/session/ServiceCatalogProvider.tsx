import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Service } from '@/domain/appointments';

import { createInitialServiceCatalog } from '../data/initial-services';
import type { ServiceCatalogSessionValue } from './types';

const ServiceCatalogContext = createContext<ServiceCatalogSessionValue | null>(null);

function copyService(service: Service): Service {
  return {
    ...service,
    phases: service.phases.map((phase) => ({ ...phase })),
  };
}

/** The single in-memory Service source shared by management and Appointments. */
export function ServiceCatalogProvider({ children }: PropsWithChildren) {
  const [services, setServices] = useState<readonly Service[]>(() =>
    createInitialServiceCatalog().map(copyService),
  );

  const getServiceById = (serviceId: string | undefined) => {
    if (!serviceId) return undefined;
    return services.find((service) => service.id === serviceId);
  };

  const addService = (service: Service) => {
    if (services.some((candidate) => candidate.id === service.id)) {
      throw new Error(`A Service with id "${service.id}" already exists`);
    }
    setServices((current) => [...current, copyService(service)]);
  };

  const updateService = (service: Service) => {
    setServices((current) =>
      current.map((existing) =>
        existing.id === service.id
          ? copyService({
              ...service,
              id: existing.id,
              businessId: existing.businessId,
            })
          : existing,
      ),
    );
  };

  const setServiceActive = (serviceId: string, active: boolean) => {
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, active } : service,
      ),
    );
  };

  const deleteService = (serviceId: string) => {
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
