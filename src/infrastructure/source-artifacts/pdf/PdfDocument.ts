import { decodeStream } from "./PdfFilters";
import { PdfLexer, PdfName, PdfOperator, PdfRef, PdfStream, decodeTextString, isDict, nameOf, numberOf, type PdfDict, type PdfValue } from "./PdfObjects";

export type PdfPageRecord = {
  pageNumber: number;
  ref: PdfRef | null;
  dict: PdfDict;
  mediaBox: [number, number, number, number] | null;
  rotation: number;
  resources: PdfDict | null;
  contents: PdfStream[];
  annotations: PdfDict[];
  inheritedFromParent: boolean;
};

export type PdfDocumentModel = {
  version: string | null;
  encrypted: boolean;
  trailer: PdfDict;
  catalog: PdfDict | null;
  info: { title: string | null; producer: string | null; creator: string | null; subject: string | null; author: string | null };
  /** Total page count when the page tree could be walked; null otherwise. */
  pageCount: number | null;
  pages: PdfPageRecord[];
  /** True when pages were enumerated by walking the catalog page tree (proven order). */
  pageTreeReliable: boolean;
  limitations: string[];
};

type XrefEntry = { kind: "offset"; offset: number; gen: number } | { kind: "compressed"; streamNum: number; index: number };

const MAX_OBJECTS = 250_000;
const MAX_PAGES = 2_000;

export class PdfDocumentParser {
  private readonly xref = new Map<number, XrefEntry>();
  private readonly cache = new Map<number, PdfValue>();
  private readonly objectStreams = new Map<number, Map<number, PdfValue> | null>();
  private readonly resolving = new Set<number>();
  private scanned = false;
  private trailer: PdfDict = new Map();
  readonly limitations: string[] = [];

  constructor(private readonly buf: Buffer) {}

  parse(): PdfDocumentModel {
    const version = this.buf.subarray(0, 16).toString("latin1").match(/%PDF-(\d\.\d)/u)?.[1] ?? null;
    try { this.loadXref(); } catch { this.limitations.push("cross-reference table unreadable; objects were located by scanning"); }
    if (!this.trailer.has("Root")) this.scanObjects();
    const encrypted = this.trailer.has("Encrypt");
    if (encrypted) this.limitations.push("PDF is encrypted; strings and streams were not decrypted");
    const catalog = this.dictOf(this.trailer.get("Root"));
    const info = this.readInfo();
    let pages: PdfPageRecord[] = [];
    let pageTreeReliable = false;
    let pageCount: number | null = null;
    if (!encrypted) {
      const rootPages = catalog ? this.dictOf(catalog.get("Pages")) : null;
      if (rootPages) {
        pages = this.walkPageTree(rootPages);
        const declared = numberOf(this.resolve(rootPages.get("Count")));
        pageCount = pages.length || (declared ?? null);
        pageTreeReliable = pages.length > 0 && (declared === null || declared === pages.length);
        if (declared !== null && declared !== pages.length) this.limitations.push(`page tree declares ${declared} page(s) but ${pages.length} were reachable`);
      }
      if (!pages.length) {
        this.scanObjects();
        const fallback = this.scanPageObjects();
        if (fallback.length) {
          pages = fallback;
          pageCount = fallback.length;
          pageTreeReliable = false;
          this.limitations.push("page order was recovered by scanning /Type /Page objects; page numbers are not proven");
        } else this.limitations.push("no page objects could be located");
      }
    }
    return { version, encrypted, trailer: this.trailer, catalog, info, pageCount, pages, pageTreeReliable, limitations: [...this.limitations] };
  }

  resolve(value: PdfValue | undefined, depth = 0): PdfValue | undefined {
    let current = value;
    let hops = 0;
    while (current instanceof PdfRef && hops < 32) { current = this.fetch(current.num, depth); hops++; }
    return current instanceof PdfRef ? undefined : current;
  }

  dictOf(value: PdfValue | undefined): PdfDict | null {
    const resolved = this.resolve(value);
    if (isDict(resolved)) return resolved;
    if (resolved instanceof PdfStream) return resolved.dict;
    return null;
  }

  streamOf(value: PdfValue | undefined): PdfStream | null {
    const resolved = this.resolve(value);
    return resolved instanceof PdfStream ? resolved : null;
  }

  decode(stream: PdfStream) {
    return decodeStream(stream, (value) => this.resolve(value));
  }

  /**
   * Recovery helper: every stream object that is neither typed (font, image,
   * XObject, xref, object stream, metadata) nor referenced by a known page.
   * Used only when the page tree is unreliable; results are UNATTRIBUTED.
   */
  orphanContentStreams(referenced: Set<PdfStream>): PdfStream[] {
    this.scanObjects();
    const orphans: PdfStream[] = [];
    for (const [num, entry] of this.xref) {
      if (entry.kind !== "offset") continue;
      const stream = this.streamOf(new PdfRef(num, entry.gen));
      if (!stream || referenced.has(stream)) continue;
      if (stream.dict.has("Type") || stream.dict.has("Subtype")) continue;
      orphans.push(stream);
      if (orphans.length >= 64) break;
    }
    return orphans;
  }

