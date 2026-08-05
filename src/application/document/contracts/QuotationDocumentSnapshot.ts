export type DocumentLocale = "ar" | "en";

export type QuotationDocumentSnapshot = {
  locale: DocumentLocale;
  company: { name: string };
  quotation: {
    number: string;
    status: string;
    issueDate: Date;
    expiryDate: Date | null;
    currencyCode: string;
    customer: {
      name: string;
      email: string | null;
      phone: string | null;
      taxNumber: string | null;
      billingAddress: string | null;
    };
    lines: ReadonlyArray<{
      position: number;
      type: string;
      itemCode: string | null;
      itemName: string;
      description: string | null;
      unitName: string | null;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    }>;
    totals: {
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    };
    notes: string | null;
    termsAndConditions: string | null;
  };
  qrValue: string;
};
