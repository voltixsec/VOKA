import { constants, inflateSync } from "node:zlib";
import { isDict, nameOf, numberOf, type PdfDict, type PdfStream, type PdfValue } from "./PdfObjects";

export const MAX_DECODED_STREAM_BYTES = 32 * 1024 * 1024;

/** Filters whose payload is pixel data; the inspector never decodes them. */
export const IMAGE_FILTERS = new Set(["DCTDecode", "DCT", "JPXDecode", "CCITTFaxDecode", "CCF", "JBIG2Decode"]);

type Resolve = (value: PdfValue | undefined) => PdfValue | undefined;

function filterList(dict: PdfDict, resolve: Resolve) {
  const raw = resolve(dict.get("Filter") ?? dict.get("F"));
  const filters = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((item) => nameOf(resolve(item))).filter((item): item is string => Boolean(item));
  const rawParms = resolve(dict.get("DecodeParms") ?? dict.get("DP"));
  const parms = (Array.isArray(rawParms) ? rawParms : [rawParms]).map((item) => { const value = resolve(item); return isDict(value) ? value : null; });
  return filters.map((name, index) => ({ name, parms: parms[index] ?? (filters.length === 1 ? parms[0] ?? null : null) }));
}

export function streamHasImageFilter(stream: PdfStream, resolve: Resolve) {
  return filterList(stream.dict, resolve).some((filter) => IMAGE_FILTERS.has(filter.name));
}

/** Returns decoded bytes, or null when the stream uses an image/unsupported filter or is corrupt beyond recovery. */
export function decodeStream(stream: PdfStream, resolve: Resolve): Buffer | null {
  let data: Buffer = stream.raw;
  for (const filter of filterList(stream.dict, resolve)) {
    if (IMAGE_FILTERS.has(filter.name)) return null;
    switch (filter.name) {
      case "FlateDecode": case "Fl": data = inflateLenient(data); break;
      case "LZWDecode": case "LZW": data = lzwDecode(data, numberOf(filter.parms ? resolve(filter.parms.get("EarlyChange")) : null, 1) ?? 1); break;
      case "ASCIIHexDecode": case "AHx": data = asciiHexDecode(data); break;
      case "ASCII85Decode": case "A85": data = ascii85Decode(data); break;
      case "RunLengthDecode": case "RL": data = runLengthDecode(data); break;
      case "Crypt": break;
      default: return null;
    }
    if (filter.parms) data = applyPredictor(data, filter.parms, resolve);
    if (data.length > MAX_DECODED_STREAM_BYTES) return null;
  }
  return data;
}

function inflateLenient(data: Buffer): Buffer {
  let start = 0;
  while (start < data.length && (data[start] === 0x0a || data[start] === 0x0d || data[start] === 0x20 || data[start] === 0x09)) start++;
  const payload = start ? data.subarray(start) : data;
  try { return inflateSync(payload, { maxOutputLength: MAX_DECODED_STREAM_BYTES }); } catch { /* try partial recovery below */ }
  // Truncated streams: keep whatever zlib can produce before the damage.
  try { return inflateSync(payload, { finishFlush: constants.Z_SYNC_FLUSH, maxOutputLength: MAX_DECODED_STREAM_BYTES }); } catch { return Buffer.alloc(0); }
}

function applyPredictor(data: Buffer, parms: PdfDict, resolve: Resolve): Buffer {
  const predictor = numberOf(resolve(parms.get("Predictor")), 1) ?? 1;
  if (predictor <= 1) return data;
  const colors = numberOf(resolve(parms.get("Colors")), 1) ?? 1;
  const bpc = numberOf(resolve(parms.get("BitsPerComponent")), 8) ?? 8;
  const columns = numberOf(resolve(parms.get("Columns")), 1) ?? 1;
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLength = Math.ceil((colors * bpc * columns) / 8);
  if (rowLength <= 0) return data;
  if (predictor === 2) {
    if (bpc !== 8) return data;
    const out = Buffer.from(data);
    for (let row = 0; row + rowLength <= out.length; row += rowLength) for (let i = bpp; i < rowLength; i++) out[row + i] = (out[row + i]! + out[row + i - bpp]!) & 0xff;
    return out;
  }
  const rows = Math.floor(data.length / (rowLength + 1));
  const out = Buffer.alloc(rows * rowLength);
  let previous = Buffer.alloc(rowLength);
  for (let row = 0; row < rows; row++) {
    const type = data[row * (rowLength + 1)]!;
    const source = data.subarray(row * (rowLength + 1) + 1, (row + 1) * (rowLength + 1));
    const current = out.subarray(row * rowLength, (row + 1) * rowLength);
    for (let i = 0; i < rowLength; i++) {
      const raw = source[i] ?? 0;
      const left = i >= bpp ? current[i - bpp]! : 0;
      const up = previous[i]!;
      const upLeft = i >= bpp ? previous[i - bpp]! : 0;
      let value: number;
      switch (type) {
        case 0: value = raw; break;
        case 1: value = raw + left; break;
        case 2: value = raw + up; break;
        case 3: value = raw + Math.floor((left + up) / 2); break;
        case 4: { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft); break; }
        default: value = raw;
      }
      current[i] = value & 0xff;
    }
    previous = current;
  }
  return out;
}

