import { describe, expect, it } from "vitest";
import { Quotation, QuotationFinalizationValidator } from "../index";

describe("incomplete quotation Draft readiness", () => {
  it("allows real pending customer, product, quantity, and price in DRAFT", () => {
    const draft = new Quotation({ companyId: "company-1", number: "Q-PENDING-1", customerId: null, customer: null, lines: [{ position: 1, type: "PRODUCT", itemName: "Ceramic tile adhesive", quantity: null, unitPrice: null, productSelectionStatus: "PENDING", quantityStatus: "PENDING", pricingStatus: "PENDING" }] });
    expect(draft.status).toBe("DRAFT");
    expect(draft.lines[0]).toMatchObject({ quantity: null, unitPrice: null, productSelectionStatus: "PENDING" });
    expect(QuotationFinalizationValidator.inspect(draft)).toEqual(expect.arrayContaining(["CUSTOMER_REQUIRED", "PRODUCT_SELECTION_REQUIRED", "QUANTITY_REQUIRED", "PRICE_REQUIRED"]));
  });

  it("blocks send until the Draft is commercially complete", () => {
    const draft = new Quotation({ companyId: "company-1", number: "Q-PENDING-2", customerId: null, customer: null, lines: [{ position: 1, type: "SERVICE", itemName: "Installation", quantity: 450, unitPrice: null, pricingStatus: "PENDING" }] });
    expect(() => draft.send()).toThrow(/CUSTOMER_REQUIRED.*PRICE_REQUIRED/);
    expect(draft.status).toBe("DRAFT");
  });
});
