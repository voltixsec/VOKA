import { ApiError, apiSuccess, withCompanyAuth } from '../../../../lib/api';
import { notificationVisibility } from '../../../../lib/notifications/notification-service';
import { prisma } from '../../../../lib/prisma';

function id(request: Request) {
  return decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? '');
}

export const PATCH = withCompanyAuth(
  ['OWNER', 'ADMIN', 'SALES', 'VIEWER'],
  async (request, auth, company) => {
    const notificationId = id(request);
    const visible = await prisma.notification.findFirst({
      where: { id: notificationId, ...notificationVisibility(company.companyId, auth.user.id) },
      select: { id: true },
    });
    if (!visible) throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'Notification not found.');
    const notification = await prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
    return apiSuccess(notification, { headers: { 'Cache-Control': 'private, no-store' } });
  },
);
