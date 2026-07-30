import type { PrismaClient } from '../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../lib/core';
import {
  Customer,
  type CustomerLocale,
  type CustomerStatus,
  type CustomerType,
} from '../../domain/entities';
import type {
  CustomerListFilters,
  CustomerRepository,
} from '../../domain/repositories';

type DecimalLike = {
  toNumber(): number;
};

type CustomerRecord = {
  id: string;
  companyId: string;
  code: string;
  type: string;
  status: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  preferredLocale: string | null;
  preferredCurrency: string | null;
  creditLimit: DecimalLike | null;
  paymentTermDays: number | null;
  notes: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaCustomerRepository
  implements CustomerRepository
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findById(
    id: string,
  ): Promise<Customer | null> {
    const record = await this.prisma.customer.findFirst({
      where: {
        id,
        isDeleted: false,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<Customer | null> {
    const record = await this.prisma.customer.findFirst({
      where: {
        id,
        companyId,
        isDeleted: false,
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByCode(
    companyId: string,
    code: string,
  ): Promise<Customer | null> {
    const record = await this.prisma.customer.findUnique({
      where: {
        companyId_code: {
          companyId,
          code: code.trim().toUpperCase(),
        },
      },
    });

    if (!record || record.isDeleted) {
      return null;
    }

    return this.toDomain(record);
  }

  public async findAll(
    filters: CustomerListFilters,
  ): Promise<Customer[]> {
    const search = filters.search?.trim();

    const records = await this.prisma.customer.findMany({
      where: {
        companyId: filters.companyId,
        isDeleted: filters.includeDeleted
          ? undefined
          : false,
        status: filters.status,
        type: filters.type,
        ...(search
          ? {
              OR: [
                {
                  code: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  legalName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  mobile: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  taxNumber: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          name: 'asc',
        },
      ],
      skip: filters.skip,
      take: filters.take,
    });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async count(
    filters: CustomerListFilters,
  ): Promise<number> {
    const search = filters.search?.trim();

    return this.prisma.customer.count({
      where: {
        companyId: filters.companyId,
        isDeleted: filters.includeDeleted
          ? undefined
          : false,
        status: filters.status,
        type: filters.type,
        ...(search
          ? {
              OR: [
                {
                  code: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  name: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  legalName: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  email: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  phone: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  mobile: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  taxNumber: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
              ],
            }
          : {}),
      },
    });
  }

  public async save(
    customer: Customer,
  ): Promise<Customer> {
    const data = {
      companyId: customer.companyId,
      code: customer.code,
      type: customer.type,
      status: customer.status,
      name: customer.name,
      legalName: customer.legalName,
      email: customer.email,
      phone: customer.phone,
      mobile: customer.mobile,
      taxNumber: customer.taxNumber,
      addressLine1: customer.addressLine1,
      addressLine2: customer.addressLine2,
      city: customer.city,
      state: customer.state,
      postalCode: customer.postalCode,
      countryCode: customer.countryCode,
      preferredLocale: customer.preferredLocale,
      preferredCurrency: customer.preferredCurrency,
      creditLimit: customer.creditLimit,
      paymentTermDays: customer.paymentTermDays,
      notes: customer.notes,
      isDeleted: customer.isDeleted,
      deletedAt: customer.deletedAt,
      updatedAt: customer.updatedAt,
    };

    const record = await this.prisma.customer.upsert({
      where: {
        id: customer.id.toString(),
      },
      create: {
        id: customer.id.toString(),
        ...data,
        createdAt: customer.createdAt,
      },
      update: data,
    });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.customer.delete({
      where: {
        id,
      },
    });
  }

  public async deleteByIdAndCompanyId(
    id: string,
    companyId: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.customer.updateMany({
      where: {
        id,
        companyId,
        isDeleted: false,
      },
      data: {
        isDeleted: true,
        deletedAt: now,
        updatedAt: now,
      },
    });
  }

  private toDomain(
    record: CustomerRecord,
  ): Customer {
    return Customer.restore(
      {
        companyId: record.companyId,
        code: record.code,
        type: record.type as CustomerType,
        status: record.status as CustomerStatus,
        name: record.name,
        legalName: record.legalName,
        email: record.email,
        phone: record.phone,
        mobile: record.mobile,
        taxNumber: record.taxNumber,
        addressLine1: record.addressLine1,
        addressLine2: record.addressLine2,
        city: record.city,
        state: record.state,
        postalCode: record.postalCode,
        countryCode: record.countryCode,
        preferredLocale:
          record.preferredLocale as CustomerLocale | null,
        preferredCurrency: record.preferredCurrency,
        creditLimit:
          record.creditLimit?.toNumber() ?? null,
        paymentTermDays: record.paymentTermDays,
        notes: record.notes,
        isDeleted: record.isDeleted,
        deletedAt: record.deletedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}
