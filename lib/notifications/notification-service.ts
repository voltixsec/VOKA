import type { PrismaClient } from '../generated/prisma/client';

export async function createNotification(
  prisma: PrismaClient,
  input: {
    companyId: string;
    targetUserId?: string | null;
    type: string;
    titleAr: string;
    titleEn: string;
    messageAr: string;
    messageEn: string;
    href?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    dedupeKey: string;
  },
) {
  return prisma.notification.upsert({
    where: { companyId_dedupeKey: { companyId: input.companyId, dedupeKey: input.dedupeKey } },
    create: input,
    update: {},
  });
}

export function notificationVisibility(companyId: string, userId: string) {
  return {
    companyId,
    OR: [{ targetUserId: null }, { targetUserId: userId }],
  };
}
