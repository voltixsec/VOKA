import type { SalesOrderActivity } from "@/src/domain/sales-order";

export type SerializedSalesOrderActivity = {
  id: string;
  salesOrderId: string;
  body: string;
  actor: {
    userId: string | null;
    name: string;
    role: string;
  };
  createdAt: string;
};

export function serializeSalesOrderActivity(
  activity: SalesOrderActivity,
): SerializedSalesOrderActivity {
  return {
    id: activity.id!,
    salesOrderId: activity.salesOrderId,
    body: activity.body,
    actor: {
      userId: activity.actorUserId,
      name: activity.actorName,
      role: activity.actorRole,
    },
    createdAt: activity.createdAt.toISOString(),
  };
}
