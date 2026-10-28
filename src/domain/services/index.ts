// BeautIzzy — Service catalogue domain (categories, descriptions)
//
// The `Service` / `ServicePhase` model itself stays in the Appointment domain
// (src/domain/appointments/types.ts), which owns scheduling and snapshots.

export {
  createServiceCategory,
  detachServicesFromCategory,
  groupServicesByCategory,
  isValidServiceCategoryName,
  moveServiceCategory,
  nextServiceCategoryPosition,
  normalizeServiceCategoryName,
  resolveServiceCategory,
  SERVICE_CATEGORY_NAME_MAX_LENGTH,
  ServiceCategoryInvalidError,
  sortServiceCategories,
  type ServiceCategory,
  type ServiceCategoryGroup,
} from './categories';
export {
  isValidServiceDescription,
  normalizeServiceDescription,
  SERVICE_DESCRIPTION_MAX_LENGTH,
} from './description';