  private readInfo() {
    const info = this.dictOf(this.trailer.get("Info"));
    const read = (key: string) => (info ? decodeTextString(this.resolve(info.get(key))) : null);
    return { title: read("Title"), producer: read("Producer"), creator: read("Creator"), subject: read("Subject"), author: read("Author") };
  }

  // ---------------------------------------------------------------- xref

  private loadXref() {
    const tail = this.buf.subarray(Math.max(0, this.buf.length - 2048)).toString("latin1");
    const match = [...tail.matchAll(/startxref\s+(\d+)/gu)].at(-1);
    if (!match) throw new Error("PDF_STARTXREF_MISSING");
    const seen = new Set<number>();
    let offset: number | null = Number(match[1]);
    const trailers: PdfDict[] = [];
    while (offset !== null && !seen.has(offset) && seen.size < 64) {
      seen.add(offset);
      if (offset < 0 || offset >= this.buf.length) throw new Error("PDF_XREF_OFFSET_INVALID");
      const trailer = this.readXrefSection(offset);
      if (!trailer) throw new Error("PDF_XREF_UNREADABLE");
      trailers.push(trailer);
      const xrefStm = numberOf(trailer.get("XRefStm"));
      if (xrefStm !== null && !seen.has(xrefStm)) { seen.add(xrefStm); const hybrid = this.readXrefSection(xrefStm); if (hybrid) trailers.push(hybrid); }
      offset = numberOf(trailer.get("Prev"));
    }
    for (const trailer of trailers) for (const [key, value] of trailer) if (!this.trailer.has(key)) this.trailer.set(key, value);
  }

  private readXrefSection(offset: number): PdfDict | null {
    const lexer = new PdfLexer(this.buf, offset, this.buf.length, (value) => numberOf(this.resolve(value)));
    lexer.skipWhitespace();
    if (this.buf.toString("latin1", lexer.pos, lexer.pos + 4) === "xref") {
      lexer.pos += 4;
      for (;;) {
        lexer.skipWhitespace();
        if (this.buf.toString("latin1", lexer.pos, lexer.pos + 7) === "trailer") {
          lexer.pos += 7;
          const dict = lexer.parseObject(0, false);
          return isDict(dict) ? dict : new Map();
        }
        const first = lexer.readToken();
        const count = lexer.readToken();
        if (first.kind !== "num" || count.kind !== "num") return new Map();
        lexer.skipWhitespace();
        for (let i = 0; i < count.value; i++) {
          lexer.skipWhitespace();
          const line = this.buf.toString("latin1", lexer.pos, lexer.pos + 18);
          const entry = line.match(/^(\d{1,10})\s+(\d{1,5})\s+([nf])/u);
          if (!entry) return new Map();
          lexer.pos += entry[0].length;
          const num = first.value + i;
          if (entry[3] === "n" && !this.xref.has(num)) this.xref.set(num, { kind: "offset", offset: Number(entry[1]), gen: Number(entry[2]) });
        }
      }
    }
    // xref stream: "N G obj <<...>> stream"
    const object = this.parseIndirectAt(offset);
    if (!(object?.value instanceof PdfStream)) return null;
    const stream = object.value;
    const data = this.decode(stream);
    if (!data) return stream.dict;
    const widths = (this.resolve(stream.dict.get("W")) as PdfValue[] | undefined)?.map((item) => numberOf(this.resolve(item), 0) ?? 0) ?? [];
    if (widths.length < 3) return stream.dict;
    const size = numberOf(this.resolve(stream.dict.get("Size")), 0) ?? 0;
    const index = (this.resolve(stream.dict.get("Index")) as PdfValue[] | undefined)?.map((item) => numberOf(this.resolve(item), 0) ?? 0) ?? [0, size];
    const rowLength = widths.reduce((total, width) => total + width, 0);
    let cursor = 0;
    for (let pair = 0; pair + 1 < index.length; pair += 2) {
      const start = index[pair]!;
      const count = index[pair + 1]!;
      for (let i = 0; i < count && cursor + rowLength <= data.length; i++) {
        const fields = widths.map((width) => { let value = 0; for (let b = 0; b < width; b++) value = value * 256 + data[cursor++]!; return value; });
        const type = widths[0] === 0 ? 1 : fields[0]!;
        const num = start + i;
        if (this.xref.has(num)) continue;
        if (type === 1) this.xref.set(num, { kind: "offset", offset: fields[1]!, gen: fields[2] ?? 0 });
        else if (type === 2) this.xref.set(num, { kind: "compressed", streamNum: fields[1]!, index: fields[2] ?? 0 });
      }
    }
    return stream.dict;
  }

