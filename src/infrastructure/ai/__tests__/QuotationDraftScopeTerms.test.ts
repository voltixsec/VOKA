import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
import { PrismaCommercialHandoffQuotationPort } from "../PrismaCommercialHandoffQuotationPort";

describe("Draft handoff scope terms source", () => {
  it("reads the exact tenant and scope and preserves configured legal formatting", async () => {
    const installation = { termsAr: "1. شروط التركيب\n\n  2. بند ثان", termsEn: "1. Installation\n\n  2. Exact company clause" };
    const supply = { termsAr: "توريد فقط", termsEn: "Supply only" };
    const db = { company: { findUnique: vi.fn().mockResolvedValue({ defaultCurrency: "KWD" }) }, companyQuotationTermsTemplate: { findUnique: vi.fn().mockResolvedValueOnce(installation).mockResolvedValueOnce(supply) } };
    const port = new PrismaCommercialHandoffQuotationPort(db as never);
    expect(await port.loadDefaults("tenant-1", "SUPPLY_AND_INSTALLATION", "ar")).toMatchObject(installation);
    expect(await port.loadDefaults("tenant-1", "SUPPLY_ONLY", "en")).toMatchObject(supply);
    expect(db.companyQuotationTermsTemplate.findUnique).toHaveBeenNthCalledWith(1, { where: { companyId_scopeType: { companyId: "tenant-1", scopeType: "SUPPLY_AND_INSTALLATION" } }, select: { termsAr: true, termsEn: true } });
    expect(db.companyQuotationTermsTemplate.findUnique).toHaveBeenNthCalledWith(2, { where: { companyId_scopeType: { companyId: "tenant-1", scopeType: "SUPPLY_ONLY" } }, select: { termsAr: true, termsEn: true } });
    expect(db.company.findUnique).toHaveBeenCalledWith({ where: { id: "tenant-1" }, select: { defaultCurrency: true } });
  });
});
