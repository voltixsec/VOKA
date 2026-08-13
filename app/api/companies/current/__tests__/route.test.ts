import { beforeEach, describe, expect, it, vi } from "vitest";
import { Company } from "@/features/company/domain/entities";
import { UniqueEntityID } from "@/lib/core";

const mocks = vi.hoisted(() => ({ findById: vi.fn(), save: vi.fn() }));

vi.mock("@/features/company/infrastructure/prisma/PrismaCompanyRepository", () => ({
  PrismaCompanyRepository: class {
    findById = mocks.findById;
    save = mocks.save;
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    withCompanyAuth: (_roles: readonly string[], handler: Function) => async (request: Request) => {
      try { return await handler(request, {}, { companyId: "company-1", role: "OWNER" }); }
      catch (error) { return responses.handleApiError(error); }
    },
  };
});

import { PATCH } from "../route";

function company(logoUrl: string | null = null) {
  return Company.restore({
    name: "VOKA", nameAr: null, nameEn: "VOKA", addressAr: null, addressEn: null,
    poBox: null, phone: null, mobile: null, whatsapp: null, logoUrl,
    letterheadUrl: null, signatureUrl: null, stampUrl: null,
    brandTheme: "NAVY_GOLD", slug: "voka", defaultLocale: "EN",
    defaultCurrency: "KWD", timezone: "Asia/Kuwait", isActive: true,
    createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01"),
  }, new UniqueEntityID("company-1"));
}

async function patch(body: Record<string, unknown>) {
  return PATCH(new Request("http://localhost/api/companies/current", {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
}

describe("current company document assets", () => {
  beforeEach(() => {
    mocks.findById.mockReset(); mocks.save.mockReset();
    mocks.save.mockImplementation(async (value) => value);
  });

  it.each([
    ["letterheadUrl", "data:image/png;base64,AAAA"],
    ["signatureUrl", "data:image/jpeg;base64,BBBB"],
    ["stampUrl", "data:image/png;base64,CCCC"],
  ] as const)("persists and returns %s", async (field, value) => {
    mocks.findById.mockResolvedValue(company());
    const response = await patch({ [field]: value });
    expect(response.status).toBe(200);
    expect((await response.json()).data[field]).toBe(value);
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({}));
  });

  it("clears a stored asset", async () => {
    const current = company();
    current.updateIdentity({ stampUrl: "data:image/png;base64,AAAA" });
    mocks.findById.mockResolvedValue(current);
    const response = await patch({ stampUrl: null });
    expect((await response.json()).data.stampUrl).toBeNull();
  });

  it("allows unrelated settings updates when the stored legacy logo is unchanged", async () => {
    const legacy = "data:image/webp;base64,AAAA";
    mocks.findById.mockResolvedValue(company(legacy));
    const response = await patch({ logoUrl: legacy, phone: "12345" });
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.logoUrl).toBe(legacy);
    expect(data.phone).toBe("12345");
  });

  it("rejects a new WebP logo upload", async () => {
    mocks.findById.mockResolvedValue(company());
    const response = await patch({ logoUrl: "data:image/webp;base64,AAAA" });
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
