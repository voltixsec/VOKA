import { describe, expect, it } from "vitest";
import { inspectDxfDocument, DEFAULT_DXF_LIMITS } from "../DxfDocumentInspector";
import { analyzeDxfBytes, analyzeDxfDocument } from "../DxfInspectionAnalyzer";
import { analyzeDxfRelationships, analyzeDxfSemantics } from "../DxfStructureAnalyzer";
import { dxfCandidatesConflict, dxfNameTokens, normalizeDxfText, phraseForDxfTokens, type DxfSemanticCandidate } from "@/src/domain/source-artifact";
import {
  SPACE_BLOCK_RECORDS,
  blockDefinition,
  conflictingSemanticsDrawing,
  cyclicBlockDrawing,
  dxfDocument,
  fullDrawing,
  largeDrawing,
  layerRecord,
  pathologicalPolylineDrawing,
  type DxfPair,
} from "../../__tests__/fixtures/dxfFixtures";

/**
 * Phase 2A-7 test matrix items 37-46: bounds, recursion safety, semantic
 * candidates, and the absolute no-count boundary.
 *
 * The no-count tests are the ones that matter most. Parsing a drawing produces
 * totals, and a total sitting next to a block named `SD` is one careless
 * sentence away from "24 smoke detectors". These tests pin the boundary from
 * both directions: totals exist as ingestion metrics, and nothing in the
 * evidence model can express an equipment quantity.
 */

describe("DXF block recursion and cycles", () => {
  it("never explodes a block: contained entities are references, not copies", () => {
    const inspection = inspectDxfDocument(Buffer.from(fullDrawing(), "latin1"), { filename: "site.dxf" });
    const block = inspection.blocks.find((entry) => entry.name === "SD")!;
    // Three entities inside the block, and exactly three entity records exist
    // for them anywhere in the inspection. Nothing was duplicated.
    expect(block.containedEntityCount).toBe(3);
    const matches = inspection.entities.filter((entity) => block.containedEntityIds.includes(entity.evidenceId));
    expect(matches).toHaveLength(3);
    expect(inspection.entityRecordsRetained).toBe(inspection.entities.length);
  });

  it("terminates safely on two blocks that insert each other", () => {
    const inspection = inspectDxfDocument(Buffer.from(cyclicBlockDrawing(), "latin1"), { filename: "loop.dxf" });
    const a = inspection.blocks.find((entry) => entry.name === "LOOP_A")!;
    const b = inspection.blocks.find((entry) => entry.name === "LOOP_B")!;
    // Each block holds one insert of the other, recorded once. The cycle is
    // visible as evidence and expands to nothing.
    expect(a.containedEntityCount).toBe(1);
    expect(b.containedEntityCount).toBe(1);
    // One insert inside each block, plus the one in the ENTITIES section: three
    // records, each recorded once, and the cycle expanded to nothing.
    expect(inspection.inserts.map((insert) => insert.blockName)).toEqual(["LOOP_B", "LOOP_A", "LOOP_A"]);
    expect(inspection.entityCount).toBe(3);
    // A bounded relationship, not a topology claim.
    const relationships = analyzeDxfRelationships(inspection).relationships;
    expect(relationships.filter((entry) => entry.kind === "INSERT_REFERENCES_BLOCK")).toHaveLength(3);
    expect(relationships.every((entry) => !["CONNECTED_TO", "FEEDS", "CIRCUIT"].includes(entry.kind))).toBe(true);
  });

  it("bounds entities retained inside one block definition and discloses it", () => {
    // A block body far larger than the per-block cap.
    const entities: DxfPair[] = [];
    for (let index = 0; index < 900; index += 1) {
      entities.push([0, "LINE"], [5, `BL${index}`], [330, "90"], [8, "0"], [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "1.0"], [21, "1.0"], [31, "0.0"]);
    }
    const drawing = dxfDocument({
      acadver: "AC1027",
      layers: layerRecord({ name: "0", handle: "10" }),
      blockRecords: SPACE_BLOCK_RECORDS,
      blocks: blockDefinition({ name: "BIG_BLOCK", handle: "90", entities }),
      entities: [[0, "LINE"], [5, "Z1"], [330, "1F"], [8, "0"], [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "1.0"], [21, "1.0"], [31, "0.0"]],
    });
    const inspection = inspectDxfDocument(Buffer.from(drawing, "latin1"));
    const block = inspection.blocks.find((entry) => entry.name === "BIG_BLOCK")!;
    expect(block.containedEntityCount).toBe(900);
    expect(block.containedEntityIds.length).toBe(DEFAULT_DXF_LIMITS.maxEntitiesPerBlock);
    expect(block.containedTruncated).toBe(true);
    expect(block.limitations.join(" ")).toContain("were retained");
  });

  it("bounds a pathological polyline instead of retaining every vertex", () => {
    const inspection = inspectDxfDocument(
      Buffer.from(pathologicalPolylineDrawing(DEFAULT_DXF_LIMITS.maxVerticesPerEntity + 500), "latin1"),
    );
    const polyline = inspection.entities.find((entity) => entity.entityType === "POLYLINE")!;
    expect(polyline.geometry.vertices.length).toBeLessThanOrEqual(DEFAULT_DXF_LIMITS.maxVerticesPerEntity);
    expect(polyline.geometry.vertexCount).toBe(DEFAULT_DXF_LIMITS.maxVerticesPerEntity + 500);
    expect(polyline.geometry.truncated).toBe(true);
    expect(polyline.geometry.limitations.join(" ")).toContain("retained");
  });
});

