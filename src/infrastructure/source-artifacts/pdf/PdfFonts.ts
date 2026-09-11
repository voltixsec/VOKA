import type { PdfDocumentParser } from "./PdfDocument";
import { PdfLexer, PdfName, PdfOperator, PdfString, isDict, nameOf, numberOf, utf16beToString, type PdfDict, type PdfValue } from "./PdfObjects";
import { WIN_ANSI_ENCODING, STANDARD_ENCODING, encodingByName, glyphNameToUnicode, isStandardFontName, standardFontWidth, type EncodingTable } from "./PdfEncodings";

export type DecodedGlyph = { code: number; text: string | null; width: number; isSpace: boolean };

export type LoadedFont = {
  key: string;
  subtype: string;
  baseFont: string | null;
  composite: boolean;
  /** True when at least one code could be mapped to Unicode. */
  hasUnicodeMapping: boolean;
  /** Type3 fonts scale glyph space through FontMatrix; simple fonts use 1/1000. */
  fontMatrixScale: number;
  decode(bytes: Buffer): DecodedGlyph[];
};

type CodespaceRange = { low: number; high: number; byteLength: number };
type CMap = { ranges: CodespaceRange[]; single: Map<number, string>; rangeMaps: Array<{ low: number; high: number; dst: number }>; cidSingle: Map<number, number>; cidRanges: Array<{ low: number; high: number; cid: number }>; identity: boolean; vertical: boolean };

const MAX_CMAP_ENTRIES = 200_000;

function emptyCMap(): CMap { return { ranges: [], single: new Map(), rangeMaps: [], cidSingle: new Map(), cidRanges: [], identity: false, vertical: false }; }

function bytesToInt(bytes: Buffer) { let value = 0; for (const byte of bytes) value = value * 256 + byte; return value; }

/** Parses embedded CMap syntax (ToUnicode and CIDSystemInfo CMaps). Tolerant to malformed input. */
export function parseCMap(data: Buffer): CMap {
  const cmap = emptyCMap();
  const lexer = new PdfLexer(data);
  const stack: Array<PdfValue | PdfOperator> = [];
  let entries = 0;
  const single = (src: Buffer, dst: PdfValue) => {
    if (entries++ > MAX_CMAP_ENTRIES) return;
    const code = bytesToInt(src);
    if (dst instanceof PdfString) cmap.single.set(code, utf16beToString(dst.bytes));
    else if (typeof dst === "number") cmap.cidSingle.set(code, dst);
    else if (dst instanceof PdfName) { const text = glyphNameToUnicode(dst.name); if (text) cmap.single.set(code, text); }
  };
  for (let guard = 0; guard < 5_000_000; guard++) {
    const item = lexer.parseObject(0, false);
    if (item instanceof PdfOperator) {
      if (item.op === "") break;
      switch (item.op) {
        case "endcodespacerange": {
          const values = stack.filter((value): value is PdfString => value instanceof PdfString);
          for (let i = 0; i + 1 < values.length; i += 2) {
            const low = values[i]!.bytes; const high = values[i + 1]!.bytes;
            if (low.length >= 1 && low.length <= 4) cmap.ranges.push({ low: bytesToInt(low), high: bytesToInt(high), byteLength: low.length });
          }
          break;
        }
        case "endbfchar": {
          const values = stack.filter((value) => !(value instanceof PdfOperator)) as PdfValue[];
          for (let i = 0; i + 1 < values.length; i += 2) { const src = values[i]; if (src instanceof PdfString) single(src.bytes, values[i + 1]!); }
          break;
        }
        case "endbfrange": {
          const values = stack.filter((value) => !(value instanceof PdfOperator)) as PdfValue[];
          for (let i = 0; i + 2 < values.length; i += 3) {
            const lowValue = values[i]; const highValue = values[i + 1]; const dst = values[i + 2];
            if (!(lowValue instanceof PdfString) || !(highValue instanceof PdfString)) continue;
            const low = bytesToInt(lowValue.bytes); const high = Math.min(bytesToInt(highValue.bytes), low + 65_535);
            if (Array.isArray(dst)) { dst.forEach((item, offset) => { if (item instanceof PdfString && low + offset <= high && entries++ < MAX_CMAP_ENTRIES) cmap.single.set(low + offset, utf16beToString(item.bytes)); }); continue; }
            if (dst instanceof PdfString) {
              const text = utf16beToString(dst.bytes);
              const last = text.codePointAt(text.length - 1);
              if (dst.bytes.length <= 2 || text.length === 1) { const base = bytesToInt(dst.bytes); if (dst.bytes.length <= 2) cmap.rangeMaps.push({ low, high, dst: base }); else if (last !== undefined) cmap.rangeMaps.push({ low, high, dst: last }); }
              else { for (let code = low; code <= high && entries++ < MAX_CMAP_ENTRIES; code++) cmap.single.set(code, text.slice(0, -1) + String.fromCodePoint((last ?? 0) + (code - low))); }
            }
          }
          break;
        }
        case "endcidchar": {
          const values = stack.filter((value) => !(value instanceof PdfOperator)) as PdfValue[];
          for (let i = 0; i + 1 < values.length; i += 2) { const src = values[i]; const cid = values[i + 1]; if (src instanceof PdfString && typeof cid === "number") cmap.cidSingle.set(bytesToInt(src.bytes), cid); }
          break;
        }
        case "endcidrange": {
          const values = stack.filter((value) => !(value instanceof PdfOperator)) as PdfValue[];
          for (let i = 0; i + 2 < values.length; i += 3) { const low = values[i]; const high = values[i + 1]; const cid = values[i + 2]; if (low instanceof PdfString && high instanceof PdfString && typeof cid === "number") cmap.cidRanges.push({ low: bytesToInt(low.bytes), high: bytesToInt(high.bytes), cid }); }
          break;
        }
        case "usecmap": { const name = [...stack].reverse().find((value): value is PdfName => value instanceof PdfName); if (name && /Identity/u.test(name.name)) cmap.identity = true; break; }
        case "def": { const key = stack.at(-2); const value = stack.at(-1); if (key instanceof PdfName && key.name === "WMode" && value === 1) cmap.vertical = true; break; }
        default: break;
      }
      if (/^(?:begin|end)/u.test(item.op)) stack.length = 0;
      continue;
    }
    stack.push(item);
    if (stack.length > 3_000) stack.splice(0, stack.length - 3_000);
  }
  if (!cmap.ranges.length) cmap.ranges.push({ low: 0, high: 0xffff, byteLength: 2 });
  return cmap;
}

