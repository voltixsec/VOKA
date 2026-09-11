import { describe, expect, it, vi } from "vitest";
import { ConversationRuntime, buildSystemConfigurationGraph, projectWorkspaceGraph, resolveEngineeringState, type ConversationBrainPort, type ConversationRuntimeState, type ConversationToolPort, type FlexibleTurnProposal } from "../index";

const now = "2026-09-10T10:00:00.000Z";
const ids = () => { let value = 0; return () => `ve-${++value}`; };
const tools: ConversationToolPort = { execute: vi.fn(async ({ request }) => ({ kind: request.kind, status: "UNAVAILABLE" as const, summary: "not used", evidence: [], createdAt: now })) };
const proposal = (overrides: Partial<FlexibleTurnProposal> = {}): FlexibleTurnProposal => ({
  responseMode: "ACK", intent: "UPDATE_SOLUTION", patches: [], researchRequests: [], recommendations: [], assumptions: [], blockingQuestion: null,
  responseContent: "تم تثبيت البيانات.", unresolvedImportantQuestions: [], solutionReadiness: "MATURE", transition: "NONE", compactMemory: "", suggestedReplies: [], ...overrides,
});
const run = (brain: ConversationBrainPort, message: string, state: ConversationRuntimeState | null = null, action: "TURN" | "RECONCILE" = "TURN") =>
  new ConversationRuntime(brain, tools, () => now, ids()).execute({ state, message, locale: "ar", source: action === "RECONCILE" ? "CHIP" : "TEXT", companyId: "tenant-1", action });

/** Every second patch path an AI proposal could use to smuggle facts, components or products past the governed authority. */
const leakyPatches: FlexibleTurnProposal["patches"] = [
  { operation: "SET", path: "facts.system.quantity", value: 4, evidence: "four units", provenance: "AI_INFERRED" },
  { operation: "SET", path: "facts.system.numberOfStops", value: 9, evidence: "nine stops", provenance: "USER_EXPLICIT" },
  { operation: "SET", path: "facts.system.vehicleClass", value: "SUV", evidence: "SUV", provenance: "AI_INFERRED" },
  { operation: "PROPOSE", path: "engineering.components", value: ["Hydraulic power unit", "Car platform", "Guide rails"], evidence: "typical", provenance: "AI_INFERRED" },
  { operation: "PROPOSE", path: "engineering.bom", value: [{ id: "VE_MOTOR", componentKeys: ["VE_MOTOR"], category: "PRODUCT", itemName: "Motor", itemNameAr: "موتور", itemNameEn: "Motor", description: null, unitName: "pcs", quantity: 2, quantityState: "CONFIRMED", unitPrice: null, priceState: "PENDING", type: "PRODUCT", provenance: "AI_INFERRED" }], evidence: "typical", provenance: "AI_INFERRED" },
  { operation: "APPROVE", path: "products.candidates.cand-1", value: null, evidence: "approve", provenance: "USER_EXPLICIT" },
];

