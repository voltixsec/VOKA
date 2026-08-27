import { NextRequest, NextResponse } from 'next/server';

import { createTokenService } from './lib/auth/token-service';

const ACCESS_TOKEN_COOKIE = 'voka_access_token';
const REFRESH_TOKEN_COOKIE = 'voka_refresh_token';

const ACCESS_TOKEN_MAX_AGE = 15 * 60;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function isAuthEndpoint(request: NextRequest): boolean {
  return request.nextUrl.pathname.startsWith('/api/auth/');
}

export async function middleware(request: NextRequest) {
  if (isAuthEndpoint(request)) {
    return NextResponse.next();
  }

  const tokenService = createTokenService();
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;

  if (accessToken) {
    try {
      await tokenService.verifyAccessToken(accessToken);
      return NextResponse.next();
    } catch {
      // A valid refresh session may recover an expired or stale access token.
    }
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return NextResponse.next();
  }

  try {
    const payload = await tokenService.verifyRefreshToken(refreshToken);
    const tokens = await tokenService.generateTokenPair({
      userId: payload.userId,
      email: payload.email,
    });

    const requestHeaders = new Headers(request.headers);
    const requestCookies = new Map(
      request.cookies.getAll().map(({ name, value }) => [name, value]),
    );

    requestCookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken);
    requestCookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken);
    requestHeaders.set(
      'cookie',
      Array.from(requestCookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join('; '),
    );

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      tokens.accessToken,
      cookieOptions(ACCESS_TOKEN_MAX_AGE),
    );
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      cookieOptions(REFRESH_TOKEN_MAX_AGE),
    );

    return response;
  } catch {
    const response = NextResponse.next();

    response.cookies.set(
      ACCESS_TOKEN_COOKIE,
      '',
      cookieOptions(0),
    );
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      '',
      cookieOptions(0),
    );

    return response;
  }
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
  ],
};
