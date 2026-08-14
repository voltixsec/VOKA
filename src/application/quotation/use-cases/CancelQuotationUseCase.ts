import { QuotationDomainError } from "../../../domain/quotation";

import type { CancelQuotationDto } from "../dto/CancelQuotationDto";
import type { IQuotationCancellationRepository } from "../repositories/IQuotationCancellationRepository";
import type { ApplicationResult } from "../results/ApplicationResult";

export class CancelQuotationUseCase {
  constructor(
    private readonly repository: IQuotationCancellationRepository,
  ) {}

  async execute(
    dto: CancelQuotationDto,
  ): Promise<ApplicationResult<void>> {
    try {
      const result = await this.repository.cancel(dto);

      if (result.kind === "QUOTATION_NOT_FOUND") {
        return {
          success: false,
          error: {
            code: "QUOTATION_NOT_FOUND",
            message: "Quotation not found.",
          },
        };
      }

      if (result.kind === "QUOTATION_HAS_SALES_ORDER") {
        return {
          success: false,
          error: {
            code: "QUOTATION_HAS_SALES_ORDER",
            message: "A quotation with a Sales Order cannot be cancelled.",
          },
        };
      }

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
