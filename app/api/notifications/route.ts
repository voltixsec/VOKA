import { apiSuccess, withCompanyAuth } from '../../../lib/api';
import { notificationVisibility } from '../../../lib/notifications/notification-service';
import { prisma } from '../../../lib/prisma';

export const GET = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, auth, company) => {
    const requested = Number(new URL(request.url).searchParams.get('limit') ?? 20);
    const take = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 50) : 20;
    const where = notificationVisibility(company.companyId, auth.user.id);
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }], take }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return apiSuccess({ notifications, unreadCount }, { headers: { 'Cache-Control': 'private, no-store' } });
  },
);
