import { describe, expect, it, vi } from 'vitest';

import { createNotification } from '../notification-service';

describe('notification creation', () => {
  it('uses a tenant-scoped deterministic dedupe key', async () => {
    const upsert = vi.fn().mockResolvedValue({ id: 'notification-1' });
    const prisma = { notification: { upsert } } as never;
    await createNotification(prisma, {
      companyId: 'company-1', type: 'INVOICE_ISSUED', titleAr: 'فاتورة', titleEn: 'Invoice',
      messageAr: 'صدرت', messageEn: 'Issued', dedupeKey: 'invoice-issued:invoice-1',
    });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId_dedupeKey: { companyId: 'company-1', dedupeKey: 'invoice-issued:invoice-1' } },
      update: {},
    }));
  });
});
