import { describe, expect, it } from "vitest";
import { CustomerName } from "../value-objects/CustomerName";

describe("CustomerName", () => {

  it("creates a valid customer name", () => {
    const name = CustomerName.create("First United");
    expect(name.toString()).toBe("First United");
  });

  it("trims whitespace", () => {
    const name = CustomerName.create("   First United   ");
    expect(name.toString()).toBe("First United");
  });

  it("throws when name is too short", () => {
    expect(() => CustomerName.create("A")).toThrow();
  });

  it("throws when name is too long", () => {
    expect(() => CustomerName.create("A".repeat(201))).toThrow();
  });

});
