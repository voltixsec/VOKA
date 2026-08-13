import type { DocumentLocale } from "./QuotationDocumentSnapshot";

export type QuotationDocument = {
  filename: string;
  contentType: "application/pdf";
  bytes: Uint8Array;
};

export type QuotationDocumentProviderResult =
  | { success: true; data: QuotationDocument }
  | {
      success: false;
      error: {
        code: "COMPANY_NOT_FOUND" | "QUOTATION_NOT_FOUND";
        message: string;
      };
    };

export interface QuotationDocumentProvider {
  generate(input: {
    companyId: string;
    quotationId: string;
    locale: DocumentLocale;
  }): Promise<QuotationDocumentProviderResult>;
}
