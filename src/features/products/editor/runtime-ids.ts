let productSequence = 0;

/** Runtime-only identities for the current in-memory Product catalog. */
export function createProductId(now = new Date()): string {
  productSequence += 1;
  return `product-${now.getTime()}-${productSequence}`;
}
