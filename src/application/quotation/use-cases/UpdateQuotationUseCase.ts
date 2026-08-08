import type { UpdateQuotationDto } from "../dto/UpdateQuotationDto";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationReferenceValidator } from "../repositories/IQuotationReferenceValidator";
import type { ApplicationResult } from "../results/ApplicationResult";

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
    const invalidReference =
      await this.referenceValidator.findInvalidReference({
        companyId: dto.companyId,
        customerId: quotation.customerId,
        priceListId: quotation.priceListId,
        catalogItemIds: dto.lines
          .map((line) => line?.catalogItemId)
          .filter(
            (id): id is string =>
              typeof id === "string" &&
              Boolean(id.trim()),
          ),
        taxRateIds: dto.lines
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

    try {

      quotation.replaceLines(dto.lines);

      quotation.setDiscount(dto.discount ?? null);

      quotation.updateText(
        dto.notes ?? null,
        dto.termsAndConditions ?? null,
        dto.notesAr,
        dto.notesEn,
        dto.termsAndConditionsAr,
        dto.termsAndConditionsEn,
      );

      quotation.updateProposal({
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
      });

      await this.repository.update(
        dto.companyId,
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