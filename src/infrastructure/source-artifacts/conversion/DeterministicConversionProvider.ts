import type { ConversionProvider, ConversionRequest, ConversionResult } from "@/src/application/source-artifacts/ports";
import { DETERMINISTIC_CONVERSION_PROVIDER_ID, type ArtifactDerivationKind } from "@/src/domain/source-artifact";

/**
 * Phase 2A-9: DETERMINISTIC TEST DOUBLE ONLY.
 *
 * This provider proves the ConversionProvider seam in tests: it turns fixture
 * DWG/RVT bytes into fixture DXF/IFC bytes so the whole governed pipeline
 * (key building, output re-validation, derived ingest, lineage) runs without
 * any real converter.
 *
 * It is never a production fallback. The production factory
 * (`createProductionConversionProvider`) must not import this module, and a
 * structural wiring test keeps that true. No environment variable can select
 * it.
 */

export const OUTPUT_FIXTURES = {
  DWG_TO_DXF: "dxf",
  RVT_TO_IFC: "ifc",
} as const;

export type DeterministicConversionOutcome =
  | { kind: "VALID_DXF" }
  | { kind: "VALID_IFC" }
  | { kind: "BINARY_DXF" }
  | { kind: "RANDOM_TEXT" }
  | { kind: "ZIP" }
  | { kind: "DWG_BYTES" }
  | { kind: "RVT_BYTES" }
  | { kind: "FAILED"; reason: string };

/** A minimal, real ASCII DXF: HEADER with version + ENTITIES with one line. */
export function minimalAsciiDxf(): string {
  return [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1027",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
    "0", "LINE", "8", "FIRE_ALARM", "10", "0.0", "20", "0.0", "11", "10.0", "21", "0.0",
    "0", "ENDSEC",
    "0", "EOF",
    "",
  ].join("\r\n");
}

/** A minimal, real textual IFC STEP physical file. */
export function minimalIfc(): string {
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('derived.ifc','2026-09-14T00:00:00',('Author'),('Org'),'VOKA','VOKA','');",
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    "#1=IFCPROJECT('0xScRe4drECQ4DMSqUj6IT',$,'Derived Project',$,$,$,$,(#3),#4);",
    "#2=IFCCARTESIANPOINT((0.,0.,0.));",
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

export function binaryDxfOutput(): Uint8Array {
  return new Uint8Array(Buffer.from("AutoCAD Binary DXF\r\n\u001a\u0000"));
}

export function randomTextOutput(): Uint8Array {
  return new Uint8Array(Buffer.from("This is not a drawing or a model, it is a random prose output from a converter gone wrong.\n".repeat(3), "utf8"));
}

export function zipOutput(): Uint8Array {
  return new Uint8Array(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]));
}

export function dwgOutput(): Uint8Array {
  return new Uint8Array(Buffer.from("AC1027\u0000binary-dwg-not-converted", "latin1"));
}

export function rvtOutput(): Uint8Array {
  return new Uint8Array(Buffer.concat([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), new Uint8Array(32)]));
}

/**
 * Builds the deterministic test provider.
 *
 * `outcomes` maps derivation kind to the output it should produce, so tests
 * can exercise every rejection branch (binary DXF, ZIP, random text, echoed
 * proprietary bytes) and both acceptance branches.
 */
export function deterministicConversionProvider(options: {
  version?: string;
  outcomes?: Partial<Record<ArtifactDerivationKind, DeterministicConversionOutcome>>;
  warnings?: string[];
  onCall?: (request: ConversionRequest) => void;
} = {}): ConversionProvider {
  const version = options.version ?? "test-1.0.0";
  const warnings = options.warnings ?? [];
  return {
    providerId: DETERMINISTIC_CONVERSION_PROVIDER_ID,
    converterVersion: version,
    supportedDerivationKinds: ["DWG_TO_DXF", "RVT_TO_IFC"],
    async convert(request: ConversionRequest): Promise<ConversionResult> {
      options.onCall?.(request);
      const outcome = options.outcomes?.[request.derivationKind]
        ?? (request.derivationKind === "DWG_TO_DXF" ? { kind: "VALID_DXF" } : { kind: "VALID_IFC" });
      switch (outcome.kind) {
        case "VALID_DXF":
          return { status: "SUCCEEDED", outputBytes: new Uint8Array(Buffer.from(minimalAsciiDxf(), "utf8")), warnings: [...warnings], converterVersion: version };
        case "VALID_IFC":
          return { status: "SUCCEEDED", outputBytes: new Uint8Array(Buffer.from(minimalIfc(), "utf8")), warnings: [...warnings], converterVersion: version };
        case "BINARY_DXF":
          return { status: "SUCCEEDED", outputBytes: binaryDxfOutput(), warnings: [...warnings], converterVersion: version };
        case "RANDOM_TEXT":
          return { status: "SUCCEEDED", outputBytes: randomTextOutput(), warnings: [...warnings], converterVersion: version };
        case "ZIP":
          return { status: "SUCCEEDED", outputBytes: zipOutput(), warnings: [...warnings], converterVersion: version };
        case "DWG_BYTES":
          return { status: "SUCCEEDED", outputBytes: dwgOutput(), warnings: [...warnings], converterVersion: version };
        case "RVT_BYTES":
          return { status: "SUCCEEDED", outputBytes: rvtOutput(), warnings: [...warnings], converterVersion: version };
        case "FAILED":
          return { status: "FAILED", reason: outcome.reason, warnings: [...warnings], converterVersion: version };
      }
    },
  };
}
