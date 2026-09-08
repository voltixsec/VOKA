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

function isProtectedDashboardPath(pathname: string): boolean {
  return (
    pathname === '/dashboard' ||
    pathname.startsWith('/dashboard/')
  );
}

// The App Router dashboard layout cannot reliably read the requested sub-path,
// so middleware records it as an x-pathname header for the server auth gate.
// The header is only ever consumed by sanitizeReturnTo() as a safe /dashboard
// fallback, never echoed back to the client. Non-dashboard requests are passed
// through untouched (no request-header override).
function withRequestPathnameHeader(
  request: NextRequest,
): NextResponse {
  if (
    !isProtectedDashboardPath(
      request.nextUrl.pathname,
    )
  ) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);

  requestHeaders.set(
    'x-pathname',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
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
      return withRequestPathnameHeader(request);
    } catch {
      // A valid refresh session may recover an expired or stale access token.
    }
  }

  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;

  if (!refreshToken) {
    return withRequestPathnameHeader(request);
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

    if (isProtectedDashboardPath(request.nextUrl.pathname)) {
      requestHeaders.set(
        'x-pathname',
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      );
    }

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
    const response = withRequestPathnameHeader(request);

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
