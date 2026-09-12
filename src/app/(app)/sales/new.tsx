import { useLocalSearchParams } from 'expo-router';

import { SaleCreationScreen } from '@/features/sales/creation/SaleCreationScreen';

export default function NewSaleRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>();
  const initialClientId = Array.isArray(clientId) ? clientId[0] : clientId;

  return <SaleCreationScreen initialClientId={initialClientId} />;
}
