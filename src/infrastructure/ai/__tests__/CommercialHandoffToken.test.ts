import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommercialSolutionHandoff } from "@/src/application/conversation-runtime";
import { signCommercialHandoff, verifyCommercialHandoff } from "../CommercialHandoffToken";

const previousSecret = process.env.JWT_ACCESS_SECRET;
const handoff: CommercialSolutionHandoff = { runtimeId: "runtime-1", confirmedFacts: {}, commercialLines: [], toolEvidence: [], createdAt: "2026-08-31T00:00:00.000Z" };
describe("CommercialHandoffToken", () => {
  beforeEach(() => { process.env.JWT_ACCESS_SECRET = "test-only-secret-that-is-at-least-thirty-two-characters"; });
  afterEach(() => { if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET; else process.env.JWT_ACCESS_SECRET = previousSecret; });
  it("round-trips a signed handoff only for its company", async () => {
    const token = await signCommercialHandoff(handoff, "tenant-1");
    await expect(verifyCommercialHandoff(token, "tenant-1")).resolves.toEqual(handoff);
    await expect(verifyCommercialHandoff(token, "tenant-2")).rejects.toThrow("COMMERCIAL_HANDOFF_INVALID");
  });
  it("rejects tampered envelopes", async () => {
    const token = await signCommercialHandoff(handoff, "tenant-1");
    const parts = token.split(".");
    parts[1] = `${parts[1].slice(0, 5)}${parts[1][5] === "a" ? "b" : "a"}${parts[1].slice(6)}`;
    const tampered = parts.join(".");
    await expect(verifyCommercialHandoff(tampered, "tenant-1")).rejects.toThrow();
  });
});
