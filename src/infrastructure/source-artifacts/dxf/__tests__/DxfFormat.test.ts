import { describe, expect, it } from "vitest";
import { detectDxfFormat } from "../DxfFormat";
import {
  binaryDxfBytes,
  dwgBytes,
  fullDrawing,
  ifcBytes,
  malformedText,
  rvtBytes,
  truncatedDrawing,
} from "../../__tests__/fixtures/dxfFixtures";

/**
 * Phase 2A-7 test matrix items 1-4: format detection.
 *
 * The point of this suite is that the decision comes from the bytes. A real
 * ASCII DXF is accepted because it carries group-code structure, and every
 * binary CAD format is rejected with a message that names what it actually is —
 * never as a generic failure, and never by quietly parsing a DWG as text.
 */
describe("DXF format detection", () => {
  it("recognizes a valid ASCII DXF from its structure, not its file name", () => {
    const bytes = Buffer.from(fullDrawing(), "latin1");
    // No filename and no MIME type at all: structure alone must decide.
    const decision = detectDxfFormat({ bytes });
    expect(decision.format).toBe("ASCII_DXF");
    expect(decision.supported).toBe(true);
    expect(decision.evidence.join(" ")).toContain("group-code structure");
  });

  it("accepts a drawing whose name and MIME type are missing or generic", () => {
    const decision = detectDxfFormat({
      bytes: Buffer.from(fullDrawing(), "latin1"),
      filename: "site",
      mimeType: "application/octet-stream",
    });
    expect(decision.supported).toBe(true);
    expect(decision.format).toBe("ASCII_DXF");
  });

  it("rejects malformed prose truthfully even when it is named .dxf", () => {
    const decision = detectDxfFormat({ bytes: malformedText(), filename: "notes.dxf", mimeType: "image/vnd.dxf" });
    expect(decision.format).toBe("NOT_A_CAD_FILE");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("does not contain DXF group-code structure");
  });

  it("rejects a binary DXF as a binary DXF rather than parsing it as text", () => {
    const decision = detectDxfFormat({ bytes: binaryDxfBytes(), filename: "site.dxf" });
    expect(decision.format).toBe("BINARY_DXF");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("binary DXF");
  });

  it("rejects a DWG as a DWG and never pretends it is a DXF", () => {
    const decision = detectDxfFormat({ bytes: dwgBytes(), filename: "site.dxf", mimeType: "image/vnd.dxf" });
    expect(decision.format).toBe("DWG");
    expect(decision.supported).toBe(false);
    expect(decision.reason).toContain("binary DWG drawing");
    expect(decision.reason).toContain("a DWG is not a DXF");
    expect(decision.reason).toContain("AC1027");
  });

  it("rejects a Revit compound document as RVT", () => {
    const decision = detectDxfFormat({ bytes: rvtBytes(), filename: "model.rvt" });
    expect(decision.format).toBe("RVT");
    expect(decision.supported).toBe(false);
  });

  it("rejects a STEP/IFC model as IFC", () => {
    const decision = detectDxfFormat({ bytes: ifcBytes(), filename: "model.ifc" });
    expect(decision.format).toBe("IFC");
    expect(decision.supported).toBe(false);
  });

  it("rejects an empty file", () => {
    const decision = detectDxfFormat({ bytes: Buffer.alloc(0), filename: "empty.dxf" });
    expect(decision.format).toBe("NOT_A_CAD_FILE");
    expect(decision.supported).toBe(false);
  });

  it("rejects an oversized drawing by size before reading it", () => {
    const decision = detectDxfFormat({ bytes: new Uint8Array(26 * 1024 * 1024), filename: "huge.dxf" });
    expect(decision.format).toBe("OVERSIZED");
    expect(decision.supported).toBe(false);
  });

  it("rejects a truncated drawing that has group codes but no section framing", () => {
    // Group-code pairs with no SECTION/ENDSEC framing: partly DXF-shaped, but
    // not something VOKA will claim to have read as a drawing.
    const decision = detectDxfFormat({ bytes: Buffer.from("  0\r\nLINE\r\n  8\r\n0\r\n", "latin1"), filename: "bad.dxf" });
    expect(decision.supported).toBe(false);
    expect(decision.format).toBe("UNKNOWN");
  });

  it("still accepts a drawing missing its EOF marker, and says so downstream", () => {
    const decision = detectDxfFormat({ bytes: Buffer.from(truncatedDrawing(), "latin1") });
    expect(decision.format).toBe("ASCII_DXF");
    expect(decision.supported).toBe(true);
  });
});
