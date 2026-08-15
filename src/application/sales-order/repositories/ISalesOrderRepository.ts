import type {
  SalesOrder,
  SalesOrderStatus,
} from "../../../domain/sales-order";
import type { QuotationStatus } from "../../../domain/quotation";

export type ConvertApprovedQuotationParams = {
  companyId: string;
  quotationId: string;
  createdByUserId: string;
  createdByName: string;
  createdByRole: string;
};

export type SalesOrderConversionPersistenceResult =
  | {
      kind: "CREATED" | "EXISTING";
      salesOrder: SalesOrder;
    }
  | {
      kind: "QUOTATION_NOT_FOUND";
    }
  | {
      kind: "INVALID_QUOTATION_STATUS";
      status: QuotationStatus;
    }
  | {
      kind: "INVALID_SOURCE_SNAPSHOT";
      message: string;
    };

export type SalesOrderActorParams = {
  userId?: string | null;
  name: string;
  role: string;
};

export type ConfirmSalesOrderParams = {
  companyId: string;
  salesOrderId: string;
  expectedStatus: SalesOrderStatus;
  actor: SalesOrderActorParams;
};

export type ConfirmSalesOrderPersistenceResult =
  | {
      kind: "CONFIRMED";
      salesOrder: SalesOrder;
    }
  | {
      kind: "SALES_ORDER_NOT_FOUND";
    }
  | {
      kind: "STALE_STATE";
      currentStatus: SalesOrderStatus;
    };

export type CancelSalesOrderParams = {
  companyId: string;
  salesOrderId: string;
  expectedStatus: SalesOrderStatus;
  reason: string;
  actor: SalesOrderActorParams;
};

export type CancelSalesOrderPersistenceResult =
  | {
      kind: "CANCELLED";
      salesOrder: SalesOrder;
    }
  | {
      kind: "SALES_ORDER_NOT_FOUND";
    }
  | {
      kind: "STALE_STATE";
      currentStatus: SalesOrderStatus;
    }
  | {
      kind: "INVALID_REASON";
      message: string;
    };

export type SalesOrderListFilters = {
  companyId: string;
  status?: SalesOrderStatus;
  search?: string;
  skip: number;
  take: number;
};

export type SalesOrderListResult = {
  salesOrders: SalesOrder[];
  total: number;
};

export interface ISalesOrderRepository {
  convertApprovedQuotation(
    params: ConvertApprovedQuotationParams,
  ): Promise<SalesOrderConversionPersistenceResult>;

  confirm(
    params: ConfirmSalesOrderParams,
  ): Promise<ConfirmSalesOrderPersistenceResult>;

  cancel(
    params: CancelSalesOrderParams,
  ): Promise<CancelSalesOrderPersistenceResult>;

  findById(
    companyId: string,
    salesOrderId: string,
  ): Promise<SalesOrder | null>;

  findBySourceQuotation(
    companyId: string,
    quotationId: string,
  ): Promise<SalesOrder | null>;

  existsBySourceQuotation(
    companyId: string,
    quotationId: string,
  ): Promise<boolean>;

  findAll(
    filters: SalesOrderListFilters,
  ): Promise<SalesOrderListResult>;
}
