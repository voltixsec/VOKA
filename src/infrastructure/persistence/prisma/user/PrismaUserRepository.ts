import type { PrismaClient } from '../../../../../lib/generated/prisma/client';
import { UniqueEntityID } from '../../../../../lib/core';

import {
  Email,
  User,
  type UserLocale,
} from '../../../../domain/user';

import type { UserRepository } from '../../../../domain/user/repositories';

type UserRecord = {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  locale: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export class PrismaUserRepository
  implements UserRepository
{
  constructor(
    private readonly prisma: PrismaClient,
  ) {}

  public async findById(
    id: string,
  ): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });

    return record ? this.toDomain(record) : null;
  }

  public async findByEmail(
    email: string,
  ): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: {
        email: email.trim().toLowerCase(),
      },
    });

    return record ? this.toDomain(record) : null;
  }

  public async save(user: User): Promise<User> {
    const data = {
      email: user.email.value,
      name: user.name,
      passwordHash: user.passwordHash,
      locale: user.locale,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    };

    const record = await this.prisma.user.upsert({
      where: {
        id: user.id.toString(),
      },
      create: {
        id: user.id.toString(),
        ...data,
        createdAt: user.createdAt,
      },
      update: data,
    });

    return this.toDomain(record);
  }

  public async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  private toDomain(record: UserRecord): User {
    const emailResult = Email.create(record.email);

    if (!emailResult.isSuccess) {
      throw emailResult.getError();
    }

    return User.restore(
      {
        email: emailResult.getValue(),
        name: record.name,
        passwordHash: record.passwordHash,
        locale: record.locale as UserLocale,
        isActive: record.isActive,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      new UniqueEntityID(record.id),
    );
  }
}
