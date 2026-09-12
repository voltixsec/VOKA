import { describe, expect, it } from "vitest";
import { IfcStepReadError, readIfcStep } from "../IfcStepReader";
import { fullIfcModel, ifcWithApostropheAndComment } from "../../__tests__/fixtures/ifcFixtures";

/**
 * Phase 2A-8 test matrix items 13-18: bounded STEP physical-file reading.
 */
describe("IFC STEP reader", () => {
  it("13 reads HEADER schema, filename, and entity records", () => {
    const read = readIfcStep(fullIfcModel());
    expect(read.header.schemas).toEqual(["IFC4"]);
    expect(read.header.fileName).toBe("seafront.ifc");
    expect(read.entityById.get(30)?.entityType).toBe("IFCFIRESUPPRESSIONTERMINAL");
    expect(read.sawIso).toBe(true);
    expect(read.sawData).toBe(true);
    expect(read.sawEndIso).toBe(true);
  });

  it("14 does not split on a semicolon inside a quoted string", () => {
    const source = fullIfcModel().replace("'SD-01'", "'SD;01'");
    const read = readIfcStep(source);
    const terminal = read.entityById.get(30)!;
    const name = terminal.args[2];
    expect(name).toEqual({ kind: "string", value: "SD;01" });
  });

  it("15 preserves doubled apostrophes and skips comments", () => {
    const read = readIfcStep(ifcWithApostropheAndComment());
    expect(read.entities.some((entity) => entity.raw.includes("authoring comment"))).toBe(false);
    const project = read.entities.find((entity) => entity.entityType === "IFCPROJECT")!;
    expect(project.args[2]).toEqual({ kind: "string", value: "Owner's Lounge" });
  });

  it("16 parses nested lists and typed values", () => {
    const read = readIfcStep(fullIfcModel());
    const point = read.entityById.get(10)!;
    expect(point.args[0]?.kind).toBe("list");
    const pset = read.entityById.get(40)!;
    expect(pset.args[2]?.kind).toBe("typed");
  });

  it("17 throws on an unterminated string rather than inventing a close", () => {
    const source = fullIfcModel().replace("'SD-01'", "'SD-01");
    expect(() => readIfcStep(source)).toThrow(IfcStepReadError);
  });

  it("18 truncates at the entity cap and discloses it", () => {
    const read = readIfcStep(fullIfcModel(), { maxEntities: 3 });
    expect(read.entities).toHaveLength(3);
    expect(read.truncated).toBe(true);
    expect(read.entityCount).toBeGreaterThan(3);
    expect(read.limitations.join(" ")).toContain("retained");
  });
});
