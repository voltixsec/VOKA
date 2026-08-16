import type { PrismaClient } from '../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../lib/core';
import { Unit } from '../../domain/entities/Unit';
import type {
  UnitListFilters,
  UnitRepository,
} from '../../domain/repositories/UnitRepository';

type UnitRecord = {
  id: string;
  companyId: string | null;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  symbol: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaUnitRepository implements UnitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: string, companyId: string): Promise<Unit | null> {
    const record = await this.prisma.unit.findFirst({
      where: {
        id,
        OR: [
          { companyId },
          { companyId: null },
        ],
      },
    });
    return record ? this.toDomain(record) : null;
  }

  public async findBySymbol(companyId: string, symbol: string): Promise<Unit | null> {
    const normalizedSymbol = symbol.trim();
    if (!normalizedSymbol) {
      return null;
    }

    // Stage 1: Explicit lookup for tenant-owned Unit
    const tenantRecord = await this.prisma.unit.findFirst({
      where: {
        companyId,
        symbol: normalizedSymbol,
      },
    });

    if (tenantRecord) {
      return this.toDomain(tenantRecord);
    }

    // Stage 2: Fallback lookup for shared system Unit (companyId IS NULL)
    const sharedRecord = await this.prisma.unit.findFirst({
      where: {
        companyId: null,
        symbol: normalizedSymbol,
      },
    });

    return sharedRecord ? this.toDomain(sharedRecord) : null;
  }

  public async findAll(filters?: UnitListFilters): Promise<Unit[]> {
    const companyId = filters?.companyId;

    const records = await this.prisma.unit.findMany({
      where: {
        ...(filters?.isActive === undefined ? {} : { isActive: filters.isActive }),
        ...(companyId
          ? {
              OR: [
                { companyId },
                { companyId: null },
              ],
            }
          : {}),
      },
      orderBy: [
        { name: 'asc' },
      ],
    });

    return records.map((record) => this.toDomain(record));
  }

  public async save(unit: Unit): Promise<Unit> {
    const data = {
      companyId: unit.companyId,
      name: unit.name,
      nameAr: unit.nameAr,
      nameEn: unit.nameEn,
      symbol: unit.symbol,
      isActive: unit.isActive,
      updatedAt: unit.updatedAt,
    };

    const record = await this.prisma.unit.upsert({
      where: { id: unit.id.toString() },
      create: {
        id: unit.id.toString(),
        ...data,
        createdAt: unit.createdAt,
      },
      update: data,
    });

    return this.toDomain(record);
  }

  private toDomain(record: UnitRecord): Unit {
    return Unit.restore(
      {
        companyId: record.companyId,
        name: record.name,
        nameAr: record.nameAr,
        nameEn: record.nameEn,
        symbol: record.symbol,
        isActive: record.isActive,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}
