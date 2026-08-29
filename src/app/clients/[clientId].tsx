import { useLocalSearchParams } from 'expo-router';

import { ClientProfileScreen } from '@/features/clients/profile/ClientProfileScreen';

export default function ClientProfileRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>();
  const resolvedClientId = Array.isArray(clientId) ? clientId[0] : clientId;

  return <ClientProfileScreen clientId={resolvedClientId} />;
}
