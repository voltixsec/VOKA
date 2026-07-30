import { NextResponse } from 'next/server';

import { PrismaCompanyMemberRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyMemberRepository';
import { PrismaCompanyRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyRepository';
import { LoginUser } from '../../../../features/user/application/commands/LoginUser';
import { PrismaUserRepository } from '../../../../features/user/infrastructure/prisma/PrismaUserRepository';
import { BCryptPasswordHasher } from '../../../../features/user/infrastructure/security/BCryptPasswordHasher';
import { JwtTokenService } from '../../../../features/user/infrastructure/security/JwtTokenService';
import { prisma } from '../../../../lib/prisma';

export const runtime = 'nodejs';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';
const REFRESH_TOKEN_COOKIE = 'voka_refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Required environment variable "${name}" is missing.`,
    );
  }

  return value;
}

function createLoginUser(): LoginUser {
  const userRepository =
    new PrismaUserRepository(prisma);

  const companyRepository =
    new PrismaCompanyRepository(prisma);

  const companyMemberRepository =
    new PrismaCompanyMemberRepository(prisma);

  const passwordHasher =
    new BCryptPasswordHasher();

  const tokenService =
    new JwtTokenService({
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

  return new LoginUser(
    userRepository,
    companyRepository,
    companyMemberRepository,
    passwordHasher,
    tokenService,
  );
}

function getErrorStatus(code: string): number {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return 401;

    case 'USER_INACTIVE':
      return 403;

    default:
      return 400;
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse> {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST_BODY',
            message:
              'The request body must contain valid JSON.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST_BODY',
            message:
              'The request body is invalid.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const input =
      body as Record<string, unknown>;

    if (
      typeof input.email !== 'string' ||
      typeof input.password !== 'string'
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_CREDENTIALS',
            message:
              'Email and password are required.',
          },
        },
        {
          status: 400,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const loginUser = createLoginUser();

    const result = await loginUser.execute({
      email: input.email,
      password: input.password,
    });

    if (!result.isSuccess) {
      const error = result.getError();

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        {
          status: getErrorStatus(error.code),
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const output = result.getValue();

    const response = NextResponse.json(
      {
        data: {
          user: output.user,
          memberships: output.memberships,
          activeCompanyId:
            output.activeCompanyId,
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );

    const secure =
      process.env.NODE_ENV === 'production';

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      output.tokens.accessToken,
      {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_TOKEN_MAX_AGE,
      },
    );

    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      output.tokens.refreshToken,
      {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_TOKEN_MAX_AGE,
      },
    );

    return response;
  } catch (error) {
    console.error('Login API error:', error);

    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message:
            'The login request could not be completed.',
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
