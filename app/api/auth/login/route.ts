import { PrismaCompanyMemberRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyMemberRepository';
import { PrismaCompanyRepository } from '../../../../features/company/infrastructure/prisma/PrismaCompanyRepository';
import { LoginUser } from '../../../../features/user/application/commands/LoginUser';
import { PrismaUserRepository } from '../../../../features/user/infrastructure/prisma/PrismaUserRepository';
import { BCryptPasswordHasher } from '../../../../features/user/infrastructure/security/BCryptPasswordHasher';
import {
  ApiError,
  apiSuccess,
  handleApiError,
} from '../../../../lib/api';
import { createTokenService } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

export const runtime = 'nodejs';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';
const REFRESH_TOKEN_COOKIE = 'voka_refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

type LoginRequestBody = {
  email: string;
  password: string;
};

function createLoginUser(): LoginUser {
  return new LoginUser(
    new PrismaUserRepository(prisma),
    new PrismaCompanyRepository(prisma),
    new PrismaCompanyMemberRepository(prisma),
    new BCryptPasswordHasher(),
    createTokenService(),
  );
}

async function parseLoginRequest(
  request: Request,
): Promise<LoginRequestBody> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new ApiError(
      400,
      'INVALID_REQUEST_BODY',
      'The request body must contain valid JSON.',
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    throw new ApiError(
      400,
      'INVALID_REQUEST_BODY',
      'The request body is invalid.',
    );
  }

  const input = body as Record<string, unknown>;

  if (
    typeof input.email !== 'string' ||
    typeof input.password !== 'string' ||
    input.email.trim() === '' ||
    input.password === ''
  ) {
    throw new ApiError(
      400,
      'INVALID_CREDENTIALS',
      'Email and password are required.',
    );
  }

  return {
    email: input.email.trim(),
    password: input.password,
  };
}

function mapLoginError(
  code: string,
  message: string,
): ApiError {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return new ApiError(401, code, message);

    case 'USER_INACTIVE':
      return new ApiError(403, code, message);

    default:
      return new ApiError(400, code, message);
  }
}

export async function POST(request: Request) {
  try {
    const input = await parseLoginRequest(request);

    const result = await createLoginUser().execute(input);

    if (!result.isSuccess) {
      const error = result.getError();

      throw mapLoginError(
        error.code,
        error.message,
      );
    }

    const output = result.getValue();

    const response = apiSuccess(
      {
        user: output.user,
        memberships: output.memberships,
        activeCompanyId: output.activeCompanyId,
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
    return handleApiError(error);
  }
}
