import { CreateQuotationUseCase } from "../use-cases/CreateQuotationUseCase";
import { QuotationCustomerResolver } from "./QuotationCustomerResolver";

import type { CreateQuotationDto } from "../dto/CreateQuotationDto";
import type { ApplicationResult } from "../results/ApplicationResult";
import type { Quotation } from "../../../domain/quotation";

export class QuotationApplicationService {

  constructor(
    private readonly customerResolver: QuotationCustomerResolver,
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

    return this.createQuotation.execute({

      ...dto,

      customerId: customer.id.toString(),

    });

  }

}
