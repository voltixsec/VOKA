import { describe, expect, it } from "vitest";
import { asksForProductOptions } from "../product-options";

describe("product options intent regression", () => {
  it("recognizes the manual acceptance Arabic product-options request", () => {
    expect(
      asksForProductOptions(
        "\u0647\u0627\u062a\u0644\u064a \u0623\u0641\u0636\u0644 3 \u0627\u062e\u062a\u064a\u0627\u0631\u0627\u062a \u062d\u0642\u064a\u0642\u064a\u0629 \u0645\u0646\u0627\u0633\u0628\u0629 \u0644\u0644\u0643\u0648\u064a\u062a",
      ),
    ).toBe(true);
  });
});