import type { PrismaClient } from '../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../lib/core';
import {
  Company,
  type CompanyLocale,
} from '../../domain/entities';
import type { CompanyRepository } from '../../domain/repositories';

type CompanyRecord = {
  id: string;
  name: string;
  slug: string;
  defaultLocale: string;
  defaultCurrency: string;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaCompanyRepository
  implements CompanyRepository
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findById(
    id: string,
  ): Promise<Company | null> {
    const record = await this.prisma.company.findUnique({
      where: { id },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findBySlug(
    slug: string,
  ): Promise<Company | null> {
    const record = await this.prisma.company.findUnique({
      where: { slug },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findAllActive(): Promise<Company[]> {
    const records = await this.prisma.company.findMany({
      where: {
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async save(
    company: Company,
  ): Promise<Company> {
    const data = {
      name: company.name,
      slug: company.slug,
      defaultLocale: company.defaultLocale,
      defaultCurrency: company.defaultCurrency,
      timezone: company.timezone,
      isActive: company.isActive,
      updatedAt: company.updatedAt,
    };

    const record = await this.prisma.company.upsert({
      where: {
        id: company.id.toString(),
      },
      create: {
        id: company.id.toString(),
        ...data,
        createdAt: company.createdAt,
      },
      update: data,
    });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.company.delete({
      where: { id },
    });
  }

  private toDomain(
    record: CompanyRecord,
  ): Company {
    return Company.restore(
      {
        name: record.name,
        slug: record.slug,
        defaultLocale:
          record.defaultLocale as CompanyLocale,
        defaultCurrency: record.defaultCurrency,
        timezone: record.timezone,
        isActive: record.isActive,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}