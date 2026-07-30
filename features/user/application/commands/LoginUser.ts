import {
  DomainError,
  Guard,
  Result,
  type Service,
} from '../../../../lib/core';

import type {
  CompanyMemberRepository,
  CompanyRepository,
} from '../../../company/domain/repositories';

import type {
  CompanyRole,
  MembershipStatus,
} from '../../../company/domain/entities';

import type { UserRepository } from '../../domain';

import type {
  AuthTokenPair,
  PasswordHasher,
  TokenService,
} from '../ports';

export type LoginUserInput = {
  email: string;
  password: string;
};

export type LoginUserMembership = {
  membershipId: string;
  company: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
  };
  role: CompanyRole;
  status: MembershipStatus;
};

export type LoginUserOutput = {
  user: {
    id: string;
    email: string;
    name: string | null;
    locale: 'EN' | 'AR';
  };
  memberships: LoginUserMembership[];
  activeCompanyId: string | null;
  tokens: AuthTokenPair;
};

export class LoginUser
  implements
    Service<
      LoginUserInput,
      Result<LoginUserOutput, DomainError>
    >
{
  constructor(
    private readonly userRepository: UserRepository,
    private readonly companyRepository: CompanyRepository,
    private readonly companyMemberRepository: CompanyMemberRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
  ) {}

  public async execute(
    input: LoginUserInput,
  ): Promise<Result<LoginUserOutput, DomainError>> {
    const normalizedEmail =
      input.email.trim().toLowerCase();

    const emailGuard = Guard.againstEmptyString(
      normalizedEmail,
      'Email',
    );

    if (!emailGuard.succeeded) {
      return Result.failure(
        new DomainError(
          emailGuard.message ?? 'Email is required.',
          'INVALID_CREDENTIALS',
        ),
      );
    }

    const password = input.password.trim();

    const passwordGuard = Guard.againstEmptyString(
      password,
      'Password',
    );

    if (!passwordGuard.succeeded) {
      return Result.failure(
        new DomainError(
          passwordGuard.message ?? 'Password is required.',
          'INVALID_CREDENTIALS',
        ),
      );
    }

    const user =
      await this.userRepository.findByEmail(
        normalizedEmail,
      );

    if (!user || !user.passwordHash) {
      return Result.failure(
        new DomainError(
          'The email or password is incorrect.',
          'INVALID_CREDENTIALS',
        ),
      );
    }

    if (!user.isActive) {
      return Result.failure(
        new DomainError(
          'This user account is inactive.',
          'USER_INACTIVE',
        ),
      );
    }

    const passwordMatches =
      await this.passwordHasher.compare(
        password,
        user.passwordHash,
      );

    if (!passwordMatches) {
      return Result.failure(
        new DomainError(
          'The email or password is incorrect.',
          'INVALID_CREDENTIALS',
        ),
      );
    }

    const companyMemberships =
      await this.companyMemberRepository.findByUserId(
        user.id.toString(),
      );

    const memberships =
      await Promise.all(
        companyMemberships.map(
          async (
            membership,
          ): Promise<LoginUserMembership> => {
            const company =
              await this.companyRepository.findById(
                membership.companyId,
              );

            if (!company) {
              throw new Error(
                `Company ${membership.companyId} was not found for membership ${membership.id.toString()}.`,
              );
            }

            return {
              membershipId:
                membership.id.toString(),
              company: {
                id: company.id.toString(),
                name: company.name,
                slug: company.slug,
                isActive: company.isActive,
              },
              role: membership.role,
              status: membership.status,
            };
          },
        ),
      );

    const activeMemberships =
      memberships.filter(
        (membership) =>
          membership.status === 'ACTIVE' &&
          membership.company.isActive,
      );

    const activeCompanyId =
      activeMemberships.length === 1
        ? activeMemberships[0].company.id
        : null;

    const tokens =
      await this.tokenService.generateTokenPair({
        userId: user.id.toString(),
        email: user.email.value,
      });

    return Result.success({
      user: {
        id: user.id.toString(),
        email: user.email.value,
        name: user.name,
        locale: user.locale,
      },
      memberships,
      activeCompanyId,
      tokens,
    });
  }
}
