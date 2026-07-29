import {
  DomainError,
  Guard,
  Result,
  type Service,
} from '../../../../lib/core';

import {
  User,
  type UserLocale,
} from '../../domain/entities';

import type { UserRepository } from '../../domain/repositories';
import type { PasswordHasher } from '../ports';

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  locale?: UserLocale;
};

export class CreateUser
  implements
    Service<CreateUserInput, Result<User, DomainError>>
{
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
  ) {}

  public async execute(
    input: CreateUserInput,
  ): Promise<Result<User, DomainError>> {
    const password = input.password.trim();

    const passwordGuard = Guard.againstEmptyString(
      password,
      'Password',
    );

    if (!passwordGuard.succeeded) {
      return Result.failure(
        new DomainError(
          passwordGuard.message ?? 'Password is required.',
          'INVALID_PASSWORD',
        ),
      );
    }

    if (password.length < 8) {
      return Result.failure(
        new DomainError(
          'Password must contain at least 8 characters.',
          'PASSWORD_TOO_SHORT',
        ),
      );
    }

    const normalizedEmail =
      input.email.trim().toLowerCase();

    const existingUser =
      await this.userRepository.findByEmail(
        normalizedEmail,
      );

    if (existingUser) {
      return Result.failure(
        new DomainError(
          'A user with this email already exists.',
          'USER_EMAIL_ALREADY_EXISTS',
        ),
      );
    }

    const passwordHash =
      await this.passwordHasher.hash(password);

    const userResult = User.create({
      email: normalizedEmail,
      name: input.name,
      passwordHash,
      locale: input.locale,
    });

    if (!userResult.isSuccess) {
      return Result.failure(userResult.getError());
    }

    const savedUser = await this.userRepository.save(
      userResult.getValue(),
    );

    return Result.success(savedUser);
  }
}
