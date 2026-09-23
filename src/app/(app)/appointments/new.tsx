import { useLocalSearchParams } from 'expo-router';

import { AppointmentCreationScreen } from '@/features/appointments/creation/AppointmentCreationScreen';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function AppointmentCreationRoute() {
  const { startAt, clientId } = useLocalSearchParams<{
    startAt?: string | string[];
    clientId?: string | string[];
  }>();
  const resolvedStartAt = firstParam(startAt);
  const parsedStartAt = resolvedStartAt ? new Date(resolvedStartAt) : new Date();

  return (
    <AppointmentCreationScreen
      initialClientId={firstParam(clientId)}
      startAt={Number.isNaN(parsedStartAt.getTime()) ? new Date() : parsedStartAt}
    />
  );
}
