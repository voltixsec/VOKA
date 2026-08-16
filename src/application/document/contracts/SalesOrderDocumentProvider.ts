import type { DocumentLocale } from "./QuotationDocumentSnapshot";

export type SalesOrderDocument = {
  filename: string;
  contentType: "application/pdf";
  bytes: Uint8Array;
};

export type SalesOrderDocumentProviderResult =
  | { success: true; data: SalesOrderDocument }
  | {
      success: false;
      error: {
        code: "COMPANY_NOT_FOUND" | "SALES_ORDER_NOT_FOUND";
        message: string;
      };
    };

export interface SalesOrderDocumentProvider {
  generate(input: {
    companyId: string;
    salesOrderId: string;
    locale: DocumentLocale;
  }): Promise<SalesOrderDocumentProviderResult>;
}
