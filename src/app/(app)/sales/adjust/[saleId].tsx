import { useLocalSearchParams } from 'expo-router';

import { SaleAdjustmentScreen } from '@/features/sales/adjustments/SaleAdjustmentScreen';
import type { SaleAdjustmentIntent } from '@/features/sales/adjustments/presentation';

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Unknown or missing intents open the plain refund flow. */
function toIntent(value: string | undefined): SaleAdjustmentIntent {
  return value === 'correct' || value === 'cancel' ? value : 'refund';
}

export default function SaleAdjustmentRoute() {
  const { saleId, intent } = useLocalSearchParams<{ saleId?: string | string[]; intent?: string | string[] }>();

  return <SaleAdjustmentScreen intent={toIntent(firstParam(intent))} saleId={firstParam(saleId)} />;
}
