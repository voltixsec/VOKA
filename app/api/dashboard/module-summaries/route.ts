import { apiSuccess, withCompanyAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { getCommercialMetricsSnapshot } from '@/lib/reporting/commercial-metrics';

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (_request, _auth, company) => {
    const snapshot = await getCommercialMetricsSnapshot(prisma, company.companyId);
    return apiSuccess(snapshot.modules, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
);
