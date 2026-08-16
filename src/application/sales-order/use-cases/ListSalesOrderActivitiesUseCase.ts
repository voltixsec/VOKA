import type { SalesOrderActivity } from "@/src/domain/sales-order";
import type { ISalesOrderActivityRepository } from "../repositories/ISalesOrderActivityRepository";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type ListSalesOrderActivitiesInput = {
  companyId: string;
  salesOrderId: string;
};

export type ListSalesOrderActivitiesResult =
  | { success: true; data: SalesOrderActivity[] }
  | {
      success: false;
      error: {
        code: "SALES_ORDER_NOT_FOUND";
        message: string;
      };
    };

export class ListSalesOrderActivitiesUseCase {
  constructor(
    private readonly salesOrders: ISalesOrderRepository,
    private readonly activities: ISalesOrderActivityRepository,
  ) {}

  async execute(
    input: ListSalesOrderActivitiesInput,
  ): Promise<ListSalesOrderActivitiesResult> {
    const salesOrder = await this.salesOrders.findById(
      input.companyId,
      input.salesOrderId,
    );

    if (!salesOrder) {
      return {
        success: false,
        error: {
          code: "SALES_ORDER_NOT_FOUND",
          message: "Sales Order not found.",
        },
      };
    }

    const items = await this.activities.listBySalesOrderId(
      input.companyId,
      input.salesOrderId,
    );

    return {
      success: true,
      data: items,
    };
  }
}
