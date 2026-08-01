import { describe, expect, it } from "vitest";
import { CustomerEmail } from "../value-objects/CustomerEmail";

describe("CustomerEmail", () => {

  it("accepts a valid email", () => {

    const email =
      CustomerEmail.create("Admin@VOKA.local");

    expect(email.toString())
      .toBe("admin@voka.local");

  });

  it("rejects an invalid email", () => {

    expect(() =>
      CustomerEmail.create("abc")
    ).toThrow();

  });

});
