import type { UpdateQuotationDto } from "../dto/UpdateQuotationDto";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { ApplicationResult } from "../results/ApplicationResult";

import { QuotationDomainError } from "../../../domain/quotation";

export class UpdateQuotationUseCase {

  constructor(
    private readonly repository: IQuotationRepository,
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

    try {

      quotation.replaceLines(dto.lines);

      quotation.setDiscount(dto.discount ?? null);

      quotation.updateText(
        dto.notes ?? null,
        dto.termsAndConditions ?? null,
      );

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