describe("DXF collection bounds", () => {
  it("bounds a large entity collection, keeps the true total, and discloses the truncation", () => {
    const inspection = inspectDxfDocument(
      Buffer.from(largeDrawing(DEFAULT_DXF_LIMITS.maxRetainedEntities + 200), "latin1"),
      { filename: "big.dxf" },
    );
    expect(inspection.entityCount).toBe(DEFAULT_DXF_LIMITS.maxRetainedEntities + 200);
    expect(inspection.entityRecordsRetained).toBe(DEFAULT_DXF_LIMITS.maxRetainedEntities);
    expect(inspection.truncated).toBe(true);
    expect(inspection.limitations.join(" ")).toContain("ingestion metrics");
    expect(inspection.spaces.MODEL_SPACE.truncated).toBe(true);
  });

  it("bounds the entity cap itself and says the remainder was not inspected", () => {
    const inspection = inspectDxfDocument(Buffer.from(largeDrawing(60), "latin1"), {
      filename: "big.dxf",
      limits: { maxEntities: 25 },
    });
    expect(inspection.entityCount).toBeGreaterThanOrEqual(25);
    expect(inspection.truncated).toBe(true);
    expect(inspection.limitations.join(" ")).toContain("reading stopped at that limit");
  });

  it("bounds the layer table and discloses the overflow", () => {
    const layers: DxfPair[] = [];
    for (let index = 0; index < 30; index += 1) {
      layers.push([0, "LAYER"], [5, `L${index}`], [330, "2"], [2, `LAYER_${index}`], [70, "0"], [62, "7"], [6, "Continuous"]);
    }
    const inspection = inspectDxfDocument(
      Buffer.from(dxfDocument({ layers, blockRecords: SPACE_BLOCK_RECORDS }), "latin1"),
      { limits: { maxLayers: 10 } },
    );
    expect(inspection.layers).toHaveLength(10);
    expect(inspection.limitations.join(" ")).toContain("more than 10 layers were declared");
  });

  it("bounds the group-code scan so a hostile file cannot run the reader unbounded", () => {
    const inspection = inspectDxfDocument(Buffer.from(largeDrawing(400), "latin1"), {
      limits: { maxGroupCodesScanned: 400 },
    });
    expect(inspection.truncated).toBe(true);
    expect(inspection.limitations.join(" ")).toContain("group-code inspection limit");
  });

  it("bounds the relationships it retains while keeping the true count", () => {
    const inspection = inspectDxfDocument(Buffer.from(fullDrawing(), "latin1"));
    const { relationships, count, truncated } = analyzeDxfRelationships(inspection, { maxRelationships: 5 });
    expect(relationships).toHaveLength(5);
    expect(count).toBeGreaterThan(5);
    expect(truncated).toBe(true);
  });
});

