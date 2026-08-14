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
