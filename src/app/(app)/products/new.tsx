import { useLocalSearchParams } from 'expo-router';

import { ProductEditorScreen } from '@/features/products/editor/ProductEditorScreen';

export default function NewProductRoute() {
  const { barcode } = useLocalSearchParams<{ barcode?: string | string[] }>();
  const initialBarcode = Array.isArray(barcode) ? barcode[0] : barcode;

  return <ProductEditorScreen initialBarcode={initialBarcode} mode="create" />;
}
