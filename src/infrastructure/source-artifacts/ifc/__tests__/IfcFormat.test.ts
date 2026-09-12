import { describe, expect, it } from "vitest";
import { detectIfcFormat } from "../IfcFormat";
import {
  binaryDxfBytes,
  dwgBytes,
  fullIfcModel,
  headerOnlyIfc,
  ifczipNamedBytes,
  malformedIfcProse,
  nwcBytes,
  rvtBytes,
  zipBytes,
} from "../../__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8 test matrix items 1-12: format detection.
 *
 * The decision comes from the bytes. A real IFC-SPF is accepted because it
 * carries ISO-10303-21 + HEADER + DATA, and every unsupported BIM/CAD format
 * is rejected with a message that names what it actually is.
 */
describe("IFC format detection", () => {
  it("1 recognizes a valid IFC STEP file from its structure, not its file name", () => {
    const decision = detectIfcFormat({ bytes: Buffer.from(fullIfcModel(), "utf8") });
    expect(decision.format).toBe("IFC_SPF");
    expect(decision.supported).toBe(true);
    expect(decision.evidence.join(" ")).toContain("STEP/IFC structure");
  });

  it("2 accepts a model whose name and MIME type are missing or generic", () => {
    const decision = detectIfcFormat({
      bytes: Buffer.from(fullIfcModel(), "utf8"),
      filename: "model",
      mimeType: "application/octet-stream",
    });
    expect(decision.supported).toBe(true);
    expect(decision.format).toBe("IFC_SPF");
  });

  it("3 rejects prose named .ifc truthfully", () => {
    const decision = detectIfcFormat({ bytes: malformedIfcProse(), filename: "notes.ifc", mimeType: "application/x-step" });
    expect(decision.format).toBe("NOT_AN_IFC_FILE");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("does not contain ISO-10303-21");
  });

  it("4 rejects a Revit compound document as RVT even when named .ifc", () => {
    const decision = detectIfcFormat({ bytes: rvtBytes(), filename: "model.ifc" });
    expect(decision.format).toBe("RVT");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("Revit");
  });

  it("5 rejects an RFA by extension on an OLE2 document", () => {
    const decision = detectIfcFormat({ bytes: rvtBytes(), filename: "family.rfa" });
    expect(decision.format).toBe("RFA");
    expect(decision.supported).toBe(false);
  });

  it("6 rejects a ZIP / IFCZIP without unzipping it", () => {
    const zip = detectIfcFormat({ bytes: zipBytes(), filename: "model.ifc" });
    expect(zip.format).toBe("IFC_ZIP");
    expect(zip.supported).toBe(false);
    expect(zip.reason).toContain("does not unzip");
    const named = detectIfcFormat({ bytes: ifczipNamedBytes(), filename: "model.ifczip" });
    expect(named.format).toBe("IFC_ZIP");
    expect(named.reason).toContain("ifczip");
  });

  it("7 rejects a DWG as a DWG", () => {
    const decision = detectIfcFormat({ bytes: dwgBytes(), filename: "model.ifc" });
    expect(decision.format).toBe("DWG");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("binary DWG");
  });

  it("8 rejects a binary DXF as DXF", () => {
    const decision = detectIfcFormat({ bytes: binaryDxfBytes(), filename: "model.ifc" });
    expect(decision.format).toBe("DXF");
    expect(decision.supported).toBe(false);
  });

  it("9 rejects binary / Navisworks-like content", () => {
    const decision = detectIfcFormat({ bytes: nwcBytes(), filename: "model.nwc" });
    expect(decision.supported).toBe(false);
  });

  it("10 rejects an empty file", () => {
    const decision = detectIfcFormat({ bytes: Buffer.alloc(0), filename: "empty.ifc" });
    expect(decision.format).toBe("NOT_AN_IFC_FILE");
    expect(decision.supported).toBe(false);
  });

  it("11 rejects an oversized model by size before reading it", () => {
    const decision = detectIfcFormat({ bytes: new Uint8Array(26 * 1024 * 1024), filename: "huge.ifc" });
    expect(decision.format).toBe("OVERSIZED");
    expect(decision.supported).toBe(false);
  });

  it("12 rejects a STEP header with no DATA section", () => {
    const decision = detectIfcFormat({ bytes: Buffer.from(headerOnlyIfc(), "utf8"), filename: "bad.ifc" });
    expect(decision.format).toBe("MALFORMED_STEP");
    expect(decision.supported).toBe(false);
  });
});