function lookupUnicode(cmap: CMap, code: number): string | null {
  const direct = cmap.single.get(code);
  if (direct !== undefined) return direct;
  for (const range of cmap.rangeMaps) if (code >= range.low && code <= range.high) { const point = range.dst + (code - range.low); return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : null; }
  return null;
}

function lookupCid(cmap: CMap, code: number): number {
  if (cmap.identity) return code;
  const direct = cmap.cidSingle.get(code);
  if (direct !== undefined) return direct;
  for (const range of cmap.cidRanges) if (code >= range.low && code <= range.high) return range.cid + (code - range.low);
  return code;
}

/** Splits a string into codes following the CMap codespace byte lengths. */
function splitCodes(bytes: Buffer, ranges: CodespaceRange[]): number[] {
  const codes: number[] = [];
  const lengths = [...new Set(ranges.map((range) => range.byteLength))].sort((a, b) => a - b);
  let index = 0;
  while (index < bytes.length) {
    let matched = false;
    for (const length of lengths) {
      if (index + length > bytes.length) continue;
      const value = bytesToInt(bytes.subarray(index, index + length));
      if (ranges.some((range) => range.byteLength === length && value >= range.low && value <= range.high)) { codes.push(value); index += length; matched = true; break; }
    }
    if (!matched) { const length = lengths[0] ?? 1; codes.push(bytesToInt(bytes.subarray(index, Math.min(bytes.length, index + length)))); index += length; }
  }
  return codes;
}

export class PdfFontLoader {
  private readonly cache = new Map<PdfDict, LoadedFont>();
  constructor(private readonly document: PdfDocumentParser) {}

