import type { DocumentLocale } from "./QuotationDocumentSnapshot";

export type SalesOrderDocumentSnapshot = {
  locale: DocumentLocale;

  company: {
    name: string;
    address?: string | null;
    poBox?: string | null;
    phone?: string | null;
    mobile?: string | null;
    whatsapp?: string | null;
    logoUrl?: string | null;
    letterheadUrl?: string | null;
    signatureUrl?: string | null;
    stampUrl?: string | null;
    brandTheme?: string | null;
  };

  salesOrder: {
    id: string;
    number: string;
    status: "DRAFT" | "CONFIRMED" | "CANCELLED";
    sourceQuotationId: string;
    sourceQuotationNumber: string;
    orderDate: Date;
    createdAt: Date;
    currencyCode: string;

    subjectAr: string | null;
    subjectEn: string | null;
    briefAr: string | null;
    briefEn: string | null;
    projectName: string | null;
    projectNameAr: string | null;
    projectNameEn: string | null;
    attentionName: string | null;
    attentionNameAr: string | null;
    attentionNameEn: string | null;
    scopeType: string | null;

    customer: {
      name: string;
      nameAr: string | null;
      nameEn: string | null;
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
      itemNameAr: string | null;
      itemNameEn: string | null;
      description: string | null;
      descriptionAr: string | null;
      descriptionEn: string | null;
      unitName: string | null;
      unitNameAr: string | null;
      unitNameEn: string | null;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      taxPercentage: number;
      taxAmount: number;
      totalAmount: number;
    }>;

    discount: {
      type: "FIXED" | "PERCENTAGE";
      value: number;
    } | null;

    totals: {
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      totalAmount: number;
    };

    notes: string | null;
    notesAr: string | null;
    notesEn: string | null;
    termsAndConditions: string | null;
    termsAndConditionsAr: string | null;
    termsAndConditionsEn: string | null;

    sourceApproval: {
      approvedAt: Date;
      approvedByName: string;
      approvedByRole: string;
    };

    creator: {
      userId: string | null;
      name: string;
      role: string;
    };

    confirmation: {
      confirmedAt: Date;
      confirmedByUserId: string | null;
      confirmedByName: string;
      confirmedByRole: string;
    } | null;

    cancellation: {
      cancelledAt: Date;
      cancelledByUserId: string | null;
      cancelledByName: string;
      cancelledByRole: string;
      reason: string;
    } | null;
  };

  qrValue: string;
  verificationUrl?: string | null;
};
