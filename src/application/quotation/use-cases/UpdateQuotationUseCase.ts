import type { UpdateQuotationDto } from "../dto/UpdateQuotationDto";
import { analyzeQuotationLocalization } from "../services/QuotationLocalizationAnalyzer";
import { createQuotationLocalizationSourceSignature } from "../services/QuotationLocalizationSourceSignature";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { ApplicationResult } from "../results/ApplicationResult";
import { invalidateQuotationTargetFields } from "../services/invalidateQuotationTargetFields";

import { QuotationDomainError } from "../../../domain/quotation";

export class UpdateQuotationUseCase {

  constructor(
    private readonly repository: IQuotationRepository,
    private readonly referenceValidator: IQuotationReferenceValidator,
  ) {}

  async execute(
    dto: UpdateQuotationDto,
  ): Promise<ApplicationResult<void>> {

    const quotation =
      await this.repository.findById(
        dto.companyId,
        dto.quotationId,
      );

    if (!quotation) {
      return {
        success: false,
        error: {
          code: "QUOTATION_NOT_FOUND",
          message: "Quotation not found.",
        },
      };
    }

    const processedDto =
      invalidateQuotationTargetFields(
        quotation,
        dto,
      );

    const invalidReference =
      await this.referenceValidator.findInvalidReference({
        companyId: processedDto.companyId,
        customerId: quotation.customerId,
        priceListId: quotation.priceListId,
        catalogItemIds: processedDto.lines
          .map((line) => line?.catalogItemId)
          .filter(
            (id): id is string =>
              typeof id === "string" &&
              Boolean(id.trim()),
          ),
        taxRateIds: processedDto.lines
          .map((line) => line?.taxRateId)
          .filter(
            (id): id is string =>
              typeof id === "string" &&
              Boolean(id.trim()),
          ),
      });

    if (invalidReference) {
      return {
        success: false,
        error: invalidReference,
      };
    }

    const refreshLineIds = new Set(processedDto.taxRateRefreshLineIds ?? []);
    const taxRateIds = processedDto.lines.flatMap((line) => {
      const taxRateId = line.taxRateId?.trim();
      if (!taxRateId) return [];
      const existingLine = line.id
        ? quotation.lines.find((candidate) => candidate.id === line.id)
        : undefined;
      const unchangedHistoricalRate = Boolean(
        existingLine &&
        (existingLine.taxRateId ?? null) === taxRateId &&
        typeof line.id === "string" &&
        !refreshLineIds.has(line.id),
      );
      return unchangedHistoricalRate ? [] : [taxRateId];
    });
    const taxPercentages =
      await this.referenceValidator.resolveTaxRatePercentages(
        processedDto.companyId,
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
    const canonicalLines = processedDto.lines.map((line) => {
      const taxRateId = line.taxRateId?.trim() || null;
      const existingLine = line.id
        ? quotation.lines.find((candidate) => candidate.id === line.id)
        : undefined;
      const preservesHistoricalSnapshot = Boolean(
        existingLine &&
        (existingLine.taxRateId ?? null) === taxRateId &&
        typeof line.id === "string" &&
        !refreshLineIds.has(line.id),
      );
      return {
        ...line,
        taxRateId,
        taxPercentage: !taxRateId
          ? 0
          : preservesHistoricalSnapshot
            ? existingLine?.taxPercentage ?? 0
            : taxPercentages.get(taxRateId) ?? 0,
      };
    });

    try {
      if (processedDto.expiryDate !== undefined) {
        quotation.updateExpiryDate(
          processedDto.expiryDate,
        );
      }

      quotation.replaceLines(canonicalLines);

      quotation.setDiscount(processedDto.discount ?? null);

      quotation.updateText(
        processedDto.notes ?? null,
        processedDto.termsAndConditions ?? null,
        processedDto.notesAr,
        processedDto.notesEn,
        processedDto.termsAndConditionsAr,
        processedDto.termsAndConditionsEn,
      );

      quotation.updateProposal({
        subjectAr: processedDto.subjectAr,
        subjectEn: processedDto.subjectEn,
        briefAr: processedDto.briefAr,
        briefEn: processedDto.briefEn,
        projectName: processedDto.projectName,
        projectNameAr: processedDto.projectNameAr,
        projectNameEn: processedDto.projectNameEn,
        attentionName: processedDto.attentionName,
        attentionNameAr: processedDto.attentionNameAr,
        attentionNameEn: processedDto.attentionNameEn,
        scopeType: processedDto.scopeType,
      });

      const analysis = analyzeQuotationLocalization(
        {
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
        },
        dto.localizationSourceLocale,
      );
      const now = new Date();

      if (analysis.items.length > 0) {
        const sourceSignature =
          createQuotationLocalizationSourceSignature(analysis);
        const requiresNewGeneration =
          quotation.localizationSourceSignature !== sourceSignature;

        if (requiresNewGeneration) {
          quotation.startLocalizationGeneration(
            analysis.sourceLocale,
            sourceSignature,
            now,
          );
        }
      } else {
        quotation.setLocalizationSourceLocale(
          analysis.sourceLocale,
        );
        quotation.markLocalizationCompleted();
      }

      await this.repository.update(
        processedDto.companyId,
        quotation,
      );

      return {
        success: true,
        data: undefined,
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