describe("DXF semantic candidates", () => {
  it("supports a layer-name candidate from explicit evidence only", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    const door = analysis.candidates.find((candidate) => candidate.label === "Door")!;
    expect(door.sources).toEqual(["LAYER_NAME"]);
    expect(door.evidenceLocators).toContain("DXF:LAYER=A-DOOR");
    expect(door.status).toBe("OBSERVED_NOT_APPROVED");
    expect(door.limitations.join(" ")).toContain("not approved, not selected, not counted");
  });

  it("corroborates a block-name candidate with a layer and an attribute value", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    const smoke = analysis.candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    expect(smoke.sources).toContain("BLOCK_NAME");
    expect(smoke.sources).toContain("LAYER_NAME");
    expect(smoke.sources).toContain("ATTRIBUTE_VALUE");
    expect(smoke.evidenceLocators).toContain("DXF:BLOCKS:block=SD");
    expect(smoke.reasons.join(" ")).toContain("DEVICE_TYPE");
  });

  it("uses nearby text as corroborating evidence without claiming a connection", () => {
    const analysis = analyzeDxfBytes(Buffer.from(conflictingSemanticsDrawing(), "latin1"));
    const smoke = analysis.candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    expect(smoke.sources).toContain("NEARBY_TEXT");
    const proximity = analysis.relationships.filter((entry) => entry.kind === "TEXT_NEAR_ENTITY_CANDIDATE");
    expect(proximity.length).toBeGreaterThan(0);
    expect(proximity[0]!.limitations.join(" ")).toContain("not a connection");
  });

  it("keeps conflicting readings visible and refuses to force a winner", () => {
    const analysis = analyzeDxfBytes(Buffer.from(conflictingSemanticsDrawing(), "latin1"));
    const smoke = analysis.candidates.find((candidate) => candidate.label === "Smoke Detector")!;
    const heat = analysis.candidates.find((candidate) => candidate.label === "Heat Detector")!;
    expect(smoke.conflictsWith).toContain(heat.id);
    expect(heat.conflictsWith).toContain(smoke.id);
    // Both survive into the projection with neither marked as selected.
    expect(analysis.candidates.every((candidate) => candidate.status === "OBSERVED_NOT_APPROVED")).toBe(true);
    expect(analysis.candidates.some((candidate) => candidate.limitations.join(" ").includes("did not choose between them"))).toBe(true);
    // Nothing in the model can express a winner.
    expect(analysis.candidates[0]).not.toHaveProperty("selected");
    expect(analysis.candidates[0]).not.toHaveProperty("approved");
  });

  it("records corroboration as evidence kinds, never as an instance count", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    for (const candidate of analysis.candidates) {
      // At most one per source kind, so the number can never grow with the
      // number of inserts. Six source kinds is the ceiling.
      expect(candidate.corroborationCount).toBeLessThanOrEqual(6);
      expect(candidate.corroborationCount).toBe(new Set(candidate.sources).size);
    }
  });

  it("proposes nothing when no explicit evidence supports a reading", () => {
    const drawing = dxfDocument({
      layers: [...layerRecord({ name: "0", handle: "10" }), ...layerRecord({ name: "X7", handle: "11" })],
      blockRecords: SPACE_BLOCK_RECORDS,
      entities: [[0, "LINE"], [5, "N1"], [330, "1F"], [8, "X7"], [10, "0.0"], [20, "0.0"], [30, "0.0"], [11, "1.0"], [21, "1.0"], [31, "0.0"]],
    });
    const { candidates, limitations } = analyzeDxfSemantics(inspectDxfDocument(Buffer.from(drawing, "latin1")));
    expect(candidates).toHaveLength(0);
    expect(limitations.join(" ")).toContain("no candidate was proposed");
  });

  it("never reads a layer name as a classification of its entities", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    const alarm = analysis.candidates.find((candidate) => candidate.label === "Fire Alarm")!;
    expect(alarm.limitations.join(" ")).toContain("entities on it were not classified from the name alone");
    // The layer holds ordinary geometry and text as well as device blocks: a
    // LINE on FIRE_ALARM is still a line, and nothing classified it as a
    // detector because of the layer it sits on.
    const onAlarm = analysis.inspection.entities.filter((entity) => entity.layerName === "FIRE_ALARM");
    expect(onAlarm.some((entity) => entity.entityType === "LINE")).toBe(true);
    expect(onAlarm.every((entity) => entity.geometry.kind !== "NONE" || entity.text !== null || entity.attribute !== null)).toBe(true);
    expect(onAlarm.every((entity) => entity.status === "OBSERVED_NOT_APPROVED")).toBe(true);
  });
});

