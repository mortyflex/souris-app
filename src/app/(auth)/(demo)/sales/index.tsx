import { useLocalSearchParams } from 'expo-router';

import { SalesHistoryScreen } from '@/features/sales/history/SalesHistoryScreen';
import { resolveSaleHistoryInitialState } from '@/features/sales/history/route-params';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default function SalesHistoryRoute() {
  const { period, date } = useLocalSearchParams<{ period?: string | string[]; date?: string | string[] }>();
  const initial = resolveSaleHistoryInitialState(
    { period: firstParam(period), date: firstParam(date) },
    new Date(),
  );

  return <SalesHistoryScreen initialDate={initial.date} initialPeriod={initial.period} />;
}
