import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  verifyAccessToken: vi.fn(),
  findUser: vi.fn(),
  findMemberships: vi.fn(),
  findCompany: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.cookie }) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/auth/token-service', () => ({
  createTokenService: () => ({ verifyAccessToken: mocks.verifyAccessToken }),
}));
vi.mock('@/src/infrastructure/persistence/prisma/user/PrismaUserRepository', () => ({
  PrismaUserRepository: class { findById = mocks.findUser; },
}));
vi.mock('@/features/company/infrastructure/prisma/PrismaCompanyMemberRepository', () => ({
  PrismaCompanyMemberRepository: class { findByUserId = mocks.findMemberships; },
}));
vi.mock('@/features/company/infrastructure/prisma/PrismaCompanyRepository', () => ({
  PrismaCompanyRepository: class { findById = mocks.findCompany; },
}));

import { GET as getMe } from '@/app/api/auth/me/route';
import { apiSuccess, handleApiError, withAuth, withCompanyAuth, withPlatformAdminAuth } from '@/lib/api';
import { unauthorized } from '@/lib/http/unauthorized';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockReturnValue({ value: 'access-token' });
  mocks.verifyAccessToken.mockResolvedValue({ userId: 'user-1' });
  mocks.findUser.mockResolvedValue({
    id: 'user-1', email: { value: 'owner@example.com' }, name: 'Owner', locale: 'en', isActive: true,
  });
  mocks.findMemberships.mockResolvedValue([
    { id: 'membership-1', companyId: 'tenant-a', role: 'OWNER', status: 'ACTIVE' },
  ]);
  mocks.findCompany.mockResolvedValue({ id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a', isActive: true });
  vi.stubEnv('VOKA_PLATFORM_ADMIN_USER_IDS', '');
  vi.stubEnv('VOKA_PLATFORM_ADMIN_EMAILS', '');
});

afterEach(() => vi.unstubAllEnvs());

const failures = [
  { name: 'missing access cookie', setup: () => mocks.cookie.mockReturnValue(undefined), code: 'UNAUTHORIZED', message: 'Authentication is required.' },
  { name: 'invalid or expired access token', setup: () => mocks.verifyAccessToken.mockRejectedValue(new Error('invalid token')), code: 'SESSION_INVALID_OR_EXPIRED', message: 'The authentication session is invalid or expired.' },
  { name: 'missing user', setup: () => mocks.findUser.mockResolvedValue(null), code: 'USER_UNAVAILABLE', message: 'The user account is unavailable or inactive.' },
  { name: 'inactive user', setup: () => mocks.findUser.mockResolvedValue({ isActive: false }), code: 'USER_UNAVAILABLE', message: 'The user account is unavailable or inactive.' },
];

describe.each(['auth', 'company', 'platform'] as const)('%s unauthorized response', (boundary) => {
  it.each(failures)('returns stable JSON for $name without invoking protected code', async ({ setup, code, message }) => {
    setup();
    const handler = vi.fn(() => apiSuccess({ protected: true }));
    const route = boundary === 'auth' ? withAuth(handler)
      : boundary === 'company' ? withCompanyAuth(['OWNER'], handler)
        : withPlatformAdminAuth(['OWNER'], handler);

    const response = await route(new Request('http://localhost/api/protected'));

    expect(response.status).toBe(401);
    expect(response.headers.get('Location')).toBeNull();
    expect(await response.json()).toEqual({ success: false, error: { code, message } });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.findMemberships).not.toHaveBeenCalled();
    expect(mocks.findCompany).not.toHaveBeenCalled();
    if (code === 'UNAUTHORIZED') expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
    if (code !== 'USER_UNAVAILABLE') expect(mocks.findUser).not.toHaveBeenCalled();
  });
});

describe('auth API and tenant boundary regression', () => {
  it.each(failures)('/api/auth/me preserves the error envelope for $name', async ({ setup, code, message }) => {
    setup();
    const response = await getMe(new Request('http://localhost/api/auth/me'));
    expect(response.status).toBe(401);
    expect(response.headers.get('Location')).toBeNull();
    expect(await response.json()).toEqual({ success: false, error: { code, message } });
  });

  it('passes the server-resolved tenant even when the request supplies another company', async () => {
    const handler = vi.fn((_request, _auth, company) => apiSuccess({ companyId: company.companyId }));
    const response = await withCompanyAuth(['OWNER'], handler)(new Request('http://localhost/api/protected?companyId=tenant-b'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { companyId: 'tenant-a' } });
  });

  it('retains fail-closed behavior for multiple active memberships', async () => {
    mocks.findMemberships.mockResolvedValue([
      { id: 'membership-1', companyId: 'tenant-a', role: 'OWNER', status: 'ACTIVE' },
      { id: 'membership-2', companyId: 'tenant-b', role: 'OWNER', status: 'ACTIVE' },
    ]);
    mocks.findCompany.mockImplementation(async (id) => ({ id, name: id, slug: id, isActive: true }));
    const handler = vi.fn(() => apiSuccess({ protected: true }));
    const response = await withCompanyAuth(['OWNER'], handler)(new Request('http://localhost/api/protected'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'ACTIVE_COMPANY_REQUIRED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains platform denial for an ordinary tenant OWNER', async () => {
    const handler = vi.fn(() => apiSuccess({ protected: true }));
    const response = await withPlatformAdminAuth(['OWNER'], handler)(new Request('http://localhost/api/protected'));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'PLATFORM_ADMIN_REQUIRED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([undefined, 'Please sign in again.'])('keeps helper message %s out of the machine code', (message) => {
    expect.assertions(2);
    try {
      unauthorized(message);
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED', message: message ?? 'Authentication is required.' });
      expect(handleApiError(error).status).toBe(401);
    }
  });
});
