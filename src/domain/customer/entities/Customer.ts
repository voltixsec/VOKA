import { CustomerId } from "../value-objects/CustomerId";
import { CustomerName } from "../value-objects/CustomerName";

export class Customer {

  private constructor(
    public readonly id: CustomerId,
    public readonly name: CustomerName,
    public readonly nameAr?: string | null,
    public readonly nameEn?: string | null,
  ) {}

  static create(
    name: string,
    id?: string,
    nameAr?: string | null,
    nameEn?: string | null,
  ): Customer {

    return new Customer(
      CustomerId.create(id),
      CustomerName.create(name),
      nameAr ?? null,
      nameEn ?? null,
    );

  }

}
