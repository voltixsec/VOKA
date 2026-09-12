import { describe, expect, it } from "vitest";
import { inspectIfcDocument } from "../IfcDocumentInspector";
import { analyzeIfcBytes } from "../IfcInspectionAnalyzer";
import {
  fullIfcModel,
  ifc2x3Model,
  ifc4x3Model,
  ifcMissingEndIso,
  ifcWithoutUnits,
  ifcWithApostropheAndComment,
} from "../../__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8 test matrix items 19-48: structural BIM evidence.
 *
 * Everything here is asserted against a real IFC STEP file. The recurring
 * question is whether the record preserves what the model stored, rather than
 * something a reader inferred, calculated, or invented.
 */
const model = () => inspectIfcDocument(Buffer.from(fullIfcModel(), "utf8"), { filename: "seafront.ifc" });

describe("IFC schema and header", () => {
  it("19 captures the declared FILE_SCHEMA exactly", () => {
    const inspection = model();
    expect(inspection.document.schema.declared).toBe("IFC4");
    expect(inspection.document.schema.family).toBe("IFC4");
    expect(inspection.document.schema.locator).toBe("IFC:HEADER:FILE_SCHEMA");
  });

  it("20 inspects IFC2X3 generically with the declared identifier preserved", () => {
    const inspection = inspectIfcDocument(Buffer.from(ifc2x3Model(), "utf8"));
    expect(inspection.document.schema.declared).toBe("IFC2X3");
    expect(inspection.document.schema.family).toBe("IFC2X3");
  });

  it("21 inspects IFC4X3 generically and discloses the limitation", () => {
    const inspection = inspectIfcDocument(Buffer.from(ifc4x3Model(), "utf8"));
    expect(inspection.document.schema.declared).toBe("IFC4X3_ADD2");
    expect(inspection.document.schema.family).toBe("IFC4X3");
    expect(inspection.document.schema.genericInspection).toBe(true);
    expect(inspection.document.schema.limitations.join(" ")).toContain("IFC4X3-specific semantics");
  });
});

describe("IFC spatial hierarchy", () => {
  it("22 captures project, site, building, storeys, and space", () => {
    const inspection = model();
    expect(inspection.project?.name).toBe("Seafront Tower");
    expect(inspection.project?.globalId).toBe("2xProjectGlobalId0000001");
    expect(inspection.sites[0]?.name).toBe("Main Site");
    expect(inspection.buildings[0]?.name).toBe("Tower A");
    expect(inspection.storeys.map((storey) => storey.name)).toEqual(["L1", "L2"]);
    expect(inspection.spaces[0]?.name).toBe("S-101");
    expect(inspection.spaces[0]?.longName).toBe("Lobby");
  });

  it("23 records aggregation only from IFCRELAGGREGATES", () => {
    const inspection = model();
    expect(inspection.sites[0]?.parentLocator).toContain("IFCPROJECT");
    expect(inspection.buildings[0]?.parentLocator).toContain("IFCSITE");
    expect(inspection.storeys[0]?.parentLocator).toContain("IFCBUILDING");
    expect(inspection.spaces[0]?.parentLocator).toContain("IFCBUILDINGSTOREY");
  });

  it("24 preserves declared storey elevation and never infers storey from it", () => {
    const inspection = model();
    expect(inspection.storeys[0]?.elevation).toBe(0);
    expect(inspection.storeys[1]?.elevation).toBe(4000);
    const serialized = JSON.stringify(inspection);
    expect(serialized).not.toMatch(/inferred storey|from elevation|from coordinates/iu);
  });

  it("25 keeps pageNumber null on every BIM record", () => {
    const inspection = model();
    expect(inspection).not.toHaveProperty("pageNumber");
    for (const element of inspection.elements) expect(element).not.toHaveProperty("pageNumber");
  });
});

describe("IFC identity", () => {
  it("26 preserves GlobalId exactly and never rewrites it", () => {
    const terminal = model().elements.find((element) => element.entityType === "IFCFIRESUPPRESSIONTERMINAL")!;
    expect(terminal.globalId).toBe("2xTerminalGlobalId0000007");
    expect(terminal.stepId).toBe(30);
    expect(terminal.locator).toBe("IFC:#30:IFCFIRESUPPRESSIONTERMINAL");
  });

  it("27 preserves Name, ObjectType, and Tag", () => {
    const terminal = model().elements.find((element) => element.entityType === "IFCFIRESUPPRESSIONTERMINAL")!;
    expect(terminal.name).toBe("SD-01");
    expect(terminal.objectType).toBe("Smoke Detector");
    expect(terminal.tag).toBe("SD");
  });

  it("28 keeps an unknown product type inspectable", () => {
    const weird = model().elements.find((element) => element.entityType === "IFCWIERDELEMENT")!;
    expect(weird.globalId).toBe("2xWeirdGlobalId000000027");
    expect(weird.name).toBe("Unknown Device");
  });

  it("29 preserves apostrophes inside STEP strings", () => {
    const inspection = inspectIfcDocument(Buffer.from(ifcWithApostropheAndComment(), "utf8"));
    expect(inspection.project?.name).toBe("Owner's Lounge");
  });
});

