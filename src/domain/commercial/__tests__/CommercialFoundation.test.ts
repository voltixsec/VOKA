import { describe, expect, it } from "vitest";
import { CommercialDomainError } from "../errors/CommercialDomainError";
import { CommercialDocumentKind } from "../types/CommercialDocumentKind";
import {
  CommercialDocumentOrigin,
  CommercialDocumentProvenance,
} from "../value-objects/CommercialDocumentProvenance";

describe("CommercialDocumentProvenance", () => {
  it("creates valid DIRECT provenance without source information", () => {
    const prov = CommercialDocumentProvenance.direct();
    expect(prov.origin).toBe(CommercialDocumentOrigin.DIRECT);
    expect(prov.sourceKind).toBeNull();
    expect(prov.sourceId).toBeNull();
    expect(prov.isDirect()).toBe(true);
    expect(prov.isSourced()).toBe(false);
  });

  it("rejects DIRECT provenance if sourceId or sourceKind is supplied", () => {
    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: CommercialDocumentOrigin.DIRECT,
          sourceId: "123",
        }),
    ).toThrow(CommercialDomainError);

    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: CommercialDocumentOrigin.DIRECT,
          sourceKind: CommercialDocumentKind.QUOTATION,
        }),
    ).toThrow(CommercialDomainError);
  });

  it("creates valid QUOTATION sourced provenance", () => {
    const prov = CommercialDocumentProvenance.fromQuotation("q_123");
    expect(prov.origin).toBe(CommercialDocumentOrigin.QUOTATION);
    expect(prov.sourceKind).toBe(CommercialDocumentKind.QUOTATION);
    expect(prov.sourceId).toBe("q_123");
    expect(prov.isDirect()).toBe(false);
    expect(prov.isSourced()).toBe(true);
  });

  it("creates valid SALES_ORDER sourced provenance", () => {
    const prov = CommercialDocumentProvenance.fromSalesOrder("so_456");
    expect(prov.origin).toBe(CommercialDocumentOrigin.SALES_ORDER);
    expect(prov.sourceKind).toBe(CommercialDocumentKind.SALES_ORDER);
    expect(prov.sourceId).toBe("so_456");
  });

  it("creates valid CONTRACT sourced provenance", () => {
    const prov = CommercialDocumentProvenance.fromContract("ct_789");
    expect(prov.origin).toBe(CommercialDocumentOrigin.CONTRACT);
    expect(prov.sourceKind).toBe(CommercialDocumentKind.CONTRACT);
    expect(prov.sourceId).toBe("ct_789");
  });

  it("rejects sourced provenance missing sourceId", () => {
    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: CommercialDocumentOrigin.QUOTATION,
          sourceKind: CommercialDocumentKind.QUOTATION,
          sourceId: "   ",
        }),
    ).toThrow(CommercialDomainError);
  });

  it("rejects mismatched origin and sourceKind", () => {
    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: CommercialDocumentOrigin.QUOTATION,
          sourceKind: CommercialDocumentKind.SALES_ORDER,
          sourceId: "so_123",
        }),
    ).toThrow(CommercialDomainError);
  });

  it("rejects invalid origin or invalid sourceKind", () => {
    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: "UNKNOWN" as any,
        }),
    ).toThrow(CommercialDomainError);

    expect(
      () =>
        new CommercialDocumentProvenance({
          origin: CommercialDocumentOrigin.QUOTATION,
          sourceKind: "UNKNOWN" as any,
          sourceId: "123",
        }),
    ).toThrow(CommercialDomainError);
  });
});
