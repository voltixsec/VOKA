import { describe, expect, it } from "vitest";
import { ConversationRuntime, type ConversationBrainDecision, type ConversationBrainPort, type ConversationRuntimeState, type ConversationToolPort, type LegacyConversationBrainDecision, type ToolObservation } from "../index";
import { projectArtifactInspection } from "@/src/application/source-artifacts";
import { analyzePdfBytes } from "@/src/infrastructure/source-artifacts/DocumentInspectionAnalyzer";
import { BOQ_SHEET, DRAWING_SHEET, buildPdf } from "@/src/infrastructure/source-artifacts/__tests__/fixtures/pdfFixtures";

const now = "2026-09-11T00:00:00.000Z";
const ids = () => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`; };
const decision = (reply: string): ConversationBrainDecision => ({ reply, factProposals: [], unresolvedImportantQuestions: [], toolRequest: null, solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [] });

/** The runtime only invokes a tool when the brain asks for it, so request the attachment inspection explicitly. */
const requestInspection = (reply: string): LegacyConversationBrainDecision => ({
  reply,
  factProposals: [],
  unresolvedImportantQuestions: [],
  toolRequest: { kind: "ATTACHMENT_INSPECTION", query: "Inspect retained file content", attachmentId: "artifact-1" },
  solutionReadiness: "EXPLORING",
  transition: "NONE",
  compactMemory: "",
  suggestedReplies: [],
});

type Captured = Parameters<ConversationBrainPort["decide"]>[0][];

/** Builds the same governed projection the real inspection port produces. */
function inspectedObservation(spec: Parameters<typeof buildPdf>[0], options: { governedFacts?: Array<{ key: string; value: unknown; provenance: "USER_EXPLICIT" }> } = {}): ToolObservation {
  const analysis = analyzePdfBytes(buildPdf(spec));
  const summary = projectArtifactInspection({
    artifactId: "artifact-1",
    filename: "tender.pdf",
    kind: "PDF",
    analysis,
    governedFacts: (options.governedFacts ?? []) as Array<{ key: string; value: string; provenance: "USER_EXPLICIT" }>,
  });
  return { kind: "ATTACHMENT_INSPECTION", status: "COMPLETED", summary: "inspected", evidence: [], citations: [], artifactId: "artifact-1", artifactInspection: summary, artifactCandidates: summary.candidates, createdAt: now };
}

function runtime(brain: ConversationBrainPort, tools: ConversationToolPort, id = ids()) {
  return new ConversationRuntime(brain, tools, () => now, id);
}

function toolPort(observation: ToolObservation | ((input: Parameters<ConversationToolPort["execute"]>[0]) => ToolObservation)): ConversationToolPort {
  return { execute: async ({ request }) => (typeof observation === "function" ? observation({ request } as never) : { ...observation, kind: request.kind }) };
}

describe("PDF inspection in the governed runtime (2A-1C)", () => {
  it("replaces an 'analyzed' claim when the artifact was never inspected", async () => {
    const brain: ConversationBrainPort = { decide: async () => decision("I analyzed the attached PDF and the quantity is approved.") };
    const state = await runtime(brain, toolPort({ kind: "ATTACHMENT_INSPECTION", status: "STORED_PENDING_VISION", summary: "stored", evidence: [], createdAt: now })).execute({
      state: null, message: "Review this file", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.messages.at(-1)?.text).toContain("not inspected successfully");
    expect(state.messages.at(-1)?.text).not.toContain("I analyzed");
  });

  it("delivers the inspected summary, classification, observations, and limitations to the assistant", async () => {
    const captured: Captured = [];
    const brain: ConversationBrainPort = { decide: async (input) => { captured.push(input); return requestInspection("Here is what the file shows."); } };
    const state = await runtime(brain, toolPort(inspectedObservation([DRAWING_SHEET, BOQ_SHEET]))).execute({
      state: null, message: "What is in the file?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    const observation = captured.at(-1)!.toolResults.at(-1)!;
    expect(observation.artifactInspection?.status).toBe("INSPECTED");
    expect(observation.artifactInspection?.classification?.value).toBe("MIXED");
    expect(observation.artifactInspection?.classification?.limitations.length).toBeGreaterThan(0);
    expect(observation.artifactInspection?.observations.length).toBeGreaterThan(0);
    expect(observation.artifactInspection?.observations.every((item) => item.status === "OBSERVED_NOT_APPROVED")).toBe(true);
    expect(observation.artifactInspection?.observations.some((item) => item.pageNumber === 1)).toBe(true);
    expect(observation.artifactInspection?.governance.join(" ")).toContain("not engineering understanding");
    expect(state.messages.at(-1)?.text).toContain("Here is what the file shows.");
  });

  it("keeps an observed quantity out of governed state and out of approval language", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("The observed quantity is approved.") };
    const state = await runtime(brain, toolPort(inspectedObservation([BOQ_SHEET]))).execute({
      state: null, message: "How many?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    expect(Object.keys(state.confirmedFacts).filter((key) => /quantity/iu.test(key))).toEqual([]);
    expect(state.workspace?.requirements ?? {}).toEqual({});
    expect(state.messages.at(-1)?.text).toContain("explicit approval");
    const quantityCandidate = state.toolResults.at(-1)!.artifactCandidates?.find((candidate) => candidate.observationType === "QUANTITY");
    expect(quantityCandidate?.status).toBe("OBSERVED_PENDING_APPROVAL");
    expect(quantityCandidate?.factKey).toBeNull();
  });

  it("does not select a product from observed model or equipment text", async () => {
    const brain: ConversationBrainPort = { decide: async () => requestInspection("The model was found in the file.") };
    const state = await runtime(brain, toolPort(inspectedObservation([DRAWING_SHEET]))).execute({
      state: null, message: "Which model?", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    expect(Object.keys(state.confirmedFacts).filter((key) => key.startsWith("product.selection."))).toEqual([]);
    expect(state.workspace?.products.approvedCandidateIds ?? []).toEqual([]);
    expect(state.workspace?.products.candidates ?? []).toEqual([]);
    expect(state.toolResults.at(-1)!.artifactCandidates?.some((candidate) => candidate.observationType === "MODEL_OR_REFERENCE" && candidate.factKey === null)).toBe(true);
  });

  it("surfaces a conflicting observed value without overwriting governed state", async () => {
    const existing: ConversationRuntimeState = {
      runtimeId: "runtime-1", version: 1, locale: "en", messages: [], candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING",
      transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null,
      confirmedFacts: { "project.name": { key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT", evidence: "Al Hamra Tower", updatedAt: now } },
    };
    const brain: ConversationBrainPort = { decide: async () => requestInspection("Noted the project name from the file.") };
    const state = await runtime(brain, toolPort(inspectedObservation([DRAWING_SHEET], { governedFacts: [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }] }))).execute({
      state: existing, message: "Read the project name", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.confirmedFacts["project.name"]).toMatchObject({ value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
    const conflicts = state.toolResults.at(-1)!.artifactInspection?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: "project.name", governedValue: "Al Hamra Tower", observedValue: "SEAFRONT TOWER" });
  });

  it("keeps the attachment-only flow working", async () => {
    const seen: string[] = [];
    const brain: ConversationBrainPort = { decide: async () => decision("I read the retained file content.") };
    const state = await runtime(brain, toolPort((input) => { seen.push(input.request.kind); return inspectedObservation([BOQ_SHEET]); })).execute({
      state: null, message: "", locale: "en", source: "TEXT", companyId: "tenant-1", attachment: { id: "artifact-1", name: "tender.pdf", type: "application/pdf", size: 10 },
    });
    expect(seen).toContain("ATTACHMENT_INSPECTION");
    expect(state.messages.at(-1)?.text).toBeTruthy();
    expect(state.toolResults.at(-1)!.artifactInspection?.status).toBe("INSPECTED");
  });
});
