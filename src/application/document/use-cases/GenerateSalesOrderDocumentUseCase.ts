import type { ISalesOrderRepository } from "@/src/application/sales-order";
import type { ISalesOrderDocumentRenderer } from "../contracts/ISalesOrderDocumentRenderer";
import type { DocumentLocale } from "../contracts/QuotationDocumentSnapshot";
import type { SalesOrderDocumentSnapshot } from "../contracts/SalesOrderDocumentSnapshot";
import { createCompanyDocumentBrandSnapshot } from "../../../domain/document/CompanyDocumentBrandSnapshot";

function requireHistoricalAuditValue(
  value: string | null | undefined,
  label: string,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Persisted Sales Order is missing ${label}.`);
  }

  return normalized;
}
export type GenerateSalesOrderCompanyIdentity = {
  nameAr?: string | null;
  nameEn?: string | null;
  addressAr?: string | null;
  addressEn?: string | null;
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

export type GenerateSalesOrderDocumentInput = {
  companyId: string;
  companyName: string;
  companyIdentity?: GenerateSalesOrderCompanyIdentity;
  salesOrderId: string;
  locale: DocumentLocale;
  publicBaseUrl?: string | null;
};

export type GenerateSalesOrderDocumentResult =
  | {
      success: true;
      data: {
        bytes: Uint8Array;
        filename: string;
      };
    }
  | {
      success: false;
      error: {
        code: "SALES_ORDER_NOT_FOUND";
        message: string;
      };
    };

export class GenerateSalesOrderDocumentUseCase {
  constructor(
    private readonly salesOrders: ISalesOrderRepository,
    private readonly renderer: ISalesOrderDocumentRenderer,
  ) {}

  async execute(
    input: GenerateSalesOrderDocumentInput,
  ): Promise<GenerateSalesOrderDocumentResult> {
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

    const liveBrand = createCompanyDocumentBrandSnapshot({
      nameAr: input.companyIdentity?.nameAr ?? null,
      nameEn: input.companyIdentity?.nameEn ?? input.companyName,
      addressAr: input.companyIdentity?.addressAr ?? null,
      addressEn: input.companyIdentity?.addressEn ?? null,
      poBox: input.companyIdentity?.poBox ?? null,
      phone: input.companyIdentity?.phone ?? null,
      mobile: input.companyIdentity?.mobile ?? null,
      whatsapp: input.companyIdentity?.whatsapp ?? null,
      logoUrl: input.companyIdentity?.logoUrl ?? null,
      letterheadUrl: input.companyIdentity?.letterheadUrl ?? null,
      signatureUrl: input.companyIdentity?.signatureUrl ?? null,
      stampUrl: input.companyIdentity?.stampUrl ?? null,
      brandTheme: input.companyIdentity?.brandTheme ?? "NAVY_GOLD",
    });

    const persistedBrand = salesOrder.documentBrandSnapshot;
    const effectiveBrand = persistedBrand ?? liveBrand;
    const effectiveFallbackName = persistedBrand ? "VOKA" : input.companyName;

    const createdAt = salesOrder.createdAt;

    if (!createdAt) {
      throw new Error(
        "Persisted Sales Order is missing creation timestamp.",
      );
    }

    const snapshot: SalesOrderDocumentSnapshot = {
      locale: input.locale,
      company: {
        name:
          input.locale === "ar"
            ? effectiveBrand.nameAr?.trim() ||
              effectiveBrand.nameEn?.trim() ||
              effectiveFallbackName.trim() ||
              "VOKA"
            : effectiveBrand.nameEn?.trim() ||
              effectiveBrand.nameAr?.trim() ||
              effectiveFallbackName.trim() ||
              "VOKA",
        address:
          input.locale === "ar"
            ? effectiveBrand.addressAr?.trim() ||
              effectiveBrand.addressEn?.trim() ||
              null
            : effectiveBrand.addressEn?.trim() ||
              effectiveBrand.addressAr?.trim() ||
              null,
        poBox: effectiveBrand.poBox?.trim() || null,
        phone: effectiveBrand.phone?.trim() || null,
        mobile: effectiveBrand.mobile?.trim() || null,
        whatsapp: effectiveBrand.whatsapp?.trim() || null,
        logoUrl: effectiveBrand.logoUrl?.trim() || null,
        letterheadUrl:
          effectiveBrand.version === 2 ? effectiveBrand.letterheadUrl : null,
        signatureUrl:
          effectiveBrand.version === 2 ? effectiveBrand.signatureUrl : null,
        stampUrl:
          effectiveBrand.version === 2 ? effectiveBrand.stampUrl : null,
        brandTheme: effectiveBrand.brandTheme?.trim() || "NAVY_GOLD",
      },
      salesOrder: {
        id: salesOrder.id ?? input.salesOrderId,
        number: salesOrder.number,
        status: salesOrder.status,
        sourceQuotationId: salesOrder.sourceQuotationId,
        sourceQuotationNumber: salesOrder.sourceQuotationNumber,
        orderDate: salesOrder.orderDate,
        createdAt,
        currencyCode: salesOrder.currencyCode,
        subjectAr: salesOrder.subjectAr,
        subjectEn: salesOrder.subjectEn,
        briefAr: salesOrder.briefAr,
        briefEn: salesOrder.briefEn,
        projectName: salesOrder.projectName,
        projectNameAr: salesOrder.projectNameAr,
        projectNameEn: salesOrder.projectNameEn,
        attentionName: salesOrder.attentionName,
        attentionNameAr: salesOrder.attentionNameAr,
        attentionNameEn: salesOrder.attentionNameEn,
        scopeType: salesOrder.scopeType,
        customer: {
          name: salesOrder.customer.name,
          nameAr: salesOrder.customer.nameAr ?? null,
          nameEn: salesOrder.customer.nameEn ?? null,
          email: salesOrder.customer.email ?? null,
          phone: salesOrder.customer.phone ?? null,
          taxNumber: salesOrder.customer.taxNumber ?? null,
          billingAddress: salesOrder.customer.billingAddress ?? null,
        },
        lines: salesOrder.lines.map((line) => ({
          position: line.position,
          type: line.type,
          itemCode: line.itemCode ?? null,
          itemName: line.itemName,
          itemNameAr: line.itemNameAr ?? null,
          itemNameEn: line.itemNameEn ?? null,
          description: line.description ?? null,
          descriptionAr: line.descriptionAr ?? null,
          descriptionEn: line.descriptionEn ?? null,
          unitName: line.unitName ?? null,
          unitNameAr: line.unitNameAr ?? null,
          unitNameEn: line.unitNameEn ?? null,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          taxPercentage: line.taxPercentage,
          taxAmount: line.taxAmount,
          totalAmount: line.totalAmount,
        })),
        discount: salesOrder.discountType
          ? {
              type: salesOrder.discountType,
              value: salesOrder.discountValue,
            }
          : null,
        totals: {
          subtotal: salesOrder.subtotal,
          discountAmount: salesOrder.discountAmount,
          taxAmount: salesOrder.taxAmount,
          totalAmount: salesOrder.totalAmount,
        },
        notes: salesOrder.notes,
        notesAr: salesOrder.notesAr,
        notesEn: salesOrder.notesEn,
        termsAndConditions: salesOrder.termsAndConditions,
        termsAndConditionsAr: salesOrder.termsAndConditionsAr,
        termsAndConditionsEn: salesOrder.termsAndConditionsEn,
        sourceApproval: {
          approvedAt: salesOrder.sourceApprovedAt,
          approvedByName: salesOrder.sourceApprovedByName,
          approvedByRole: salesOrder.sourceApprovedByRole,
        },
        creator: {
          userId: salesOrder.createdByUserId,
          name: salesOrder.createdByName,
          role: salesOrder.createdByRole,
        },
        confirmation: salesOrder.confirmedAt
          ? {
              confirmedAt: salesOrder.confirmedAt,
              confirmedByUserId: salesOrder.confirmedByUserId,
              confirmedByName: requireHistoricalAuditValue(
                salesOrder.confirmedByName,
                "confirming actor name",
              ),
              confirmedByRole: requireHistoricalAuditValue(
                salesOrder.confirmedByRole,
                "confirming actor role",
              ),
            }
          : null,
        cancellation: salesOrder.cancelledAt
          ? {
              cancelledAt: salesOrder.cancelledAt,
              cancelledByUserId: salesOrder.cancelledByUserId,
              cancelledByName: requireHistoricalAuditValue(
                salesOrder.cancelledByName,
                "cancelling actor name",
              ),
              cancelledByRole: requireHistoricalAuditValue(
                salesOrder.cancelledByRole,
                "cancelling actor role",
              ),
              reason: requireHistoricalAuditValue(
                salesOrder.cancellationReason,
                "cancellation reason",
              ),
            }
          : null,
      },
      qrValue: "VOKA:SO:" + salesOrder.number,
      verificationUrl: null,
    };

    const bytes = await this.renderer.render(snapshot);

    const safeNumber = salesOrder.number.replace(/[^a-zA-Z0-9_-]+/g, "-");

    return {
      success: true,
      data: {
        bytes,
        filename: `sales-order-${safeNumber || "document"}.pdf`,
      },
    };
  }
}
