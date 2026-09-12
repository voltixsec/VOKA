import { describe, expect, it } from "vitest";
import { ConversationRuntime, type ConversationBrainPort, type ConversationRuntimeState, type ConversationToolPort, type LegacyConversationBrainDecision, type ToolObservation } from "../index";
import { projectIfcInspection } from "@/src/application/source-artifacts";
import { analyzeIfcBytes } from "@/src/infrastructure/source-artifacts/ifc";
import { conflictingIfcModel, fullIfcModel } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8: the BIM channel inside the governed ConversationRuntime.
 */

const now = "2026-09-12T00:00:00.000Z";
const ids = () => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`; };
const requestInspection = (reply: string): LegacyConversationBrainDecision => ({
  reply,
  factProposals: [],
  unresolvedImportantQuestions: [],
  toolRequest: { kind: "ATTACHMENT_INSPECTION", query: "Inspect the retained IFC model", attachmentId: "artifact-1" },
  solutionReadiness: "EXPLORING",
  transition: "NONE",
  compactMemory: "",
  suggestedReplies: [],
});

type Captured = Parameters<ConversationBrainPort["decide"]>[0][];

function ifcObservation(source: string): ToolObservation {
  const analysis = analyzeIfcBytes(Buffer.from(source, "utf8"), { filename: "seafront.ifc" });
  const summary = projectIfcInspection({ artifactId: "artifact-1", filename: "seafront.ifc", analysis });
  return {
    kind: "ATTACHMENT_INSPECTION",
    status: "COMPLETED",
    summary: `I read the IFC model. It declares schema ${summary.ifc.schema}.`,
    evidence: [],
    citations: [],
    artifactId: "artifact-1",
    artifactInspection: summary,
    artifactCandidates: [],
    requirementCandidates: [],
    createdAt: now,
  };
}

function toolPort(observation: ToolObservation): ConversationToolPort {
  return { execute: async ({ request }) => ({ ...observation, kind: request.kind }) };
}

function runtime(brain: ConversationBrainPort, tools: ConversationToolPort, id = ids()) {
  return new ConversationRuntime(brain, tools, () => now, id);
}

const attachment = { id: "artifact-1", name: "seafront.ifc", type: "application/x-step", size: 4096 };

describe("IFC inspection in the governed runtime (2A-8)", () => {
  it("delivers the bounded BIM projection to the assistant", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Here is what the model shows."); } };
    const state = await runtime(brain, toolPort(ifcObservation(fullIfcModel()))).execute({
      state: null, message: "What is in this IFC?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const observation = captured.at(-1)!.toolResults.at(-1)!;
    expect(observation.artifactInspection?.kind).toBe("IFC");
    expect(observation.artifactInspection?.ifc.schema).toBe("IFC4");
    expect(observation.artifactInspection?.ifc.storeyCount).toBe(2);
    expect(state.messages.at(-1)?.text).toContain("Here is what the model shows.");
  });

  it("creates no confirmed fact, requirement, or product selection from BIM evidence", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("Noted the model contents.") };
    const state = await runtime(brain, toolPort(ifcObservation(fullIfcModel()))).execute({
      state: null, message: "How many smoke detectors?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(state.confirmedFacts).toEqual({});
    expect(state.workspace?.requirements ?? {}).toEqual({});
    expect(state.workspace?.products.approvedCandidateIds ?? []).toEqual([]);
    expect(state.toolResults.at(-1)!.artifactCandidates ?? []).toHaveLength(0);
    expect(state.toolResults.at(-1)!.requirementCandidates ?? []).toHaveLength(0);
  });

  it("does not overwrite governed state with a BIM reading", async () => {
    const existing: ConversationRuntimeState = {
      runtimeId: "runtime-1", version: 1, locale: "en", messages: [], candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING",
      transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null,
      confirmedFacts: { "project.name": { key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT", evidence: "Al Hamra Tower", updatedAt: now } },
    };
    const brain: ConversationBrainPort = { decide: async () => requestInspection("Read the project.") };
    const state = await runtime(brain, toolPort(ifcObservation(fullIfcModel()))).execute({
      state: existing, message: "Read the project name", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    expect(state.confirmedFacts["project.name"]).toMatchObject({ value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
  });

  it("keeps conflicting BIM readings visible without resolving them", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Two readings found."); } };
    await runtime(brain, toolPort(ifcObservation(conflictingIfcModel()))).execute({
      state: null, message: "What is this device?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment,
    });
    const candidates = captured.at(-1)!.toolResults.at(-1)!.artifactInspection?.ifc.candidates ?? [];
    const smoke = candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    const heat = candidates.find((candidate) => candidate.label === "Heat Detector")!;
    expect(smoke.conflictsWith).toContain(heat.id);
    expect(heat.conflictsWith).toContain(smoke.id);
  });
});
