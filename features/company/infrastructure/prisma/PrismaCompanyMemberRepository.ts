import type { PrismaClient } from '../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../lib/core';

import {
  CompanyMember,
  type CompanyRole,
  type MembershipStatus,
} from '../../domain/entities';

import type { CompanyMemberRepository } from '../../domain/repositories';

type CompanyMemberRecord = {
  id: string;
  companyId: string;
  userId: string;
  role: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaCompanyMemberRepository
  implements CompanyMemberRepository
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findById(
    id: string,
  ): Promise<CompanyMember | null> {
    const record =
      await this.prisma.companyMember.findUnique({
        where: { id },
      });

    return record ? this.toDomain(record) : null;
  }

  public async findByCompanyAndUser(
    companyId: string,
    userId: string,
  ): Promise<CompanyMember | null> {
    const record =
      await this.prisma.companyMember.findUnique({
        where: {
          companyId_userId: {
            companyId: companyId.trim(),
            userId: userId.trim(),
          },
        },
      });

    return record ? this.toDomain(record) : null;
  }

  public async findByCompanyId(
    companyId: string,
  ): Promise<CompanyMember[]> {
    const records =
      await this.prisma.companyMember.findMany({
        where: {
          companyId: companyId.trim(),
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async findByUserId(
    userId: string,
  ): Promise<CompanyMember[]> {
    const records =
      await this.prisma.companyMember.findMany({
        where: {
          userId: userId.trim(),
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async findByCompanyAndRole(
    companyId: string,
    role: CompanyRole,
  ): Promise<CompanyMember[]> {
    const records =
      await this.prisma.companyMember.findMany({
        where: {
          companyId: companyId.trim(),
          role,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async findByCompanyAndStatus(
    companyId: string,
    status: MembershipStatus,
  ): Promise<CompanyMember[]> {
    const records =
      await this.prisma.companyMember.findMany({
        where: {
          companyId: companyId.trim(),
          status,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

    return records.map((record) =>
      this.toDomain(record),
    );
  }

  public async save(
    member: CompanyMember,
  ): Promise<CompanyMember> {
    const data = {
      companyId: member.companyId,
      userId: member.userId,
      role: member.role,
      status: member.status,
      updatedAt: member.updatedAt,
    };

    const record =
      await this.prisma.companyMember.upsert({
        where: {
          id: member.id.toString(),
        },
        create: {
          id: member.id.toString(),
          ...data,
          createdAt: member.createdAt,
        },
        update: data,
      });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.companyMember.delete({
      where: { id },
    });
  }

  private toDomain(
    record: CompanyMemberRecord,
  ): CompanyMember {
    return CompanyMember.restore(
      {
        companyId: record.companyId,
        userId: record.userId,
        role: record.role as CompanyRole,
        status:
          record.status as MembershipStatus,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}
