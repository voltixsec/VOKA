import { QuotationDomainError } from "../../../domain/quotation";

import type { CancelQuotationDto } from "../dto/CancelQuotationDto";
import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { IQuotationSalesOrderGuard } from "../repositories/IQuotationSalesOrderGuard";
import type { ApplicationResult } from "../results/ApplicationResult";

export class CancelQuotationUseCase {
  constructor(
    private readonly repository: IQuotationRepository,
    private readonly salesOrderGuard: IQuotationSalesOrderGuard,
  ) {}

  async execute(
    dto: CancelQuotationDto,
  ): Promise<ApplicationResult<void>> {

    const quotation = await this.repository.findById(
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

    if (
      await this.salesOrderGuard.existsBySourceQuotation(
        dto.companyId,
        dto.quotationId,
      )
    ) {
      return {
        success: false,
        error: {
          code: "QUOTATION_HAS_SALES_ORDER",
          message: "A quotation with a Sales Order cannot be cancelled.",
        },
      };
    }

    try {

      quotation.cancel();

      await this.repository.update(
        dto.companyId,
        quotation,
      );

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
