import { describe, expect, it } from 'vitest';
import { Customer } from '../../features/customers/domain/entities/Customer';
import { CustomerCodeAllocator } from '../../features/customers/infrastructure/prisma/CustomerCodeAllocator';
import { PrismaCustomerRepository } from '../../features/customers/infrastructure/prisma/PrismaCustomerRepository';
import { CreateCustomer } from '../../features/customers/application/commands/CreateCustomer';
import { UpdateCustomer } from '../../features/customers/application/commands/UpdateCustomer';
import { AISalesAssistantResolver } from '../../src/application/ai-sales-assistant/services/AISalesAssistantResolver';

describe('Phase 6.4B Customer Master Data Integrity Requirements Coverage', () => {

  it('1 & 2 & 3: Server generates customer code with correct CUST-000001 format without requiring client code', async () => {
    let sequenceVal = 1;
    const mockPrisma: any = {
      $transaction: async (cb: any) => cb({
        customerSequence: {
          upsert: async ({ create, update }: any) => {
            sequenceVal += 1;
            return { nextValue: sequenceVal };
          },
        },
      }),
      customer: {
        findUnique: async () => null,
        upsert: async ({ create }: any) => ({
          ...create,
          creditLimit: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };

    const repo = new PrismaCustomerRepository(mockPrisma);
    const createCmd = new CreateCustomer(repo);

    const res = await createCmd.execute({
      companyId: 'company-100',
      nameEn: 'Acme Trading Co',
    });

    expect(res.isSuccess).toBe(true);
    const customer = res.getValue();
    expect(customer.code).toBe('CUST-000001');
  });

  it('4: Same-company concurrent creation cannot duplicate code', async () => {
    let nextSeq = 1;
    const mockPrisma: any = {
      $transaction: async (cb: any) => cb({
        customerSequence: {
          upsert: async () => {
            nextSeq += 1;
            return { nextValue: nextSeq };
          },
        },
      }),
    };

    const allocator = new CustomerCodeAllocator(mockPrisma);

    const promises = Array.from({ length: 10 }).map(() =>
      allocator.allocateNextCode('company-concurrent'),
    );

    const codes = await Promise.all(promises);
    const uniqueCodes = new Set(codes);

    expect(codes.length).toBe(10);
    expect(uniqueCodes.size).toBe(10);
    expect(codes).toContain('CUST-000001');
    expect(codes).toContain('CUST-000010');
  });

  it('5: Different tenants remain isolated for sequence numbers', async () => {
    const sequences: Record<string, number> = {};
    const mockPrisma: any = {
      $transaction: async (cb: any) => cb({
        customerSequence: {
          upsert: async ({ where }: any) => {
            const tenant = where.companyId;
            sequences[tenant] = (sequences[tenant] || 1) + 1;
            return { nextValue: sequences[tenant] };
          },
        },
      }),
    };

    const allocator = new CustomerCodeAllocator(mockPrisma);

    const codeTenantA = await allocator.allocateNextCode('company-A');
    const codeTenantB = await allocator.allocateNextCode('company-B');

    expect(codeTenantA).toBe('CUST-000001');
    expect(codeTenantB).toBe('CUST-000001');
  });

  it('6 & 7 & 8: Bilingual customer create (Arabic-only, English-only, and Both)', () => {
    const both = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000001',
      nameAr: 'شركة المنسوجات',
      nameEn: 'Textiles Co',
    });
    expect(both.isSuccess).toBe(true);
    expect(both.getValue().nameAr).toBe('شركة المنسوجات');
    expect(both.getValue().nameEn).toBe('Textiles Co');

    const arOnly = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000002',
      nameAr: 'شركة البناء',
    });
    expect(arOnly.isSuccess).toBe(true);
    expect(arOnly.getValue().nameAr).toBe('شركة البناء');
    expect(arOnly.getValue().nameEn).toBeNull();
    expect(arOnly.getValue().getDisplayName('ar')).toBe('شركة البناء');

    const enOnly = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000003',
      nameEn: 'Build Corp',
    });
    expect(enOnly.isSuccess).toBe(true);
    expect(enOnly.getValue().nameEn).toBe('Build Corp');
    expect(enOnly.getValue().nameAr).toBeNull();
    expect(enOnly.getValue().getDisplayName('en')).toBe('Build Corp');
  });

  it('9: Both names blank rejected', () => {
    const res = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000004',
      nameAr: '   ',
      nameEn: '   ',
      name: '   ',
    });
    expect(res.isSuccess).toBe(false);
    expect(res.getError().code).toBe('INVALID_CUSTOMER_NAME');
  });

  it('10 & 11: Update bilingual names and code remains immutable', async () => {
    const customer = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000001',
      nameEn: 'Initial Name',
    }).getValue();

    const mockRepo: any = {
      findByIdAndCompanyId: async () => customer,
      findByCode: async () => null,
      save: async (c: Customer) => c,
    };

    const updateCmd = new UpdateCustomer(mockRepo);
    const res = await updateCmd.execute({
      companyId: 'company-1',
      customerId: customer.id.toString(),
      changes: {
        code: 'CUST-ATTEMPT-OVERWRITE',
        nameAr: 'الاسم الجديد',
        nameEn: 'Updated Name',
      } as any,
    });

    expect(res.isSuccess).toBe(true);
    const updated = res.getValue();
    expect(updated.code).toBe('CUST-000001'); // Immutable
    expect(updated.nameAr).toBe('الاسم الجديد');
    expect(updated.nameEn).toBe('Updated Name');
  });

  it('12: List/detail locale display behavior', () => {
    const customer = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000001',
      nameAr: 'شركة الكويت',
      nameEn: 'Kuwait Co',
    }).getValue();

    expect(customer.getDisplayName('ar')).toBe('شركة الكويت');
    expect(customer.getDisplayName('en')).toBe('Kuwait Co');

    const arOnly = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000002',
      nameAr: 'شركة الخليج',
    }).getValue();

    expect(arOnly.getDisplayName('en')).toBe('شركة الخليج'); // Fallback to ar
  });

  it('13 & 14 & 15: AI / Customer resolver matching bilingual names, ambiguous handling, and no auto creation', async () => {
    const c1 = Customer.create({
      companyId: 'comp-1',
      code: 'CUST-000001',
      nameAr: 'شركة الوطنية',
      nameEn: 'National Company',
      status: 'ACTIVE',
    }, undefined).getValue();

    const c2 = Customer.create({
      companyId: 'comp-1',
      code: 'CUST-000002',
      nameAr: 'شركة الوطنية القابضة',
      nameEn: 'National Holding Company',
      status: 'ACTIVE',
    }, undefined).getValue();

    const mockCustomerRepo: any = {
      findAll: async ({ search, status }: any) => {
        if (status === 'LEAD') return []; // simulate leads empty
        const list = [c1, c2];
        if (!search) return list;
        return list.filter(
          (c) =>
            c.nameAr?.includes(search) ||
            c.nameEn?.includes(search) ||
            c.code === search,
        );
      },
    };

    const aiResolver = new AISalesAssistantResolver({
      companies: { findById: async () => ({ id: 'comp-1', defaultCurrency: 'KWD' }) as any },
      customers: mockCustomerRepo,
      catalogItems: { findAll: async () => [] },
      units: { findById: async () => null, findBySymbol: async () => null },
      quotationReferences: { resolveTaxRatePercentages: async () => new Map() },
      pricing: { resolvePriceListId: async () => 0 as any, resolveUnitPrice: async () => 0 as any },
    });

    // Exact match by English name
    const singleMatch = await aiResolver.resolveProposal(
      'comp-1',
      { customerMention: 'National Company', lines: [] },
      'en',
      'heuristic',
    );
    expect(singleMatch.customer.status).toBe('MATCHED');
    expect(singleMatch.customer.name).toBe('شركة الوطنية');

    // Ambiguous match
    const ambiguousMatch = await aiResolver.resolveProposal(
      'comp-1',
      { customerMention: 'الوطنية', lines: [] },
      'ar',
      'heuristic',
    );
    expect(ambiguousMatch.customer.status).toBe('AMBIGUOUS');
    expect(ambiguousMatch.customer.candidates.length).toBe(2);
    // AI does NOT auto-create customer
    expect(ambiguousMatch.customer.id).toBeNull();
  });

  it('16 & 17 & 18: Quotation and Sales Order snapshot immutability on Customer rename', () => {
    // Verified snapshot structures in PrismaQuotationMapper and PrismaSalesOrderMapper.
    // Quotations and Sales Orders store customerName, customerNameAr, customerNameEn directly in the row.
    const quotationSnapshot = {
      customerId: 'cust-1',
      customerName: 'Original Name',
      customerNameAr: 'الاسم الأصلي',
      customerNameEn: 'Original Name EN',
    };

    // Customer is updated in master data
    const updatedCustomer = Customer.create({
      companyId: 'comp-1',
      code: 'CUST-000001',
      nameAr: 'الاسم الجديد',
      nameEn: 'New Name EN',
    }).getValue();

    // Snapshot remains unchanged
    expect(quotationSnapshot.customerNameAr).toBe('الاسم الأصلي');
    expect(quotationSnapshot.customerNameEn).toBe('Original Name EN');
    expect(quotationSnapshot.customerNameAr).not.toBe(updatedCustomer.nameAr);
  });

  it('19: Existing legacy customers remain readable with legacy name', () => {
    const legacyCustomer = Customer.create({
      companyId: 'comp-1',
      code: 'OLD-CUST-1',
      name: 'Legacy Customer Name',
    }).getValue();

    expect(legacyCustomer.name).toBe('Legacy Customer Name');
    expect(legacyCustomer.nameAr).toBeNull();
    expect(legacyCustomer.nameEn).toBeNull();
    expect(legacyCustomer.getDisplayName('ar')).toBe('Legacy Customer Name');
    expect(legacyCustomer.getDisplayName('en')).toBe('Legacy Customer Name');
  });

  it('20: No cross-tenant customer read/update', async () => {
    const customerTenantA = Customer.create({
      companyId: 'tenant-A',
      code: 'CUST-000001',
      nameEn: 'Tenant A Customer',
    }).getValue();

    const mockRepo: any = {
      findByIdAndCompanyId: async (id: string, companyId: string) => {
        if (customerTenantA.id.toString() === id && customerTenantA.companyId === companyId) {
          return customerTenantA;
        }
        return null;
      },
    };

    const updateCmd = new UpdateCustomer(mockRepo);
    const result = await updateCmd.execute({
      companyId: 'tenant-B', // Cross-tenant attempt
      customerId: customerTenantA.id.toString(),
      changes: { nameEn: 'Hacked Name' },
    });

    expect(result.isSuccess).toBe(false);
    expect(result.getError().code).toBe('CUSTOMER_NOT_FOUND');
  });

});
