import { describe, expect, it } from "vitest";
import { ConversationRuntime, type ConversationBrainDecision, type ConversationBrainPort, type ConversationRuntimeState, type ConversationToolPort, type ToolObservation } from "../index";
import { normalizeDrawingDrafts, type ObservedFact } from "@/src/domain/source-artifact";
import { projectArtifactInspection, renderInspectionBrief, type ArtifactAnalysisInput } from "@/src/application/source-artifacts";

/**
 * Phase 2A-4 in the governed runtime: the drawing brief rides the accepted
 * truthfulness enforcement. A COMPLETED drawing reading may be quoted
 * truthfully; a not-run boundary still blocks "I analyzed it" claims; and a
 * quantity-takeoff claim from a drawing observation is kept out of governed
 * state exactly like 2A-1C's text behavior.
 */

const now = "2026-09-11T00:00:00.000Z";
const ids = () => { let id = 0; return () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`; };
const decision = (reply: string): ConversationBrainDecision => ({ reply, factProposals: [], unresolvedImportantQuestions: [], toolRequest: null, solutionReadiness: "EXPLORING", transition: "NONE", compactMemory: "", suggestedReplies: [] });
const requestDrawing = (reply: string) => ({
  reply,
  factProposals: [],
  unresolvedImportantQuestions: [],
  toolRequest: { kind: "DRAWING_INSPECTION" as const, query: "inspect the drawing", attachmentId: "artifact-1" },
  solutionReadiness: "EXPLORING" as const,
  transition: "NONE" as const,
  compactMemory: "",
  suggestedReplies: [] as string[],
});

function drawingFacts(items: Array<[string, string]>, pageNumber: number | null = 4): ObservedFact[] {
  return items.flatMap(([type, value]) => normalizeDrawingDrafts(
    [{ type, description: value, confidence: 0.9, region: null, limitations: [] }],
    { providerId: "openai-compatible-vision", artifactId: "artifact-1", pageNumber, attribution: pageNumber === null ? "UNATTRIBUTED" : "PAGE_TREE", surface: "PAGE" },
  ).observations);
}

function analysisWith(observations: ObservedFact[]): ArtifactAnalysisInput {
  return {
    inspection: {
      format: "PDF",
      text: "DRAWING NO: M-201 REV: B",
      pages: [],
      document: { pageCount: 12, pageAttributionReliable: true, encrypted: false, producer: null, creator: null, title: null, limitations: [] },
    },
    classification: null,
    observations,
    limitations: [],
    vision: { attempted: true, providerId: "openai-compatible-vision" },
    drawing: { attempted: true, pages: [4], outcome: "RAN" },
  };
}

function drawingObservation(locale: "en" | "ar", status: ToolObservation["status"]): ToolObservation {
  const summary = projectArtifactInspection({
    artifactId: "artifact-1",
    filename: "m-201.pdf",
    kind: "PDF",
    analysis: analysisWith(drawingFacts([
      ["DRAWING_NUMBER", "M-201"],
      ["REVISION", "B"],
      ["EQUIPMENT_REFERENCE", "AHU-01"],
      ["SYMBOL_CANDIDATE", "circle with a cross"],
    ])),
  });
  return { kind: "DRAWING_INSPECTION", status, artifactId: "artifact-1", summary: renderInspectionBrief(summary, locale), evidence: [], citations: [], artifactInspection: summary, artifactCandidates: summary.candidates, createdAt: now };
}

function runtime(brain: ConversationBrainPort, tools: ConversationToolPort) {
  return new ConversationRuntime(brain, tools, () => now, ids());
}

const toolPort = (observation: ToolObservation): ConversationToolPort => ({ execute: async () => observation });

describe("drawing semantics in the governed runtime (2A-4)", () => {
  it("lets the assistant quote the truthful drawing brief when the reading ran", async () => {
    const truthful = "I inspected drawing page 4. I can read drawing number M-201 and revision B. Equipment references are visible, but I have not performed a quantity takeoff.";
    const state = await runtime({ decide: async () => requestDrawing(truthful) }, toolPort(drawingObservation("en", "COMPLETED"))).execute({
      state: null, message: "What does the drawing show?", locale: "en", source: "TEXT", companyId: "tenant-1",
      attachment: { id: "artifact-1", name: "m-201.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.messages.at(-1)?.text).toBe(truthful);
    const observation = state.toolResults.at(-1)!;
    expect(observation.summary).toContain("not measurements and not a quantity takeoff");
    expect(observation.artifactInspection?.drawing).toMatchObject({ attempted: true, used: true, pages: [4] });
    expect(observation.artifactCandidates?.every((candidate) => candidate.status === "OBSERVED_PENDING_APPROVAL")).toBe(true);
  });

  it("delivers the Arabic drawing brief through the same governed path", async () => {
    const truthfulAr = "فحصت صفحة الرسم رقم 4. يظهر رقم اللوحة M-201 والمراجعة B. توجد مراجع لمعدات، لكن لم يتم إجراء حصر كميات.";
    const state = await runtime({ decide: async () => requestDrawing(truthfulAr) }, toolPort(drawingObservation("ar", "COMPLETED"))).execute({
      state: null, message: "ماذا تظهر اللوحة؟", locale: "ar", source: "TEXT", companyId: "tenant-1",
      attachment: { id: "artifact-1", name: "m-201.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.messages.at(-1)?.text).toBe(truthfulAr);
    expect(state.toolResults.at(-1)!.summary).toContain("ما رُصد في الرسومات");
    expect(state.toolResults.at(-1)!.summary).toContain("لم يُعَدّ أي رمز ولم يُنتَج حصر كميات أو جدول مواد");
  });

  it("blocks inspection claims when the drawing boundary did not run", async () => {
    const state = await runtime({ decide: async () => requestDrawing("I analyzed the attached drawing pdf page by page.") }, toolPort(drawingObservation("en", "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE"))).execute({
      state: null, message: "Inspect the drawing", locale: "en", source: "TEXT", companyId: "tenant-1",
      attachment: { id: "artifact-1", name: "m-201.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.messages.at(-1)?.text).toContain("not inspected successfully");
    expect(state.messages.at(-1)?.text).not.toMatch(/I analyzed the attached/iu);
  });

  it("creates no governed state from drawing observations", async () => {
    const existing: ConversationRuntimeState = {
      runtimeId: "runtime-1", version: 1, locale: "en", messages: [], candidateFacts: [], unresolvedImportantQuestions: [], toolResults: [], solutionReadiness: "EXPLORING",
      transitionState: "EXPLORING", compactMemory: "", suggestedReplies: [], handoff: null,
      confirmedFacts: { "project.name": { key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT", evidence: "Al Hamra Tower", updatedAt: now } },
    };
    const state = await runtime(
      { decide: async () => requestDecision() },
      { execute: async () => {
        const summary = projectArtifactInspection({
          artifactId: "artifact-1", filename: "m-201.pdf", kind: "PDF",
          analysis: analysisWith(drawingFacts([["PROJECT_NAME", "DESERT GATE MEGAPLEX"], ["EQUIPMENT_REFERENCE", "AHU-01"]])),
          governedFacts: [{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }],
        });
        return { kind: "DRAWING_INSPECTION", status: "COMPLETED", artifactId: "artifact-1", summary: renderInspectionBrief(summary, "en"), evidence: [], citations: [], artifactInspection: summary, artifactCandidates: summary.candidates, createdAt: now } satisfies ToolObservation;
      } },
    ).execute({
      state: existing, message: "Read the title block", locale: "en", source: "TEXT", companyId: "tenant-1",
      attachment: { id: "artifact-1", name: "m-201.pdf", type: "application/pdf", size: 10 },
    });
    expect(state.confirmedFacts["project.name"]).toMatchObject({ value: "Al Hamra Tower", provenance: "USER_EXPLICIT" });
    expect(state.workspace?.requirements ?? {}).toEqual({});
    const conflicts = state.toolResults.at(-1)!.artifactInspection?.conflicts ?? [];
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ key: "project.name", governedValue: "Al Hamra Tower", observedValue: "DESERT GATE MEGAPLEX" });
    expect(state.messages.at(-1)?.text).toBe("Noted without approval.");
  });
});

function requestDecision() {
  return requestDrawing("Noted without approval.");
}
