import {
  Quotation,
  QuotationDomainError,
} from "../../../domain/quotation";
import { analyzeQuotationLocalization } from "../services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../services/QuotationLocalizationSourceSignature";

import type { CreateQuotationDto } from "../dto/CreateQuotationDto";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { ApplicationResult } from "../results/ApplicationResult";

export class CreateQuotationUseCase {
  constructor(
    private readonly repository: IQuotationRepository,
    private readonly referenceValidator: IQuotationReferenceValidator,
  ) {}

  async execute(
    dto: CreateQuotationDto,
  ): Promise<ApplicationResult<Quotation>> {

    const exists = await this.repository.existsByNumber(
      dto.companyId,
      dto.quotationNumber,
    );

    if (exists) {
      return {
        success: false,
        error: {
          code: "QUOTATION_ALREADY_EXISTS",
          message: "Quotation number already exists.",
        },
      };
    }
    const catalogItemIds = dto.lines
      .map((line) => line?.catalogItemId)
      .filter(
        (id): id is string =>
          typeof id === "string" && Boolean(id.trim()),
      )
      .map((id) => id.trim());

    const taxRateIds = dto.lines
      .map((line) => line?.taxRateId)
      .filter(
        (id): id is string =>
          typeof id === "string" && Boolean(id.trim()),
      )
      .map((id) => id.trim());

    const invalidReference =
      await this.referenceValidator.findInvalidReference({
        companyId: dto.companyId,
        customerId: dto.customerId,
        priceListId: dto.priceListId,
        catalogItemIds,
        taxRateIds,
      });

    if (invalidReference) {
      return {
        success: false,
        error: invalidReference,
      };
    }

    const taxPercentages =
      await this.referenceValidator.resolveTaxRatePercentages(
        dto.companyId,
        taxRateIds,
        { activeOnly: true },
      );
    if (taxRateIds.some((id) => !taxPercentages.has(id))) {
      return {
        success: false,
        error: {
          code: "TAX_RATE_NOT_FOUND",
          message: "A tax rate was not found for the active company.",
        },
      };
    }
    const canonicalLines = dto.lines.map((line) => {
      const taxRateId = line.taxRateId?.trim() || null;
      return {
        ...line,
        taxRateId,
        taxPercentage: taxRateId
          ? taxPercentages.get(taxRateId) ?? 0
          : 0,
      };
    });

    const customer =
      await this.referenceValidator.getCustomerSnapshot(
        dto.companyId,
        dto.customerId,
      );

    if (!customer) {
      return {
        success: false,
        error: {
          code: "CUSTOMER_NOT_FOUND",
          message: "Customer was not found for the active company.",
        },
      };
    }
    try {
      const customerInfo = {
        ...customer,
        ...(dto.customer || {}),
        // Preserve persisted customer name, ignore name from DTO to maintain data integrity
        name: customer.name,
        nameAr: dto.customer?.nameAr ?? customer.nameAr,
        nameEn: dto.customer?.nameEn ?? customer.nameEn,
      };

      const quotation = new Quotation({
        companyId: dto.companyId,
        customerId: dto.customerId,
        priceListId: dto.priceListId,
        number: dto.quotationNumber,
        currencyCode: dto.currencyCode,
        customer: customerInfo,
        lines: canonicalLines,
        discount: dto.discount,
        notes: dto.notes,
        notesAr: dto.notesAr,
        notesEn: dto.notesEn,
        termsAndConditions: dto.termsAndConditions,
        termsAndConditionsAr: dto.termsAndConditionsAr,
        termsAndConditionsEn: dto.termsAndConditionsEn,
        subjectAr: dto.subjectAr,
        subjectEn: dto.subjectEn,
        briefAr: dto.briefAr,
        briefEn: dto.briefEn,
        projectName: dto.projectName,
        projectNameAr: dto.projectNameAr,
        projectNameEn: dto.projectNameEn,
        attentionName: dto.attentionName,
        attentionNameAr: dto.attentionNameAr,
        attentionNameEn: dto.attentionNameEn,
        scopeType: dto.scopeType,
        issueDate: dto.issueDate,
        expiryDate: dto.expiryDate,
      });

      const quotationSnapshot = {
        customer: quotation.customer.toJSON(),
        projectName: quotation.projectName,
        projectNameAr: quotation.projectNameAr,
        projectNameEn: quotation.projectNameEn,
        attentionName: quotation.attentionName,
        attentionNameAr: quotation.attentionNameAr,
        attentionNameEn: quotation.attentionNameEn,
        subjectAr: quotation.subjectAr,
        subjectEn: quotation.subjectEn,
        briefAr: quotation.briefAr,
        briefEn: quotation.briefEn,
        notes: quotation.notes,
        notesAr: quotation.notesAr,
        notesEn: quotation.notesEn,
        termsAndConditions: quotation.termsAndConditions,
        termsAndConditionsAr: quotation.termsAndConditionsAr,
        termsAndConditionsEn: quotation.termsAndConditionsEn,
        lines: quotation.lines.map((line) => ({
          id: line.id,
          catalogItemId: line.catalogItemId,
          taxRateId: line.taxRateId,
          position: line.position,
          type: line.type,
          itemCode: line.itemCode,
          itemName: line.itemName,
          itemNameAr: line.itemNameAr,
          itemNameEn: line.itemNameEn,
          description: line.description,
          descriptionAr: line.descriptionAr,
          descriptionEn: line.descriptionEn,
          unitName: line.unitName,
          unitNameAr: line.unitNameAr,
          unitNameEn: line.unitNameEn,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          taxPercentage: line.taxPercentage,
        })),
      };

      const analysis = analyzeQuotationLocalization(
        quotationSnapshot,
        dto.localizationSourceLocale,
      );
      const now = new Date();

      if (analysis.items.length > 0) {
        quotation.startLocalizationGeneration(
          analysis.sourceLocale,
          createQuotationLocalizationSourceSignature(analysis),
          now,
        );
      } else {
        quotation.setLocalizationSourceLocale(
          analysis.sourceLocale,
        );
        quotation.markLocalizationCompleted();
      }

      const savedQuotation =
        await this.repository.save(quotation);

      return {
        success: true,
        data: savedQuotation,
      };
    }
    catch (error) {

      if (error instanceof QuotationDomainError) {
        return {
          success: false,
          error: {
            code: "DOMAIN_ERROR",
            message: error.message,
          },
        };
      }

      throw error;
    }
  }
}
