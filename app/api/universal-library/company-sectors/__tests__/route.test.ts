import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ roots: vi.fn(), installed: vi.fn(), replace: vi.fn() }));
vi.mock('@/lib/api', async () => {
 const { ApiError } = await import('@/lib/api/ApiError');
 const { apiSuccess } = await import('@/lib/api/ApiResponse');
 return { ApiError, apiSuccess, withCompanyAuth: (_roles: unknown, handler: Function) => (request: Request) => handler(request, {}, { companyId: 'trusted-tenant' }) };
});
vi.mock('@/features/universal-library/application/persistCompanySectors', () => ({ listGovernedRootSectors: mocks.roots, listCompanyInstalledSectors: mocks.installed, replaceCompanyInstalledSectors: mocks.replace }));
import { GET, PUT } from '../route';
describe('Company sectors API boundary', () => {
 beforeEach(() => { vi.clearAllMocks(); mocks.roots.mockResolvedValue([{ id: 'security', name: 'Security' }]); mocks.installed.mockResolvedValue([{ categoryId: 'security' }]); });
 it('reads selected sectors only for authenticated company without writes', async () => {
  const response = await GET(new Request('http://localhost/api/universal-library/company-sectors?companyId=forged'));
  expect((await response.json()).data.selected).toEqual(['security']); expect(mocks.installed).toHaveBeenCalledWith('trusted-tenant'); expect(mocks.replace).not.toHaveBeenCalled();
 });
 it('ignores forged company identity when persisting', async () => {
  mocks.replace.mockResolvedValue({ ok: true, ids: ['security'] });
  await PUT(new Request('http://localhost/api/universal-library/company-sectors', { method: 'PUT', body: JSON.stringify({ companyId: 'forged', categoryIds: ['security'] }) }));
  expect(mocks.replace).toHaveBeenCalledWith('trusted-tenant', ['security']);
 });
 it.each(['UNIVERSAL_LIBRARY_SECTOR_REQUIRED','UNIVERSAL_LIBRARY_SECTOR_LIMIT','UNIVERSAL_LIBRARY_SECTOR_INVALID'])('preserves server rejection %s', async code => {
  mocks.replace.mockResolvedValue({ ok: false, error: code });
  await expect(PUT(new Request('http://localhost/api/universal-library/company-sectors', { method: 'PUT', body: '{}' }))).rejects.toMatchObject({ code });
 });
});
