import type { ApplicationResult } from "../../quotation";
import type { SalesOrder } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type ConvertApprovedQuotationToSalesOrderDto = {
  companyId: string;
  quotationId: string;
  createdByUserId: string;
  createdByName: string;
  createdByRole: string;
};

export type ConvertApprovedQuotationToSalesOrderResult = {
  salesOrder: SalesOrder;
  created: boolean;
};

export class ConvertApprovedQuotationToSalesOrderUseCase {
  constructor(
    private readonly repository: ISalesOrderRepository,
  ) {}

  async execute(
    dto: ConvertApprovedQuotationToSalesOrderDto,
  ): Promise<ApplicationResult<ConvertApprovedQuotationToSalesOrderResult>> {
    const result = await this.repository.convertApprovedQuotation(dto);

    if (result.kind === "QUOTATION_NOT_FOUND") {
      return {
        success: false,
        error: {
          code: "QUOTATION_NOT_FOUND",
          message: "Quotation not found.",
        },
      };
    }

    if (result.kind === "INVALID_QUOTATION_STATUS") {
      return {
        success: false,
        error: {
          code: "QUOTATION_NOT_APPROVED",
          message: "Only an approved quotation can be converted to a Sales Order.",
        },
      };
    }

    if (result.kind === "INVALID_SOURCE_SNAPSHOT") {
      return {
        success: false,
        error: {
          code: "QUOTATION_CONVERSION_SOURCE_INVALID",
          message: result.message,
        },
      };
    }

    return {
      success: true,
      data: {
        salesOrder: result.salesOrder,
        created: result.kind === "CREATED",
      },
    };
  }
}
