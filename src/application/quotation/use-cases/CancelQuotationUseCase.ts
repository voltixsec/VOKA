import { QuotationDomainError } from "../../../domain/quotation";

import type { CancelQuotationDto } from "../dto/CancelQuotationDto";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { ApplicationResult } from "../results/ApplicationResult";

export class CancelQuotationUseCase {
  constructor(
    private readonly repository: IQuotationRepository,
  ) {}

  async execute(
    dto: CancelQuotationDto,
  ): Promise<ApplicationResult<void>> {

    const quotation = await this.repository.findById(
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

      quotation.cancel();

      await this.repository.update(quotation);

      return {
        success: true,
        data: undefined,
      };

    } catch (error) {

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