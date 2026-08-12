import { describe, expect, it, vi } from "vitest";
import { GetDocumentVerificationUseCase } from "../DocumentVerification";

describe("GetDocumentVerificationUseCase", () => {
  it("rejects malformed tokens without repository access", async () => {
    const repository = { findPublicByToken: vi.fn() };
    expect(await new GetDocumentVerificationUseCase(repository).execute("short")).toBeNull();
    expect(repository.findPublicByToken).not.toHaveBeenCalled();
  });

  it("performs a read-only opaque-token lookup", async () => {
    const value = { result: "CANCELLED" as const, documentType: "QUOTATION" as const, documentNumber: "Q-1", issuingCompanyName: "VOKA", status: "CANCELLED", issueDate: new Date(), approvalDate: new Date(), currencyCode: "KWD", totalValue: 10 };
    const repository = { findPublicByToken: vi.fn().mockResolvedValue(value) };
    const token = "abcdefghijklmnopqrstuvwxyz_ABCDEFG-123456";
    expect(await new GetDocumentVerificationUseCase(repository).execute(token)).toEqual(value);
    expect(repository.findPublicByToken).toHaveBeenCalledWith(token);
  });
});
