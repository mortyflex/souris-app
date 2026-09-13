import { useLocalSearchParams } from 'expo-router';

import { SaleCreationScreen } from '@/features/sales/creation/SaleCreationScreen';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function NewSaleRoute() {
  const { clientId, appointmentId } = useLocalSearchParams<{
    clientId?: string | string[];
    appointmentId?: string | string[];
  }>();

  return (
    <SaleCreationScreen
      initialAppointmentId={firstParam(appointmentId)}
      initialClientId={firstParam(clientId)}
    />
  );
}
