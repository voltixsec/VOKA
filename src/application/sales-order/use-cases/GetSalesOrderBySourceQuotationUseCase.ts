import type { ApplicationResult } from "../../quotation";
import type { SalesOrder } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export class GetSalesOrderBySourceQuotationUseCase {
  constructor(
    private readonly repository: ISalesOrderRepository,
  ) {}

  async execute(input: {
    companyId: string;
    quotationId: string;
  }): Promise<ApplicationResult<SalesOrder>> {
    const salesOrder = await this.repository.findBySourceQuotation(
      input.companyId,
      input.quotationId,
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
