import { createContext, useContext, useState, type PropsWithChildren } from 'react';

import type { Service } from '@/domain/appointments';
import {
  createServiceCategory,
  detachServicesFromCategory,
  moveServiceCategory,
  nextServiceCategoryPosition,
  sortServiceCategories,
  type ServiceCategory,
} from '@/domain/services';
import { useBusinessWriteGuard } from '@/features/access/write-guard';
import { useCurrentBusiness } from '@/features/business/session/CurrentBusinessProvider';
import {
  deleteServiceCategory as removeServiceCategory,
  insertServiceCategory,
  updateServiceCategory as persistServiceCategory,
  updateServiceCategoryPositions,
} from '@/persistence/stores/service-categories';
import {
  deleteService as removeService,
  insertService,
  setServiceActive as persistServiceActive,
  updateService as persistService,
} from '@/persistence/stores/services';
import { usePersistence, useSnapshotRefresh } from '@/providers/PersistenceProvider';
import { createUuidV4 } from '@/shared/lib/uuid';

import type { ServiceCatalogSessionValue, ServiceCategoryInput } from './types';

const ServiceCatalogContext = createContext<ServiceCatalogSessionValue | null>(null);

function copyService(service: Service): Service {
  return {
    ...service,
    phases: service.phases.map((phase) => ({ ...phase })),
  };
}

/**
 * The single Service source shared by management and Appointments, and the
 * professional's catalogue categories. Hydrated once from the persisted
 * snapshot; every mutation passes the business write guard first
 * (features/access/write-guard.ts), is written to SQLite next, and is
 * reflected in state only after success.
 */
export function ServiceCatalogProvider({ children }: PropsWithChildren) {
  const { database, snapshot } = usePersistence();
  const business = useCurrentBusiness();
  const requireWriteAccess = useBusinessWriteGuard();
  const [services, setServices] = useState<readonly Service[]>(() =>
    snapshot.services.map(copyService),
  );
  const [categories, setCategories] = useState<readonly ServiceCategory[]>(() =>
    sortServiceCategories(snapshot.serviceCategories),
  );
  // Remote changes applied by the sync runner, adopted in place.
  useSnapshotRefresh((fresh) => {
    setServices(fresh.services.map(copyService));
    setCategories(sortServiceCategories(fresh.serviceCategories));
  });

  const getServiceById = (serviceId: string | undefined) => {
    if (!serviceId) return undefined;
    return services.find((service) => service.id === serviceId);
  };

  const addService = (service: Service) => {
    requireWriteAccess('services.addService');
    if (services.some((candidate) => candidate.id === service.id)) {
      throw new Error(`A Service with id "${service.id}" already exists`);
    }
    const next = copyService(service);
    insertService(database, next);
    setServices((current) => [...current, next]);
  };

  const updateService = (service: Service) => {
    requireWriteAccess('services.updateService');
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
    requireWriteAccess('services.setServiceActive');
    persistServiceActive(database, serviceId, active);
    setServices((current) =>
      current.map((service) =>
        service.id === serviceId ? { ...service, active } : service,
      ),
    );
  };

  const deleteService = (serviceId: string) => {
    requireWriteAccess('services.deleteService');
    removeService(database, serviceId);
    setServices((current) =>
      current.filter((service) => service.id !== serviceId),
    );
  };

  const getCategoryById = (categoryId: string | undefined) =>
    categoryId === undefined ? undefined : categories.find((category) => category.id === categoryId);

  const addCategory = (input: ServiceCategoryInput) => {
    requireWriteAccess('services.addCategory');
    const category = createServiceCategory({
      id: createUuidV4(),
      businessId: business.id,
      name: input.name,
      description: input.description,
      position: nextServiceCategoryPosition(categories),
    });
    insertServiceCategory(database, category);
    setCategories((current) => sortServiceCategories([...current, category]));
    return category;
  };

  const updateCategory = (categoryId: string, input: ServiceCategoryInput) => {
    requireWriteAccess('services.updateCategory');
    const existing = categories.find((category) => category.id === categoryId);
    if (!existing) return;
    const next = createServiceCategory({ ...existing, name: input.name, description: input.description });
    persistServiceCategory(database, next);
    setCategories((current) => current.map((category) => (category.id === categoryId ? next : category)));
  };

  const moveCategory = (categoryId: string, toIndex: number) => {
    requireWriteAccess('services.moveCategory');
    const moved = moveServiceCategory(categories, categoryId, toIndex);
    if (moved.length === 0) return;
    updateServiceCategoryPositions(database, moved);
    setCategories((current) =>
      sortServiceCategories(current.map((category) => moved.find((change) => change.id === category.id) ?? category)),
    );
  };

  const countServicesInCategory = (categoryId: string) =>
    services.filter((service) => service.categoryId === categoryId).length;

  const deleteCategory = (categoryId: string) => {
    requireWriteAccess('services.deleteCategory');
    removeServiceCategory(database, categoryId);
    const detached = detachServicesFromCategory(services, categoryId);
    setCategories((current) => current.filter((category) => category.id !== categoryId));
    setServices((current) => current.map((service) => detached.find((next) => next.id === service.id) ?? service));
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
        categories,
        getCategoryById,
        addCategory,
        updateCategory,
        moveCategory,
        countServicesInCategory,
        deleteCategory,
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
