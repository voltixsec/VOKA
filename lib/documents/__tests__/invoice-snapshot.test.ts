import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { invoice: { findFirst } } }));

import { ApiError } from "@/lib/api";
import { getInvoiceDocumentSnapshot } from "../invoice-snapshot";
import { COMPANY_IDENTITY_SELECT } from "../company-document-identity";

describe("invoice document snapshot", () => {
  beforeEach(() => {
    findFirst.mockReset();
  });

  it("loads tenant-scoped invoice with company identity fields", async () => {
    findFirst.mockResolvedValue({
      id: "inv-1",
      companyId: "company-1",
      number: "INV-1",
      company: { nameEn: "Horizon Co", logoUrl: "data:image/png;base64,xx" },
      lines: [],
    });
    const row = await getInvoiceDocumentSnapshot("company-1", "inv-1");
    expect(row.number).toBe("INV-1");
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "inv-1", companyId: "company-1" },
      include: { company: { select: COMPANY_IDENTITY_SELECT }, lines: { orderBy: { position: "asc" } } },
    });
  });

  it("does not return another tenant invoice", async () => {
    findFirst.mockResolvedValue(null);
    await expect(getInvoiceDocumentSnapshot("company-1", "other")).rejects.toBeInstanceOf(ApiError);
  });
});
