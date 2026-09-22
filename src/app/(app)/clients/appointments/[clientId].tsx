import { useLocalSearchParams } from 'expo-router';

import { ClientAppointmentHistoryScreen } from '@/features/clients/history/ClientAppointmentHistoryScreen';

export default function ClientAppointmentHistoryRoute() {
  const { clientId } = useLocalSearchParams<{ clientId?: string | string[] }>();
  const resolvedClientId = Array.isArray(clientId) ? clientId[0] : clientId;

  return <ClientAppointmentHistoryScreen clientId={resolvedClientId} />;
}
