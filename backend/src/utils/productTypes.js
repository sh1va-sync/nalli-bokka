export const BUILT_IN_PRODUCT_TYPES = ['meat', 'vegetable', 'fruit', 'oil', 'rice'];

export function getLegacyPricingMode(product) {
  if (product.productType === 'oil') return 'pack';
  if (product.productType === 'rice' && product.packs?.length) return 'pack';
  return 'weight';
}
