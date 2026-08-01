import { describe, expect, it } from "vitest";
import { Customer } from "../entities/Customer";

describe("Customer", () => {

  it("creates a valid customer", () => {

    const customer = Customer.create("First United");

    expect(customer.name.toString()).toBe("First United");
    expect(customer.id.toString()).toBeTruthy();

  });

});
