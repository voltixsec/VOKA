import type { IQuotationRepository } from "@/src/application/quotation";
import type { QuotationDelivery } from "@/src/domain/quotation-delivery";

import type { QuotationDeliveryRepository } from "./QuotationDeliveryRepository";

export class GetQuotationDeliveryHistoryUseCase {
  constructor(
    private readonly quotations: IQuotationRepository,
    private readonly deliveries: QuotationDeliveryRepository,
  ) {}

  async execute(input: {
    companyId: string;
    quotationId: string;
  }): Promise<
    | { success: true; data: QuotationDelivery[] }
    | { success: false; error: { code: "QUOTATION_NOT_FOUND"; message: string } }
  > {
    const quotation = await this.quotations.findById(
      input.companyId,
      input.quotationId,
    );

    if (!quotation) {
      return { success: false, error: { code: "QUOTATION_NOT_FOUND", message: "Quotation not found." } };
    }

    return {
      success: true,
      data: await this.deliveries.findHistory(
        input.companyId,
        input.quotationId,
      ),
    };
  }
}
