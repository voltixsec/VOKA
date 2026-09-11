import { describe, expect, it } from "vitest";
import { ConversationToolRegistry } from "../ConversationToolRegistry";
import type { SourceArtifactInspectionPort } from "@/src/application/source-artifacts";
import type { ToolObservation } from "@/src/application/conversation-runtime";
import { emptySystemConfigurationGraph } from "@/src/application/conversation-runtime";

type InspectionInput = Parameters<SourceArtifactInspectionPort["inspect"]>[0];

/** Captures what the registry hands to the inspection port. */
class CapturingInspection implements SourceArtifactInspectionPort {
  calls: InspectionInput[] = [];
  async inspect(input: InspectionInput): Promise<ToolObservation> {
    this.calls.push(input);
    return { kind: input.kind, status: "COMPLETED", summary: "stub", evidence: [], citations: [], artifactId: input.artifactId, createdAt: "2026-09-11T00:00:00.000Z" };
  }
}

const graph = emptySystemConfigurationGraph();

async function call(locale: "ar" | "en") {
  const inspection = new CapturingInspection();
  const registry = new ConversationToolRegistry(null, null, () => "2026-09-11T00:00:00.000Z", inspection);
  const observation = await registry.execute({
    runtimeId: "runtime-1",
    request: { kind: "ATTACHMENT_INSPECTION", query: "Inspect retained file content", attachmentId: "artifact-1" },
    companyId: "tenant-1",
    locale,
    graph: { ...graph, requirements: [{ key: "project.name", labelAr: "المشروع", labelEn: "Project", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }] },
  });
  return { inspection, observation };
}

describe("inspection locale routing through the tool registry (2A-1C)", () => {
  it("forwards the Arabic runtime locale to the inspection port", async () => {
    const { inspection, observation } = await call("ar");
    expect(inspection.calls).toHaveLength(1);
    expect(inspection.calls[0]!.locale).toBe("ar");
    expect(inspection.calls[0]!.artifactId).toBe("artifact-1");
    expect(inspection.calls[0]!.kind).toBe("ATTACHMENT_INSPECTION");
    expect(observation.status).toBe("COMPLETED");
  });

  it("forwards the English runtime locale and governed facts for conflict detection", async () => {
    const { inspection } = await call("en");
    expect(inspection.calls[0]!.locale).toBe("en");
    expect(inspection.calls[0]!.governedFacts).toEqual([{ key: "project.name", value: "Al Hamra Tower", provenance: "USER_EXPLICIT" }]);
  });

  it("still requires an attachment before inspecting", async () => {
    const inspection = new CapturingInspection();
    const registry = new ConversationToolRegistry(null, null, () => "2026-09-11T00:00:00.000Z", inspection);
    const observation = await registry.execute({ request: { kind: "ATTACHMENT_INSPECTION", query: "Inspect", attachmentId: null }, companyId: "tenant-1", locale: "ar", graph });
    expect(observation.status).toBe("ATTACHMENT_REQUIRED");
    expect(inspection.calls).toEqual([]);
  });
});
