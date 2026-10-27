import { useLocalSearchParams } from 'expo-router';

import { CalendarBlockDetailsScreen } from '@/features/calendar-blocks/details/CalendarBlockDetailsScreen';

export default function CalendarBlockDetailsRoute() {
  const { calendarBlockId } = useLocalSearchParams<{ calendarBlockId?: string | string[] }>();
  const resolvedCalendarBlockId = Array.isArray(calendarBlockId) ? calendarBlockId[0] : calendarBlockId;

  return <CalendarBlockDetailsScreen calendarBlockId={resolvedCalendarBlockId} />;
}