  // ------------------------------------------------------------- objects

  private fetch(num: number, depth: number): PdfValue | undefined {
    if (this.cache.has(num)) return this.cache.get(num);
    if (this.resolving.has(num) || depth > 64) return undefined;
    this.resolving.add(num);
    try {
      let value = this.fetchViaXref(num);
      if (value === undefined && !this.scanned) { this.scanObjects(); value = this.fetchViaXref(num); }
      this.cache.set(num, value ?? null);
      return value;
    } finally { this.resolving.delete(num); }
  }

  private fetchViaXref(num: number): PdfValue | undefined {
    const entry = this.xref.get(num);
    if (!entry) return undefined;
    if (entry.kind === "offset") {
      const parsed = this.parseIndirectAt(entry.offset, num);
      if (parsed) return parsed.value;
      if (!this.scanned) { this.scanObjects(); const retry = this.xref.get(num); if (retry && retry.kind === "offset" && retry.offset !== entry.offset) return this.parseIndirectAt(retry.offset, num)?.value; }
      return undefined;
    }
    const table = this.objectStream(entry.streamNum);
    return table?.get(num);
  }

  private parseIndirectAt(offset: number, expectedNum?: number): { num: number; gen: number; value: PdfValue } | null {
    if (offset < 0 || offset >= this.buf.length) return null;
    const lexer = new PdfLexer(this.buf, offset, this.buf.length, (value) => numberOf(this.resolve(value)));
    const num = lexer.readToken();
    const gen = lexer.readToken();
    const keyword = lexer.readToken();
    if (num.kind !== "num" || gen.kind !== "num" || keyword.kind !== "kw" || keyword.value !== "obj") return null;
    if (expectedNum !== undefined && num.value !== expectedNum) return null;
    const value = lexer.parseObject(0, true);
    if (value instanceof PdfOperator) return { num: num.value, gen: gen.value, value: null };
    return { num: num.value, gen: gen.value, value };
  }

  private objectStream(streamNum: number) {
    if (this.objectStreams.has(streamNum)) return this.objectStreams.get(streamNum) ?? null;
    this.objectStreams.set(streamNum, null);
    const stream = this.streamOf(new PdfRef(streamNum, 0));
    if (!stream) return null;
    const data = this.decode(stream);
    if (!data) return null;
    const count = numberOf(this.resolve(stream.dict.get("N")), 0) ?? 0;
    const first = numberOf(this.resolve(stream.dict.get("First")), 0) ?? 0;
    const header = new PdfLexer(data, 0, Math.min(first, data.length));
    const table = new Map<number, PdfValue>();
    for (let i = 0; i < count; i++) {
      const num = header.readToken();
      const objOffset = header.readToken();
      if (num.kind !== "num" || objOffset.kind !== "num") break;
      const lexer = new PdfLexer(data, first + objOffset.value, data.length, (value) => numberOf(this.resolve(value)));
      const value = lexer.parseObject(0, false);
      table.set(num.value, value instanceof PdfOperator ? null : value);
    }
    this.objectStreams.set(streamNum, table);
    return table;
  }