describe("DXF vocabulary helpers", () => {
  it("splits CAD names written in every common style", () => {
    expect(dxfNameTokens("SMOKE_DETECTOR")).toEqual(["SMOKE", "DETECTOR"]);
    expect(dxfNameTokens("A-DOOR")).toEqual(["DOOR"]);
    expect(dxfNameTokens("E-EQUIP")).toEqual(["EQUIP"]);
    expect(dxfNameTokens("SD-01")).toEqual(["SD", "01"]);
    expect(dxfNameTokens("0")).toEqual([]);
  });

  it("does not expand an unknown code into a phrase", () => {
    expect(phraseForDxfTokens(["ZZZ"])).toBeNull();
    expect(phraseForDxfTokens(["SD"])).toBe("Smoke Detector");
  });

  it("treats two readings of the same layer as agreement, not conflict", () => {
    const shared: DxfSemanticCandidate = {
      id: "a", label: "Fire Alarm", sources: ["LAYER_NAME"], evidenceLocators: ["DXF:LAYER=FIRE_ALARM"],
      reasons: [], corroborationCount: 1, confidence: 0.5, reliability: "LOW",
      status: "OBSERVED_NOT_APPROVED", conflictsWith: [], space: "UNKNOWN_SPACE", limitations: [],
    };
    const other: DxfSemanticCandidate = { ...shared, id: "b", label: "Smoke Detector" };
    // A layer is shared infrastructure: hosting two device types is normal, so
    // this is not a disagreement worth surfacing.
    expect(dxfCandidatesConflict(shared, other)).toBe(false);
    // Two readings of one specific record are.
    const specific: DxfSemanticCandidate = { ...shared, evidenceLocators: ["DXF:BLOCKS:block=SD"] };
    const specificOther: DxfSemanticCandidate = { ...other, evidenceLocators: ["DXF:BLOCKS:block=SD"] };
    expect(dxfCandidatesConflict(specific, specificOther)).toBe(true);
  });

  it("decodes DXF control syntax without rewriting the drawing's wording", () => {
    expect(normalizeDxfText("{\\fArial|b0;Hello\\PWorld}")).toBe("Hello\nWorld");
    expect(normalizeDxfText("\\LUnderline\\l")).toBe("Underline");
    expect(normalizeDxfText("A\\U+0042C")).toBe("ABC");
    expect(normalizeDxfText("Two  spaces")).toBe("Two  spaces".replace(/ {2}/u, " "));
    expect(normalizeDxfText("بند كهرباء")).toBe("بند كهرباء");
  });
});

