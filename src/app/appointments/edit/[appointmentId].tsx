import { useLocalSearchParams } from 'expo-router';

import { AppointmentEditingScreen } from '@/features/appointments/editing/AppointmentEditingScreen';

export default function AppointmentEditingRoute() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string | string[] }>();
  const resolvedAppointmentId = Array.isArray(appointmentId) ? appointmentId[0] : appointmentId;

  return <AppointmentEditingScreen appointmentId={resolvedAppointmentId} />;
}
