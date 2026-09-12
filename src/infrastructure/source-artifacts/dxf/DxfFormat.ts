// Phase 2A-9: the recognized DWG release table is canonical in the domain
// module, so every detector names the same releases from one source.
import { DWG_VERSION_PREFIXES, MAX_DXF_BYTES, MAX_DXF_LIMITATIONS, type DxfFormat } from "@/src/domain/source-artifact";

/**
 * Phase 2A-7: truthful CAD format detection.
 *
 * The extension is corroborating evidence only. The decision rests on the bytes:
 * a file is an ASCII DXF because it carries DXF group-code structure, not
 * because it is named `site.dxf`. This matters in both directions:
 *
 * - a DWG renamed to `.dxf` must be rejected as a DWG, never parsed as text.
 *   A DWG is a binary object database; reading it as group codes produces
 *   plausible-looking garbage, which is the worst possible failure mode;
 * - a real ASCII DXF that a browser reported as `application/octet-stream` must
 *   still be accepted.
 *
 * Nothing here opens, converts, or shells out. Detection reads bytes.
 */

export class DxfInspectionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DxfInspectionError";
  }
}

export type DxfFormatDecision = {
  format: DxfFormat;
  supported: boolean;
  /** Bounded plain-language evidence behind the decision. */
  evidence: string[];
  /** Plain-language reason, safe to show a user or hand to the assistant. */
  reason: string;
  limitations: string[];
};

/**
 * DWG releases begin with their `$ACADVER` string as six ASCII bytes followed
 * by a NUL. Matching that prefix is what lets VOKA say "this is a DWG" instead
 * of "this is not a CAD file", which is a far more useful answer to an engineer
 * who exported the wrong format. The release table itself is canonical in the
 * domain layer (Phase 2A-9) and shared with the proprietary-original gate.
 */

/** AutoCAD binary DXF header. `\x1A` is the documented end-of-file byte. */
const BINARY_DXF_PREFIX = "AutoCAD Binary DXF";

/** OLE2 compound document signature, which Revit `.rvt` files use. */
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** MicroStation `.dgn` signature bytes. */
const DGN_SIGNATURES: readonly number[][] = [
  [0x08, 0x09, 0xfe],
  [0x08, 0x09, 0xff],
];

/** STEP physical file header, which IFC-SPF (`.ifc`) files use. */
const STEP_PREFIX = "ISO-10303-21";

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
 * Structural evidence that a text body really is an ASCII DXF.
 *
 * A DXF file is a sequence of two-line pairs: a group code, then its value.
 * Rather than trust any single keyword, this scans the head of the file for
 * that shape and for the section markers a DXF is built from (`SECTION` with a
 * name, `ENDSEC`, `EOF`). Requiring the pair structure is what distinguishes a
 * DXF from, say, a CSV or a hand-written text file that happens to mention
 * "LAYER".
 */
export function asciiDxfStructureEvidence(text: string): { matches: string[]; structural: boolean; groupCodePairs: number } {
  const matches: string[] = [];
  let structural = false;
  let groupCodePairs = 0;
  // Scan only the head: enough lines to see the section structure without
  // walking a 25 MB file just to decide whether to parse it.
  // The window has to be wide enough to reach the first ENDSEC: a real drawing
  // with a large LAYER or BLOCK_RECORD table puts it hundreds of pairs in.
  const lines = text.slice(0, 128 * 1024).split(/\r\n|\r|\n/);
  for (let index = 0; index + 1 < lines.length && index < 2_048; index += 2) {
    const codeLine = (lines[index] ?? "").trim();
    if (!/^-?\d{1,4}$/u.test(codeLine)) break;
    groupCodePairs += 1;
    const value = (lines[index + 1] ?? "").trim();
    const code = Number.parseInt(codeLine, 10);
    if (code === 0 && ["SECTION", "ENDSEC", "EOF"].includes(value)) {
      structural = true;
      if (!matches.includes(value)) matches.push(value);
    }
    if (code === 2 && ["HEADER", "TABLES", "BLOCKS", "ENTITIES", "OBJECTS", "CLASSES"].includes(value)) {
      if (!matches.includes(value)) matches.push(value);
    }
  }
  // Section framing is the primary evidence. `EOF` on its own is not enough —
  // plenty of text files end with those three letters — so it only counts
  // alongside a `SECTION`.
  const framed = matches.includes("SECTION") && (matches.includes("ENDSEC") || matches.includes("EOF"));
  // A long unbroken run of well-formed group-code pairs is independently
  // conclusive. Prose, CSV, and JSON all break the strict two-line shape within
  // a handful of lines, so nothing but a DXF sustains this many.
  const sustainedPairs = groupCodePairs >= 64;
  return { matches, structural: structural && (framed || sustainedPairs) && groupCodePairs >= 3, groupCodePairs };
}

