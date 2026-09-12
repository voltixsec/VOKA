import { MAX_IFC_BYTES, MAX_IFC_LIMITATIONS, type IfcFormat } from "@/src/domain/source-artifact";

/**
 * Phase 2A-8: truthful IFC format detection.
 *
 * The extension is corroborating evidence only. The decision rests on the
 * bytes: a file is a textual IFC because it carries ISO-10303-21 STEP
 * structure, not because it is named `model.ifc`. This matters in both
 * directions:
 *
 * - an RVT or DWG renamed to `.ifc` must be rejected as what it is;
 * - a real IFC-SPF that a browser reported as `application/octet-stream` must
 *   still be accepted.
 *
 * Nothing here unzips archives, opens IFCZIP, or shells out. Detection reads
 * bytes.
 */

export class IfcInspectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "IfcInspectionError";
  }
}

export type IfcFormatDecision = {
  format: IfcFormat;
  supported: boolean;
  evidence: string[];
  reason: string;
  limitations: string[];
};

const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_SIGNATURE = [0x50, 0x4b];
const DWG_VERSION_PREFIXES = [
  "AC1009", "AC1012", "AC1014", "AC1015", "AC1017", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032", "AC1035",
] as const;
const BINARY_DXF_PREFIX = "AutoCAD Binary DXF";
const STEP_PREFIX = "ISO-10303-21";
const DGN_SIGNATURES: readonly number[][] = [
  [0x08, 0x09, 0xfe],
  [0x08, 0x09, 0xff],
];

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let index = start; index < start + length && index < bytes.length; index += 1) out += String.fromCharCode(bytes[index]!);
  return out;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function extensionOf(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const match = /\.([A-Za-z0-9]{1,8})$/u.exec(filename.trim());
  return match ? match[1]!.toLocaleLowerCase() : null;
}

/**
 * Structural evidence that a text body really is a STEP physical file that
 * looks like IFC. Requiring ISO-10303-21 plus HEADER and DATA is what
 * distinguishes an IFC from a text file that happens to mention IFCPROJECT.
 */
export function ifcStepStructureEvidence(text: string): {
  matches: string[];
  structural: boolean;
  hasIso: boolean;
  hasHeader: boolean;
  hasData: boolean;
  hasFileSchema: boolean;
  hasIfcEntity: boolean;
} {
  const sample = text.slice(0, 256 * 1024);
  const upper = sample.toUpperCase();
  const matches: string[] = [];
  const hasIso = upper.includes("ISO-10303-21");
  if (hasIso) matches.push("ISO-10303-21");
  const hasHeader = /HEADER\s*;/u.test(upper);
  if (hasHeader) matches.push("HEADER");
  const hasFileSchema = upper.includes("FILE_SCHEMA");
  if (hasFileSchema) matches.push("FILE_SCHEMA");
  const hasData = /DATA\s*;/u.test(upper);
  if (hasData) matches.push("DATA");
  const hasIfcEntity = /#\d+\s*=\s*IFC[A-Z0-9_]+\(/u.test(upper);
  if (hasIfcEntity) matches.push("IFC entity");
  const structural = hasIso && hasHeader && hasData;
  return { matches, structural, hasIso, hasHeader, hasData, hasFileSchema, hasIfcEntity };
}

