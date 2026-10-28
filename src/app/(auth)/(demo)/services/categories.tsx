import { useLocalSearchParams } from 'expo-router';

import { ServiceCategoriesScreen } from '@/features/services/categories/ServiceCategoriesScreen';

export default function ServiceCategoriesRoute() {
  // `?create=1`: « Nouvelle catégorie » from the Prestations & tarifs « + ».
  const { create } = useLocalSearchParams<{ create?: string | string[] }>();
  const resolvedCreate = Array.isArray(create) ? create[0] : create;

  return <ServiceCategoriesScreen startCreating={resolvedCreate === '1'} />;
}
