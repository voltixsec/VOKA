import type { QuotationDelivery } from "@/src/domain/quotation-delivery";

export interface QuotationDeliveryRepository {
  reserve(delivery: QuotationDelivery): Promise<{
    created: boolean;
    delivery: QuotationDelivery;
  }>;
  update(delivery: QuotationDelivery): Promise<void>;
  findHistory(
    companyId: string,
    quotationId: string,
  ): Promise<QuotationDelivery[]>;
}