describe("DXF no-count boundary", () => {
  /** Every key name in a serialized structure, at any depth. */
  function allKeys(value: unknown, seen = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
      for (const item of value) allKeys(item, seen);
      return seen;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        seen.add(key.toLowerCase());
        allKeys(child, seen);
      }
    }
    return seen;
  }

  it("produces no equipment count anywhere in the analysis", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    const keys = allKeys(analysis);
    // No field in the evidence model can carry an engineering quantity. This
    // checks the shape rather than banning words, because the governance prose
    // deliberately uses "quantity" to say none was produced.
    for (const forbidden of ["quantity", "quantitynumber", "approvedquantity", "equipmentcount", "devicecount", "symbolcount", "bom", "bomitems", "procurementquantity", "takeoff"]) {
      expect(keys.has(forbidden)).toBe(false);
    }
    // Counts that do exist are named for what they are.
    expect(keys.has("entitycount")).toBe(true);
    expect(keys.has("observedentitycount")).toBe(true);
  });

  it("exposes parser totals only as ingestion metrics and labels them as such", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    expect(analysis.inspection.entityCount).toBe(23);
    expect(analysis.limitations.join(" ")).toContain("ingestion metrics describing how much of the file VOKA read");
    expect(analysis.limitations.join(" ")).toContain("not equipment counts, quantities, or takeoff results");
  });

  it("does not aggregate repeated inserts into a quantity", () => {
    // Ten inserts of the same block: each is preserved, and no total is offered
    // as a quantity.
    const entities: DxfPair[] = [];
    for (let index = 0; index < 10; index += 1) {
      entities.push([0, "INSERT"], [5, `I${index}`], [330, "1F"], [8, "0"], [2, "SD"], [10, String(index * 10)], [20, "0.0"], [30, "0.0"]);
    }
    const drawing = dxfDocument({
      layers: layerRecord({ name: "0", handle: "10" }),
      blockRecords: SPACE_BLOCK_RECORDS,
      blocks: blockDefinition({ name: "SD", handle: "30" }),
      entities,
    });
    const analysis = analyzeDxfBytes(Buffer.from(drawing, "latin1"));
    expect(analysis.inspection.inserts).toHaveLength(10);
    const candidate = analysis.candidates.find((entry) => entry.label === "Smoke Detector")!;
    // Ten instances, but corroboration stays at the number of evidence kinds.
    expect(candidate.corroborationCount).toBe(1);
    expect(JSON.stringify(candidate)).not.toContain("10");
  });

  it("creates no engineering topology from geometry that merely sits together", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    const kinds = new Set(analysis.relationships.map((entry) => entry.kind));
    for (const forbidden of ["CONNECTED_TO", "FEEDS", "CIRCUIT", "PIPE_ROUTE", "NETWORK_PATH", "AIRFLOW", "CONTROL_LOOP"]) {
      expect(kinds.has(forbidden as never)).toBe(false);
    }
  });

  it("keeps every candidate observed and unapproved, with no promotion path in the model", () => {
    const analysis = analyzeDxfBytes(Buffer.from(fullDrawing(), "latin1"));
    expect(analysis.candidates.length).toBeGreaterThan(0);
    for (const candidate of analysis.candidates) {
      expect(candidate.status).toBe("OBSERVED_NOT_APPROVED");
      expect(candidate).not.toHaveProperty("approvedQuantity");
      expect(candidate).not.toHaveProperty("requirementId");
      expect(candidate).not.toHaveProperty("productSelection");
    }
    // The analysis shape has no requirement, BOM, quotation, or procurement field.
    expect(analysis).not.toHaveProperty("requirements");
    expect(analysis).not.toHaveProperty("bom");
    expect(analysis).not.toHaveProperty("quotationLines");
    expect(analysis).not.toHaveProperty("procurement");
  });

  it("does not re-run the analysis differently for the same bytes", () => {
    const bytes = Buffer.from(fullDrawing(), "latin1");
    const first = analyzeDxfBytes(bytes);
    const second = analyzeDxfDocument(first.inspection);
    expect(second.candidates.map((candidate) => candidate.label)).toEqual(first.candidates.map((candidate) => candidate.label));
    expect(second.relationshipCount).toBe(first.relationshipCount);
  });
});
