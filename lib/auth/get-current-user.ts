import { cookies } from 'next/headers';

import { PrismaCompanyMemberRepository } from '../../features/company/infrastructure/prisma/PrismaCompanyMemberRepository';
import { PrismaCompanyRepository } from '../../features/company/infrastructure/prisma/PrismaCompanyRepository';
import { PrismaUserRepository } from '../../features/user/infrastructure/prisma/PrismaUserRepository';
import type { AuthContext } from '../../types/auth';
import { ApiError } from '../api';
import { prisma } from '../prisma';
import { createTokenService } from './token-service';

export const ACCESS_TOKEN_COOKIE =
  'voka_access_token';

export async function getCurrentUser(): Promise<AuthContext> {
  const cookieStore = await cookies();

  const accessToken = cookieStore.get(
    ACCESS_TOKEN_COOKIE,
  )?.value;

  if (!accessToken) {
    throw ApiError.unauthorized(
      'Authentication is required.',
    );
  }

  const tokenService = createTokenService();

  let tokenPayload;

  try {
    tokenPayload =
      await tokenService.verifyAccessToken(
        accessToken,
      );
  } catch {
    throw ApiError.unauthorized(
      'The authentication session is invalid or expired.',
    );
  }

  const userRepository =
    new PrismaUserRepository(prisma);

  const companyRepository =
    new PrismaCompanyRepository(prisma);

  const companyMemberRepository =
    new PrismaCompanyMemberRepository(prisma);

  const user = await userRepository.findById(
    tokenPayload.userId,
  );

  if (!user || !user.isActive) {
    throw ApiError.unauthorized(
      'The user account is unavailable or inactive.',
    );
  }

  const companyMemberships =
    await companyMemberRepository.findByUserId(
      user.id.toString(),
    );

  const memberships = await Promise.all(
    companyMemberships.map(
      async (membership) => {
        const company =
          await companyRepository.findById(
            membership.companyId,
          );

        if (!company) {
          return null;
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

  const validMemberships = memberships.filter(
    (
      membership,
    ): membership is NonNullable<
      typeof membership
    > => membership !== null,
  );

  const activeMemberships =
    validMemberships.filter(
      (membership) =>
        membership.status === 'ACTIVE' &&
        membership.company.isActive,
    );

  const activeCompanyId =
    activeMemberships.length === 1
      ? activeMemberships[0].company.id
      : null;

  return {
    user: {
      id: user.id.toString(),
      email: user.email.value,
      name: user.name,
      locale: user.locale,
      isActive: user.isActive,
    },
    memberships: validMemberships,
    activeCompanyId,
  };
}
