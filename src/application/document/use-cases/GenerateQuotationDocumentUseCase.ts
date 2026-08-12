import type {
  IQuotationRepository,
} from "@/src/application/quotation";

import type {
  IQuotationDocumentRenderer,
} from "../contracts/IQuotationDocumentRenderer";

import type {
  DocumentLocale,
  QuotationDocumentSnapshot,
} from "../contracts/QuotationDocumentSnapshot";
import { createCompanyDocumentBrandSnapshot } from "../../../domain/document/CompanyDocumentBrandSnapshot";

export type GenerateQuotationCompanyIdentity = {
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

export type GenerateQuotationDocumentInput = {
  companyId: string;
  companyName: string;

  companyIdentity?:
    GenerateQuotationCompanyIdentity;

  quotationId: string;
  locale: DocumentLocale;
};

export type GenerateQuotationDocumentResult =
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
        code:
          "QUOTATION_NOT_FOUND";

        message: string;
      };
    };

export class GenerateQuotationDocumentUseCase {
  constructor(
    private readonly quotations:
      IQuotationRepository,

    private readonly renderer:
      IQuotationDocumentRenderer,
  ) {}

  async execute(
    input:
      GenerateQuotationDocumentInput,
  ): Promise<
    GenerateQuotationDocumentResult
  > {
    const quotation =
      await this.quotations.findById(
        input.companyId,
        input.quotationId,
      );

    if (!quotation) {
      return {
        success: false,

        error: {
          code:
            "QUOTATION_NOT_FOUND",

          message:
            "Quotation not found.",
        },
      };
    }

    const customer =
      quotation.customer.toJSON();

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
    const persistedBrand = quotation.documentBrandSnapshot;
    const usePersistedBrand = Boolean(
      persistedBrand &&
      (quotation.status === "APPROVED" || quotation.approvedAt),
    );
    const effectiveBrand = usePersistedBrand && persistedBrand
      ? persistedBrand
      : liveBrand;
    const effectiveFallbackName =
      usePersistedBrand
        ? "VOKA"
        : input.companyName;

    const snapshot:
      QuotationDocumentSnapshot = {
      locale:
        input.locale,

      company: {
        name:
          input.locale === "ar"
            ? effectiveBrand
                .nameAr
                ?.trim() ||
              effectiveBrand
                .nameEn
                ?.trim() ||
              effectiveFallbackName
                .trim() ||
              "VOKA"
            : effectiveBrand
                .nameEn
                ?.trim() ||
              effectiveBrand
                .nameAr
                ?.trim() ||
              effectiveFallbackName
                .trim() ||
              "VOKA",

        address:
          input.locale === "ar"
            ? effectiveBrand
                .addressAr
                ?.trim() ||
              effectiveBrand
                .addressEn
                ?.trim() ||
              null
            : effectiveBrand
                .addressEn
                ?.trim() ||
              effectiveBrand
                .addressAr
                ?.trim() ||
              null,

        poBox:
          effectiveBrand
            .poBox
            ?.trim() ||
          null,

        phone:
          effectiveBrand
            .phone
            ?.trim() ||
          null,

        mobile:
          effectiveBrand
            .mobile
            ?.trim() ||
          null,

        whatsapp:
          effectiveBrand
            .whatsapp
            ?.trim() ||
          null,

        logoUrl:
          effectiveBrand
            .logoUrl
            ?.trim() ||
          null,

        letterheadUrl: effectiveBrand.version === 2 ? effectiveBrand.letterheadUrl : null,
        signatureUrl: effectiveBrand.version === 2 ? effectiveBrand.signatureUrl : null,
        stampUrl: effectiveBrand.version === 2 ? effectiveBrand.stampUrl : null,

        brandTheme:
          effectiveBrand
            .brandTheme
            ?.trim() ||
          "NAVY_GOLD",
      },

      quotation: {
        number:
          quotation.number.toString(),

        status:
          quotation.status,

        issueDate:
          quotation.issueDate,

        expiryDate:
          quotation.expiryDate,

        currencyCode:
          quotation.currencyCode,

        subjectAr:
          quotation.subjectAr,

        subjectEn:
          quotation.subjectEn,

        briefAr:
          quotation.briefAr,

        briefEn:
          quotation.briefEn,

        projectName:
          quotation.projectName,

        projectNameAr:
          quotation.projectNameAr,

        projectNameEn:
          quotation.projectNameEn,

        attentionName:
          quotation.attentionName,

        attentionNameAr:
          quotation.attentionNameAr,

        attentionNameEn:
          quotation.attentionNameEn,

        scopeType:
          quotation.scopeType,

        customer: {
          name:
            customer.name,

          email:
            customer.email ?? null,

          phone:
            customer.phone ?? null,

          taxNumber:
            customer.taxNumber ?? null,

          billingAddress:
            customer.billingAddress ??
            null,
        },

        lines:
          quotation.lines.map(
            (line) => ({
              position:
                line.position,

              type:
                line.type,

              itemCode:
                line.itemCode ??
                null,

              itemName:
                line.itemName,

              itemNameAr:
                line.itemNameAr ??
                null,

              itemNameEn:
                line.itemNameEn ??
                null,

              description:
                line.description ??
                null,

              descriptionAr:
                line.descriptionAr ??
                null,

              descriptionEn:
                line.descriptionEn ??
                null,

              unitName:
                line.unitName ??
                null,

              unitNameAr:
                line.unitNameAr ??
                null,

              unitNameEn:
                line.unitNameEn ??
                null,

              quantity:
                line.quantity,

              unitPrice:
                line.unitPrice,

              discountAmount:
                line.discountAmount,

              taxAmount:
                line.taxAmount,

              totalAmount:
                line.totalAmount,
            }),
          ),

        discount:
          quotation.discount
            ? {
                type:
                  quotation.discount
                    .type,

                value:
                  quotation.discount
                    .value,
              }
            : null,

        totals: {
          subtotal:
            quotation.totals
              .subtotal,

          discountAmount:
            quotation.totals
              .discountAmount,

          taxAmount:
            quotation.totals
              .taxAmount,

          totalAmount:
            quotation.totals
              .totalAmount,
        },

        notes:
          quotation.notes,

        notesAr:
          quotation.notesAr,

        notesEn:
          quotation.notesEn,

        termsAndConditions:
          quotation
            .termsAndConditions,

        termsAndConditionsAr:
          quotation
            .termsAndConditionsAr,

        termsAndConditionsEn:
          quotation
            .termsAndConditionsEn,

        approvedAt:
          quotation.approvedAt,

        approvedByName:
          quotation.approvedByName,

        approvedByRole:
          quotation.approvedByRole,
      },

      qrValue:
        "VOKA:" +
        quotation.number.toString(),
    };

    const bytes =
      await this.renderer.render(
        snapshot,
      );

    const safeNumber =
      quotation.number
        .toString()
        .replace(
          /[^a-zA-Z0-9_-]+/g,
          "-",
        );

    return {
      success: true,

      data: {
        bytes,

        filename:
          "quotation-" +
          (
            safeNumber ||
            "document"
          ) +
          ".pdf",
      },
    };
  }
}
