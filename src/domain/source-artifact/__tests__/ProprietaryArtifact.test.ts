import { describe, expect, it } from "vitest";
import {
  ARTIFACT_DERIVATION_KINDS,
  DWG_TO_DXF_FIDELITY_LIMITATIONS,
  MAX_DERIVATION_FIDELITY_LIMITATIONS,
  MAX_DERIVATION_WARNINGS,
  RVT_TO_IFC_FIDELITY_LIMITATIONS,
  automatedDerivationKey,
  canonicalOptionsFingerprint,
  derivationFidelityLimitations,
  derivationKindForPair,
  userProvidedDerivationKey,
  detectDwgOriginalFormat,
  detectRvtOriginalFormat,
  looksLikeDwgOriginal,
  looksLikeRvtOriginal,
  revitCompoundEvidence,
} from "@/src/domain/source-artifact";

/**
 * Phase 2A-9 test matrix items 1-6 and 15-18: proprietary format validation
 * and deterministic derivation idempotency keys.
 */

function dwgBytes(version = "AC1027"): Buffer {
  return Buffer.concat([Buffer.from(version, "latin1"), Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]), Buffer.alloc(64, 0x51)]);
}

/** An OLE2 compound document carrying the Revit BasicFileInfo directory marker (UTF-16LE, as stored). */
function rvtBytes(): Buffer {
  const markerUtf16 = Buffer.from(Array.from("BasicFileInfo").flatMap((character) => [character.charCodeAt(0), 0x00]));
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(32, 0x00),
    markerUtf16,
    Buffer.alloc(32, 0x00),
  ]);
}

describe("DWG original detection (matrix 1-3)", () => {
  it("1 recognizes every documented DWG release signature", () => {
    for (const version of ["AC1009", "AC1012", "AC1014", "AC1015", "AC1017", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032", "AC1035"]) {
      const decision = detectDwgOriginalFormat({ bytes: dwgBytes(version) });
      expect(decision.isDwg, `${version} must be recognized`).toBe(true);
      expect(decision.versionCode).toBe(version);
    }
  });

  it("2 captures the DWG version and its published release label", () => {
    const decision = detectDwgOriginalFormat({ bytes: dwgBytes("AC1027"), filename: "anything.bin" });
    expect(decision.versionCode).toBe("AC1027");
    expect(decision.versionLabel).toBe("AutoCAD 2013");
    expect(decision.reason).toContain("AC1027");
    // The filename plays no part: a renamed real DWG is still a DWG.
    expect(detectDwgOriginalFormat({ bytes: dwgBytes("AC1032"), filename: "photo.txt" }).isDwg).toBe(true);
  });

  it("3 rejects a renamed random file, a text file, and an OLE compound file as DWG", () => {
    expect(detectDwgOriginalFormat({ bytes: dwgBytes() }).isDwg).toBe(true);
    expect(detectDwgOriginalFormat({ bytes: Buffer.from("random bytes that mean nothing at all") }).isDwg).toBe(false);
    expect(detectDwgOriginalFormat({ bytes: Buffer.from("%PDF-1.4\n") }).isDwg).toBe(false);
    expect(detectDwgOriginalFormat({ bytes: rvtBytes() }).isDwg).toBe(false);
    expect(detectDwgOriginalFormat({ bytes: Buffer.alloc(0) }).isDwg).toBe(false);
    expect(looksLikeDwgOriginal(Buffer.from("hello world, definitely not a drawing"))).toBe(false);
    // An embedded AC-looking string that does not START the file is not evidence.
    const embedded = Buffer.concat([Buffer.alloc(16, 0x20), Buffer.from("AC1027")]);
    expect(detectDwgOriginalFormat({ bytes: embedded }).isDwg).toBe(false);
  });
});

describe("RVT original detection (matrix 4-6)", () => {
  it("4 accepts an RVT only with OLE2 signature AND Revit-specific corroboration", () => {
    const decision = detectRvtOriginalFormat({ bytes: rvtBytes(), filename: "tower.rvt", mimeType: "application/octet-stream" });
    expect(decision.decision).toBe("RVT");
    expect(revitCompoundEvidence(rvtBytes()).found).toBe(true);
    expect(looksLikeRvtOriginal(rvtBytes())).toBe(true);
  });

  it("5 rejects a generic OLE compound file as an unverified OLE compound file, never as RVT", () => {
    const genericOle = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512, 0x00)]);
    expect(revitCompoundEvidence(genericOle).found).toBe(false);
    const decision = detectRvtOriginalFormat({ bytes: genericOle, filename: "document.rvt" });
    expect(decision.decision).toBe("UNVERIFIED_OLE_COMPOUND");
    expect(looksLikeRvtOriginal(genericOle)).toBe(false);
    // And a non-OLE file named .rvt is not an RVT either.
    expect(detectRvtOriginalFormat({ bytes: Buffer.from("%PDF-1.4"), filename: "x.rvt" }).decision).toBe("NOT_RVT");
  });

  it("6 names a Revit family definition truthfully and separately", () => {
    const rfa = detectRvtOriginalFormat({ bytes: rvtBytes(), filename: "door.rfa" });
    expect(rfa.decision).toBe("RFA");
    expect(rfa.reason).toContain("Revit family");
    expect(rfa.reason).toContain(".rfa");
    // Even a non-OLE .rfa is named as RFA, not swallowed by a generic answer.
    const plain = detectRvtOriginalFormat({ bytes: Buffer.from("junk"), filename: "door.rfa" });
    expect(plain.decision).toBe("RFA");
  });
});

