import { useLocalSearchParams } from 'expo-router';

import { ProductEditorScreen } from '@/features/products/editor/ProductEditorScreen';

export default function ExistingProductRoute() {
  const { productId } = useLocalSearchParams<{
    productId?: string | string[];
  }>();
  const resolvedProductId = Array.isArray(productId) ? productId[0] : productId;

  return <ProductEditorScreen mode="existing" productId={resolvedProductId} />;
}
