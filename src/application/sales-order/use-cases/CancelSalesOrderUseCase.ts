import type { SalesOrder, SalesOrderStatus } from "../../../domain/sales-order";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type CancelSalesOrderInput = {
  companyId: string;
  salesOrderId: string;
  expectedStatus: SalesOrderStatus;
  reason: string;
  actor: {
    userId?: string | null;
    name: string;
    role: string;
  };
};

export type CancelSalesOrderOutput =
  | {
      success: true;
      data: SalesOrder;
    }
  | {
      success: false;
      error: {
        code:
          | "SALES_ORDER_NOT_FOUND"
          | "STALE_STATE"
          | "INVALID_REASON"
          | "UNAUTHORIZED";
        message: string;
        currentStatus?: SalesOrderStatus;
      };
    };

export class CancelSalesOrderUseCase {
  constructor(private readonly repository: ISalesOrderRepository) {}

  async execute(input: CancelSalesOrderInput): Promise<CancelSalesOrderOutput> {
    if (!input.companyId?.trim() || !input.salesOrderId?.trim()) {
      return {
        success: false,
        error: {
          code: "SALES_ORDER_NOT_FOUND",
          message: "Sales Order not found.",
        },
      };
    }

    const trimmedReason = input.reason?.trim();
    if (!trimmedReason) {
      return {
        success: false,
        error: {
          code: "INVALID_REASON",
          message: "Cancellation reason is required.",
        },
      };
    }

    if (
      input.expectedStatus !== "DRAFT" &&
      input.expectedStatus !== "CONFIRMED"
    ) {
      return {
        success: false,
        error: {
          code: "STALE_STATE",
          message: "Sales Order state transition not allowed.",
        },
      };
    }

    const result = await this.repository.cancel({
      companyId: input.companyId,
      salesOrderId: input.salesOrderId,
      expectedStatus: input.expectedStatus,
      reason: trimmedReason,
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

    if (result.kind === "INVALID_REASON") {
      return {
        success: false,
        error: {
          code: "INVALID_REASON",
          message: result.message,
        },
      };
    }

    return {
      success: true,
      data: result.salesOrder,
    };
  }
}
