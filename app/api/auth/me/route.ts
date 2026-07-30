import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { PrismaCompanyMemberRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyMemberRepository';
import { PrismaCompanyRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyRepository';
import { PrismaUserRepository } from '../../../../features/user/infrastructure/prisma/PrismaUserRepository';
import { JwtTokenService } from '../../../../features/user/infrastructure/security/JwtTokenService';
import { prisma } from '../../../../lib/prisma';

export const runtime = 'nodejs';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is missing.`,
    );
  }

  return value;
}

function createTokenService(): JwtTokenService {
  return new JwtTokenService({
    accessTokenSecret:
      getRequiredEnvironmentVariable(
        'JWT_ACCESS_SECRET',
      ),
    refreshTokenSecret:
      getRequiredEnvironmentVariable(
        'JWT_REFRESH_SECRET',
      ),
    issuer:
      process.env.JWT_ISSUER?.trim() || 'VOKA',
    audience:
      process.env.JWT_AUDIENCE?.trim() ||
      'VOKA-WEB',
    accessTokenExpiresIn: '15m',
    refreshTokenExpiresIn: '7d',
  });
}

function unauthorizedResponse(
  message = 'Authentication is required.',
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message,
      },
    },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

export async function GET(): Promise<NextResponse> {
  try {
    const cookieStore = await cookies();

    const accessToken = cookieStore.get(
      ACCESS_TOKEN_COOKIE,
    )?.value;

    if (!accessToken) {
      return unauthorizedResponse();
    }

    const tokenService = createTokenService();

    let tokenPayload;

    try {
      tokenPayload =
        await tokenService.verifyAccessToken(
          accessToken,
        );
    } catch {
      const response = unauthorizedResponse(
        'The authentication session is invalid or expired.',
      );

      response.cookies.set(
        ACCESS_TOKEN_COOKIE,
        '',
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
        },
      );

      return response;
    }

    const userRepository =
      new PrismaUserRepository(prisma);

    const companyRepository =
      new PrismaCompanyRepository(prisma);

    const companyMemberRepository =
      new PrismaCompanyMemberRepository(prisma);

    const user =
      await userRepository.findById(
        tokenPayload.userId,
      );

    if (!user || !user.isActive) {
      return unauthorizedResponse(
        'The user account is unavailable or inactive.',
      );
    }

    const companyMemberships =
      await companyMemberRepository.findByUserId(
        user.id.toString(),
      );

    const memberships =
      await Promise.all(
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

    const validMemberships =
      memberships.filter(
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

    return NextResponse.json(
      {
        data: {
          user: {
            id: user.id.toString(),
            email: user.email.value,
            name: user.name,
            locale: user.locale,
            isActive: user.isActive,
          },
          memberships: validMemberships,
          activeCompanyId,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    console.error('Current user API error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'The current user request could not be completed.',
        },
      },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}
