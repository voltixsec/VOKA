import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findById: vi.fn(), update: vi.fn(), companyFindUnique: vi.fn(), signatoryFindFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { company: { findUnique: mocks.companyFindUnique }, authorizedSignatory: { findFirst: mocks.signatoryFindFirst } } }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({
  PrismaQuotationRepository: class { findById = mocks.findById; update = mocks.update; },
}));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError, apiSuccess: responses.apiSuccess,
    withCompanyAuth: (_roles: readonly string[], handler: Function) => (request: Request) =>
      handler(request, { user: { name: "Approver", email: "approver@example.com" } }, { companyId: "company-1", role: "OWNER" }),
  };
});

import { Quotation } from "@/src/domain/quotation";
import { LocalizationStatus } from "@/src/domain/quotation/types/LocalizationStatus";
import { POST } from "../route";

describe("quotation approval document brand snapshot", () => {
  beforeEach(() => { mocks.findById.mockReset(); mocks.update.mockReset(); mocks.companyFindUnique.mockReset(); mocks.signatoryFindFirst.mockReset(); mocks.signatoryFindFirst.mockResolvedValue(null); });

  it("captures the effective company identity at approval", async () => {
    const quotation = Quotation.restore({
      id: "quotation-1", companyId: "company-1", customerId: "customer-1",
      number: "Q-001", status: "SENT", customer: { name: "Customer" },
      lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
    });
    mocks.findById.mockResolvedValue(quotation);
    mocks.update.mockResolvedValue(undefined);
    mocks.companyFindUnique.mockResolvedValue({
      name: "VOKA", nameAr: "شركة فوكا", nameEn: "VOKA", addressAr: "الكويت", addressEn: "Kuwait",
      poBox: "123", phone: "222", mobile: "333", whatsapp: "444",
      logoUrl: "data:image/png;base64,AAAA", brandTheme: "EMERALD",
      letterheadUrl: "data:image/png;base64,BBBB",
      signatureUrl: "data:image/jpeg;base64,CCCC",
      stampUrl: "data:image/png;base64,DDDD",
    });
    const response = await POST(new Request("http://localhost/api/quotations/quotation-1/approve", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(quotation.documentBrandSnapshot).toEqual({
      version: 3, nameAr: "شركة فوكا", nameEn: "VOKA",
      addressAr: "الكويت", addressEn: "Kuwait", poBox: "123",
      phone: "222", mobile: "333", whatsapp: "444",
      logoUrl: "data:image/png;base64,AAAA", brandTheme: "EMERALD",
      letterheadUrl: "data:image/png;base64,BBBB",
      signatureUrl: "data:image/jpeg;base64,CCCC",
      stampUrl: "data:image/png;base64,DDDD",
      authorizedSignatory: null,
    });
    expect(mocks.update).toHaveBeenCalledWith("company-1", quotation);
  });

  it("snapshots the active default quotation signatory separately from the approval actor", async () => {
    const quotation = Quotation.restore({
      id: "quotation-1", companyId: "company-1", customerId: "customer-1", number: "Q-001", status: "SENT",
      customer: { name: "Customer" }, lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
    });
    mocks.findById.mockResolvedValue(quotation); mocks.update.mockResolvedValue(undefined);
    mocks.companyFindUnique.mockResolvedValue({ name: "VOKA", nameAr: null, nameEn: "VOKA", addressAr: null, addressEn: null, poBox: null, phone: null, mobile: null, whatsapp: null, logoUrl: null, letterheadUrl: null, signatureUrl: null, stampUrl: null, brandTheme: "NAVY_GOLD" });
    mocks.signatoryFindFirst.mockResolvedValue({ id: "signatory-1", nameAr: "أحمد", nameEn: "Ahmed", titleAr: "المدير", titleEn: "Director", signatureUrl: "data:image/png;base64,AAAA" });
    await POST(new Request("http://localhost/api/quotations/quotation-1/approve", { method: "POST" }));
    expect(quotation.approvedByName).toBe("Approver");
    expect(quotation.documentBrandSnapshot).toEqual(expect.objectContaining({ authorizedSignatory: expect.objectContaining({ id: "signatory-1", nameEn: "Ahmed" }) }));
  });

  it("returns conflict without snapshotting while localization is pending", async () => {
    const quotation = Quotation.restore({
      id: "quotation-1", companyId: "company-1", customerId: "customer-1",
      number: "Q-001", status: "SENT", localizationStatus: LocalizationStatus.PENDING,
      customer: { name: "Customer" },
      lines: [{ position: 1, type: "SERVICE", itemName: "Service", quantity: 1, unitPrice: 10 }],
    });
    mocks.findById.mockResolvedValue(quotation);
    mocks.companyFindUnique.mockResolvedValue({
      name: "VOKA", nameAr: null, nameEn: "VOKA", addressAr: null, addressEn: null,
      poBox: null, phone: null, mobile: null, whatsapp: null, logoUrl: null,
      letterheadUrl: null, signatureUrl: null, stampUrl: null, brandTheme: "NAVY_GOLD",
    });

    await expect(POST(new Request("http://localhost/api/quotations/quotation-1/approve", { method: "POST" })))
      .rejects.toEqual(expect.objectContaining({
        statusCode: 409,
        code: "QUOTATION_LOCALIZATION_PENDING",
      }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(quotation.documentBrandSnapshot).toBeNull();
  });
});
