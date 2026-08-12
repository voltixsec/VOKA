import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { quotation: { findUnique: mocks.findUnique } } }));
import { GET } from "../route";

const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFG-123456";

describe("public document verification API", () => {
  beforeEach(() => mocks.findUnique.mockReset());

  it("returns only allowlisted public fields", async () => {
    mocks.findUnique.mockResolvedValue({
      number: "Q-1", status: "APPROVED", issueDate: new Date("2026-08-01"), approvedAt: new Date("2026-08-02"),
      currencyCode: "KWD", totalAmount: { toString: () => "100.5" }, isDeleted: false,
      company: { name: "VOKA", nameEn: "VOKA Company" },
      customerEmail: "private@example.com", companyId: "secret", id: "secret",
    });
    const response = await GET(new Request(`http://localhost/api/verify/${token}`));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ result: "VALID", documentType: "QUOTATION", documentNumber: "Q-1", issuingCompanyName: "VOKA Company", status: "APPROVED", issueDate: "2026-08-01T00:00:00.000Z", approvalDate: "2026-08-02T00:00:00.000Z", currencyCode: "KWD", totalValue: 100.5 });
    expect(JSON.stringify(payload)).not.toContain("private@example.com");
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  it("reports cancellation through the same token", async () => {
    mocks.findUnique.mockResolvedValue({ number: "Q-1", status: "CANCELLED", issueDate: new Date(), approvedAt: new Date(), currencyCode: "KWD", totalAmount: 10, isDeleted: false, company: { name: "VOKA", nameEn: null } });
    const response = await GET(new Request(`http://localhost/api/verify/${token}`));
    expect((await response.json()).data.result).toBe("CANCELLED");
  });

  it("returns one safe invalid response and never mutates", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await GET(new Request(`http://localhost/api/verify/${token}`));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ data: { result: "INVALID" } });
    expect(Object.keys(mocks)).toEqual(["findUnique"]);
  });
});
