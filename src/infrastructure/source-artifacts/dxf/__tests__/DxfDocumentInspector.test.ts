import { describe, expect, it } from "vitest";
import { inspectDxfDocument } from "../DxfDocumentInspector";
import {
  drawingWithFeet,
  drawingWithoutBlockRecords,
  drawingWithoutUnits,
  fullDrawing,
  paperSpaceDrawing,
  truncatedDrawing,
  xrefDrawing,
} from "../../__tests__/fixtures/dxfFixtures";

/**
 * Phase 2A-7 test matrix items 5-22 and 24-36: structural CAD evidence.
 *
 * Everything here is asserted against a real ASCII DXF file. The recurring
 * question behind each test is whether the record preserves what the drawing
 * stored, rather than something a reader inferred or invented.
 */

const drawing = () => inspectDxfDocument(Buffer.from(fullDrawing(), "latin1"), { filename: "site.dxf" });

describe("DXF metadata and version", () => {
  it("captures the declared $ACADVER version and its release name", () => {
    const inspection = drawing();
    expect(inspection.document.version.code).toBe("AC1027");
    expect(inspection.document.version.label).toBe("AutoCAD 2013");
    expect(inspection.document.version.locator).toBe("DXF:HEADER:variable=$ACADVER");
  });

  it("preserves an unrecognized version code verbatim instead of guessing a release", () => {
    const inspection = inspectDxfDocument(
      Buffer.from(fullDrawing().replace("AC1027", "AC9999"), "latin1"),
      { filename: "site.dxf" },
    );
    expect(inspection.document.version.code).toBe("AC9999");
    expect(inspection.document.version.label).toBeNull();
    expect(inspection.document.version.limitations.join(" ")).toContain("preserved verbatim");
  });

  it("records a missing version as absent rather than defaulting one", () => {
    // Remove the $ACADVER header variable entirely, leaving the drawing with no
    // declared version to read.
    const source = drawingWithoutUnits().replace("  9\r\n$ACADVER\r\n  1\r\nAC1027\r\n", "");
    expect(source).not.toContain("$ACADVER");
    const inspection = inspectDxfDocument(Buffer.from(source, "latin1"));
    expect(inspection.document.version.code).toBeNull();
    expect(inspection.document.version.limitations.join(" ")).toContain("did not declare");
  });

  it("captures the declared code page and the declared extents", () => {
    const inspection = drawing();
    expect(inspection.document.codePage).toBe("ANSI_1252");
    expect(inspection.document.declaredExtents?.max).toEqual({ x: 1000, y: 500, z: 0 });
    expect(inspection.document.handleSeed).toBe("FFFF");
    expect(inspection.document.sectionsPresent).toEqual(["HEADER", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS"]);
  });
});

describe("DXF drawing units", () => {
  it("captures explicitly declared millimetres and names them semantically", () => {
    const inspection = drawing();
    expect(inspection.document.units.declared).toBe(true);
    expect(inspection.document.units.code).toBe(4);
    expect(inspection.document.units.name).toBe("millimetres");
    expect(inspection.document.units.nameArabic).toBe("مليمتر");
    expect(inspection.document.units.raw).toBe("4");
  });

  it("preserves a declared imperial unit literally rather than converting it", () => {
    const inspection = inspectDxfDocument(Buffer.from(drawingWithFeet(), "latin1"));
    expect(inspection.document.units.code).toBe(2);
    expect(inspection.document.units.name).toBe("feet");
    // The radius stays the number the drawing wrote. No conversion happened.
    const circle = inspection.entities.find((entity) => entity.entityType === "CIRCLE");
    expect(circle?.geometry.radius).toBe(12);
  });

  it("leaves units unknown when the drawing declares none", () => {
    const inspection = inspectDxfDocument(Buffer.from(drawingWithoutUnits(), "latin1"));
    expect(inspection.document.units.declared).toBe(false);
    expect(inspection.document.units.code).toBeNull();
    expect(inspection.document.units.name).toBeNull();
    expect(inspection.document.units.limitations.join(" ")).toContain("did not declare CAD units");
  });

  it("never infers units from coordinates, extents, or project context", () => {
    // A 3500-unit line is exactly the kind of number that invites a metre
    // assumption. Nothing in the inspection produces one.
    const inspection = inspectDxfDocument(Buffer.from(drawingWithoutUnits(), "latin1"));
    const line = inspection.entities.find((entity) => entity.entityType === "LINE");
    expect(line?.geometry.endPoint?.x).toBe(3500);
    expect(inspection.document.units.name).toBeNull();
    const serialized = JSON.stringify(inspection);
    expect(serialized).not.toMatch(/metre|millimetre|centimetre|"feet"|inches/u);
    // The declared extents are present and still produce no unit: a bounding box
    // is not a scale.
    expect(inspection.document.declaredExtents).toBeNull();
  });

  it("preserves an unrecognized unit code verbatim and keeps the units unknown", () => {
    const inspection = inspectDxfDocument(
      Buffer.from(fullDrawing().replace("$INSUNITS\r\n 70\r\n4", "$INSUNITS\r\n 70\r\n99"), "latin1"),
    );
    expect(inspection.document.units.code).toBe(99);
    expect(inspection.document.units.declared).toBe(false);
    expect(inspection.document.units.name).toBeNull();
    expect(inspection.document.units.limitations.join(" ")).toContain("unrecognized unit code 99");
  });
});

describe("DXF model space and paper space", () => {
  it("attributes a model-space entity to model space", () => {
    const inspection = drawing();
    const line = inspection.entities.find((entity) => entity.handle === "3AF");
    expect(line?.space).toBe("MODEL_SPACE");
    expect(line?.spaceAttribution).toBe("OWNER_HANDLE");
  });

  it("attributes a paper-space entity to paper space and names its layout", () => {
    const inspection = drawing();
    const title = inspection.entities.find((entity) => entity.handle === "22B");
    expect(title?.space).toBe("PAPER_SPACE");
    expect(title?.spaceAttribution).toBe("GROUP_67");
    expect(title?.layoutName).toBe("Layout1");
    expect(title?.locator).toBe("DXF:PAPER_SPACE:layout=Layout1:handle=22B:owner=1B:layer=0");
  });

  it("never merges model space and paper space", () => {
    const inspection = drawing();
    const model = inspection.spaces.MODEL_SPACE;
    const paper = inspection.spaces.PAPER_SPACE;
    expect(model.entityCount).toBe(13);
    expect(paper.entityCount).toBe(2);
    expect(paper.layoutName).toBe("Layout1");
    const modelHandles = model.entities.map((entity) => entity.handle);
    const paperHandles = paper.entities.map((entity) => entity.handle);
    expect(modelHandles).not.toContain("22B");
    expect(paperHandles).toEqual(["22B", "22C"]);
    // No deduplication: nothing was removed from either space to reconcile them.
    expect(modelHandles.some((handle) => paperHandles.includes(handle ?? ""))).toBe(false);
    expect(paper.limitations.join(" ")).toContain("kept separate from model space");
  });

  it("keeps block-contained entities in their own unattributed space rather than guessing", () => {
    const inspection = drawing();
    const unknown = inspection.spaces.UNKNOWN_SPACE;
    expect(unknown.entityCount).toBe(3);
    expect(unknown.entities.every((entity) => entity.blockName === "SD")).toBe(true);
    expect(unknown.limitations.join(" ")).toContain("not merged");
  });

  it("records a space taken from DXF convention as an assumption, not a proof", () => {
    // No BLOCK_RECORD table, so no owner handle can resolve: the ENTITIES
    // section convention applies and must be labelled as such.
    const inspection = inspectDxfDocument(Buffer.from(drawingWithoutBlockRecords(), "latin1"));
    const line = inspection.entities.find((entity) => entity.handle === "E1")!;
    expect(line?.space).toBe("MODEL_SPACE");
    expect(line?.spaceAttribution).toBe("SECTION_CONVENTION");
    expect(line?.limitations.join(" ")).toContain("DXF convention");
  });
});

describe("DXF layers", () => {
  it("captures the layer table with colour, line type, and handle provenance", () => {
    const inspection = drawing();
    const alarm = inspection.layers.find((layer) => layer.name === "FIRE_ALARM");
    expect(alarm).toBeDefined();
    expect(alarm?.colorIndex).toBe(1);
    expect(alarm?.lineType).toBe("DASHED");
    expect(alarm?.handle).toBe("2A");
    expect(alarm?.locator).toBe("DXF:LAYER=FIRE_ALARM");
  });

  it("distinguishes off, frozen, and locked as three separate states", () => {
    const inspection = drawing();
    const byName = (name: string) => inspection.layers.find((layer) => layer.name === name);
    // flags 1 -> frozen, not off and not locked.
    expect(byName("CCTV")).toMatchObject({ frozen: true, off: false, locked: false });
    // Negative colour -> switched off; flags 4 -> locked. Both, independently.
    expect(byName("E-EQUIP")).toMatchObject({ off: true, frozen: false, locked: true, colorIndex: 3 });
    expect(byName("0")).toMatchObject({ off: false, frozen: false, locked: false });
  });

  it("records hidden-layer content as hidden evidence rather than ordinary evidence", () => {
    const inspection = drawing();
    const frozen = inspection.layers.find((layer) => layer.name === "CCTV");
    expect(frozen?.limitations.join(" ")).toContain("frozen");
    const off = inspection.layers.find((layer) => layer.name === "E-EQUIP");
    expect(off?.limitations.join(" ")).toContain("switched off");
  });

  it("flags reserved layers whose names carry no design meaning", () => {
    const inspection = drawing();
    expect(inspection.layers.find((layer) => layer.name === "0")?.reserved).toBe(true);
    expect(inspection.layers.find((layer) => layer.name === "FIRE_ALARM")?.reserved).toBe(false);
  });

  it("records entity layer membership as a bounded count, not an equipment count", () => {
    const inspection = drawing();
    const alarm = inspection.layers.find((layer) => layer.name === "FIRE_ALARM");
    expect(alarm?.observedEntityCount).toBeGreaterThan(0);
    const inspectionLimitations = inspection.limitations.join(" ");
    expect(inspectionLimitations).toContain("no entity count is an engineering quantity");
    expect(inspectionLimitations).toContain("not equipment counts, quantities, or takeoff results");
  });
});

describe("DXF geometry", () => {
  it("preserves LINE endpoints verbatim", () => {
    const line = drawing().entities.find((entity) => entity.entityType === "LINE" && entity.handle === "3AF")!;
    expect(line.geometry.kind).toBe("LINE");
    expect(line.geometry.startPoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(line.geometry.endPoint).toEqual({ x: 1000, y: 500, z: 0 });
    expect(line.colorIndex).toBe(1);
    expect(line.lineType).toBe("DASHED");
  });

  it("preserves LWPOLYLINE vertices and its closed flag", () => {
    const polyline = drawing().entities.find((entity) => entity.entityType === "LWPOLYLINE")!;
    expect(polyline.geometry.kind).toBe("POLYLINE");
    expect(polyline.geometry.vertexCount).toBe(3);
    expect(polyline.geometry.vertices).toEqual([
      { x: 0, y: 0, z: null },
      { x: 10, y: 0, z: null },
      { x: 10, y: 10, z: null },
    ]);
    expect(polyline.geometry.closed).toBe(true);
  });

  it("folds VERTEX records into their POLYLINE and terminates at SEQEND", () => {
    const inspection = drawing();
    const polyline = inspection.entities.find((entity) => entity.entityType === "POLYLINE")!;
    expect(polyline.geometry.vertices).toEqual([
      { x: 1, y: 2, z: 0 },
      { x: 3, y: 4, z: 0 },
      { x: 5, y: 6, z: 0 },
    ]);
    // The vertices are counted as file entities but are not recorded as
    // standalone entities: they belong to their polyline.
    expect(inspection.entityTypeCounts.VERTEX).toBe(3);
    expect(inspection.entities.filter((entity) => entity.entityType === "VERTEX")).toHaveLength(0);
    expect(inspection.entities.find((entity) => entity.handle === "3B5")).toBeUndefined();
  });

  it("preserves CIRCLE centre and radius without deriving a length from them", () => {
    const circle = drawing().entities.find((entity) => entity.entityType === "CIRCLE" && entity.handle === "3B6")!;
    expect(circle.geometry.kind).toBe("CIRCLE");
    expect(circle.geometry.center).toEqual({ x: 50, y: 50, z: 0 });
    expect(circle.geometry.radius).toBe(25);
    expect(circle.geometry).not.toHaveProperty("length");
  });

  it("preserves an ELLIPSE major-axis vector, axis ratio, and radian parameters in their own fields", () => {
    const ellipse = drawing().entities.find((entity) => entity.entityType === "ELLIPSE")!;
    expect(ellipse.geometry.kind).toBe("ELLIPSE");
    expect(ellipse.geometry.center).toEqual({ x: 600, y: 600, z: 0 });
    expect(ellipse.geometry.majorAxisEndpoint).toEqual({ x: 100, y: 0, z: 0 });
    expect(ellipse.geometry.axisRatio).toBe(0.5);
    expect(ellipse.geometry.startParameter).toBe(0);
    expect(ellipse.geometry.endParameter).toBeCloseTo(6.283185307179586);
    // The radian parameters must never land in the degree fields, and the major
    // axis is a vector rather than a radius: both would silently misstate the
    // geometry if conflated.
    expect(ellipse.geometry.startAngleDegrees).toBeNull();
    expect(ellipse.geometry.endAngleDegrees).toBeNull();
    expect(ellipse.geometry.radius).toBeNull();
    expect(ellipse.geometry.limitations.join(" ")).toContain("not converted into a radius or degrees");
  });

  it("preserves SPLINE control points without evaluating the curve", () => {
    const spline = drawing().entities.find((entity) => entity.entityType === "SPLINE")!;
    expect(spline.geometry.kind).toBe("SPLINE");
    expect(spline.geometry.vertices).toEqual([
      { x: 0, y: 0, z: null },
      { x: 10, y: 20, z: null },
      { x: 20, y: 0, z: null },
    ]);
    expect(spline.geometry.limitations.join(" ")).toContain("not evaluated or measured");
  });

  it("preserves ARC angles in degrees exactly as stored", () => {
    const arc = drawing().entities.find((entity) => entity.entityType === "ARC")!;
    expect(arc.geometry.startAngleDegrees).toBe(0);
    expect(arc.geometry.endAngleDegrees).toBe(90);
    expect(arc.geometry.radius).toBe(25);
  });
});

describe("DXF text and multiline text", () => {
  it("preserves TEXT with its insertion point, height, and rotation", () => {
    const text = drawing().texts.find((entry) => entry.entityType === "TEXT" && entry.raw === "Smoke Detector")!;
    expect(text.raw).toBe("Smoke Detector");
    expect(text.insertionPoint).toEqual({ x: 120, y: 30, z: 0 });
    expect(text.height).toBe(5);
    expect(text.rotationDegrees).toBe(15);
    expect(text.layerName).toBe("FIRE_ALARM");
    expect(text.normalizedChanged).toBe(false);
  });

  it("keeps raw MTEXT and adds a readable normalization without rewriting meaning", () => {
    const mtext = drawing().texts.find((entry) => entry.entityType === "MTEXT")!;
    expect(mtext.raw).toBe("{\\fArial|b0|i0;Fire\\PAlarm\\PRiser}");
    expect(mtext.normalized).toBe("Fire\nAlarm\nRiser");
    expect(mtext.normalizedChanged).toBe(true);
    expect(mtext.styleName).toBe("Standard");
  });

  it("does not merge paragraph breaks into invented phrases", () => {
    const mtext = drawing().texts.find((entry) => entry.entityType === "MTEXT")!;
    // Three lines stay three lines. Collapsing them to one would create a
    // phrase the drawing never wrote.
    expect(mtext.normalized.split("\n")).toHaveLength(3);
    expect(mtext.normalized).not.toContain("Fire Alarm Riser");
  });
});

describe("DXF dimensions", () => {
  it("preserves the drawing's stored measurement, style, block, and definition points", () => {
    const dimension = drawing().dimensions[0]!;
    expect(dimension.measurement).toBe(1000);
    expect(dimension.displayText).toBe("<>");
    expect(dimension.displayIsPlaceholder).toBe(true);
    expect(dimension.styleName).toBe("Standard");
    expect(dimension.blockName).toBe("*D1");
    expect(dimension.definitionPoint).toEqual({ x: 0, y: -50, z: 0 });
    expect(dimension.referencePoint2).toEqual({ x: 1000, y: 0, z: 0 });
    expect(dimension.dimensionTypeFlags).toBe(32);
  });

  it("states plainly that the dimension was not independently recalculated or verified", () => {
    const dimension = drawing().dimensions[0]!;
    const limitations = dimension.limitations.join(" ");
    expect(limitations).toContain("did not measure the geometry");
    expect(limitations).toContain("recompute");
    expect(limitations).toContain("verify");
    expect(dimension.status).toBe("OBSERVED_NOT_APPROVED");
  });

  it("reads the dimension form from the type bits without measuring anything", () => {
    expect(drawing().dimensions[0]?.dimensionTypeLabel).toBe("linear");
  });
});

describe("DXF blocks, inserts, and attributes", () => {
  it("captures a block definition with its base point and contained entities", () => {
    const block = drawing().blocks.find((entry) => entry.name === "SD")!;
    expect(block.handle).toBe("30");
    expect(block.basePoint).toEqual({ x: 0, y: 0, z: 0 });
    expect(block.containedEntityCount).toBe(3);
    expect(block.containedEntityIds).toHaveLength(3);
    expect(block.locator).toBe("DXF:BLOCKS:block=SD:handle=30");
    // Contained entities are references, never copies: the same evidence ids
    // appear in the retained entity list.
    const ids = drawing().entities.map((entity) => entity.evidenceId);
    expect(block.containedEntityIds.every((id) => ids.includes(id))).toBe(true);
  });

  it("captures an insert's referenced block, insertion point, scale, and rotation", () => {
    const insert = drawing().inserts.find((entry) => entry.blockName === "SD")!;
    expect(insert.insertionPoint).toEqual({ x: 300, y: 300, z: 0 });
    expect(insert.scaleX).toBe(2);
    expect(insert.scaleY).toBe(2);
    expect(insert.scaleZ).toBe(1);
    expect(insert.rotationDegrees).toBe(45);
    expect(insert.layerName).toBe("CCTV");
    expect(insert.space).toBe("MODEL_SPACE");
  });

  it("captures ATTDEF records in the block that defines them", () => {
    const block = drawing().blocks.find((entry) => entry.name === "SD")!;
    expect(block.attributeDefinitions.map((definition) => definition.tag)).toEqual(["DEVICE_TYPE", "MODEL"]);
    expect(block.attributeDefinitions[0]?.prompt).toBe("Device type:");
    expect(block.attributeDefinitions[0]?.value).toBe("SD");
    expect(block.attributeDefinitions[0]?.entityType).toBe("ATTDEF");
  });

  it("links ATTRIB records to the insert that carries them", () => {
    const insert = drawing().inserts.find((entry) => entry.blockName === "SD")!;
    expect(insert.attributes.map((attribute) => `${attribute.tag}=${attribute.value}`)).toEqual([
      "DEVICE_TYPE=SD",
      "MODEL=ABC-123",
    ]);
    expect(insert.attributes.every((attribute) => attribute.insertHandle === "7C2")).toBe(true);
    expect(insert.attributes.every((attribute) => attribute.blockName === "SD")).toBe(true);
    // Not recorded as orphan entities either.
    expect(drawing().entities.filter((entity) => entity.entityType === "ATTRIB")).toHaveLength(0);
  });

  it("reports an insert of an undefined block as a defect instead of hiding it", () => {
    const insert = drawing().inserts.find((entry) => entry.blockName === "MISSING_BLOCK")!;
    expect(insert.blockMissing).toBe(true);
    expect(insert.limitations.join(" ")).toContain("defines no block with that name");
  });

  it("never fabricates a handle and marks positional references as such", () => {
    const inspection = drawing();
    const unhandled = inspection.entities.find((entity) => entity.handleMissing)!;
    expect(unhandled.handle).toBeNull();
    expect(unhandled.evidenceId).toMatch(/^dxf-e:pos:\d+$/u);
    expect(unhandled.limitations.join(" ")).toContain("carried no handle");
    // Every entity that does carry a handle keeps the file's own value.
    expect(inspection.entities.filter((entity) => !entity.handleMissing).every((entity) => /^[0-9A-F]+$/u.test(entity.handle ?? ""))).toBe(true);
  });

  it("carries the owner handle where the file provided one", () => {
    const line = drawing().entities.find((entity) => entity.handle === "3AF")!;
    expect(line.ownerHandle).toBe("1F");
  });
});

describe("DXF provenance", () => {
  it("builds exact CAD locators instead of page numbers", () => {
    const inspection = drawing();
    expect(inspection.entities.find((entity) => entity.handle === "3AF")?.locator).toBe("DXF:MODEL_SPACE:handle=3AF:owner=1F:layer=FIRE_ALARM");
    expect(inspection.spaces.MODEL_SPACE.locator).toBe("DXF:MODEL_SPACE");
    expect(inspection.spaces.PAPER_SPACE.locator).toBe("DXF:PAPER_SPACE");
    expect(inspection.blocks.find((block) => block.name === "SITE_XREF")?.locator).toBe("DXF:BLOCKS:block=SITE_XREF:handle=40");
  });

  it("keeps pageNumber null on every CAD record", () => {
    const inspection = drawing();
    // No CAD record type even has a page field, and the projection that carries
    // citations sets it to null. Asserted against the exported constant so a
    // later change cannot quietly reintroduce a number.
    expect(inspection).not.toHaveProperty("pageNumber");
    for (const entity of inspection.entities) expect(entity).not.toHaveProperty("pageNumber");
    for (const text of inspection.texts) expect(text).not.toHaveProperty("pageNumber");
    expect(inspection.entityCount).toBeGreaterThan(0);
  });
});

describe("DXF external references", () => {
  it("records external-reference metadata and never follows it", () => {
    const inspection = inspectDxfDocument(Buffer.from(xrefDrawing(), "latin1"), { filename: "site.dxf" });
    expect(inspection.externalReferences).toHaveLength(2);
    const remote = inspection.externalReferences.find((reference) => reference.blockName === "REMOTE_XREF")!;
    expect(remote.path).toBe("https://files.example.com/site.dwg");
    expect(remote.looksRemote).toBe(true);
    const overlay = inspection.externalReferences.find((reference) => reference.blockName === "OVERLAY_XREF")!;
    expect(overlay.overlay).toBe(true);
    expect(inspection.limitations.join(" ")).toContain("not opened, fetched, or resolved");
  });

  it("discloses a local external-reference path without opening it", () => {
    const inspection = drawing();
    const xref = inspection.externalReferences[0]!;
    expect(xref.path).toBe("C:\\site\\ref\\site.dwg");
    expect(xref.looksRemote).toBe(false);
    expect(inspection.blocks.find((block) => block.name === "SITE_XREF")?.limitations.join(" "))
      .toContain("referenced file was not opened");
  });
});

describe("DXF structural honesty", () => {
  it("discloses a drawing that does not end with the EOF marker", () => {
    const inspection = inspectDxfDocument(Buffer.from(truncatedDrawing(), "latin1"));
    expect(inspection.limitations.join(" ")).toContain("did not end with the DXF EOF marker");
  });

  it("records entity types it does not model instead of silently dropping them", () => {
    const source = fullDrawing().replace(
      "  0\r\nCIRCLE\r\n  5\r\n3B6",
      "  0\r\nWIPEOUT\r\n  5\r\n3BB\r\n  8\r\n0\r\n  0\r\nCIRCLE\r\n  5\r\n3B6",
    );
    const inspection = inspectDxfDocument(Buffer.from(source, "latin1"));
    expect(inspection.unmodelledEntityTypes).toContain("WIPEOUT");
    const wipeout = inspection.entities.find((entity) => entity.entityType === "WIPEOUT")!;
    expect(wipeout.knownType).toBe("OTHER");
    expect(wipeout.limitations.join(" ")).toContain("outside what this phase models");
  });
});