export function detectIfcFormat(input: {
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
}): IfcFormatDecision {
  const { bytes } = input;
  const evidence: string[] = [];
  const extension = extensionOf(input.filename);
  if (extension) evidence.push(`the file name ends in .${extension}`);
  if (input.mimeType) evidence.push(`the declared MIME type is ${input.mimeType}`);

  const decide = (format: IfcFormat, supported: boolean, reason: string, extra: string[] = []): IfcFormatDecision => ({
    format,
    supported,
    evidence,
    reason,
    limitations: [...new Set(extra)].slice(0, MAX_IFC_LIMITATIONS),
  });

  if (bytes.length === 0) return decide("NOT_AN_IFC_FILE", false, "the file is empty, so there is no IFC model to inspect");
  if (bytes.length > MAX_IFC_BYTES) {
    return decide("OVERSIZED", false, `the model is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB, above the ${MAX_IFC_BYTES / (1024 * 1024)} MB limit for safe inspection`);
  }

  if (startsWithBytes(bytes, OLE2_SIGNATURE)) {
    const asRfa = extension === "rfa";
    return decide(
      asRfa ? "RFA" : "RVT",
      false,
      asRfa
        ? "the file is an OLE2 compound document of the kind Revit family (.rfa) uses; VOKA inspects textual IFC STEP files only"
        : "the file is an OLE2 compound document of the kind Revit (.rvt) uses; VOKA inspects textual IFC STEP files only",
    );
  }
  if (startsWithBytes(bytes, ZIP_SIGNATURE)) {
    if (extension === "ifczip") {
      return decide("IFC_ZIP", false, "the file is an IFC ZIP archive (.ifczip); VOKA inspects textual IFC STEP files only and does not unzip archives in this phase");
    }
    return decide("IFC_ZIP", false, "the file is a ZIP archive, not a textual IFC STEP file; VOKA does not unzip archives in this phase");
  }
  if (DGN_SIGNATURES.some((signature) => startsWithBytes(bytes, signature))) {
    return decide("DGN", false, "the file is a MicroStation (.dgn) drawing; VOKA inspects textual IFC STEP files only");
  }

  const head = ascii(bytes, 0, 8);
  const wideHead = ascii(bytes, 0, BINARY_DXF_PREFIX.length + 2);
  const dwgVersion = DWG_VERSION_PREFIXES.find((prefix) => head.startsWith(prefix));
  if (dwgVersion) {
    return decide("DWG", false, `the file is a binary DWG drawing (${dwgVersion}); VOKA inspects textual IFC STEP files only`);
  }
  if (wideHead.startsWith(BINARY_DXF_PREFIX)) {
    return decide("DXF", false, "the file is a binary DXF drawing; VOKA inspects textual IFC STEP files only");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return decide("NOT_AN_IFC_FILE", false, "the file could not be decoded as text, so it is not a textual IFC STEP file");
  }

  let controlBytes = 0;
  const sampleLength = Math.min(bytes.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = bytes[index]!;
    if (byte === 0x00 || (byte < 0x09) || (byte > 0x0d && byte < 0x20)) controlBytes += 1;
  }
  if (controlBytes / Math.max(sampleLength, 1) > 0.02) {
    if (ascii(bytes, 0, STEP_PREFIX.length).startsWith(STEP_PREFIX)) {
      return decide("IFC_BINARY", false, "the file starts like STEP but contains binary content, so it is not a textual IFC STEP file");
    }
    return decide("UNKNOWN", false, "the file contains binary content, so it is not a textual IFC STEP file");
  }

  const structure = ifcStepStructureEvidence(text);
  if (structure.structural) {
    evidence.push(`the file carries STEP/IFC structure (${structure.matches.join(", ")})`);
    if (!structure.hasIfcEntity && !structure.hasFileSchema) {
      return decide("MALFORMED_STEP", false, "the file looks like a STEP physical file but declares no FILE_SCHEMA and no IFC entities, so it was not parsed as IFC");
    }
    return decide("IFC_SPF", true, "the file is a textual IFC STEP physical file");
  }
  if (structure.hasIso && !structure.hasData) {
    return decide("MALFORMED_STEP", false, "the file starts as ISO-10303-21 but has no DATA section, so it is not a well-formed IFC file");
  }
  if (extension === "ifc") {
    return decide("NOT_AN_IFC_FILE", false, "the file is named .ifc but does not contain ISO-10303-21 STEP structure, so it was not parsed as an IFC model");
  }
  if (extension === "rvt") {
    return decide("RVT", false, "the file is named .rvt and is not a textual IFC STEP file; VOKA does not parse Revit files");
  }
  if (extension === "dwg") {
    return decide("DWG", false, "the file is named .dwg and is not a textual IFC STEP file; VOKA does not parse DWG files");
  }
  return decide("NOT_AN_IFC_FILE", false, "the file contains no ISO-10303-21 STEP structure, so it is not a readable IFC model");
}
