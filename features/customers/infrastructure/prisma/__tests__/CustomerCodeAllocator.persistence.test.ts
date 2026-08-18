import { afterEach, describe, expect, it } from 'vitest';

import { CreateCustomer } from '../../../application/commands/CreateCustomer';
import { PrismaCustomerRepository } from '../PrismaCustomerRepository';

const persistenceDescribe =
  process.env.VOKA_RUN_DB_TESTS === '1'
    ? describe
    : describe.skip;

persistenceDescribe(
  'Customer code allocation — real PostgreSQL concurrency',
  () => {
    const companyIds: string[] = [];

    afterEach(async () => {
      if (companyIds.length === 0) {
        return;
      }

      const { prisma } = await import(
        '../../../../../lib/prisma'
      );

      await prisma.company.deleteMany({
        where: {
          id: {
            in: [...companyIds],
          },
        },
      });

      companyIds.length = 0;
    });

    it('creates concurrent same-company Customers with unique sequential codes', async () => {
      const { prisma } = await import(
        '../../../../../lib/prisma'
      );

      const token =
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2);

      const company = await prisma.company.create({
        data: {
          name: 'Phase 6.4B Concurrency',
          slug: 'phase64b-concurrency-' + token,
        },
      });

      companyIds.push(company.id);

      const repository =
        new PrismaCustomerRepository(prisma);

      const createCustomer =
        new CreateCustomer(repository);

      const results = await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          createCustomer.execute({
            companyId: company.id,
            nameEn: 'Concurrent Customer ' + (index + 1),
          }),
        ),
      );

      expect(
        results.every((result) => result.isSuccess),
      ).toBe(true);

      const codes = results
        .map((result) => result.getValue().code)
        .sort();

      const expected = Array.from(
        { length: 12 },
        (_, index) =>
          'CUST-' +
          String(index + 1).padStart(6, '0'),
      ).sort();

      expect(codes).toEqual(expected);
      expect(new Set(codes).size).toBe(12);

      const persisted = await prisma.customer.findMany({
        where: {
          companyId: company.id,
        },
        select: {
          code: true,
        },
      });

      expect(persisted).toHaveLength(12);
      expect(
        new Set(persisted.map((row) => row.code)).size,
      ).toBe(12);
    });

    it('keeps Customer sequences independent between tenants', async () => {
      const { prisma } = await import(
        '../../../../../lib/prisma'
      );

      const token =
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2);

      const companyA = await prisma.company.create({
        data: {
          name: 'Phase 6.4B Tenant A',
          slug: 'phase64b-tenant-a-' + token,
        },
      });

      const companyB = await prisma.company.create({
        data: {
          name: 'Phase 6.4B Tenant B',
          slug: 'phase64b-tenant-b-' + token,
        },
      });

      companyIds.push(companyA.id, companyB.id);

      const repository =
        new PrismaCustomerRepository(prisma);

      const createCustomer =
        new CreateCustomer(repository);

      const [resultA, resultB] = await Promise.all([
        createCustomer.execute({
          companyId: companyA.id,
          nameEn: 'Tenant A Customer',
        }),
        createCustomer.execute({
          companyId: companyB.id,
          nameEn: 'Tenant B Customer',
        }),
      ]);

      expect(resultA.isSuccess).toBe(true);
      expect(resultB.isSuccess).toBe(true);

      expect(resultA.getValue().code)
        .toBe('CUST-000001');

      expect(resultB.getValue().code)
        .toBe('CUST-000001');
    });
  },
);