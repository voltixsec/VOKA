import {
  QuotationDomainError,
} from "../../../domain/quotation";

import type {
  ApproveQuotationDto,
} from "../dto/ApproveQuotationDto";
import type {
  IQuotationRepository,
} from "../repositories/IQuotationRepository";
import type {
  ApplicationResult,
} from "../results/ApplicationResult";

export class ApproveQuotationUseCase {
  constructor(
    private readonly repository:
      IQuotationRepository,
  ) {}

  async execute(
    dto: ApproveQuotationDto,
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
          message:
            "Quotation not found.",
        },
      };
    }

    try {
      quotation.approve(dto.documentBrandSnapshot, {
        name:
          dto.approvedByName?.trim() ||
          "Authorized Approver",

        role:
          dto.approvedByRole?.trim() ||
          "APPROVER",
      });

      await this.repository.update(
        dto.companyId,
        quotation,
      );

      return {
        success: true,
        data: undefined,
      };
    } catch (error) {
      if (
        error instanceof
        QuotationDomainError
      ) {
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
