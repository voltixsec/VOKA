import {
  describe,
  expect,
  it,
} from "vitest";

import { Quotation } from "../entities/Quotation";

const SUBJECT_AR =
  "\u0639\u0631\u0636 \u0641\u0646\u064a \u0648\u062a\u062c\u0627\u0631\u064a";

const BRIEF_AR =
  "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u0631\u0636";

function createQuotation(): Quotation {
  return new Quotation({
    companyId: "company-1",
    customerId: "customer-1",
    number: "Q-001",
    customer: {
      name: "First United",
    },
    lines: [
      {
        position: 1,
        type: "SERVICE",
        itemName: "Installation service",
        quantity: 1,
        unitPrice: 10,
      },
    ],
  });
}

describe("Quotation proposal metadata", () => {
  it("normalizes bilingual proposal metadata on creation", () => {
    const quotation = new Quotation({
      companyId: "company-1",
      customerId: "customer-1",
      number: "Q-001",
      customer: {
        name: "First United",
      },
      subjectAr: `  ${SUBJECT_AR}  `,
      subjectEn: "  Technical Proposal  ",
      briefAr: `  ${BRIEF_AR}  `,
      briefEn: "  Proposal brief  ",
      projectName: "  VOKA Project  ",
      attentionName: "  Mr. Customer  ",
      scopeType: "SERVICE",
    });

    expect(quotation.subjectAr).toBe(SUBJECT_AR);
    expect(quotation.subjectEn).toBe(
      "Technical Proposal",
    );
    expect(quotation.briefAr).toBe(BRIEF_AR);
    expect(quotation.briefEn).toBe(
      "Proposal brief",
    );
    expect(quotation.projectName).toBe(
      "VOKA Project",
    );
    expect(quotation.attentionName).toBe(
      "Mr. Customer",
    );
    expect(quotation.scopeType).toBe("SERVICE");
  });

  it("supports partial draft updates and explicit clearing", () => {
    const quotation = createQuotation();

    quotation.updateProposal({
      subjectEn: "  Updated subject  ",
      projectName: "  Project A  ",
      scopeType: "SUPPLY_AND_INSTALLATION",
    });

    quotation.updateProposal({
      projectName: null,
    });

    expect(quotation.subjectEn).toBe(
      "Updated subject",
    );
    expect(quotation.projectName).toBeNull();
    expect(quotation.scopeType).toBe(
      "SUPPLY_AND_INSTALLATION",
    );
  });

  it("rejects an invalid runtime scope type", () => {
    expect(
      () =>
        new Quotation({
          companyId: "company-1",
          customerId: "customer-1",
          number: "Q-001",
          customer: {
            name: "First United",
          },
          scopeType: "INVALID" as never,
        }),
    ).toThrow("Quotation scope type is invalid.");
  });

  it("prevents proposal changes after sending", () => {
    const quotation = createQuotation();

    quotation.send();

    expect(() =>
      quotation.updateProposal({
        subjectEn: "Changed after sending",
      }),
    ).toThrow(
      "Only draft quotations can be modified.",
    );
  });

  it("preserves localized line fields when recalculating after discount changes", () => {
    const quotation = new Quotation({
      companyId: "company-1",
      customerId: "customer-1",
      number: "Q-LOCALIZED-001",
      customer: {
        name: "First United",
      },
      lines: [
        {
          position: 1,
          type: "PRODUCT",
          itemName: "اسمنت اسود",
          itemNameAr: "اسمنت اسود",
          itemNameEn: "Black Cement",
          description: "توريد اسمنت اسود",
          descriptionAr: "توريد اسمنت اسود",
          descriptionEn: "Supply of Black Cement",
          unitName: "كيس",
          unitNameAr: "كيس",
          unitNameEn: "Bag",
          quantity: 300,
          unitPrice: 1.25,
        },
      ],
    });

    expect(quotation.lines[0]).toMatchObject({
      itemNameAr: "اسمنت اسود",
      itemNameEn: "Black Cement",
      descriptionAr: "توريد اسمنت اسود",
      descriptionEn: "Supply of Black Cement",
      unitNameAr: "كيس",
      unitNameEn: "Bag",
    });

    quotation.setDiscount({
      type: "PERCENTAGE",
      value: 10,
    });

    expect(quotation.lines[0]).toMatchObject({
      itemNameAr: "اسمنت اسود",
      itemNameEn: "Black Cement",
      descriptionAr: "توريد اسمنت اسود",
      descriptionEn: "Supply of Black Cement",
      unitNameAr: "كيس",
      unitNameEn: "Bag",
    });

    expect(quotation.totals.subtotal).toBe(375);
    expect(quotation.totals.discountAmount).toBe(37.5);
    expect(quotation.totals.totalAmount).toBe(337.5);
  });
});
