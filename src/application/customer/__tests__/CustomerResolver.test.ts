import { describe, expect, it } from "vitest";

import { CustomerResolver } from "../services/CustomerResolver";
import { FakeCustomerRepository } from "../repositories/FakeCustomerRepository";

describe("CustomerResolver", () => {

  it("creates customer automatically", async () => {

    const repository = new FakeCustomerRepository();
    const resolver = new CustomerResolver(repository);

    const customer = await resolver.resolve(
      "company-1",
      "First United",
      "info@firstunited.com",
    );

    expect(customer.name.toString()).toBe("First United");
    expect(repository.count()).toBe(1);

  });

  it("returns existing customer", async () => {

    const repository = new FakeCustomerRepository();
    const resolver = new CustomerResolver(repository);

    const first = await resolver.resolve(
      "company-1",
      "First United",
      "info@firstunited.com",
    );

    const second = await resolver.resolve(
      "company-1",
      "First United",
      "info@firstunited.com",
    );

    expect(first.id.toString()).toBe(second.id.toString());
    expect(repository.count()).toBe(1);

  });

});
