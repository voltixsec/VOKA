import { apiSuccess, withCompanyAuth } from '../../../../lib/api';
import { notificationVisibility } from '../../../../lib/notifications/notification-service';
import { prisma } from '../../../../lib/prisma';

export const POST = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (_request, auth, company) => {
    const result = await prisma.notification.updateMany({
      where: { ...notificationVisibility(company.companyId, auth.user.id), readAt: null },
      data: { readAt: new Date() },
    });
    return apiSuccess({ updatedCount: result.count }, { headers: { 'Cache-Control': 'private, no-store' } });
  },
);
