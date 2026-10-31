import { useLocalSearchParams } from 'expo-router';

import { SaleRefundCorrectionScreen } from '@/features/sales/adjustments/SaleRefundCorrectionScreen';

export default function SaleRefundCorrectionRoute() {
  const { adjustmentId } = useLocalSearchParams<{ adjustmentId?: string | string[] }>();
  const resolved = Array.isArray(adjustmentId) ? adjustmentId[0] : adjustmentId;

  return <SaleRefundCorrectionScreen adjustmentId={resolved} />;
}
