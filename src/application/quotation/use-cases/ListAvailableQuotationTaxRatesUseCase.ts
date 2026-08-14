import type {
  AvailableQuotationTaxRate,
  IQuotationReferenceValidator,
} from "../repositories/IQuotationReferenceValidator";
import type { ApplicationResult } from "../results/ApplicationResult";

export class ListAvailableQuotationTaxRatesUseCase {
  constructor(
    private readonly references: IQuotationReferenceValidator,
  ) {}

  async execute(
    companyId: string,
  ): Promise<ApplicationResult<AvailableQuotationTaxRate[]>> {
    return {
      success: true,
      data: await this.references.listAvailableTaxRates(companyId),
    };
  }
}
