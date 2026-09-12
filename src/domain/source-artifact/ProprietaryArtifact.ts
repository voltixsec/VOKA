/**
 * Phase 2A-9: governed proprietary CAD/BIM original formats (DWG, RVT).
 *
 * DWG and RVT become ORIGINAL SourceArtifact kinds: immutable bytes VOKA keeps
 * and can talk about, but never semantic-parses. They enter the derivation
 * workflow instead: an explicit, recorded derivation produces a DXF or IFC
 * artifact, and the accepted 2A-7 / 2A-8 intelligence reads the derived file.
 *
 * Validation rules (deliberately conservative):
 *
 * - DWG: the binary starts with the `$ACADVER` release string (AC1009..AC1035).
 *   A file that does not carry a recognized DWG signature is never accepted as
 *   a DWG, whatever its name claims;
 * - RVT: an OLE2 compound signature alone proves nothing — OLE2 is a generic
 *   container (old Office documents, thumbs.db, and many installers use it).
 *   An artifact is accepted as RVT only when the `.rvt` declaration is
 *   corroborated by bounded Revit-specific structural evidence: the
 *   `BasicFileInfo` stream/directory marker every Revit compound file carries.
 *   OLE2 without that marker is rejected as an unverified OLE compound file
 *   rather than claimed as Revit;
 * - RFA: a Revit family definition is truthfully unsupported in this phase and
 *   is named as such wherever it can be identified.
 *
 * Nothing here parses proprietary contents, shells out, or opens a converter.
 * Detection reads bytes.
 */

import { dxfVersionFromCode } from "./DxfInspection";

/** OLE2 compound document signature, which Revit `.rvt` / `.rfa` files use. */
export const OLE2_SIGNATURE: readonly number[] = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * DWG releases begin with their `$ACADVER` string as ASCII bytes. This is the
 * canonical Phase 2A-9 table; the 2A-7/2A-8 detectors import it from here so
 * the recognized-release list exists exactly once.
 */
export const DWG_VERSION_PREFIXES = [
  "AC1009", "AC1012", "AC1014", "AC1015", "AC1017", "AC1018", "AC1021", "AC1024", "AC1027", "AC1032", "AC1035",
] as const;

export type DwgVersionPrefix = (typeof DWG_VERSION_PREFIXES)[number];

/**
 * MIME types browsers and tools report for DWG. There is no single registered
 * type; the declared type only routes the upload, and the bytes decide.
 */
export const DWG_MIME_TYPE = "image/vnd.dwg";
export const DWG_MIME_TYPES: readonly string[] = [
  "image/vnd.dwg",
  "application/acad",
  "application/x-acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-dwg",
];

/**
 * MIME types seen for Revit project files. Like DWG, nothing is registered; a
 * browser most often reports `application/octet-stream`, and the `.rvt`
 * extension plus the bytes decide.
 */
export const RVT_MIME_TYPE = "application/vnd.revit.rvt";
export const RVT_MIME_TYPES: readonly string[] = [
  RVT_MIME_TYPE,
  "application/x-revit-rvt",
  "application/vnd.autodesk.revit.rvt",
  "application/revit",
];

/** Bounded window scanned for Revit-specific structural evidence. */
export const RVT_CORROBORATION_SCAN_BYTES = 256 * 1024;
/** Upper bound for a DWG head read; the signature lives in the first bytes. */
const DWG_HEAD_BYTES = 8;

function asciiHead(bytes: Uint8Array, length: number): string {
  let out = "";
  for (let index = 0; index < length && index < bytes.length; index += 1) out += String.fromCharCode(bytes[index]!);
  return out;
}

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

/** True when the bytes carry the OLE2 compound-document signature. */
export function looksLikeOle2Compound(bytes: Uint8Array): boolean {
  return startsWithBytes(bytes, OLE2_SIGNATURE);
}

const BASIC_FILE_INFO_ASCII: readonly number[] = Array.from("BasicFileInfo").map((character) => character.charCodeAt(0));
/** The same marker as stored in an OLE directory entry: UTF-16LE code units. */
const BASIC_FILE_INFO_UTF16LE: readonly number[] = Array.from("BasicFileInfo").flatMap((character) => [character.charCodeAt(0), 0x00]);

