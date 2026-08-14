import type { ApplicationResult } from "../../quotation";
import type { SalesOrder } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export class GetSalesOrderUseCase {
  constructor(
    private readonly repository: ISalesOrderRepository,
  ) {}

  async execute(input: {
    companyId: string;
    salesOrderId: string;
  }): Promise<ApplicationResult<SalesOrder>> {
    const salesOrder = await this.repository.findById(
      input.companyId,
      input.salesOrderId,
    );

    return salesOrder
      ? { success: true, data: salesOrder }
      : {
          success: false,
          error: {
            code: "SALES_ORDER_NOT_FOUND",
            message: "Sales Order not found.",
          },
        };
  }
}
