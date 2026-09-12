import { describe, expect, it } from "vitest";
import { ConversationRuntime, type ConversationBrainDecision, type ConversationBrainPort, type ConversationRuntimeState, type ConversationToolPort, type LegacyConversationBrainDecision, type ToolObservation } from "../index";
import { projectDxfInspection } from "@/src/application/source-artifacts";
import { analyzeDxfBytes } from "@/src/infrastructure/source-artifacts/dxf";
import { conflictingSemanticsDrawing, fullDrawing, xrefDrawing } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/dxfFixtures";

/**
 * Phase 2A-7: the CAD channel inside the governed ConversationRuntime.
 *
 * The inspection port produces a bounded projection; this suite proves the
 * runtime actually delivers it to the assistant and that a drawing cannot
 * create governed state. A semantic candidate reading "Smoke Detector" is the
 * sharpest case: it looks like a product, and the runtime must treat it as
 * observed drawing evidence and nothing more.
 */

const now = "2026-09-12T00:00:00.000Z";
const ids = () => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`; };
const decision = (reply: string): ConversationBrainDecision => ({ reply, factProposals: [], unresolvedImportantQuestions: [], toolRequest: null, solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [] });

/** The runtime only invokes a tool when the brain asks for it, so request the drawing inspection explicitly. */
const requestInspection = (reply: string): LegacyConversationBrainDecision => ({
  reply,
  factProposals: [],
  unresolvedImportantQuestions: [],
  toolRequest: { kind: "DRAWING_INSPECTION", query: "Inspect the retained drawing", attachmentId: "artifact-1" },
  solutionReadiness: "EXPLORING",
  transition: "NONE",
  compactMemory: "",
  suggestedReplies: [],
});

type Captured = Parameters<ConversationBrainPort["decide"]>[0][];

/** Builds the same governed projection the real inspection port produces. */
function dxfObservation(source: string, locale: "ar" | "en" = "en"): ToolObservation {
  const analysis = analyzeDxfBytes(Buffer.from(source, "latin1"), { filename: "site.dxf" });
  const summary = projectDxfInspection({ artifactId: "artifact-1", filename: "site.dxf", analysis });
  return {
    kind: "DRAWING_INSPECTION",
    status: "COMPLETED",
    summary: `I read the drawing. ${summary.dxf.units.declared ? `It declares ${summary.dxf.units.name}.` : "Its units are not declared."}`,
    evidence: [],
    citations: [],
    artifactId: "artifact-1",
    artifactInspection: summary,
    // The real CAD channel never proposes governed fact candidates from a drawing.
    artifactCandidates: [],
    requirementCandidates: [],
    createdAt: now,
    ...(locale === "ar" ? {} : {}),
  };
}

function toolPort(observation: ToolObservation): ConversationToolPort {
  return { execute: async ({ request }) => ({ ...observation, kind: request.kind }) };
}

function runtime(brain: ConversationBrainPort, tools: ConversationToolPort, id = ids()) {
  return new ConversationRuntime(brain, tools, () => now, id);
}

const attachment = { id: "artifact-1", name: "site.dxf", type: "image/vnd.dxf", size: 4096 };

describe("DXF inspection in the governed runtime (2A-7)", () => {
  it("delivers the bounded CAD projection to the assistant", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Here is what the drawing shows."); } };
    const state = await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "What is in this drawing?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const observation = captured.at(-1)!.toolResults.at(-1)!;
    expect(observation.artifactInspection?.kind).toBe("DXF");
    expect(observation.artifactInspection?.status).toBe("INSPECTED");
    expect(observation.artifactInspection?.dxf.units.name).toBe("millimetres");
    expect(observation.artifactInspection?.dxf.modelSpaceEntityCount).toBe(13);
    expect(observation.artifactInspection?.dxf.paperSpaceEntityCount).toBe(2);
    expect(observation.artifactInspection?.dxf.candidates.length).toBeGreaterThan(0);
    expect(state.messages.at(-1)?.text).toContain("Here is what the drawing shows.");
  });

  it("states the CAD governance to the assistant", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Read."); } };
    await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "Read it", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const governance = captured.at(-1)!.toolResults.at(-1)!.artifactInspection?.governance.join(" ") ?? "";
    expect(governance).toContain("no dimension was recalculated or verified");
    expect(governance).toContain("no equipment was counted");
    expect(governance).toContain("never inferred from coordinates");
  });

  it("creates no confirmed fact from drawing evidence", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("Noted the drawing contents.") };
    const state = await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "Read the drawing", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(state.confirmedFacts).toEqual({});
    expect(state.candidateFacts).toEqual([]);
  });

  it("creates no requirement from drawing evidence", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("The drawing implies smoke detectors.") };
    const state = await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "How many smoke detectors?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(state.workspace?.requirements ?? {}).toEqual({});
    expect(Object.keys(state.confirmedFacts).filter((key) => /quantity/iu.test(key))).toEqual([]);
    expect(state.toolResults.at(-1)!.artifactCandidates ?? []).toHaveLength(0);
    expect(state.toolResults.at(-1)!.requirementCandidates ?? []).toHaveLength(0);
  });

  it("does not select a product from a semantic candidate", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("The block SD is a smoke detector.") };
    const state = await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "Which product is this?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(Object.keys(state.confirmedFacts).filter((key) => key.startsWith("product.selection."))).toEqual([]);
    expect(state.workspace?.products.approvedCandidateIds ?? []).toEqual([]);
    expect(state.workspace?.products.candidates ?? []).toEqual([]);
    // The candidate stays observed in the projection, and no promotion is offered.
    const candidates = state.toolResults.at(-1)!.artifactInspection?.dxf.candidates ?? [];
    expect(candidates.some((candidate) => candidate.label === "Smoke Detector")).toBe(true);
    expect(candidates.every((candidate) => candidate.corroborationKinds <= 6)).toBe(true);
  });

  it("keeps conflicting readings visible without resolving them", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Two readings found."); } };
    await runtime(brain, toolPort(dxfObservation(conflictingSemanticsDrawing()))).execute({
      state: null, message: "What is this device?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const candidates = captured.at(-1)!.toolResults.at(-1)!.artifactInspection?.dxf.candidates ?? [];
    const smoke = candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    const heat = candidates.find((candidate) => candidate.label === "Heat Detector")!;
    expect(smoke).toBeDefined();
    expect(heat).toBeDefined();
    expect(smoke.conflictsWith).toContain(heat.id);
    expect(heat.conflictsWith).toContain(smoke.id);
  });

  it("discloses an unopened external CAD reference to the assistant", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Read."); } };
    await runtime(brain, toolPort(dxfObservation(xrefDrawing()))).execute({
      state: null, message: "Read it", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const inspection = captured.at(-1)!.toolResults.at(-1)!.artifactInspection!;
    expect(inspection.dxf.externalReferences).toHaveLength(2);
    expect(inspection.dxf.externalReferences[0]!.path).toContain("example.com");
    expect(inspection.limitations.join(" ")).toContain("not opened, fetched, or resolved");
  });

  it("carries no page number anywhere in the delivered inspection", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Read."); } };
    await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: null, message: "Read it", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const inspection = captured.at(-1)!.toolResults.at(-1)!.artifactInspection!;
    expect(inspection.pageCount).toBeNull();
    expect(inspection.pageClassifications).toEqual([]);
    for (const locator of inspection.dxf.citedLocators) expect(locator.startsWith("DXF:")).toBe(true);
  });

  it("does not overwrite governed state with a drawing reading", async () => {
    const existing: ConversationRuntimeState = {
      runtimeId: "runtime-1", version: 1, locale: "en", messages: [], candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING",
      transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null,
      confirmedFacts: { "project.name": { key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT", evidence: "Al Hamra Tower", updatedAt: now } },
    };
    const brain: ConversationBrainPort = { decide: async () => requestInspection("Read the title block.") };
    const state = await runtime(brain, toolPort(dxfObservation(fullDrawing()))).execute({
      state: existing, message: "Read the project name", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(state.confirmedFacts["project.name"]).toMatchObject({ value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
  });
});