/** Bounded byte search without building a string copy of the window. */
function indexOfBytes(haystack: Uint8Array, needle: readonly number[]): number {
  if (needle.length === 0 || haystack.length < needle.length) return -1;
  outer: for (let index = 0; index + needle.length <= haystack.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

/**
 * Bounded corroborating evidence that an OLE compound document was produced by
 * Revit: every Revit compound file carries a `BasicFileInfo` stream whose name
 * sits in the compound-file directory. The name is stored UTF-16LE, and some
 * tools copy it as plain ASCII, so both encodings are searched inside a bounded
 * head window. This is directory-marker evidence, not a Revit parser.
 */
export function revitCompoundEvidence(bytes: Uint8Array): { found: boolean; marker: string | null; scannedBytes: number } {
  const end = Math.min(bytes.length, RVT_CORROBORATION_SCAN_BYTES);
  const window = bytes.subarray(0, end);
  if (indexOfBytes(window, BASIC_FILE_INFO_ASCII) >= 0) return { found: true, marker: "BasicFileInfo", scannedBytes: window.length };
  if (indexOfBytes(window, BASIC_FILE_INFO_UTF16LE) >= 0) return { found: true, marker: "BasicFileInfo (UTF-16)", scannedBytes: window.length };
  return { found: false, marker: null, scannedBytes: window.length };
}

export type DwgOriginalDecision = {
  isDwg: boolean;
  /** Verbatim release code such as "AC1027"; null when no signature matched. */
  versionCode: string | null;
  /** Published release name when the code is known; null otherwise. */
  versionLabel: string | null;
  reason: string;
};

/**
 * Decides whether a file is a recognizable binary DWG original.
 *
 * The decision rests on the leading release signature, not the extension: a
 * renamed random file, a text file, or a ZIP is not a DWG and must never enter
 * the DWG workflow. When the signature matches, the release code and its
 * published label are captured so the assistant can state the version it saw.
 */
export function detectDwgOriginalFormat(input: { bytes: Uint8Array; filename?: string | null; mimeType?: string | null }): DwgOriginalDecision {
  const { bytes } = input;
  if (bytes.length < 6) {
    return { isDwg: false, versionCode: null, versionLabel: null, reason: "the file is too short to carry a DWG version signature" };
  }
  const head = asciiHead(bytes, DWG_HEAD_BYTES);
  const versionCode = DWG_VERSION_PREFIXES.find((prefix) => head.startsWith(prefix));
  if (!versionCode) {
    return { isDwg: false, versionCode: null, versionLabel: null, reason: "the file does not start with a recognized DWG version signature" };
  }
  const version = dxfVersionFromCode(versionCode);
  return {
    isDwg: true,
    versionCode,
    versionLabel: version.label,
    reason: versionLabelReason(versionCode, version.label),
  };
}

function versionLabelReason(versionCode: string, label: string | null): string {
  return label ? `the file starts with the DWG release signature ${versionCode} (${label})` : `the file starts with the DWG release signature ${versionCode}`;
}

export type RvtOriginalDecision =
  | { decision: "RVT"; reason: string; evidence: string[] }
  | { decision: "UNVERIFIED_OLE_COMPOUND"; reason: string; evidence: string[] }
  | { decision: "NOT_RVT"; reason: string; evidence: string[] }
  | { decision: "RFA"; reason: string; evidence: string[] };

function extensionOf(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const match = /\.([A-Za-z0-9]{1,8})$/u.exec(filename.trim());
  return match ? match[1]!.toLocaleLowerCase() : null;
}

/**
 * Decides whether a file may be accepted as a Revit project (.rvt) original.
 *
 * Requires all of:
 * - a `.rvt` declaration/name,
 * - the OLE2 compound signature, and
 * - bounded Revit-specific corroboration (the BasicFileInfo directory marker).
 *
 * An OLE compound file without Revit evidence is rejected as an unverified OLE
 * compound file, never accepted as RVT on the container signature alone. A
 * `.rfa` family definition is named truthfully as unsupported instead of being
 * swallowed by the RVT answer.
 */
export function detectRvtOriginalFormat(input: { bytes: Uint8Array; filename: string; mimeType?: string | null }): RvtOriginalDecision {
  const { bytes } = input;
  const extension = extensionOf(input.filename);
  const evidence: string[] = [];
  if (extension) evidence.push(`the file name ends in .${extension}`);
  if (input.mimeType) evidence.push(`the declared MIME type is ${input.mimeType}`);

  const ole = looksLikeOle2Compound(bytes);
  if (extension === "rfa") {
    if (ole) {
      evidence.push("the file carries the OLE2 compound signature");
      return { decision: "RFA", reason: "the file is an OLE2 compound document of the kind Revit family (.rfa) uses; Revit family definitions are not supported in this phase", evidence };
    }
    return { decision: "RFA", reason: "the file is named .rfa, which is a Revit family definition; Revit family definitions are not supported in this phase", evidence };
  }
  if (!ole) {
    return { decision: "NOT_RVT", reason: "the file does not carry the OLE2 compound-document signature a Revit project uses", evidence };
  }
  evidence.push("the file carries the OLE2 compound signature");
  const corroboration = revitCompoundEvidence(bytes);
  if (!corroboration.found) {
    evidence.push(`no Revit-specific structural marker was found in the first ${Math.round(corroboration.scannedBytes / 1024)} KiB`);
    return {
      decision: "UNVERIFIED_OLE_COMPOUND",
      reason: "the file is an OLE2 compound document, but no Revit-specific structural evidence was found inside it, so it is not accepted as a Revit project",
      evidence,
    };
  }
  evidence.push("the compound file carries the Revit BasicFileInfo structural marker");
  return { decision: "RVT", reason: "the file is an OLE2 compound document carrying the Revit BasicFileInfo structural marker", evidence };
}

/**
 * Cheap upload-time gate for a declared DWG original: recognized release
 * signature, nothing else. A real DWG parser is out of scope by design.
 */
export function looksLikeDwgOriginal(bytes: Uint8Array): boolean {
  return detectDwgOriginalFormat({ bytes }).isDwg;
}

/**
 * Cheap upload-time gate for a declared RVT original: OLE2 signature plus the
 * Revit BasicFileInfo marker. The container signature alone is not enough.
 */
export function looksLikeRvtOriginal(bytes: Uint8Array): boolean {
  if (!looksLikeOle2Compound(bytes)) return false;
  return revitCompoundEvidence(bytes).found;
}
