export type DocumentLocale =
  "ar" | "en";

export type QuotationDocumentSnapshot = {
  locale: DocumentLocale;

  company: {
    name: string;

    address?: string | null;

    poBox?: string | null;
    phone?: string | null;
    mobile?: string | null;
    whatsapp?: string | null;

    logoUrl?: string | null;
  };

  quotation: {
    number: string;
    status: string;

    issueDate: Date;
    expiryDate: Date | null;

    currencyCode: string;

    subjectAr: string | null;
    subjectEn: string | null;

    briefAr: string | null;
    briefEn: string | null;

    projectName: string | null;
    attentionName: string | null;
    scopeType: string | null;

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

    discount: {
      type:
        | "FIXED"
        | "PERCENTAGE";

      value: number;
    } | null;

    totals: {
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    };

    notes: string | null;

    termsAndConditions:
      string | null;

    approvedAt: Date | null;
    approvedByName: string | null;
    approvedByRole: string | null;
  };

  qrValue: string;
};
