import { describe, expect, it, vi } from 'vitest';
import { PrismaCustomerRepository } from '../PrismaCustomerRepository';

describe('tenant-scoped customer discovery before pagination', () => {
  it('ranks tenant identities and hydrates only the matching page', async () => {
    const records = ['شركة الوطنية لصناعة السكر', 'الوطنية للغاز', 'الشركة الوطنية للتركيب', 'الوطنية للمقاولات'].map((name, i) => ({ id: `c${i}`, name, companyId: 'tenant-a' }));
    const findMany = vi.fn().mockResolvedValueOnce(records).mockResolvedValueOnce(records);
    const repository = new PrismaCustomerRepository({ customer: { findMany } } as any);
    expect((await repository.findAll({ companyId: 'tenant-a', search: 'الوطنية', status: 'ACTIVE', take: 5 })).map((c) => c.name)).toEqual(records.map((r) => r.name));
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { companyId: 'tenant-a', isDeleted: false, status: 'ACTIVE' }, take: 500, select: { nameAr: true, legalName: true } });
    expect(findMany.mock.calls[1][0].where).toMatchObject({ companyId: 'tenant-a', isDeleted: false, id: { in: ['c0', 'c1', 'c2', 'c3'] } });
  });
  it('does not lose normalized matches after the first bounded batch', async () => {
    const findMany = vi.fn().mockResolvedValueOnce(Array.from({ length: 500 }, (_, i) => ({ id: `x${i}`, name: 'Other' })))
      .mockResolvedValueOnce([{ id: 'match', name: 'شركة الأفق للتجهيزات ومقاولات المباني' }])
      .mockResolvedValueOnce([{ id: 'match', name: 'شركة الأفق للتجهيزات ومقاولات المباني' }]);
    const repository = new PrismaCustomerRepository({ customer: { findMany } } as any);
    expect(await repository.findAll({ companyId: 'tenant-a', search: 'شركة الافق', take: 5 })).toHaveLength(1);
    expect(findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: 'x499' }, skip: 1, where: { companyId: 'tenant-a', isDeleted: false } });
  });
});
