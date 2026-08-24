import { describe, expect, it } from "vitest";
import { Quotation, QuotationDomainError } from "..";

function historical(status: "DRAFT" | "SENT" | "APPROVED" = "APPROVED") {
  return Quotation.restore({
    id: "quotation-rev-1",
    companyId: "company-1",
    customerId: "customer-1",
    number: "QT-100",
    familyId: "quotation-original",
    revisionNumber: 1,
    previousRevisionId: "quotation-original",
    isCurrentRevision: false,
    supersededAt: new Date("2026-08-25T00:00:00Z"),
    status,
    customer: { name: "Customer" },
  });
}

describe("Quotation revision integrity", () => {
  it("rejects invalid revision numbers", () => {
    expect(() => Quotation.restore({
      id: "q-1", companyId: "c-1", customerId: "customer-1", number: "QT-1",
      revisionNumber: -1, customer: { name: "Customer" },
    })).toThrow(QuotationDomainError);
  });

  it("keeps historical drafts read-only", () => {
    expect(() => historical("DRAFT").updateText("changed", null)).toThrow(
      "Historical quotation revisions are read-only.",
    );
  });

  it("keeps historical lifecycle state immutable", () => {
    expect(() => historical("SENT").approve({
      version: 1, nameAr: null, nameEn: "Company", addressAr: null,
      addressEn: null, poBox: null, phone: null, mobile: null,
      whatsapp: null, logoUrl: null, brandTheme: "NAVY_GOLD",
    }, { name: "Approver", role: "OWNER" }))
      .toThrow("Historical quotation revisions are read-only.");
  });
});
