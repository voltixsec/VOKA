import {
  DomainError,
  Entity,
  Guard,
  Result,
  UniqueEntityID,
} from '../../../../lib/core';

import { Email } from '../value-objects';

export type UserLocale = 'EN' | 'AR';

export type UserProps = {
  email: Email;
  name: string | null;
  passwordHash: string | null;
  locale: UserLocale;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserProps = {
  email: string;
  name: string;
  passwordHash: string;
  locale?: UserLocale;
};

export class User extends Entity<UserProps> {
  private constructor(
    props: UserProps,
    id?: UniqueEntityID,
  ) {
    super(props, id);
  }

  public get email(): Email {
    return this.props.email;
  }

  public get name(): string | null {
    return this.props.name;
  }

  public get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  public get locale(): UserLocale {
    return this.props.locale;
  }

  public get isActive(): boolean {
    return this.props.isActive;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public static create(
    input: CreateUserProps,
    id?: UniqueEntityID,
  ): Result<User, DomainError> {
    const name = input.name.trim();

    const nameGuard = Guard.againstEmptyString(
      name,
      'User name',
    );

    if (!nameGuard.succeeded) {
      return Result.failure(
        new DomainError(
          nameGuard.message ?? 'User name is required.',
          'INVALID_USER_NAME',
        ),
      );
    }

    const emailResult = Email.create(input.email);

    if (!emailResult.isSuccess) {
      return Result.failure(emailResult.getError());
    }

    const passwordHash = input.passwordHash.trim();

    const passwordGuard = Guard.againstEmptyString(
      passwordHash,
      'Password hash',
    );

    if (!passwordGuard.succeeded) {
      return Result.failure(
        new DomainError(
          passwordGuard.message ??
            'Password hash is required.',
          'INVALID_PASSWORD_HASH',
        ),
      );
    }

    const now = new Date();

    return Result.success(
      new User(
        {
          email: emailResult.getValue(),
          name,
          passwordHash,
          locale: input.locale ?? 'EN',
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        id,
      ),
    );
  }

  public static restore(
    props: UserProps,
    id: UniqueEntityID,
  ): User {
    return new User(props, id);
  }

  public rename(
    name: string,
  ): Result<void, DomainError> {
    const normalizedName = name.trim();

    const guard = Guard.againstEmptyString(
      normalizedName,
      'User name',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ?? 'User name is required.',
          'INVALID_USER_NAME',
        ),
      );
    }

    this.props.name = normalizedName;
    this.touch();

    return Result.success(undefined);
  }

  public changeEmail(
    email: string,
  ): Result<void, DomainError> {
    const emailResult = Email.create(email);

    if (!emailResult.isSuccess) {
      return Result.failure(emailResult.getError());
    }

    this.props.email = emailResult.getValue();
    this.touch();

    return Result.success(undefined);
  }

  public changePasswordHash(
    passwordHash: string,
  ): Result<void, DomainError> {
    const normalizedHash = passwordHash.trim();

    const guard = Guard.againstEmptyString(
      normalizedHash,
      'Password hash',
    );

    if (!guard.succeeded) {
      return Result.failure(
        new DomainError(
          guard.message ??
            'Password hash is required.',
          'INVALID_PASSWORD_HASH',
        ),
      );
    }

    this.props.passwordHash = normalizedHash;
    this.touch();

    return Result.success(undefined);
  }

  public changeLocale(locale: UserLocale): void {
    this.props.locale = locale;
    this.touch();
  }

  public activate(): void {
    this.props.isActive = true;
    this.touch();
  }

  public deactivate(): void {
    this.props.isActive = false;
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
