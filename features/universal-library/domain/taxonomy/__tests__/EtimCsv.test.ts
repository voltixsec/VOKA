import { describe, expect, it } from "vitest";
import { decodeEtimCsv, parseEtimCsv } from "../EtimCsv";

describe("ETIM CSV parsing", () => {
  it("decodes the official UTF-16LE format with or without a BOM", () => {
    const value = "ARTGROUPID;GROUPDESC\r\nEG000001;Cables and wires\r\n";
    expect(decodeEtimCsv(Buffer.from(value, "utf16le"))).toBe(value);
    expect(decodeEtimCsv(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(value, "utf16le")]))).toBe(value);
  });

  it("preserves quoted semicolons and escaped quotes", () => {
    expect(parseEtimCsv('ID;NAME\r\nEC1;"Cable; data ""premium"""\r\n'))
      .toEqual([["ID", "NAME"], ["EC1", 'Cable; data "premium"']]);
  });

  it("fails closed on malformed quoted input", () => {
    expect(() => parseEtimCsv('ID;NAME\nEC1;"broken'))
      .toThrow("unterminated quoted field");
  });
});