  /** Recovery path: index every "N G obj" occurrence; later definitions win (incremental updates append). */
  private scanObjects() {
    if (this.scanned) return;
    this.scanned = true;
    const pattern = /(?:^|[\s>\]})\x00])(\d{1,10})\s+(\d{1,5})\s+obj\b/gu;
    const text = this.buf.toString("latin1");
    let count = 0;
    for (const match of text.matchAll(pattern)) {
      const index = (match.index ?? 0) + match[0].indexOf(match[1]!);
      this.xref.set(Number(match[1]), { kind: "offset", offset: index, gen: Number(match[2]) });
      if (++count > MAX_OBJECTS) { this.limitations.push("object scan truncated: too many objects"); break; }
    }
    this.cache.clear();
    this.objectStreams.clear();
    if (!this.trailer.has("Root")) {
      for (const match of text.matchAll(/trailer\s*<<([\s\S]{0,4000}?)>>/gu)) {
        const dict = new PdfLexer(Buffer.from(`<<${match[1]}>>`, "latin1")).parseObject(0, false);
        if (isDict(dict)) for (const [key, value] of dict) if (!this.trailer.has(key)) this.trailer.set(key, value);
      }
    }
    if (!this.trailer.has("Root")) {
      // Objects stored in object streams may hold the catalog; expand xref streams found by scanning.
      for (const [num, entry] of [...this.xref.entries()]) {
        if (entry.kind !== "offset") continue;
        const head = this.buf.toString("latin1", entry.offset, Math.min(this.buf.length, entry.offset + 400));
        if (/\/Type\s*\/XRef/u.test(head)) { const trailer = this.readXrefSection(entry.offset); if (trailer) for (const [key, value] of trailer) if (!this.trailer.has(key)) this.trailer.set(key, value); }
        if (/\/Type\s*\/ObjStm/u.test(head)) {
          const table = this.objectStream(num);
          if (table) for (const [innerNum] of table) if (!this.xref.has(innerNum)) this.xref.set(innerNum, { kind: "compressed", streamNum: num, index: 0 });
        }
      }
    }
    if (!this.trailer.has("Root")) {
      for (const [num, entry] of this.xref) {
        const dict = this.dictOf(new PdfRef(num, entry.kind === "offset" ? entry.gen : 0));
        if (dict && nameOf(this.resolve(dict.get("Type"))) === "Catalog") { this.trailer.set("Root", new PdfRef(num, 0)); break; }
      }
    }
  }

  // ---------------------------------------------------------- page tree

  private walkPageTree(root: PdfDict): PdfPageRecord[] {
    const pages: PdfPageRecord[] = [];
    const visited = new Set<PdfDict>();
    const visit = (node: PdfDict, ref: PdfRef | null, inherited: PdfDict, depth: number) => {
      if (visited.has(node) || depth > 64 || pages.length >= MAX_PAGES) return;
      visited.add(node);
      const merged = new Map(inherited);
      for (const key of ["Resources", "MediaBox", "CropBox", "Rotate"]) if (node.has(key)) merged.set(key, node.get(key)!);
      const type = nameOf(this.resolve(node.get("Type")));
      const kids = this.resolve(node.get("Kids"));
      if (type === "Pages" || (Array.isArray(kids) && type !== "Page")) {
        for (const kid of Array.isArray(kids) ? kids : []) {
          const dict = this.dictOf(kid);
          if (dict) visit(dict, kid instanceof PdfRef ? kid : null, merged, depth + 1);
        }
        return;
      }
      if (type === "Page" || node.has("Contents") || node.has("MediaBox")) pages.push(this.pageRecord(node, ref, merged, pages.length + 1, !node.has("Resources") || !node.has("MediaBox")));
    };
    visit(root, null, new Map(), 0);
    return pages;
  }

  private scanPageObjects(): PdfPageRecord[] {
    const found: Array<{ num: number; dict: PdfDict }> = [];
    for (const [num] of this.xref) {
      const dict = this.dictOf(new PdfRef(num, 0));
      if (dict && nameOf(this.resolve(dict.get("Type"))) === "Page") found.push({ num, dict });
      if (found.length >= MAX_PAGES) break;
    }
    found.sort((a, b) => a.num - b.num);
    return found.map((item, index) => {
      const inherited = new Map<string, PdfValue>();
      let parent = this.dictOf(item.dict.get("Parent"));
      let hops = 0;
      while (parent && hops++ < 32) { for (const key of ["Resources", "MediaBox", "Rotate"]) if (!inherited.has(key) && parent.has(key)) inherited.set(key, parent.get(key)!); parent = this.dictOf(parent.get("Parent")); }
      for (const key of ["Resources", "MediaBox", "Rotate"]) if (item.dict.has(key)) inherited.set(key, item.dict.get(key)!);
      return this.pageRecord(item.dict, new PdfRef(item.num, 0), inherited, index + 1, !item.dict.has("Resources"));
    });
  }

  private pageRecord(dict: PdfDict, ref: PdfRef | null, merged: PdfDict, pageNumber: number, inheritedFromParent: boolean): PdfPageRecord {
    const box = (this.resolve(merged.get("MediaBox")) as PdfValue[] | undefined)?.map((item) => numberOf(this.resolve(item)));
    const mediaBox = box && box.length === 4 && box.every((item): item is number => item !== null) ? [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])] as [number, number, number, number] : null;
    const rotateRaw = numberOf(this.resolve(merged.get("Rotate")), 0) ?? 0;
    const rotation = ((Math.round(rotateRaw / 90) * 90) % 360 + 360) % 360;
    const contentsValue = this.resolve(dict.get("Contents"));
    const contents: PdfStream[] = [];
    for (const item of Array.isArray(contentsValue) ? contentsValue : contentsValue ? [contentsValue] : []) {
      const stream = item instanceof PdfStream ? item : this.streamOf(item);
      if (stream) contents.push(stream);
    }
    const annotsValue = this.resolve(dict.get("Annots"));
    const annotations = (Array.isArray(annotsValue) ? annotsValue : []).map((item) => this.dictOf(item)).filter((item): item is PdfDict => Boolean(item));
    return { pageNumber, ref, dict, mediaBox, rotation, resources: this.dictOf(merged.get("Resources")), contents, annotations, inheritedFromParent };
  }
}

export { PdfName, PdfRef, PdfStream };
