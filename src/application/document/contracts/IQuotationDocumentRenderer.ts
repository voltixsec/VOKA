import type { QuotationDocumentSnapshot } from "./QuotationDocumentSnapshot";

export interface IQuotationDocumentRenderer {
  render(snapshot: QuotationDocumentSnapshot): Promise<Uint8Array>;
}
