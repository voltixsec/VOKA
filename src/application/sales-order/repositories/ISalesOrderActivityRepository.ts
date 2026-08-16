import type { SalesOrderActivity } from "@/src/domain/sales-order";

export interface ISalesOrderActivityRepository {
  save(activity: SalesOrderActivity): Promise<SalesOrderActivity>;
  listBySalesOrderId(
    companyId: string,
    salesOrderId: string,
  ): Promise<SalesOrderActivity[]>;
}
