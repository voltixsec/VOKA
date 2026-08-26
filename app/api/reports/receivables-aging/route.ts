import { apiSuccess, withCompanyAuth } from '@/lib/api';
import {
  getReceivablesAgingSnapshot,
  parseReceivablesAgingFilters,
} from '@/lib/reporting/receivables-aging';

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, _auth, company) => {
    const snapshot = await getReceivablesAgingSnapshot(
      company.companyId,
      parseReceivablesAgingFilters(request),
    );
    return apiSuccess(snapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
);
