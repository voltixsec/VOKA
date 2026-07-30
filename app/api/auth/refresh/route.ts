import type { NextRequest } from 'next/server';

import {
  ApiError,
  apiSuccess,
  handleApiError,
} from '../../../../lib/api';
import { createTokenService } from '../../../../lib/auth';

export const runtime = 'nodejs';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';
const REFRESH_TOKEN_COOKIE = 'voka_refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

export async function POST(request: NextRequest) {
  try {
    const refreshToken =
      request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

    if (!refreshToken) {
      throw new ApiError(
        401,
        'REFRESH_TOKEN_MISSING',
        'Refresh token is required.',
      );
    }

    const tokenService = createTokenService();

    let payload;

    try {
      payload = await tokenService.verifyRefreshToken(
        refreshToken,
      );
    } catch {
      throw new ApiError(
        401,
        'INVALID_REFRESH_TOKEN',
        'The refresh token is invalid or expired.',
      );
    }

    const tokens = await tokenService.generateTokenPair({
      userId: payload.userId,
      email: payload.email,
    });

    const response = apiSuccess(
      {
        refreshed: true,
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
      tokens.accessToken,
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
      tokens.refreshToken,
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
