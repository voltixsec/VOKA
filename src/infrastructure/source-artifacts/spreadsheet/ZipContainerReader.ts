import { inflateRawSync } from "node:zlib";

/**
 * Phase 2A-6: bounded, dependency-free OOXML container reader.
 *
 * An .xlsx file is a ZIP container. Before any spreadsheet parser is allowed
 * near the bytes, this module answers two questions from the container alone:
 * is this a ZIP at all, and does it declare an OOXML workbook structure?
 *
 * Hard rules:
 * - nothing is ever decompressed except the one small XML part this module is
 *   asked for, and that part is size-capped before inflation;
 * - no macro, VBA project, external link, DDE reference, or remote part is
 *   ever read, resolved, or executed. Seeing `vbaProject.bin` in the entry list
 *   is recorded as evidence and then ignored;
 * - path traversal, absolute paths, and absurd entry counts are rejected rather
 *   than followed;
 * - malformed containers produce a truthful limitation, never a guess.
 */

/** Maximum entries enumerated from one container. */
export const MAX_ZIP_ENTRIES = 512;
/** Maximum characters retained for one entry name. */
export const MAX_ZIP_ENTRY_NAME_CHARACTERS = 512;
/** Maximum decompressed bytes read for a single container part. */
export const MAX_ZIP_ENTRY_BYTES = 512 * 1024;
/** Bytes searched backwards for the end-of-central-directory record. */
const EOCD_SEARCH_WINDOW = 65_575;

export type ZipEntryListing = {
  entries: string[];
  /** True when the container declared more entries than were enumerated. */
  truncated: boolean;
  limitations: string[];
};

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;

/** True when the bytes begin with a ZIP local-file header (or an empty/spanned archive). */
export function hasZipSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return (bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08);
  }
  return false;
}

/** True when the bytes begin with the OLE2 compound-file magic used by legacy .xls. */
export function hasOle2Signature(bytes: Uint8Array): boolean {
  return bytes.length >= 8
    && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
}

function readUint32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0;
}

function readUint16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

type CentralDirectory = {
  offset: number;
  count: number;
  limitations: string[];
};

function findEndOfCentralDirectory(bytes: Uint8Array): number | null {
  const windowStart = Math.max(0, bytes.length - EOCD_SEARCH_WINDOW);
  for (let offset = bytes.length - 22; offset >= windowStart; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  return null;
}

function locateCentralDirectory(bytes: Uint8Array): CentralDirectory | null {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd === null) return null;
  const limitations: string[] = [];
  let count = readUint16(bytes, eocd + 10);
  let offset = readUint32(bytes, eocd + 16);
  if (count === null || offset === null) return null;
  // ZIP64: the locator sits immediately before the EOCD and points at the real record.
  const locator = eocd - 20;
  if (locator >= 0 && readUint32(bytes, locator) === ZIP64_LOCATOR_SIGNATURE) {
    const zip64EocdOffset = Number(readUint32(bytes, locator + 8) ?? 0) * 2 ** 32 + Number(readUint32(bytes, locator + 4) ?? 0);
    if (zip64EocdOffset > 0 && zip64EocdOffset < bytes.length && readUint32(bytes, zip64EocdOffset) === ZIP64_EOCD_SIGNATURE) {
      const bigCount = Number(readUint32(bytes, zip64EocdOffset + 32) ?? count);
      const bigOffset = Number(readUint32(bytes, zip64EocdOffset + 48) ?? offset);
      if (Number.isFinite(bigCount) && Number.isFinite(bigOffset)) {
        count = bigCount;
        offset = bigOffset;
        limitations.push("the container uses the ZIP64 format; its ZIP64 central directory was used");
      }
    }
  }
  if (offset > bytes.length) return null;
  return { offset, count, limitations };
}

type CentralEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function readCentralEntry(bytes: Uint8Array, offset: number): CentralEntry | null {
  if (readUint32(bytes, offset) !== ZIP_CENTRAL_SIGNATURE) return null;
  const method = readUint16(bytes, offset + 10);
  const compressedSize = readUint32(bytes, offset + 20);
  const uncompressedSize = readUint32(bytes, offset + 24);
  const nameLength = readUint16(bytes, offset + 28);
  const extraLength = readUint16(bytes, offset + 30);
  const commentLength = readUint16(bytes, offset + 32);
  const localHeaderOffset = readUint32(bytes, offset + 42);
  if ([method, compressedSize, uncompressedSize, nameLength, extraLength, commentLength, localHeaderOffset].includes(null)) return null;
  if (nameLength === null || nameLength > MAX_ZIP_ENTRY_NAME_CHARACTERS) return null;
  const nameStart = offset + 46;
  const nameEnd = nameStart + nameLength;
  if (nameEnd > bytes.length) return null;
  const name = decodeLatin1(bytes, nameStart, nameEnd);
  return {
    name,
    method: method!,
    compressedSize: compressedSize!,
    uncompressedSize: uncompressedSize!,
    localHeaderOffset: localHeaderOffset!,
  };
}