/**
 * Decides what a CAD attachment actually is.
 *
 * Order matters: the binary signatures are checked first, because a binary file
 * decoded as text can still contain ASCII fragments that would fool a text-only
 * check. Only after every binary format is ruled out does the structural DXF
 * evidence get to say yes.
 */
export function detectDxfFormat(input: {
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
}): DxfFormatDecision {
  const { bytes } = input;
  const evidence: string[] = [];
  const extension = extensionOf(input.filename);
  if (extension) evidence.push(`the file name ends in .${extension}`);
  if (input.mimeType) evidence.push(`the declared MIME type is ${input.mimeType}`);

  const decide = (format: DxfFormat, supported: boolean, reason: string, extra: string[] = []): DxfFormatDecision => ({
    format,
    supported,
    evidence,
    reason,
    limitations: [...new Set(extra)].slice(0, MAX_DXF_LIMITATIONS),
  });

  if (bytes.length === 0) return decide("NOT_A_CAD_FILE", false, "the file is empty, so there is no drawing to inspect");
  if (bytes.length > MAX_DXF_BYTES) {
    return decide("OVERSIZED", false, `the drawing is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB, above the ${MAX_DXF_BYTES / (1024 * 1024)} MB limit for safe inspection`);
  }

  // Binary signatures first. Every one of these is named for what it is, so an
  // engineer who exported the wrong format gets an actionable answer.
  if (startsWithBytes(bytes, OLE2_SIGNATURE)) {
    return decide("RVT", false, "the file is an OLE2 compound document of the kind Revit (.rvt) uses; VOKA inspects ASCII DXF drawings only");
  }
  if (DGN_SIGNATURES.some((signature) => startsWithBytes(bytes, signature))) {
    return decide("DGN", false, "the file is a MicroStation (.dgn) drawing; VOKA inspects ASCII DXF drawings only");
  }
  // Six bytes are enough to name a DWG release, but the binary-DXF banner is
  // eighteen, so the head slice has to cover the longest signature checked here.
  // A too-short slice would let a binary DXF fall through to a generic answer.
  const head = ascii(bytes, 0, 8);
  const wideHead = ascii(bytes, 0, BINARY_DXF_PREFIX.length + 2);
  const dwgVersion = DWG_VERSION_PREFIXES.find((prefix) => head.startsWith(prefix));
  if (dwgVersion) {
    return decide("DWG", false, `the file is a binary DWG drawing (${dwgVersion}); VOKA inspects ASCII DXF drawings only, and a DWG is not a DXF`);
  }
  if (wideHead.startsWith(BINARY_DXF_PREFIX)) {
    return decide("BINARY_DXF", false, "the file is a binary DXF drawing; VOKA inspects ASCII DXF drawings only");
  }
  const stepHead = ascii(bytes, 0, STEP_PREFIX.length);
  if (stepHead.startsWith(STEP_PREFIX)) {
    return decide("IFC", false, "the file is a STEP/IFC model; VOKA inspects ASCII DXF drawings only");
  }

  // Text path: decode leniently and let the group-code structure decide.
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return decide("NOT_A_CAD_FILE", false, "the file could not be decoded as text, so it is not an ASCII DXF drawing");
  }
  // A high density of non-text bytes means this is a binary file whatever its
  // extension claims. Counting NULs is cheap and catches truncated binaries.
  let controlBytes = 0;
  const sampleLength = Math.min(bytes.length, 8_192);
  for (let index = 0; index < sampleLength; index += 1) {
    const byte = bytes[index]!;
    if (byte === 0x00 || (byte < 0x09) || (byte > 0x0d && byte < 0x20)) controlBytes += 1;
  }
  if (controlBytes / Math.max(sampleLength, 1) > 0.02) {
    return decide("UNKNOWN", false, "the file contains binary content, so it is not an ASCII DXF drawing");
  }

  const structure = asciiDxfStructureEvidence(text);
  if (structure.structural) {
    evidence.push(`the file carries DXF group-code structure (${structure.matches.join(", ")})`);
    return decide("ASCII_DXF", true, "the file is an ASCII DXF drawing with readable group-code structure");
  }
  if (structure.groupCodePairs > 0) {
    evidence.push(`the file begins with ${structure.groupCodePairs} group-code pair(s) but has no DXF section framing`);
    return decide("UNKNOWN", false, "the file looks partly like a DXF but has no SECTION/ENDSEC framing, so it was not parsed");
  }
  if (extension === "dxf") {
    return decide("NOT_A_CAD_FILE", false, "the file is named .dxf but does not contain DXF group-code structure, so it was not parsed as a drawing");
  }
  return decide("NOT_A_CAD_FILE", false, "the file contains no DXF group-code structure, so it is not a readable drawing");
}
