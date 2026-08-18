import { describe, expect, it } from 'vitest';

import { parseCustomerCreate } from '../../app/api/customers/customer-api';
import { CreateCustomer } from '../../features/customers/application/commands/CreateCustomer';
import { Customer } from '../../features/customers/domain/entities/Customer';
import { PrismaCustomerRepository } from '../../features/customers/infrastructure/prisma/PrismaCustomerRepository';

describe('Phase 6.4B CTO blocker fixes', () => {
  it('removes caller-supplied Customer code at the HTTP create boundary', () => {
    const parsed = parseCustomerCreate({
      code: 'CLIENT-999999',
      nameEn: 'Server Authority Customer',
    });

    expect(parsed).not.toHaveProperty('code');
    expect(parsed.nameEn).toBe('Server Authority Customer');
  });

  it('CreateCustomer ignores a runtime caller code and uses server allocation', async () => {
    let nextValue = 1;

    const prisma: any = {
      $transaction: async (callback: any) =>
        callback({
          customerSequence: {
            upsert: async () => {
              nextValue += 1;
              return { nextValue };
            },
          },
        }),
      customer: {
        upsert: async ({ create }: any) => ({
          ...create,
          creditLimit: null,
          createdAt: create.createdAt ?? new Date(),
          updatedAt: new Date(),
        }),
      },
    };

    const repository = new PrismaCustomerRepository(prisma);
    const command = new CreateCustomer(repository);

    const result = await command.execute({
      companyId: 'company-server-authority',
      code: 'CLIENT-999999',
      nameEn: 'Server Authority Customer',
    } as any);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue().code).toBe('CUST-000001');
  });

  it('rejects clearing both canonical names from a canonical Customer', () => {
    const customer = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000001',
      nameAr: 'شركة الاختبار',
      nameEn: 'Test Company',
    }).getValue();

    const result = customer.updateDetails({
      nameAr: null,
      nameEn: null,
    });

    expect(result.isSuccess).toBe(false);
    expect(result.getError().code).toBe('INVALID_CUSTOMER_NAME');
  });

  it('keeps a genuine legacy Customer editable for unrelated changes', () => {
    const customer = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000002',
      name: 'Legacy Customer',
    }).getValue();

    const result = customer.updateDetails({
      notes: 'Safe unrelated edit',
    });

    expect(result.isSuccess).toBe(true);
    expect(customer.name).toBe('Legacy Customer');
    expect(customer.nameAr).toBeNull();
    expect(customer.nameEn).toBeNull();
    expect(customer.notes).toBe('Safe unrelated edit');
  });

  it('allows a genuine legacy Customer to receive its first canonical name', () => {
    const customer = Customer.create({
      companyId: 'company-1',
      code: 'CUST-000003',
      name: 'Legacy Customer',
    }).getValue();

    const result = customer.updateDetails({
      nameEn: 'Legacy Customer Ltd',
    });

    expect(result.isSuccess).toBe(true);
    expect(customer.nameEn).toBe('Legacy Customer Ltd');
  });

  it('rejects legacy name-only creation for a new Customer', () => {
    expect(() =>
      parseCustomerCreate({
        code: 'CLIENT-CODE',
        name: 'Legacy-only new Customer',
      }),
    ).toThrow();
  });
});