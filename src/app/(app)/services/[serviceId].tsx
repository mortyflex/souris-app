import { useLocalSearchParams } from 'expo-router';

import { ServiceEditorScreen } from '@/features/services/editor/ServiceEditorScreen';

export default function ExistingServiceRoute() {
  const { serviceId } = useLocalSearchParams<{
    serviceId?: string | string[];
  }>();
  const resolvedServiceId = Array.isArray(serviceId) ? serviceId[0] : serviceId;

  return <ServiceEditorScreen mode="existing" serviceId={resolvedServiceId} />;
}
