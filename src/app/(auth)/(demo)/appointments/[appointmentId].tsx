import { useLocalSearchParams } from 'expo-router';

import { AppointmentDetailsScreen } from '@/features/appointments/details/AppointmentDetailsScreen';

export default function AppointmentDetailsRoute() {
  const { appointmentId } = useLocalSearchParams<{ appointmentId?: string | string[] }>();
  const resolvedAppointmentId = Array.isArray(appointmentId) ? appointmentId[0] : appointmentId;

  return <AppointmentDetailsScreen appointmentId={resolvedAppointmentId} />;
}
