import { describe, expect, it } from "vitest";
import { CustomerId } from "../value-objects/CustomerId";

describe("CustomerId", () => {

  it("creates a random id", () => {

    const id = CustomerId.create();

    expect(id.toString()).toBeTruthy();

  });

  it("accepts an existing id", () => {

    const id = CustomerId.create("123");

    expect(id.toString()).toBe("123");

  });

});
