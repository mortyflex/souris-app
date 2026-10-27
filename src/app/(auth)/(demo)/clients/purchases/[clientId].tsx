import { useLocalSearchParams } from 'expo-router';

import { ClientPurchaseHistoryScreen } from '@/features/clients/history/ClientPurchaseHistoryScreen';

export default function ClientPurchaseHistoryRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>();
  const resolvedClientId = Array.isArray(clientId) ? clientId[0] : clientId;

  return <ClientPurchaseHistoryScreen clientId={resolvedClientId} />;
}
