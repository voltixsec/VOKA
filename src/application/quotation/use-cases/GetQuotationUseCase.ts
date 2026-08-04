import type { Quotation } from "../../../domain/quotation";

import type { IQuotationRepository } from "../repositories/IQuotationRepository";
import type { ApplicationResult } from "../results/ApplicationResult";

export type GetQuotationDto = {
  companyId: string;
  quotationId: string;
};

export class GetQuotationUseCase {
  constructor(
    private readonly repository: IQuotationRepository,
  ) {}

  async execute(
    dto: GetQuotationDto,
  ): Promise<ApplicationResult<Quotation>> {
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

    return {
      success: true,
      data: quotation,
    };
  }
}
