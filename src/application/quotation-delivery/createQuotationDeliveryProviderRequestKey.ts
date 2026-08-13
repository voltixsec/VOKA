export function createQuotationDeliveryProviderRequestKey(
  deliveryId: string,
): string {
  const normalizedId = deliveryId.trim();
  if (!normalizedId) {
    throw new Error("Delivery id is required for provider request identity.");
  }

  return `quotation-delivery/${normalizedId}`;
}