  load(fontDict: PdfDict, key: string): LoadedFont {
    const cached = this.cache.get(fontDict);
    if (cached) return cached;
    const subtype = nameOf(this.document.resolve(fontDict.get("Subtype"))) ?? "Unknown";
    const baseFont = nameOf(this.document.resolve(fontDict.get("BaseFont")));
    const toUnicode = this.cmapFrom(fontDict.get("ToUnicode"));
    const font = subtype === "Type0" ? this.loadComposite(fontDict, key, baseFont, toUnicode) : this.loadSimple(fontDict, key, subtype, baseFont, toUnicode);
    this.cache.set(fontDict, font);
    return font;
  }

  private cmapFrom(value: PdfValue | undefined): CMap | null {
    const resolved = this.document.resolve(value);
    if (resolved instanceof PdfName) { const cmap = emptyCMap(); if (/Identity/u.test(resolved.name)) cmap.identity = true; if (/-V$/u.test(resolved.name)) cmap.vertical = true; return cmap; }
    const stream = this.document.streamOf(value);
    if (!stream) return null;
    const data = this.document.decode(stream);
    if (!data) return null;
    const cmap = parseCMap(data);
    const useCMap = this.document.resolve(stream.dict.get("UseCMap"));
    if (useCMap instanceof PdfName && /Identity/u.test(useCMap.name)) cmap.identity = true;
    return cmap;
  }

  private loadSimple(fontDict: PdfDict, key: string, subtype: string, baseFont: string | null, toUnicode: CMap | null): LoadedFont {
    const descriptor = this.document.dictOf(fontDict.get("FontDescriptor"));
    const flags = descriptor ? numberOf(this.document.resolve(descriptor.get("Flags")), 0) ?? 0 : 0;
    const symbolic = (flags & 4) !== 0 && (flags & 32) === 0;
    const encodingValue = this.document.resolve(fontDict.get("Encoding"));
    let table: EncodingTable | null = null;
    let differences: Array<string | null> | null = null;
    if (encodingValue instanceof PdfName) table = encodingByName(encodingValue.name);
    else if (isDict(encodingValue)) {
      table = encodingByName(nameOf(this.document.resolve(encodingValue.get("BaseEncoding"))));
      const diff = this.document.resolve(encodingValue.get("Differences"));
      if (Array.isArray(diff)) {
        differences = new Array<string | null>(256).fill(null);
        let code = 0;
        for (const item of diff) { const value = this.document.resolve(item); if (typeof value === "number") code = Math.trunc(value); else if (value instanceof PdfName && code >= 0 && code < 256) differences[code++] = value.name; }
      }
    }
    if (!table) table = symbolic && !isStandardFontName(baseFont) ? null : (isStandardFontName(baseFont) && /Symbol|Dingbat/u.test(baseFont ?? "") ? null : subtype === "TrueType" ? WIN_ANSI_ENCODING : STANDARD_ENCODING);
    const firstChar = numberOf(this.document.resolve(fontDict.get("FirstChar")), 0) ?? 0;
    const widthsValue = this.document.resolve(fontDict.get("Widths"));
    const widths = Array.isArray(widthsValue) ? widthsValue.map((item) => numberOf(this.document.resolve(item))) : null;
    const missingWidth = descriptor ? numberOf(this.document.resolve(descriptor.get("MissingWidth")), 0) ?? 0 : 0;
    const fontMatrix = subtype === "Type3" ? (this.document.resolve(fontDict.get("FontMatrix")) as PdfValue[] | undefined)?.map((item) => numberOf(this.document.resolve(item), 0) ?? 0) : null;
    const fontMatrixScale = fontMatrix && fontMatrix.length >= 1 && fontMatrix[0] ? Math.abs(fontMatrix[0]) : 0.001;
    const charProcsNames = subtype === "Type3" ? this.document.dictOf(fontDict.get("CharProcs")) : null;
    const decodeOne = (code: number): string | null => {
      if (toUnicode) { const mapped = lookupUnicode(toUnicode, code); if (mapped !== null) return mapped; }
      const glyphName = differences?.[code] ?? table?.[code] ?? null;
      if (glyphName) { const mapped = glyphNameToUnicode(glyphName); if (mapped !== null) return mapped; if (charProcsNames && !toUnicode) return null; }
      if (!table && !differences?.[code] && !toUnicode) {
        // Symbolic font without any mapping: accept only printable ASCII codes; anything else remains undecodable.
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : null;
      }
      if (!glyphName && code >= 32 && code <= 126 && table) return String.fromCharCode(code);
      return null;
    };
    let hasUnicodeMapping = false;
    const font: LoadedFont = {
      key, subtype, baseFont, composite: false, hasUnicodeMapping: false, fontMatrixScale,
      decode: (bytes) => {
        const glyphs: DecodedGlyph[] = [];
        for (const code of bytes) {
          const text = decodeOne(code);
          if (text !== null) hasUnicodeMapping = true;
          const explicit = widths && code - firstChar >= 0 && code - firstChar < widths.length ? widths[code - firstChar] : null;
          const fallback = explicit ?? (widths ? missingWidth || null : null) ?? standardFontWidth(baseFont, code) ?? (missingWidth || 500);
          const width = subtype === "Type3" ? (explicit ?? 0) : fallback;
          glyphs.push({ code, text, width, isSpace: code === 32 && !symbolic });
        }
        font.hasUnicodeMapping = hasUnicodeMapping;
        return glyphs;
      },
    };
    return font;
  }

