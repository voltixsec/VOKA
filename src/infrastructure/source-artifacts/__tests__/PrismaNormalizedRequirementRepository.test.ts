import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSystemConfigurationGraph, type ConfirmedFact, type ToolCitation } from "@/src/application/conversation-runtime";

const db = vi.hoisted(() => ({ requirement: { upsert: vi.fn() }, citation: { findMany: vi.fn() }, requirementCitation: { upsert: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { citationsSupportingRequirement, PrismaNormalizedRequirementRepository } from "../PrismaNormalizedRequirementRepository";

const fact = (key: string, value: string | number): ConfirmedFact => ({ key, value, provenance: "USER_EXPLICIT", evidence: String(value), updatedAt: "2026-09-10T00:00:00.000Z" });
const vehicleFacts: Record<string, ConfirmedFact> = { "system.identity": fact("system.identity", "Vehicle Elevator"), "system.quantity": fact("system.quantity", 1), "system.numberOfStops": fact("system.numberOfStops", 6) };
const citation = (id: string, supportedClaimSummary: string): ToolCitation => ({ id, sourceArtifactId: "artifact-1", sourceType: "SOURCE_ARTIFACT_TEXT", title: "boq.pdf", pageNumber: 1, provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", supportedClaimSummary });

async function synchronize(conversationRuntimeId: string, facts = vehicleFacts, citations: ToolCitation[] = []) {
  await new PrismaNormalizedRequirementRepository().synchronize({ companyId: "tenant-1", userId: "user-1", conversationRuntimeId, facts, graph: buildSystemConfigurationGraph(facts), citations });
  return db.requirement.upsert.mock.calls.map((call) => call[0].where.companyId_stableKey.stableKey as string);
}

describe("runtime-scoped normalized requirements", () => {
  beforeEach(() => { vi.clearAllMocks(); db.requirement.upsert.mockResolvedValue({ id: "requirement-1" }); db.citation.findMany.mockResolvedValue([]); });

  it("keeps stable keys stable across edits inside one conversation and isolated across conversations", async () => {
    const first = await synchronize("runtime-A");
    expect(first).toEqual(["SALES_ASSISTANT:runtime:runtime-A:fact:system.quantity", "SALES_ASSISTANT:runtime:runtime-A:fact:system.numberOfStops"]);
    vi.clearAllMocks(); db.requirement.upsert.mockResolvedValue({ id: "requirement-1" }); db.citation.findMany.mockResolvedValue([]);
    const corrected = await synchronize("runtime-A", { ...vehicleFacts, "system.numberOfStops": fact("system.numberOfStops", 7) });
    expect(corrected).toEqual(first);
    expect(db.requirement.upsert.mock.calls[1]?.[0].update).toMatchObject({ quantity: 7, revision: { increment: 1 } });
    vi.clearAllMocks(); db.requirement.upsert.mockResolvedValue({ id: "requirement-1" }); db.citation.findMany.mockResolvedValue([]);
    const other = await synchronize("runtime-B");
    expect(other.every((key) => !first.includes(key))).toBe(true);
    expect(db.requirement.upsert.mock.calls[0]?.[0].create).toMatchObject({ companyId: "tenant-1", correctionTrace: { conversationRuntimeId: "runtime-B" } });
  });

  it("does not invent BOM component requirements for a Vehicle Elevator", async () => {
    const keys = await synchronize("runtime-A");
    expect(keys.some((key) => key.includes(":component:"))).toBe(false);
  });

  it("links a citation only to the requirement whose claim it demonstrably supports", async () => {
    db.citation.findMany.mockResolvedValue([{ id: "citation-kuwait" }, { id: "citation-unrelated" }]);
    const facts = { ...vehicleFacts, "system.jurisdiction": fact("system.jurisdiction", "Kuwait") };
    await synchronize("runtime-A", facts, [citation("citation-kuwait", "Project located in Kuwait, six stops"), citation("citation-unrelated", "Cable tray schedule")]);
    expect(db.requirementCitation.upsert).toHaveBeenCalledTimes(1);
    expect(db.requirementCitation.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ citationId: "citation-kuwait" }) }));
    expect(citationsSupportingRequirement([citation("c1", "Vehicle Elevator, 6 stops")], ["Vehicle Elevator"]).map((item) => item.id)).toEqual(["c1"]);
    expect(citationsSupportingRequirement([citation("c1", "Vehicle Elevator, 6 stops")], [])).toEqual([]);
  });

  it("never links citations owned by another tenant", async () => {
    db.citation.findMany.mockResolvedValue([]);
    await synchronize("runtime-A", { ...vehicleFacts, "system.jurisdiction": fact("system.jurisdiction", "Kuwait") }, [citation("foreign", "Kuwait")]);
    expect(db.citation.findMany).toHaveBeenCalledWith({ where: { id: { in: ["foreign"] }, companyId: "tenant-1" }, select: { id: true } });
    expect(db.requirementCitation.upsert).not.toHaveBeenCalled();
  });
});
