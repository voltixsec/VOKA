import { prisma } from "@/lib/prisma";
import type { ISalesOrderActivityRepository } from "@/src/application/sales-order";
import { SalesOrderActivity } from "@/src/domain/sales-order";

export class PrismaSalesOrderActivityRepository
  implements ISalesOrderActivityRepository {
  constructor(private readonly db = prisma) {}

  async save(activity: SalesOrderActivity): Promise<SalesOrderActivity> {
    const record = await this.db.salesOrderActivity.create({
      data: {
        companyId: activity.companyId,
        salesOrderId: activity.salesOrderId,
        body: activity.body,
        actorUserId: activity.actorUserId,
        actorName: activity.actorName,
        actorRole: activity.actorRole,
        createdAt: activity.createdAt,
      },
    });

    return SalesOrderActivity.restore({
      id: record.id,
      companyId: record.companyId,
      salesOrderId: record.salesOrderId,
      body: record.body,
      actorUserId: record.actorUserId,
      actorName: record.actorName,
      actorRole: record.actorRole,
      createdAt: record.createdAt,
    });
  }

  async listBySalesOrderId(
    companyId: string,
    salesOrderId: string,
  ): Promise<SalesOrderActivity[]> {
    const records = await this.db.salesOrderActivity.findMany({
      where: {
        companyId,
        salesOrderId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return records.map((record) =>
      SalesOrderActivity.restore({
        id: record.id,
        companyId: record.companyId,
        salesOrderId: record.salesOrderId,
        body: record.body,
        actorUserId: record.actorUserId,
        actorName: record.actorName,
        actorRole: record.actorRole,
        createdAt: record.createdAt,
      }),
    );
  }
}
