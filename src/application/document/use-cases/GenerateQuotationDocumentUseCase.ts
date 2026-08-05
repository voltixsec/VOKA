import type { IQuotationRepository } from "@/src/application/quotation";
import type { IQuotationDocumentRenderer } from "../contracts/IQuotationDocumentRenderer";
import type { DocumentLocale, QuotationDocumentSnapshot } from "../contracts/QuotationDocumentSnapshot";

export type GenerateQuotationDocumentInput = { companyId: string; companyName: string; quotationId: string; locale: DocumentLocale };
export type GenerateQuotationDocumentResult =
  | { success: true; data: { bytes: Uint8Array; filename: string } }
  | { success: false; error: { code: "QUOTATION_NOT_FOUND"; message: string } };

export class GenerateQuotationDocumentUseCase {
  constructor(private readonly quotations: IQuotationRepository, private readonly renderer: IQuotationDocumentRenderer) {}

  async execute(input: GenerateQuotationDocumentInput): Promise<GenerateQuotationDocumentResult> {
    const quotation = await this.quotations.findById(input.companyId, input.quotationId);
    if (!quotation) return { success: false, error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." } };

    const customer = quotation.customer.toJSON();
    const snapshot: QuotationDocumentSnapshot = {
      locale: input.locale,
      company: { name: input.companyName.trim() || "VOKA" },
      quotation: {
        number: quotation.number.toString(), status: quotation.status,
        issueDate: quotation.issueDate, expiryDate: quotation.expiryDate,
        currencyCode: quotation.currencyCode,
        customer: { name: customer.name, email: customer.email ?? null, phone: customer.phone ?? null, taxNumber: customer.taxNumber ?? null, billingAddress: customer.billingAddress ?? null },
        lines: quotation.lines.map((line) => ({ position: line.position, type: line.type, itemCode: line.itemCode ?? null, itemName: line.itemName, description: line.description ?? null, unitName: line.unitName ?? null, quantity: line.quantity, unitPrice: line.unitPrice, discountAmount: line.discountAmount, taxAmount: line.taxAmount, totalAmount: line.totalAmount })),
        totals: { subtotal: quotation.totals.subtotal, discountAmount: quotation.totals.discountAmount, taxAmount: quotation.totals.taxAmount, totalAmount: quotation.totals.totalAmount },
        notes: quotation.notes, termsAndConditions: quotation.termsAndConditions,
      },
      qrValue: `VOKA:${quotation.number.toString()}`,
    };
    const bytes = await this.renderer.render(snapshot);
    const safeNumber = quotation.number.toString().replace(/[^a-zA-Z0-9_-]+/g, "-");
    return { success: true, data: { bytes, filename: `quotation-${safeNumber || "document"}.pdf` } };
  }
}