  private loadComposite(fontDict: PdfDict, key: string, baseFont: string | null, toUnicode: CMap | null): LoadedFont {
    const encoding = this.cmapFrom(fontDict.get("Encoding")) ?? Object.assign(emptyCMap(), { identity: true });
    const descendants = this.document.resolve(fontDict.get("DescendantFonts"));
    const descendant = Array.isArray(descendants) ? this.document.dictOf(descendants[0]) : this.document.dictOf(descendants as PdfValue);
    const defaultWidth = descendant ? numberOf(this.document.resolve(descendant.get("DW")), 1000) ?? 1000 : 1000;
    const widths = new Map<number, number>();
    const wArray = descendant ? this.document.resolve(descendant.get("W")) : undefined;
    if (Array.isArray(wArray)) {
      const items = wArray.map((item) => this.document.resolve(item));
      for (let i = 0; i < items.length;) {
        const first = items[i];
        if (typeof first !== "number") { i++; continue; }
        const second = items[i + 1];
        if (Array.isArray(second)) { second.forEach((width, offset) => { const value = numberOf(this.document.resolve(width)); if (value !== null && widths.size < MAX_CMAP_ENTRIES) widths.set(first + offset, value); }); i += 2; continue; }
        const third = items[i + 2];
        if (typeof second === "number" && typeof third === "number") { const last = Math.min(second, first + 65_535); for (let cid = first; cid <= last && widths.size < MAX_CMAP_ENTRIES; cid++) widths.set(cid, third); i += 3; continue; }
        i++;
      }
    }
    const cidToGid = descendant ? this.document.resolve(descendant.get("CIDToGIDMap")) : undefined;
    const ordering = (() => { const info = descendant ? this.document.dictOf(descendant.get("CIDSystemInfo")) : null; const value = info ? this.document.resolve(info.get("Ordering")) : undefined; return value instanceof PdfString ? value.bytes.toString("latin1") : null; })();
    const ranges = encoding.ranges.length ? encoding.ranges : [{ low: 0, high: 0xffff, byteLength: 2 }];
    let hasUnicodeMapping = false;
    const font: LoadedFont = {
      key, subtype: "Type0", baseFont, composite: true, hasUnicodeMapping: false, fontMatrixScale: 0.001,
      decode: (bytes) => {
        const codes = splitCodes(bytes, ranges);
        const glyphs = codes.map((code) => {
          const cid = lookupCid(encoding, code);
          let text: string | null = toUnicode ? lookupUnicode(toUnicode, code) : null;
          if (text === null && !toUnicode && ordering && /^(?:UCS|Identity)$/u.test(ordering) && cidToGid === undefined && encoding.identity && cid >= 32 && cid <= 0xffff && !/Identity/u.test(ordering)) text = String.fromCodePoint(cid);
          if (text !== null) hasUnicodeMapping = true;
          return { code, text, width: widths.get(cid) ?? defaultWidth, isSpace: text === " " || (code === 32 && ranges.some((range) => range.byteLength === 1)) };
        });
        font.hasUnicodeMapping = hasUnicodeMapping;
        return glyphs;
      },
    };
    return font;
  }
}