describe("vehicle elevator: one governed authority", () => {
  it("keeps system=Vehicle Elevator, quantity=1, stops=6 from the explicit Arabic request and rejects every unapproved patch path", async () => {
    const brain: ConversationBrainPort = { decide: async () => proposal({ patches: leakyPatches, solutionReadiness: "READY_FOR_HANDOFF", transition: "CONFIRM" }) };
    const first = await run(brain, "أريد نظام مصعد سيارات واحد لستة طوابق");
    expect(first.confirmedFacts).toMatchObject({ "system.identity": { value: "مصعد سيارات", provenance: "USER_EXPLICIT" }, "system.quantity": { value: 1, provenance: "USER_EXPLICIT" }, "system.numberOfStops": { value: 6, provenance: "USER_EXPLICIT" } });
    expect(first.confirmedFacts["system.vehicleClass"]).toBeUndefined();
    expect(first.candidateFacts.filter((fact) => fact.status === "PENDING_APPROVAL").map((fact) => fact.key)).toEqual(["system.vehicleClass"]);
    expect(first.candidateFacts.find((fact) => fact.key === "system.quantity")).toMatchObject({ status: "REJECTED", rejectionReason: "CONTRADICTS_VERBATIM_USER_STATEMENT" });
    expect(first.candidateFacts.find((fact) => fact.key === "system.numberOfStops")).toMatchObject({ status: "REJECTED", rejectionReason: "USER_EVIDENCE_NOT_VERBATIM" });
    const workspace = first.workspace!;
    expect(workspace.engineering.system?.key).toBe("VEHICLE_ELEVATOR");
    expect(workspace.requirements).toMatchObject({ "system.quantity": 1, "system.numberOfStops": 6 });
    expect(workspace.engineering.bom).toEqual([]);
    expect(workspace.commercialSolution.bom).toEqual([]);
    expect(workspace.products).toEqual({ candidates: [], approvedCandidateIds: [] });
    expect(first.solutionGraph?.engineeringBom).toEqual([]);
    expect(first.solutionGraph?.salesBom).toEqual([]);
    expect(workspace.readiness.engineeringState).toBe("ENGINEERING_REVIEW_REQUIRED");
    expect(workspace.readiness.pendingBeforeFinalIssue).toEqual(expect.arrayContaining(["Engineering components", "Product selection", "Pricing"]));
    expect(workspace.readiness.draftReady).toBe(true);
    // The projected graph used by workspace rendering and handoff is the same authority.
    const projected = projectWorkspaceGraph(workspace, buildSystemConfigurationGraph(first.confirmedFacts));
    expect(projected.engineeringBom).toEqual([]);
    expect(projected.salesBom).toEqual([]);
    expect(projected.readiness.engineeringState).toBe("ENGINEERING_REVIEW_REQUIRED");
  });

  it("promotes only the pending AI proposal on explicit approval and never above an explicit user fact", async () => {
    const proposing: ConversationBrainPort = { decide: async () => proposal({ patches: [{ operation: "SET", path: "facts.system.vehicleClass", value: "SUV", evidence: "SUV", provenance: "AI_INFERRED" }, { operation: "SET", path: "facts.system.quantity", value: 3, evidence: "three", provenance: "AI_INFERRED" }] }) };
    const first = await run(proposing, "أريد نظام مصعد سيارات واحد لستة طوابق");
    expect(first.confirmedFacts["system.vehicleClass"]).toBeUndefined();
    // The same-turn machine counter-proposal for a verbatim user fact is rejected, not parked for a blanket approval.
    expect(first.candidateFacts.find((fact) => fact.key === "system.quantity")).toMatchObject({ status: "REJECTED", rejectionReason: "CONTRADICTS_VERBATIM_USER_STATEMENT" });
    const quiet: ConversationBrainPort = { decide: async () => proposal({ responseContent: "تم." }) };
    const approved = await run(quiet, "اعتمد", first);
    expect(approved.confirmedFacts["system.vehicleClass"]).toMatchObject({ value: "SUV", provenance: "USER_APPROVED", evidence: "اعتمد" });
    expect(approved.confirmedFacts["system.quantity"]).toMatchObject({ value: 1, provenance: "USER_EXPLICIT" });
    expect(approved.workspace?.requirements).toMatchObject({ "system.quantity": 1, "system.numberOfStops": 6, "system.vehicleClass": "SUV" });
    expect(approved.workspace?.engineering.bom).toEqual([]);
    const corrected = await run(quiet, "غيّر العدد إلى 2 والوقفات إلى 7", approved);
    expect(corrected.confirmedFacts["system.quantity"]).toMatchObject({ value: 2 });
    expect(corrected.confirmedFacts["system.numberOfStops"]).toMatchObject({ value: 7 });
    const reconciled = await run(quiet, "", corrected, "RECONCILE").catch(() => null);
    expect(reconciled).toBeNull();
    const reconciledProperly = await run(quiet, "Reconcile", corrected, "RECONCILE");
    expect(reconciledProperly.confirmedFacts).toMatchObject({ "system.quantity": { value: 2 }, "system.numberOfStops": { value: 7 }, "system.vehicleClass": { value: "SUV", provenance: "USER_APPROVED" } });
    expect(reconciledProperly.workspace?.engineering.bom).toEqual([]);
    expect(reconciledProperly.workspace?.readiness.engineeringState).toBe("ENGINEERING_REVIEW_REQUIRED");
  });

  it("names unresolved BOM states honestly without inventing components", () => {
    const identity = { key: "system.identity", value: "Vehicle Elevator", provenance: "USER_EXPLICIT" as const, evidence: "Vehicle Elevator", updatedAt: now };
    const vehicle = buildSystemConfigurationGraph({ "system.identity": identity });
    expect(vehicle.engineeringBom).toEqual([]);
    expect(vehicle.readiness.engineeringState).toBe("ENGINEERING_REVIEW_REQUIRED");
    expect(resolveEngineeringState({ ...vehicle, unresolvedDecisions: [] })).toBe("SYSTEM_KNOWN");
    expect(resolveEngineeringState({ ...vehicle, unresolvedDecisions: [], requirements: [{ key: "system.numberOfStops", labelAr: "الوقفات", labelEn: "Stops", value: 6, provenance: "USER_EXPLICIT" }] })).toBe("REQUIREMENTS_PARTIAL");
    const cctv = buildSystemConfigurationGraph({ "system.identity": { ...identity, value: "CCTV" }, "system.cameraCount": { ...identity, key: "system.cameraCount", value: 8, evidence: "8" } });
    expect(cctv.readiness.engineeringState).toBe("BOM_RESOLVED");
    expect(resolveEngineeringState({ system: null, requirements: [], engineeringBom: [], unresolvedDecisions: [] })).toBeUndefined();
  });
});
