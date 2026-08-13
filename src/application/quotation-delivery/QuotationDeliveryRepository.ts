import type { QuotationDelivery } from "@/src/domain/quotation-delivery";

export interface QuotationDeliveryRepository {
  create(delivery: QuotationDelivery): Promise<void>;
  update(delivery: QuotationDelivery): Promise<void>;
  findHistory(
    companyId: string,
    quotationId: string,
  ): Promise<QuotationDelivery[]>;
}
