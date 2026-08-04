import {
  Quotation,
  QuotationDomainError,
} from "../../../domain/quotation";

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

    try {
      const quotation = new Quotation({
        companyId: dto.companyId,
        customerId: dto.customerId,
        priceListId: dto.priceListId,
        number: dto.quotationNumber,
        currencyCode: dto.currencyCode,
        customer: dto.customer,
        lines: dto.lines,
        discount: dto.discount,
        notes: dto.notes,
        termsAndConditions: dto.termsAndConditions,
        issueDate: dto.issueDate,
        expiryDate: dto.expiryDate,
      });

      await this.repository.save(quotation);

      return {
        success: true,
        data: quotation,
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