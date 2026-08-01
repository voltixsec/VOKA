import { CustomerId } from "../value-objects/CustomerId";
import { CustomerName } from "../value-objects/CustomerName";

export class Customer {

  private constructor(
    public readonly id: CustomerId,
    public readonly name: CustomerName,
  ) {}

  static create(
    name: string,
    id?: string,
  ): Customer {

    return new Customer(
      CustomerId.create(id),
      CustomerName.create(name),
    );

  }

}
