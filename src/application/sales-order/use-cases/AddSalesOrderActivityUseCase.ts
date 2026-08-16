import { SalesOrderActivity } from "@/src/domain/sales-order";
import type { ISalesOrderActivityRepository } from "../repositories/ISalesOrderActivityRepository";
import type { ISalesOrderRepository } from "../repositories/ISalesOrderRepository";

export type AddSalesOrderActivityInput = {
  companyId: string;
  salesOrderId: string;
  body: string;
  actor: {
    userId?: string | null;
    name: string;
    role: string;
  };
};

export type AddSalesOrderActivityResult =
  | { success: true; data: SalesOrderActivity }
  | {
      success: false;
      error: {
        code: "SALES_ORDER_NOT_FOUND" | "INVALID_ACTIVITY";
        message: string;
      };
    };

export class AddSalesOrderActivityUseCase {
  constructor(
    private readonly salesOrders: ISalesOrderRepository,
    private readonly activities: ISalesOrderActivityRepository,
  ) {}

  async execute(
    input: AddSalesOrderActivityInput,
  ): Promise<AddSalesOrderActivityResult> {
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

    try {
      const activity = new SalesOrderActivity({
        companyId: input.companyId,
        salesOrderId: input.salesOrderId,
        body: input.body,
        actorUserId: input.actor.userId,
        actorName: input.actor.name,
        actorRole: input.actor.role,
      });

      const saved = await this.activities.save(activity);

      return {
        success: true,
        data: saved,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "INVALID_ACTIVITY",
          message: error instanceof Error ? error.message : "Invalid activity entry.",
        },
      };
    }
  }
}
