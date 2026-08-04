import { CreateQuotationUseCase } from "../use-cases/CreateQuotationUseCase";
import { QuotationCustomerResolver } from "./QuotationCustomerResolver";

import type { CreateQuotationDto } from "../dto/CreateQuotationDto";
import type { ApplicationResult } from "../results/ApplicationResult";
import type { Quotation } from "../../../domain/quotation";

import { PriceListResolver } from "../../pricelist/services";

export class QuotationApplicationService {

  constructor(
    private readonly customerResolver: QuotationCustomerResolver,
    private readonly priceListResolver: PriceListResolver,
    private readonly createQuotation: CreateQuotationUseCase,
  ) {}

  async execute(
    dto: CreateQuotationDto,
  ): Promise<ApplicationResult<Quotation>> {

    const customer =
      await this.customerResolver.resolve({
        companyId: dto.companyId,
        customer: dto.customer,
      });

    const priceListId =
      dto.priceListId ??
      await this.priceListResolver.resolve({
        companyId: dto.companyId,
        customerId: customer.id.toString(),
        currencyCode: dto.currencyCode,
      });

    return this.createQuotation.execute({
      ...dto,
      customerId: customer.id.toString(),
      priceListId,
    });

  }

}
