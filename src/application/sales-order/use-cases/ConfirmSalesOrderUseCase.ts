import type { SalesOrder, SalesOrderStatus } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type ConfirmSalesOrderInput = {
  companyId: string;
  salesOrderId: string;
  expectedStatus: SalesOrderStatus;
  actor: {
    userId?: string | null;
    name: string;
    role: string;
  };
};

export type ConfirmSalesOrderOutput =
  | {
      success: true;
      data: SalesOrder;
    }
  | {
      success: false;
      error: {
        code: "SALES_ORDER_NOT_FOUND" | "STALE_STATE" | "UNAUTHORIZED";
        message: string;
        currentStatus?: SalesOrderStatus;
      };
    };

export class ConfirmSalesOrderUseCase {
  constructor(private readonly repository: ISalesOrderRepository) {}

  async execute(input: ConfirmSalesOrderInput): Promise<ConfirmSalesOrderOutput> {
    if (!input.companyId?.trim() || !input.salesOrderId?.trim()) {
      return {
        success: false,
        error: {
          code: "SALES_ORDER_NOT_FOUND",
          message: "Sales Order not found.",
        },
      };
    }

    if (input.expectedStatus !== "DRAFT") {
      return {
        success: false,
        error: {
          code: "STALE_STATE",
          message: "Only DRAFT Sales Orders can be confirmed.",
        },
      };
    }

    const result = await this.repository.confirm({
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      expectedStatus: input.expectedStatus,
      actor: input.actor,
    });

    if (result.kind === "SALES_ORDER_NOT_FOUND") {
      return {
        success: false,
        error: {
          code: "SALES_ORDER_NOT_FOUND",
          message: "Sales Order not found.",
        },
      };
    }

    if (result.kind === "STALE_STATE") {
      return {
        success: false,
        error: {
          code: "STALE_STATE",
          message: "Sales Order status has changed.",
          currentStatus: result.currentStatus,
        },
      };
    }

    return {
      success: true,
      data: result.salesOrder,
    };
  }
}
