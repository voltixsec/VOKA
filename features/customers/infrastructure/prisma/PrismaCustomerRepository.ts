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
import { CustomerCodeAllocator } from './CustomerCodeAllocator';

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
  nameAr: string | null;
  nameEn: string | null;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  addressLine1Ar: string | null;
  addressLine1En: string | null;
  addressLine2: string | null;
  addressLine2Ar: string | null;
  addressLine2En: string | null;
  city: string | null;
  cityAr: string | null;
  cityEn: string | null;
  state: string | null;
  stateAr: string | null;
  stateEn: string | null;
  postalCode: string | null;
  countryCode: string | null;
  preferredLocale: string | null;
  preferredCurrency: string | null;
  creditLimit: DecimalLike | null;
  paymentTermDays: number | null;
  notes: string | null;
  notesAr: string | null;
  notesEn: string | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaCustomerRepository
  implements CustomerRepository
{
  private readonly codeAllocator: CustomerCodeAllocator;

  constructor(
    private readonly prisma: PrismaClient,
  ) {
    this.codeAllocator = new CustomerCodeAllocator(prisma);
  }

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
                  nameAr: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  nameEn: {
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
                  whatsapp: {
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
                  nameAr: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  nameEn: {
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
                  whatsapp: {
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
    let code = customer.code;
    if (!code) {
      code = await this.codeAllocator.allocateNextCode(customer.companyId);
    }

    const data = {
      companyId: customer.companyId,
      code,
      type: customer.type,
      status: customer.status,
      name: customer.name,
      nameAr: customer.nameAr,
      nameEn: customer.nameEn,
      legalName: customer.legalName,
      email: customer.email,
      phone: customer.phone,
      mobile: customer.mobile,
      whatsapp: customer.whatsapp,
      taxNumber: customer.taxNumber,
      addressLine1: customer.addressLine1,
      addressLine1Ar: customer.addressLine1Ar,
      addressLine1En: customer.addressLine1En,
      addressLine2: customer.addressLine2,
      addressLine2Ar: customer.addressLine2Ar,
      addressLine2En: customer.addressLine2En,
      city: customer.city,
      cityAr: customer.cityAr,
      cityEn: customer.cityEn,
      state: customer.state,
      stateAr: customer.stateAr,
      stateEn: customer.stateEn,
      postalCode: customer.postalCode,
      countryCode: customer.countryCode,
      preferredLocale: customer.preferredLocale,
      preferredCurrency: customer.preferredCurrency,
      creditLimit: customer.creditLimit,
      paymentTermDays: customer.paymentTermDays,
      notes: customer.notes,
      notesAr: customer.notesAr,
      notesEn: customer.notesEn,
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
        nameAr: record.nameAr,
        nameEn: record.nameEn,
        legalName: record.legalName,
        email: record.email,
        phone: record.phone,
        mobile: record.mobile,
        whatsapp: record.whatsapp,
        taxNumber: record.taxNumber,
        addressLine1: record.addressLine1,
        addressLine1Ar: record.addressLine1Ar,
        addressLine1En: record.addressLine1En,
        addressLine2: record.addressLine2,
        addressLine2Ar: record.addressLine2Ar,
        addressLine2En: record.addressLine2En,
        city: record.city,
        cityAr: record.cityAr,
        cityEn: record.cityEn,
        state: record.state,
        stateAr: record.stateAr,
        stateEn: record.stateEn,
        postalCode: record.postalCode,
        countryCode: record.countryCode,
        preferredLocale:
          record.preferredLocale as CustomerLocale | null,
        preferredCurrency: record.preferredCurrency,
        creditLimit:
          record.creditLimit?.toNumber() ?? null,
        paymentTermDays: record.paymentTermDays,
        notes: record.notes,
        notesAr: record.notesAr,
        notesEn: record.notesEn,
        isDeleted: record.isDeleted,
        deletedAt: record.deletedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}