describe("derivation key idempotency (matrix 15-18)", () => {
  const sourceHash = "aa".repeat(32);
  const derivedHash = "bb".repeat(32);

  it("15 is stable when the same options are declared in a different insertion order", () => {
    const keyA = automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0", options: { layers: "all", encoding: "ascii", scaleX: 1 } });
    const keyB = automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0", options: { scaleX: 1, encoding: "ascii", layers: "all" } });
    expect(keyA).toBe(keyB);
    expect(canonicalOptionsFingerprint({ b: 2, a: 1 })).toBe(canonicalOptionsFingerprint({ a: 1, b: 2 }));
  });

  it("16 changes when the converter version changes", () => {
    const old = automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0" });
    const next = automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "2.0" });
    expect(old).not.toBe(next);
  });

  it("17 changes when the options, converter id, kind, or method change", () => {
    const base = automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0", options: { encoding: "ascii" } });
    expect(automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0", options: { encoding: "binary" } })).not.toBe(base);
    expect(automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "other", converterVersion: "1.0" })).not.toBe(base);
    expect(automatedDerivationKey({ derivationKind: "RVT_TO_IFC", sourceHash, converterId: "converter", converterVersion: "1.0" })).not.toBe(base);
    // Case differences in the hash do NOT produce a second identity.
    expect(automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash: sourceHash.toUpperCase(), converterId: "converter", converterVersion: "1.0" })).toBe(
      automatedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, converterId: "converter", converterVersion: "1.0" }),
    );
  });

  it("18 is stable for the same user-provided source/derived hash pair and differs otherwise", () => {
    const a = userProvidedDerivationKey({ derivationKind: "RVT_TO_IFC", sourceHash, derivedHash });
    const b = userProvidedDerivationKey({ derivationKind: "RVT_TO_IFC", sourceHash, derivedHash });
    expect(a).toBe(b);
    expect(userProvidedDerivationKey({ derivationKind: "RVT_TO_IFC", sourceHash, derivedHash: "cc".repeat(32) })).not.toBe(a);
    expect(userProvidedDerivationKey({ derivationKind: "DWG_TO_DXF", sourceHash, derivedHash })).not.toBe(a);
    // Automated and user-provided derivations of the same pair never collide.
    expect(automatedDerivationKey({ derivationKind: "RVT_TO_IFC", sourceHash, converterId: "converter", converterVersion: "1.0" })).not.toBe(a);
  });
});

describe("fidelity limitation channels (matrix 49-50, 24)", () => {
  it("keeps the two channels distinct and bounded, with no losslessness claims", () => {
    expect(ARTIFACT_DERIVATION_KINDS).toEqual(["DWG_TO_DXF", "RVT_TO_IFC"]);
    for (const limitations of [DWG_TO_DXF_FIDELITY_LIMITATIONS, RVT_TO_IFC_FIDELITY_LIMITATIONS]) {
      expect(limitations.length).toBeGreaterThan(0);
      expect(limitations.length).toBeLessThanOrEqual(MAX_DERIVATION_FIDELITY_LIMITATIONS);
      for (const limitation of limitations) {
        expect(limitation.toLowerCase()).not.toContain("lossless");
        expect(limitation.toLowerCase()).not.toContain("fully preserved");
      }
    }
    expect(derivationFidelityLimitations("DWG_TO_DXF")).toEqual(DWG_TO_DXF_FIDELITY_LIMITATIONS);
    expect(derivationFidelityLimitations("RVT_TO_IFC")).toEqual(RVT_TO_IFC_FIDELITY_LIMITATIONS);
    expect(MAX_DERIVATION_WARNINGS).toBeGreaterThan(0);
  });

  it("addresses the required risk areas for each derivation kind", () => {
    const dwg = DWG_TO_DXF_FIDELITY_LIMITATIONS.join("\n").toLowerCase();
    for (const topic of ["metadata", "custom objects", "extended data", "layout", "xref"]) expect(dwg).toContain(topic);
    const rvt = RVT_TO_IFC_FIDELITY_LIMITATIONS.join("\n").toLowerCase();
    for (const topic of ["parameters", "categor", "family", "mep", "views", "quantities", "identity"]) expect(rvt).toContain(topic);
  });
});

describe("pair policy", () => {
  it("accepts only DWG→DXF and RVT→IFC, rejecting every other pairing", () => {
    expect(derivationKindForPair("DWG", "DXF")).toBe("DWG_TO_DXF");
    expect(derivationKindForPair("RVT", "IFC")).toBe("RVT_TO_IFC");
    for (const [original, derived] of [["DWG", "IFC"], ["RVT", "DXF"], ["PDF", "DXF"], ["DXF", "IFC"], ["DWG", "DWG"], ["RVT", "RVT"]] as const) {
      expect(derivationKindForPair(original, derived)).toBeNull();
    }
  });
});
