import { describe, expect, it, vi } from 'vitest';
import { PricingService } from '../../pricing/services';
import { CreateQuotationFlow } from '../services/CreateQuotationFlow';

function flow(salePrice: number | null, listPrice: number | null = null) {
  return new CreateQuotationFlow(
    { resolve: vi.fn().mockResolvedValue({ id: { toString: () => 'customer' } }) } as any,
    { resolve: vi.fn().mockResolvedValue('price-list') } as any,
    new PricingService({
      priceListItem: { findFirst: vi.fn().mockResolvedValue(listPrice === null ? null : { price: listPrice }) },
      catalogItem: { findFirst: vi.fn().mockResolvedValue({ salePrice }) },
    }),
  );
}

const request = { companyId: 'tenant', customerName: 'Customer', catalogItemId: 'catalog', quantity: 2, currencyCode: 'KWD' };

describe('quotation catalog price boundary', () => {
  it('requires an explicit commercial price for an unknown catalog price', async () => {
    await expect(flow(null).execute(request)).rejects.toMatchObject({ code: 'CATALOG_PRICE_REQUIRED' });
  });

  it.each([0, 125])('preserves explicit catalog price %s', async (price) => {
    await expect(flow(price).execute(request)).resolves.toMatchObject({ unitPrice: price, subtotal: price * 2 });
  });

  it.each([0, 75])('allows resolved price-list price %s when catalog price is unknown', async (price) => {
    await expect(flow(null, price).execute(request)).resolves.toMatchObject({ unitPrice: price, subtotal: price * 2 });
  });
});
