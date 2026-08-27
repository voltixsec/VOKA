import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('../../../../lib/prisma', () => ({
  prisma: { notification: mocks },
}));
vi.mock('../../../../lib/api', async () => {
  const errors = await vi.importActual<typeof import('../../../../lib/api/ApiError')>('../../../../lib/api/ApiError');
  const responses = await vi.importActual<typeof import('../../../../lib/api/ApiResponse')>('../../../../lib/api/ApiResponse');
  return {
    ApiError: errors.ApiError,
    apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: unknown, handler: Function) => (request: Request) => handler(request, { user: { id: 'user-1' } }, { companyId: 'company-1' }),
  };
});

import { GET } from '../route';
import { PATCH } from '../[notificationId]/route';
import { POST as readAll } from '../read-all/route';

describe('tenant-safe notifications API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists newest visible notifications and counts unread with tenant and target-user scope', async () => {
    mocks.findMany.mockResolvedValue([]); mocks.count.mockResolvedValue(2);
    const response = await GET(new Request('http://localhost/api/notifications?limit=500'));
    expect(response.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company-1', OR: [{ targetUserId: null }, { targetUserId: 'user-1' }] },
      orderBy: [{ createdAt: 'desc' }], take: 50,
    }));
    expect(mocks.count).toHaveBeenCalledWith({ where: expect.objectContaining({ companyId: 'company-1', readAt: null }) });
  });

  it('marks one notification read only after tenant/user visibility is proven', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'n-1' }); mocks.update.mockResolvedValue({ id: 'n-1', readAt: new Date() });
    const response = await PATCH(new Request('http://localhost/api/notifications/n-1', { method: 'PATCH' }));
    expect(response.status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'n-1', companyId: 'company-1' }), select: { id: true } });
  });

  it('marks only visible unread notifications read', async () => {
    mocks.updateMany.mockResolvedValue({ count: 3 });
    const response = await readAll(new Request('http://localhost/api/notifications/read-all', { method: 'POST' }));
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: expect.objectContaining({ companyId: 'company-1', readAt: null }), data: { readAt: expect.any(Date) } });
  });
});
