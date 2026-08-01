import type { Customer } from "../../../domain/customer/entities/Customer";
import { CustomerResolver } from "../../customer/services/CustomerResolver";

export interface ResolveQuotationCustomerRequest {

  companyId: string;

  customer: {

    name: string;

    email?: string;

  };

}

export class QuotationCustomerResolver {

  constructor(

    private readonly customerResolver: CustomerResolver,

  ) {}

  async resolve(

    request: ResolveQuotationCustomerRequest,

  ): Promise<Customer> {

    return this.customerResolver.resolve(

      request.companyId,

      request.customer.name,

      request.customer.email,

    );

  }

}
