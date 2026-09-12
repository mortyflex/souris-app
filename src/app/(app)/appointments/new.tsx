import { useLocalSearchParams } from 'expo-router';

import { AppointmentCreationScreen } from '@/features/appointments/creation/AppointmentCreationScreen';

export default function AppointmentCreationRoute() {
  const { startAt } = useLocalSearchParams<{ startAt?: string | string[] }>();
  const resolvedStartAt = Array.isArray(startAt) ? startAt[0] : startAt;
  const parsedStartAt = resolvedStartAt ? new Date(resolvedStartAt) : new Date();

  return <AppointmentCreationScreen startAt={Number.isNaN(parsedStartAt.getTime()) ? new Date() : parsedStartAt} />;
}