function decodeLatin1(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let index = start; index < end; index += 1) out += String.fromCharCode(bytes[index]!);
  return out;
}

/** Enumerates entry names using the central directory. Never decompresses anything. */
export function listZipEntries(bytes: Uint8Array): ZipEntryListing {
  const limitations: string[] = [];
  if (!hasZipSignature(bytes)) {
    return { entries: [], truncated: false, limitations: ["the bytes do not begin with a ZIP local-file header, so this is not an OOXML container"] };
  }
  const directory = locateCentralDirectory(bytes);
  if (!directory) {
    return { entries: [], truncated: false, limitations: ["the ZIP container has no readable central directory, so its contents could not be enumerated safely"] };
  }
  limitations.push(...directory.limitations);
  const entries: string[] = [];
  let offset = directory.offset;
  let truncated = false;
  for (let index = 0; index < directory.count; index += 1) {
    if (entries.length >= MAX_ZIP_ENTRIES) {
      truncated = true;
      break;
    }
    const entry = readCentralEntry(bytes, offset);
    if (!entry) break;
    const extraLength = readUint16(bytes, offset + 30) ?? 0;
    const commentLength = readUint16(bytes, offset + 32) ?? 0;
    const nameLength = readUint16(bytes, offset + 28) ?? 0;
    offset += 46 + nameLength + extraLength + commentLength;
    if (!isSafeEntryName(entry.name)) {
      limitations.push(`the container declares an entry name that was rejected as unsafe and skipped (entry ${index + 1})`);
      continue;
    }
    entries.push(entry.name);
  }
  if (truncated) limitations.push(`only the first ${MAX_ZIP_ENTRIES} container entries were enumerated`);
  return { entries, truncated, limitations: [...new Set(limitations)] };
}

/** Rejects traversal, absolute, and drive-letter entry names before they are used. */
function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > MAX_ZIP_ENTRY_NAME_CHARACTERS) return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/")) return false;
  if (/^[A-Za-z]:/u.test(name)) return false;
  if (name.split("/").includes("..")) return false;
  return true;
}

/**
 * Reads one container part as text.
 *
 * Only the requested part is inflated, only after its declared uncompressed
 * size has been checked against a hard cap, so a zip bomb cannot expand here.
 * Returns null with a reason whenever the part cannot be read safely.
 */
export function readZipEntryText(bytes: Uint8Array, wanted: string): { text: string; limitations: string[] } | null {
  const listing = listZipEntries(bytes);
  if (!listing.entries.includes(wanted)) return null;
  const directory = locateCentralDirectory(bytes);
  if (!directory) return null;
  let offset = directory.offset;
  for (let index = 0; index < directory.count; index += 1) {
    const entry = readCentralEntry(bytes, offset);
    if (!entry) break;
    const nameLength = readUint16(bytes, offset + 28) ?? 0;
    const extraLength = readUint16(bytes, offset + 30) ?? 0;
    const commentLength = readUint16(bytes, offset + 32) ?? 0;
    offset += 46 + nameLength + extraLength + commentLength;
    if (entry.name !== wanted) continue;
    if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) {
      return { text: "", limitations: [`the part ${wanted} declares ${entry.uncompressedSize} bytes, above the ${MAX_ZIP_ENTRY_BYTES} byte safety cap, so it was not decompressed`] };
    }
    if (readUint32(bytes, entry.localHeaderOffset) !== ZIP_LOCAL_SIGNATURE) return null;
    const localNameLength = readUint16(bytes, entry.localHeaderOffset + 26) ?? 0;
    const localExtraLength = readUint16(bytes, entry.localHeaderOffset + 28) ?? 0;
    const dataStart = entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.length) return null;
    try {
      const raw = bytes.slice(dataStart, dataEnd);
      const inflated = entry.method === 0 ? raw : inflateRawSync(Buffer.from(raw), { maxOutputLength: MAX_ZIP_ENTRY_BYTES });
      return { text: Buffer.from(inflated).toString("utf8"), limitations: [] };
    } catch {
      return null;
    }
  }
  return null;
}
