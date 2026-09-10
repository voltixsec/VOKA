import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: {
    id: "takeoff-1", companyId: "company-1", sourceFileName: "tower.pdf", status: "CONFIRMED", quotationId: null,
    lines: [{ id: "line-1", position: 1, itemName: "IP camera", description: "Outdoor", quantity: 12, unitName: "pcs", provenance: "DRAWING_COUNTED", isConfirmed: true }],
  },
  prisma: { drawingTakeoffSession: { findFirst: vi.fn(), updateMany: vi.fn() } },
  findById: vi.fn(), findByFamilyId: vi.fn(), execute: vi.fn(), getCustomerSnapshot: vi.fn(), loadDefaults: vi.fn(),
  after: vi.fn(), roles: [] as readonly string[],
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationRepository", () => ({ PrismaQuotationRepository: class { findById = mocks.findById; findByFamilyId = mocks.findByFamilyId; } }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationReferenceValidator", () => ({ PrismaQuotationReferenceValidator: class { getCustomerSnapshot = mocks.getCustomerSnapshot; } }));
vi.mock("@/src/infrastructure/persistence/prisma/quotation/PrismaQuotationNumberGenerator", () => ({ PrismaQuotationNumberGenerator: class {} }));
vi.mock("@/src/application/quotation", () => ({ CreateQuotationUseCase: class { execute = mocks.execute; } }));
vi.mock("@/src/infrastructure/ai/PrismaCommercialHandoffQuotationPort", () => ({ PrismaCommercialHandoffQuotationPort: class { loadDefaults = mocks.loadDefaults; } }));
vi.mock("@/src/infrastructure/translation/quotation/QuotationLocalizationJobRunner", () => ({ QuotationLocalizationJobRunner: class {} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return { ApiError: errors.ApiError, apiSuccess: responses.apiSuccess, withCompanyAuth: (roles: readonly string[], handler: Function) => { mocks.roles = roles; return async (request: Request) => { try { return await handler(request, {}, { companyId: "company-1" }); } catch (error) { return responses.handleApiError(error); } }; } };
});

import { POST } from "../route";

describe("POST /api/drawing-takeoffs/:sessionId/quotation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.drawingTakeoffSession.findFirst.mockResolvedValue(mocks.session);
    mocks.prisma.drawingTakeoffSession.updateMany.mockResolvedValue({ count: 1 });
    mocks.findByFamilyId.mockResolvedValue(null);
    mocks.findById.mockResolvedValue(null);
    mocks.loadDefaults.mockResolvedValue({ currencyCode: "KWD", termsAr: "شروط الشركة", termsEn: "Company terms", payment: null, delivery: null, warranty: null, validity: null });
    mocks.execute.mockResolvedValue({ success: true, data: { id: "quotation-1", status: "DRAFT", localizationStatus: "COMPLETED" } });
  });

  it("creates a customer-optional draft from confirmed quantities without inventing prices", async () => {
    const response = await POST(new Request("http://localhost/api/drawing-takeoffs/takeoff-1/quotation", { method: "POST", body: JSON.stringify({ locale: "en" }) }));
    expect(response.status).toBe(201);
    expect(mocks.roles).toEqual(["OWNER", "ADMIN", "SALES"]);
    const dto = mocks.execute.mock.calls[0][0];
    expect(dto).toMatchObject({ customerId: null, customer: null, familyId: "drawing-takeoff:takeoff-1" });
    expect(dto.lines).toEqual([expect.objectContaining({ itemName: "IP camera", quantity: 12, unitPrice: null, quantityStatus: "CONFIRMED", pricingStatus: "PENDING", provenance: "DRAWING_COUNTED", engineeringComponentKeys: ["line-1"] })]);
    expect(mocks.prisma.drawingTakeoffSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONVERTED", quotationId: "quotation-1" }) }));
  });

  it("refuses a handoff until the takeoff is explicitly confirmed", async () => {
    mocks.prisma.drawingTakeoffSession.findFirst.mockResolvedValue({ ...mocks.session, status: "REVIEW_REQUIRED", lines: [{ ...mocks.session.lines[0], isConfirmed: false }] });
    const response = await POST(new Request("http://localhost/api/drawing-takeoffs/takeoff-1/quotation", { method: "POST", body: JSON.stringify({ locale: "en" }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "TAKEOFF_NOT_CONFIRMED" } });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