export function asciiHexDecode(data: Buffer) {
  const digits: number[] = [];
  for (const byte of data) {
    if (byte === 0x3e) break;
    if (byte >= 0x30 && byte <= 0x39) digits.push(byte - 0x30);
    else if (byte >= 0x41 && byte <= 0x46) digits.push(byte - 0x37);
    else if (byte >= 0x61 && byte <= 0x66) digits.push(byte - 0x57);
  }
  if (digits.length % 2) digits.push(0);
  const out = Buffer.alloc(digits.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (digits[2 * i]! << 4) | digits[2 * i + 1]!;
  return out;
}

export function ascii85Decode(data: Buffer) {
  const out: number[] = [];
  let group: number[] = [];
  let index = 0;
  if (data[0] === 0x3c && data[1] === 0x7e) index = 2;
  const flush = (values: number[], keep: number) => {
    let tuple = 0;
    for (const value of values) tuple = tuple * 85 + value;
    const bytes = [(tuple >>> 24) & 0xff, (tuple >>> 16) & 0xff, (tuple >>> 8) & 0xff, tuple & 0xff];
    out.push(...bytes.slice(0, keep - 1));
  };
  for (; index < data.length; index++) {
    const byte = data[index]!;
    if (byte === 0x7e) break;
    if (byte === 0x7a && group.length === 0) { out.push(0, 0, 0, 0); continue; }
    if (byte < 0x21 || byte > 0x75) continue;
    group.push(byte - 33);
    if (group.length === 5) { flush(group, 5); group = []; }
  }
  if (group.length > 1) { const missing = 5 - group.length; while (group.length < 5) group.push(84); flush(group, 5 - missing); }
  return Buffer.from(out);
}

export function runLengthDecode(data: Buffer) {
  const out: number[] = [];
  let index = 0;
  while (index < data.length) {
    const length = data[index++]!;
    if (length === 128) break;
    if (length < 128) { for (let i = 0; i <= length && index < data.length; i++) out.push(data[index++]!); }
    else { const byte = data[index++] ?? 0; for (let i = 0; i < 257 - length; i++) out.push(byte); }
    if (out.length > MAX_DECODED_STREAM_BYTES) break;
  }
  return Buffer.from(out);
}

export function lzwDecode(data: Buffer, earlyChange: number) {
  const out: number[] = [];
  let dictionary: number[][] = [];
  const reset = () => { dictionary = []; for (let i = 0; i < 256; i++) dictionary.push([i]); dictionary.push([], []); };
  reset();
  let codeLength = 9;
  let previous: number[] | null = null;
  let bitBuffer = 0;
  let bitCount = 0;
  let index = 0;
  for (;;) {
    while (bitCount < codeLength && index < data.length) { bitBuffer = ((bitBuffer << 8) | data[index++]!) >>> 0; bitCount += 8; }
    if (bitCount < codeLength) break;
    const code = (bitBuffer >>> (bitCount - codeLength)) & ((1 << codeLength) - 1);
    bitCount -= codeLength;
    if (code === 256) { reset(); codeLength = 9; previous = null; continue; }
    if (code === 257) break;
    let entry: number[];
    if (code < dictionary.length) { entry = dictionary[code]!; if (previous) dictionary.push([...previous, entry[0]!]); }
    else if (previous) { entry = [...previous, previous[0]!]; dictionary.push(entry); }
    else break;
    out.push(...entry);
    if (out.length > MAX_DECODED_STREAM_BYTES) break;
    previous = entry;
    const limit = dictionary.length + (earlyChange ? 1 : 0);
    codeLength = limit >= 2048 ? 12 : limit >= 1024 ? 11 : limit >= 512 ? 10 : 9;
  }
  return Buffer.from(out);
}
