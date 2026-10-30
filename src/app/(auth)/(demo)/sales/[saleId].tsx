import { useLocalSearchParams } from 'expo-router';

import { SaleDetailScreen } from '@/features/sales/history/SaleDetailScreen';

export default function SaleDetailRoute() {
  const { saleId } = useLocalSearchParams<{ saleId?: string | string[] }>();
  const resolvedSaleId = Array.isArray(saleId) ? saleId[0] : saleId;

  return <SaleDetailScreen saleId={resolvedSaleId} />;
}