describe("IFC types, properties, quantities, units", () => {
  it("30 records an assigned type object without selecting a product", () => {
    const terminal = model().elements.find((element) => element.entityType === "IFCFIRESUPPRESSIONTERMINAL")!;
    expect(terminal.typeName).toBe("Smoke Detector Type");
    expect(terminal.typeLocator).toContain("IFCFLOWTERMINALTYPE");
    expect(terminal.status).toBe("OBSERVED_NOT_APPROVED");
  });

  it("31 preserves Manufacturer and ModelReference as observed metadata", () => {
    const inspection = model();
    const manufacturer = inspection.properties.find((property) => property.name === "Manufacturer")!;
    const modelRef = inspection.properties.find((property) => property.name === "ModelReference")!;
    expect(manufacturer.rawValue).toBe("Siemens");
    expect(modelRef.rawValue).toBe("ABC-123");
    expect(manufacturer.limitations.join(" ")).toContain("does not create a supplier");
    expect(modelRef.limitations.join(" ")).toContain("does not create a catalog item");
  });

  it("32 preserves a declared quantity without calculating geometry", () => {
    const quantity = model().quantities[0]!;
    expect(quantity.name).toBe("GrossFloorArea");
    expect(quantity.kind).toBe("AREA");
    expect(quantity.value).toBe(42.5);
    expect(quantity.rawValue).toBe("42.5");
    expect(quantity.limitations.join(" ")).toContain("did not calculate");
  });

  it("33 captures declared SI units and never converts them", () => {
    const inspection = model();
    const length = inspection.units.find((unit) => unit.unitType === "LENGTHUNIT")!;
    expect(length.prefix).toBe("MILLI");
    expect(length.siName).toBe("METRE");
    expect(length.label).toBe("milli metre");
    expect(length.declared).toBe(true);
    const quantity = inspection.quantities[0]!;
    expect(quantity.value).toBe(42.5);
    expect(quantity.value).not.toBeCloseTo(0.0425);
  });

  it("34 leaves units unknown when the model declares none", () => {
    const inspection = inspectIfcDocument(Buffer.from(ifcWithoutUnits(), "utf8"));
    expect(inspection.units.filter((unit) => unit.declared && unit.label)).toHaveLength(0);
  });
});

describe("IFC systems, materials, classification, documents", () => {
  it("35 records system membership from IFCRELASSIGNSTOGROUP", () => {
    const inspection = model();
    const system = inspection.systems.find((item) => item.name === "Fire Alarm")!;
    expect(system.memberLocators.some((locator) => locator.includes("IFCFIRESUPPRESSIONTERMINAL"))).toBe(true);
    const terminal = inspection.elements.find((element) => element.entityType === "IFCFIRESUPPRESSIONTERMINAL")!;
    expect(terminal.systemLocators).toContain(system.locator);
  });

  it("36 records material association without creating a purchase item", () => {
    const inspection = model();
    const material = inspection.materials.find((item) => item.name === "Concrete")!;
    expect(material.associatedObjectLocators.some((locator) => locator.includes("IFCWALL"))).toBe(true);
    expect(material.limitations.join(" ")).toContain("not a catalog product");
  });

  it("37 preserves classification codes without resolving a taxonomy", () => {
    const classification = model().classifications[0]!;
    expect(classification.identification).toBe("Pr_75_50_76");
    expect(classification.name).toBe("Smoke detectors");
    expect(classification.limitations.join(" ")).toContain("not interpreted");
  });

  it("38 records an external document reference without opening it", () => {
    const reference = model().documentReferences[0]!;
    expect(reference.location).toBe("https://files.example.com/spec.pdf");
    expect(reference.opened).toBe(false);
    expect(reference.limitations.join(" ")).toContain("was not opened");
  });

  it("39 preserves placement coordinates without transforming them", () => {
    const point = model().placements.find((item) => item.entityType === "IFCCARTESIANPOINT")!;
    expect(point.coordinates).toEqual([0, 0, 0]);
    expect(point.limitations.join(" ")).toContain("were not transformed");
  });

  it("40 preserves representation metadata without meshing", () => {
    const representations = model().representations;
    expect(representations.length).toBeGreaterThan(0);
    expect(representations.map((item) => item.limitations.join(" ")).join(" ")).toMatch(/tessellat|mesh|measur/iu);
  });
});

describe("IFC relationships and honesty", () => {
  it("41 never invents CONNECTED_TO, FEEDS, or AIRFLOW from IFCRELCONNECTS", () => {
    const analysis = analyzeIfcBytes(Buffer.from(fullIfcModel(), "utf8"));
    expect(analysis.relationships.every((relationship) => relationship.kind !== "CONNECTED_TO" as never)).toBe(true);
    const kinds = analysis.relationships.map((relationship) => relationship.kind);
    expect(kinds).not.toContain("CONNECTED_TO");
    expect(JSON.stringify(analysis.relationships)).not.toMatch(/FEEDS|AIRFLOW|CONNECTED_TO/u);
  });

  it("42 records spatial containment from IFCRELCONTAINEDINSPATIALSTRUCTURE", () => {
    const terminal = model().elements.find((element) => element.entityType === "IFCFIRESUPPRESSIONTERMINAL")!;
    expect(terminal.containerLocator).toContain("IFCBUILDINGSTOREY");
  });

  it("43 discloses a file that does not end with END-ISO-10303-21", () => {
    const inspection = inspectIfcDocument(Buffer.from(ifcMissingEndIso(), "utf8"));
    expect(inspection.limitations.join(" ")).toContain("did not end with END-ISO-10303-21");
  });

  it("44 states entity totals are ingestion metrics, not equipment counts", () => {
    const inspection = model();
    expect(inspection.limitations.join(" ")).toContain("not equipment counts");
    expect(inspection.entityCount).toBeGreaterThan(inspection.elements.length);
  });
});
