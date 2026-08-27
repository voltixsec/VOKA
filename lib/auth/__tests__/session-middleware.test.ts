import { NextRequest } from 'next/server';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JwtTokenService } from '../../../features/user/infrastructure/security/JwtTokenService';
import { middleware } from '../../../middleware';

const ACCESS_SECRET = 'test-access-secret-with-sufficient-entropy';
const REFRESH_SECRET = 'test-refresh-secret-with-sufficient-entropy';

function tokenService(accessTokenExpiresIn = '15m') {
  return new JwtTokenService({
    accessTokenSecret: ACCESS_SECRET,
    refreshTokenSecret: REFRESH_SECRET,
    issuer: 'VOKA',
    audience: 'VOKA-WEB',
    accessTokenExpiresIn,
    refreshTokenExpiresIn: '7d',
  });
}

describe('session refresh middleware', () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
    process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
    process.env.JWT_ISSUER = 'VOKA';
    process.env.JWT_AUDIENCE = 'VOKA-WEB';
  });

  afterEach(() => {
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it('refreshes an expired access credential and forwards the valid credential to the protected request', async () => {
    const expiredTokens = await tokenService('0s').generateTokenPair({
      userId: 'user-1',
      email: 'user@example.com',
    });
    const request = new NextRequest('http://localhost/api/customers', {
      headers: {
        cookie: [
          `voka_access_token=${expiredTokens.accessToken}`,
          `voka_refresh_token=${expiredTokens.refreshToken}`,
        ].join('; '),
      },
    });

    const response = await middleware(request);
    const refreshedAccess = response.cookies.get('voka_access_token')?.value;

    expect(refreshedAccess).toBeTruthy();
    expect(response.cookies.get('voka_refresh_token')?.value).toBeTruthy();
    await expect(tokenService().verifyAccessToken(refreshedAccess!)).resolves.toMatchObject({
      userId: 'user-1',
      email: 'user@example.com',
      type: 'access',
    });
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      `voka_access_token=${refreshedAccess}`,
    );
  });

  it('recovers when the browser has already removed the expired access cookie', async () => {
    const tokens = await tokenService().generateTokenPair({
      userId: 'user-1',
      email: 'user@example.com',
    });
    const response = await middleware(
      new NextRequest('http://localhost/api/invoices', {
        headers: {
          cookie: `voka_refresh_token=${tokens.refreshToken}`,
        },
      }),
    );

    const refreshedAccess = response.cookies.get('voka_access_token')?.value;
    expect(refreshedAccess).toBeTruthy();
    await expect(tokenService().verifyAccessToken(refreshedAccess!)).resolves.toMatchObject({
      userId: 'user-1',
      type: 'access',
    });
    expect(response.headers.get('x-middleware-request-cookie')).toContain(
      `voka_access_token=${refreshedAccess}`,
    );
  });

  it('does not rotate a still-valid access session', async () => {
    const tokens = await tokenService().generateTokenPair({
      userId: 'user-1',
      email: 'user@example.com',
    });
    const response = await middleware(
      new NextRequest('http://localhost/dashboard/invoices/new', {
        headers: {
          cookie: [
            `voka_access_token=${tokens.accessToken}`,
            `voka_refresh_token=${tokens.refreshToken}`,
          ].join('; '),
        },
      }),
    );

    expect(response.cookies.get('voka_access_token')).toBeUndefined();
    expect(response.cookies.get('voka_refresh_token')).toBeUndefined();
  });

  it('clears invalid session cookies without forwarding an invalid credential', async () => {
    const response = await middleware(
      new NextRequest('http://localhost/api/customers', {
        headers: {
          cookie: 'voka_access_token=stale; voka_refresh_token=invalid',
        },
      }),
    );

    expect(response.cookies.get('voka_access_token')?.value).toBe('');
    expect(response.cookies.get('voka_refresh_token')?.value).toBe('');
    expect(response.headers.get('x-middleware-request-cookie')).toBeNull();
  });

  it('does not intercept explicit auth endpoints such as logout', async () => {
    const response = await middleware(
      new NextRequest('http://localhost/api/auth/logout', {
        headers: { cookie: 'voka_refresh_token=invalid' },
      }),
    );

    expect(response.cookies.getAll()).toHaveLength(0);
  });
});
