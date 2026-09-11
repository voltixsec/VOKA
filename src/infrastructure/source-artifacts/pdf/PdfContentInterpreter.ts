import type { PdfDocumentParser, PdfPageRecord } from "./PdfDocument";
import { PdfFontLoader, type LoadedFont } from "./PdfFonts";
import { PdfLexer, PdfName, PdfOperator, PdfString, PdfStream, isDict, nameOf, numberOf, type PdfDict, type PdfValue } from "./PdfObjects";
import { streamHasImageFilter } from "./PdfFilters";

type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3],
    m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3],
    m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5],
  ];
}

export type TextChunk = {
  text: string;
  /** 0 → left-to-right, 1 → bottom-to-top, 2 → right-to-left, 3 → top-to-bottom, in unrotated user space. */
  orientation: 0 | 1 | 2 | 3;
  along: number;
  alongEnd: number;
  line: number;
  fontSize: number;
  invisible: boolean;
};

export type PageContentStats = {
  chunks: TextChunk[];
  annotationTexts: string[];
  vectorPathSegments: number;
  imageCount: number;
  imageArea: number;
  formXObjectCount: number;
  fontKeys: Set<string>;
  undecodableGlyphs: number;
  invisibleCharacters: number;
  missingFontResources: number;
  truncated: boolean;
  unsupportedFilters: number;
};

/**
 * Phase 2A-5: bounded capture of painted vector paths and text anchor positions
 * for ONE page. It is collected alongside the accepted text statistics, and
 * only when a caller explicitly asks for it: the 2A-1A text path never builds
 * this structure and is therefore unchanged.
 *
 * This is not a CAD engine. Curves are reduced to their endpoints, clipping is
 * not applied, and every capture is bounded so a vector-heavy sheet cannot
 * explode memory.
 */
export type CapturedPath = {
  /** Path points in PDF user space, already transformed by the CTM at capture time. */
  points: { x: number; y: number }[];
  closed: boolean;
  stroked: boolean;
  filled: boolean;
  /** How many Bézier segments built the path; the curve interior is not reconstructed. */
  curveSegments: number;
  /** True when the path was produced by the `re` rectangle operator. */
  fromRectangle: boolean;
  /** The painting operator that made the path visible, e.g. "S", "f", "B". */
  paintOperator: string | null;
  /** Form XObject nesting depth; 0 is page content. */
  formDepth: number;
};

/** A positioned text run, used only as a spatial anchor for association. */
export type CapturedTextAnchor = {
  text: string;
  /** Pen origin in PDF user space. */
  x: number;
  y: number;
  fontSize: number;
  /** 0 → left-to-right, 1 → bottom-to-top, 2 → right-to-left, 3 → top-to-bottom. */
  orientation: 0 | 1 | 2 | 3;
};

export type PageGeometryStats = {
  paths: CapturedPath[];
  anchors: CapturedTextAnchor[];
  /** Paths seen before the capture bound was applied. */
  pathsObserved: number;
  /** Anchors seen before the capture bound was applied. */
  anchorsObserved: number;
  truncated: boolean;
  unsupportedFilters: number;
};

/** Upper bound of captured paths per page. Beyond it, capture stops and the truncation is disclosed. */
export const MAX_CAPTURED_PATHS_PER_PAGE = 4_000;
/** Upper bound of captured text anchors per page. */
export const MAX_CAPTURED_ANCHORS_PER_PAGE = 4_000;
/** Upper bound of points retained for one captured path (the curve interior is never reconstructed). */
export const MAX_CAPTURED_POINTS_PER_PATH = 64;

export function createPageGeometryStats(): PageGeometryStats {
  return { paths: [], anchors: [], pathsObserved: 0, anchorsObserved: 0, truncated: false, unsupportedFilters: 0 };
}

type TextState = { font: LoadedFont | null; size: number; charSpacing: number; wordSpacing: number; horizontalScale: number; leading: number; rise: number; renderMode: number };
type GraphicsState = { ctm: Matrix; text: TextState };

const MAX_OPERATORS_PER_PAGE = 3_000_000;
const MAX_CHUNKS_PER_PAGE = 150_000;
const MAX_FORM_DEPTH = 8;
const MAX_FORM_INVOCATIONS = 20_000;
const MAX_ANNOTATIONS = 500;

export class PdfContentInterpreter {
  private readonly fonts: PdfFontLoader;
  private readonly decoded = new Map<PdfStream, Buffer | null>();
  private readonly unknownFonts = new Map<string, LoadedFont>();

  constructor(private readonly document: PdfDocumentParser) { this.fonts = new PdfFontLoader(document); }

  interpretPage(page: PdfPageRecord): PageContentStats {
    const stats: PageContentStats = { chunks: [], annotationTexts: [], vectorPathSegments: 0, imageCount: 0, imageArea: 0, formXObjectCount: 0, fontKeys: new Set(), undecodableGlyphs: 0, invisibleCharacters: 0, missingFontResources: 0, truncated: false, unsupportedFilters: 0 };
    const budget = { operators: 0, forms: 0 };
    const parts: Buffer[] = [];
    for (const stream of page.contents) {
      const data = this.decodeCached(stream);
      if (data) parts.push(data, Buffer.from("\n"));
      else stats.unsupportedFilters += 1;
    }
    if (parts.length) this.run(Buffer.concat(parts), page.resources, IDENTITY, stats, budget, 0, new Set());
    this.collectAnnotations(page, stats);
    return stats;
  }

  /**
   * Phase 2A-5: interprets one page for bounded vector geometry and text
   * anchor positions.
   *
   * It reuses the accepted content-stream parser — the same lexer, the same
   * CTM stack, the same Form XObject walk, the same operator budget — and adds
   * a path/anchor collector. The 2A-1A text result is not used, not altered,
   * and not re-emitted here: `interpretPage` remains the text path.
   */
  interpretPageGeometry(page: PdfPageRecord): PageGeometryStats {
    const geometry = createPageGeometryStats();
    // A minimal stats sink keeps the shared `run` contract intact without
    // building the text structures this pass does not need.
    const sink: PageContentStats = { chunks: [], annotationTexts: [], vectorPathSegments: 0, imageCount: 0, imageArea: 0, formXObjectCount: 0, fontKeys: new Set(), undecodableGlyphs: 0, invisibleCharacters: 0, missingFontResources: 0, truncated: false, unsupportedFilters: 0 };
    const budget = { operators: 0, forms: 0 };
    const parts: Buffer[] = [];
    for (const stream of page.contents) {
      const data = this.decodeCached(stream);
      if (data) parts.push(data, Buffer.from("\n"));
      else geometry.unsupportedFilters += 1;
    }
    if (parts.length) this.run(Buffer.concat(parts), page.resources, IDENTITY, sink, budget, 0, new Set(), geometry);
    return geometry;
  }

  private decodeCached(stream: PdfStream) {
    if (this.decoded.has(stream)) return this.decoded.get(stream) ?? null;
    const data = this.document.decode(stream);
    this.decoded.set(stream, data);
    return data;
  }

  private collectAnnotations(page: PdfPageRecord, stats: PageContentStats) {
    for (const annotation of page.annotations.slice(0, MAX_ANNOTATIONS)) {
      const subtype = nameOf(this.document.resolve(annotation.get("Subtype")));
      if (subtype === "Link" || subtype === "Popup") continue;
      const contents = this.textString(annotation.get("Contents"));
      if (contents) stats.annotationTexts.push(contents);
      if (subtype === "Widget") { const value = this.textString(annotation.get("V")); if (value) stats.annotationTexts.push(value); }
    }
  }

  private textString(value: PdfValue | undefined) {
    const resolved = this.document.resolve(value);
    if (!(resolved instanceof PdfString)) return null;
    const bytes = resolved.bytes;
    const text = bytes[0] === 0xfe && bytes[1] === 0xff ? Buffer.from(bytes.subarray(2)).swap16().toString("utf16le") : bytes.toString("latin1");
    const cleaned = text.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/gu, "").replace(/\s+/gu, " ").trim();
    return cleaned || null;
  }

  private fontFor(resources: PdfDict | null, name: string, stats: PageContentStats): LoadedFont {
    const fonts = resources ? this.document.dictOf(resources.get("Font")) : null;
    const dict = fonts ? this.document.dictOf(fonts.get(name)) : null;
    if (dict) return this.fonts.load(dict, name);
    stats.missingFontResources += 1;
    let fallback = this.unknownFonts.get(name);
    if (!fallback) {
      fallback = { key: name, subtype: "Missing", baseFont: null, composite: false, hasUnicodeMapping: false, fontMatrixScale: 0.001, decode: (bytes) => [...bytes].map((code) => ({ code, text: code >= 32 && code <= 126 ? String.fromCharCode(code) : null, width: 500, isSpace: code === 32 })) };
      this.unknownFonts.set(name, fallback);
    }
    return fallback;
  }

  /**
   * `geometry` is the optional Phase 2A-5 collector. When it is absent — which
   * is the case for every accepted 2A-1A/2A-2/2A-4 caller — the path and anchor
   * capture below is skipped entirely and the operator handling is byte-for-byte
   * the accepted behavior.
   */
  private run(content: Buffer, resources: PdfDict | null, baseCtm: Matrix, stats: PageContentStats, budget: { operators: number; forms: number }, depth: number, activeForms: Set<PdfStream>, geometry?: PageGeometryStats) {
    const lexer = new PdfLexer(content);
    const operands: PdfValue[] = [];
    const stack: GraphicsState[] = [];
    let state: GraphicsState = { ctm: baseCtm, text: { font: null, size: 0, charSpacing: 0, wordSpacing: 0, horizontalScale: 1, leading: 0, rise: 0, renderMode: 0 } };
    let tm: Matrix = IDENTITY;
    let tlm: Matrix = IDENTITY;
    let pendingSegments = 0;
    let pathStarted = false;
    const num = (index: number) => { const value = operands[index]; return typeof value === "number" && Number.isFinite(value) ? value : 0; };

    // --- Phase 2A-5 path capture state (inactive unless `geometry` is given) ---
    type Subpath = { points: { x: number; y: number }[]; closed: boolean; curveSegments: number; fromRectangle: boolean };
    let subpaths: Subpath[] = [];
    /** Transforms a user-space operand pair through the current CTM into page space. */
    const project = (x: number, y: number) => {
      const ctm = state.ctm;
      return { x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] };
    };
    const captureEnabled = () => Boolean(geometry) && (geometry!.paths.length < MAX_CAPTURED_PATHS_PER_PAGE);
    const lastSubpath = (): Subpath | null => (subpaths.length ? subpaths[subpaths.length - 1]! : null);
    const beginSubpath = (point: { x: number; y: number }, fromRectangle = false) => {
      if (!geometry || !captureEnabled()) return;
      subpaths.push({ points: [point], closed: false, curveSegments: 0, fromRectangle });
    };
    const appendPoint = (point: { x: number; y: number }, curved = false) => {
      if (!geometry) return;
      const subpath = lastSubpath();
      if (!subpath) return;
      subpath.points.push(point);
      if (curved) subpath.curveSegments += 1;
    };
    const closeSubpath = () => {
      const subpath = lastSubpath();
      if (subpath) subpath.closed = true;
    };
    /** Turns accumulated subpaths into captured paths when a painting operator runs. */
    const finalizePath = (paintOperator: string, stroked: boolean, filled: boolean, closeFirst: boolean) => {
      if (!geometry) return;
      for (const subpath of subpaths) {
        if (subpath.points.length < 2) continue;
        geometry.pathsObserved += 1;
        if (!captureEnabled()) { geometry.truncated = true; continue; }
        geometry.paths.push({
          points: subpath.points.slice(0, MAX_CAPTURED_POINTS_PER_PATH),
          closed: subpath.closed || closeFirst,
          stroked,
          filled,
          curveSegments: subpath.curveSegments,
          fromRectangle: subpath.fromRectangle,
          paintOperator,
          formDepth: depth,
        });
      }
      subpaths = [];
    };

    const showText = (bytes: Buffer) => {
      const text = state.text;
      const font = text.font ?? this.fontFor(resources, "__missing__", stats);
      const glyphs = font.decode(bytes);
      const invisible = text.renderMode === 3 || text.renderMode === 7;
      const m = multiply(tm, state.ctm);
      const trm = multiply([text.size * text.horizontalScale, 0, 0, text.size, 0, text.rise], m);
      const fontSize = Math.hypot(trm[2], trm[3]) || Math.abs(text.size) || 1;
      const angle = Math.atan2(trm[1], trm[0]) * 180 / Math.PI;
      const orientation = ((Math.round(angle / 90) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
      let advance = 0;
      let visibleText = "";
      for (const glyph of glyphs) {
        const w0 = glyph.width * font.fontMatrixScale;
        advance += (w0 * text.size + text.charSpacing + (glyph.isSpace ? text.wordSpacing : 0)) * text.horizontalScale;
        if (glyph.text === null) { stats.undecodableGlyphs += 1; continue; }
        visibleText += glyph.text;
      }
      const start = { x: trm[4], y: trm[5] };
      const end = { x: start.x + advance * m[0], y: start.y + advance * m[1] };
      const r = orientation === 0 ? [1, 0] : orientation === 1 ? [0, 1] : orientation === 2 ? [-1, 0] : [0, -1];
      const down = orientation === 0 ? [0, -1] : orientation === 1 ? [1, 0] : orientation === 2 ? [0, 1] : [-1, 0];
      if (visibleText && stats.chunks.length < MAX_CHUNKS_PER_PAGE) {
        if (invisible) stats.invisibleCharacters += visibleText.replace(/\s/gu, "").length;
        stats.chunks.push({ text: visibleText, orientation, along: start.x * r[0]! + start.y * r[1]!, alongEnd: end.x * r[0]! + end.y * r[1]!, line: start.x * down[0]! + start.y * down[1]!, fontSize, invisible });
      } else if (visibleText) stats.truncated = true;
      // Phase 2A-5: visible text only. An invisible (render-mode 3/7) OCR layer
      // is deliberately not used as a spatial anchor; it is unverified against
      // the page image and must never position a dimension association.
      if (geometry && visibleText && !invisible) {
        geometry.anchorsObserved += 1;
        if (geometry.anchors.length < MAX_CAPTURED_ANCHORS_PER_PAGE) {
          geometry.anchors.push({ text: visibleText, x: start.x, y: start.y, fontSize, orientation });
        } else geometry.truncated = true;
      }
      tm = multiply([1, 0, 0, 1, advance, 0], tm);
    };

    for (;;) {
      if (++budget.operators > MAX_OPERATORS_PER_PAGE) { stats.truncated = true; return; }
      const item = lexer.parseObject(0, false);
      if (!(item instanceof PdfOperator)) { operands.push(item); if (operands.length > 64) operands.shift(); continue; }
      const op = item.op;
      if (op === "") break;
      switch (op) {
        case "q": stack.push({ ctm: state.ctm, text: { ...state.text } }); if (stack.length > 256) stack.shift(); break;
        case "Q": state = stack.pop() ?? state; break;
        case "cm": if (operands.length >= 6) state.ctm = multiply([num(operands.length - 6), num(operands.length - 5), num(operands.length - 4), num(operands.length - 3), num(operands.length - 2), num(operands.length - 1)], state.ctm); break;
        case "BT": tm = IDENTITY; tlm = IDENTITY; break;
        case "ET": break;
        case "Tc": state.text.charSpacing = num(operands.length - 1); break;
        case "Tw": state.text.wordSpacing = num(operands.length - 1); break;
        case "Tz": state.text.horizontalScale = num(operands.length - 1) / 100 || 1; break;
        case "TL": state.text.leading = num(operands.length - 1); break;
        case "Ts": state.text.rise = num(operands.length - 1); break;
        case "Tr": state.text.renderMode = Math.trunc(num(operands.length - 1)); break;
        case "Tf": {
          const name = operands.at(-2);
          state.text.size = num(operands.length - 1);
          if (name instanceof PdfName) { state.text.font = this.fontFor(resources, name.name, stats); stats.fontKeys.add(`${name.name}:${state.text.font.baseFont ?? state.text.font.subtype}`); }
          break;
        }
        case "Td": tlm = multiply([1, 0, 0, 1, num(operands.length - 2), num(operands.length - 1)], tlm); tm = tlm; break;
        case "TD": state.text.leading = -num(operands.length - 1); tlm = multiply([1, 0, 0, 1, num(operands.length - 2), num(operands.length - 1)], tlm); tm = tlm; break;
        case "Tm": if (operands.length >= 6) { tlm = [num(operands.length - 6), num(operands.length - 5), num(operands.length - 4), num(operands.length - 3), num(operands.length - 2), num(operands.length - 1)]; tm = tlm; } break;
        case "T*": tlm = multiply([1, 0, 0, 1, 0, -state.text.leading], tlm); tm = tlm; break;
        case "Tj": { const value = operands.at(-1); if (value instanceof PdfString) showText(value.bytes); break; }
        case "'": { tlm = multiply([1, 0, 0, 1, 0, -state.text.leading], tlm); tm = tlm; const value = operands.at(-1); if (value instanceof PdfString) showText(value.bytes); break; }
        case "\"": { state.text.wordSpacing = num(operands.length - 3); state.text.charSpacing = num(operands.length - 2); tlm = multiply([1, 0, 0, 1, 0, -state.text.leading], tlm); tm = tlm; const value = operands.at(-1); if (value instanceof PdfString) showText(value.bytes); break; }
        case "TJ": {
          const array = operands.at(-1);
          if (!Array.isArray(array)) break;
          for (const element of array) {
            if (element instanceof PdfString) showText(element.bytes);
            else if (typeof element === "number") { const shift = -element / 1000 * state.text.size * state.text.horizontalScale; tm = multiply([1, 0, 0, 1, shift, 0], tm); }
          }
          break;
        }
        // --- Phase 2A-5 path capture. The accepted `pendingSegments` /
        // `pathStarted` accounting above it is untouched, so 2A-1A metrics and
        // 2A-1B classification see exactly the same numbers as before. ---
        case "m": pathStarted = true; if (geometry) beginSubpath(project(num(operands.length - 2), num(operands.length - 1))); break;
        case "l": if (pathStarted || true) pendingSegments += 1; if (geometry) appendPoint(project(num(operands.length - 2), num(operands.length - 1))); break;
        // Curves are reduced to their endpoint: no curve interior is reconstructed.
        case "c": if (pathStarted || true) pendingSegments += 1; if (geometry) appendPoint(project(num(operands.length - 2), num(operands.length - 1)), true); break;
        case "v": if (pathStarted || true) pendingSegments += 1; if (geometry) appendPoint(project(num(operands.length - 2), num(operands.length - 1)), true); break;
        case "y": if (pathStarted || true) pendingSegments += 1; if (geometry) appendPoint(project(num(operands.length - 2), num(operands.length - 1)), true); break;
        case "h": if (geometry) closeSubpath(); break;
        case "re": {
          pendingSegments += 4; pathStarted = true;
          if (geometry) {
            const x = num(operands.length - 4);
            const y = num(operands.length - 3);
            const w = num(operands.length - 2);
            const h = num(operands.length - 1);
            beginSubpath(project(x, y), true);
            appendPoint(project(x + w, y));
            appendPoint(project(x + w, y + h));
            appendPoint(project(x, y + h));
            closeSubpath();
          }
          break;
        }
        case "S": case "s": stats.vectorPathSegments += pendingSegments; pendingSegments = 0; pathStarted = false; finalizePath(op, true, false, false); break;
        case "f": case "F": case "f*": stats.vectorPathSegments += pendingSegments; pendingSegments = 0; pathStarted = false; finalizePath(op, false, true, false); break;
        case "B": case "B*": stats.vectorPathSegments += pendingSegments; pendingSegments = 0; pathStarted = false; finalizePath(op, true, true, false); break;
        case "b": case "b*": stats.vectorPathSegments += pendingSegments; pendingSegments = 0; pathStarted = false; finalizePath(op, true, true, true); break;
        case "n": pendingSegments = 0; pathStarted = false; if (geometry) { subpaths = []; } break;
        case "W": case "W*": break;
        case "BI": {
          this.skipInlineImage(lexer);
          stats.imageCount += 1;
          stats.imageArea += Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2]);
          break;
        }
        case "Do": {
          const name = operands.at(-1);
          if (!(name instanceof PdfName)) break;
          const xobjects = resources ? this.document.dictOf(resources.get("XObject")) : null;
          const xobject = xobjects ? this.document.streamOf(xobjects.get(name.name)) : null;
          if (!xobject) break;
          const subtype = nameOf(this.document.resolve(xobject.dict.get("Subtype")));
          if (subtype === "Image") {
            stats.imageCount += 1;
            stats.imageArea += Math.abs(state.ctm[0] * state.ctm[3] - state.ctm[1] * state.ctm[2]);
            if (streamHasImageFilter(xobject, (value) => this.document.resolve(value))) { /* pixel data intentionally not decoded */ }
          } else if (subtype === "Form") {
            stats.formXObjectCount += 1;
            if (depth >= MAX_FORM_DEPTH || activeForms.has(xobject) || ++budget.forms > MAX_FORM_INVOCATIONS) { stats.truncated = stats.truncated || budget.forms > MAX_FORM_INVOCATIONS; break; }
            const matrixValue = this.document.resolve(xobject.dict.get("Matrix")) as PdfValue[] | undefined;
            const matrix = Array.isArray(matrixValue) && matrixValue.length === 6 ? matrixValue.map((value) => numberOf(this.document.resolve(value), 0) ?? 0) as Matrix : IDENTITY;
            const formResources = this.document.dictOf(xobject.dict.get("Resources")) ?? resources;
            const data = this.decodeCached(xobject);
            if (!data) { stats.unsupportedFilters += 1; break; }
            activeForms.add(xobject);
            this.run(data, formResources, multiply(matrix, state.ctm), stats, budget, depth + 1, activeForms, geometry);
            activeForms.delete(xobject);
          }
          break;
        }
        case "gs": {
          const name = operands.at(-1);
          const states = resources && name instanceof PdfName ? this.document.dictOf(resources.get("ExtGState")) : null;
          const extGState = states && name instanceof PdfName ? this.document.dictOf(states.get(name.name)) : null;
          const fontEntry = extGState ? this.document.resolve(extGState.get("Font")) : undefined;
          if (Array.isArray(fontEntry) && fontEntry.length === 2) { const dict = this.document.dictOf(fontEntry[0]); if (dict) { state.text.font = this.fonts.load(dict, "gs"); state.text.size = numberOf(this.document.resolve(fontEntry[1]), state.text.size) ?? state.text.size; } }
          break;
        }
        default: break;
      }
      operands.length = 0;
    }
  }

  private skipInlineImage(lexer: PdfLexer) {
    // Consume "key value ... ID <binary> EI".
    for (let guard = 0; guard < 200; guard++) {
      const item = lexer.parseObject(0, false);
      if (item instanceof PdfOperator && (item.op === "ID" || item.op === "")) break;
    }
    const buf = lexer.buf;
    let pos = lexer.pos + 1;
    while (pos < buf.length) {
      const index = buf.indexOf("EI", pos, "latin1");
      if (index === -1) { lexer.pos = buf.length; return; }
      const before = buf[index - 1] ?? 0x20;
      const after = buf[index + 2] ?? 0x20;
      if ((before === 0x20 || before === 0x0a || before === 0x0d || before === 0x09 || before === 0x3e) && (after === 0x20 || after === 0x0a || after === 0x0d || after === 0x09 || index + 2 >= buf.length)) { lexer.pos = index + 2; return; }
      pos = index + 2;
    }
    lexer.pos = buf.length;
  }
}

export type AssembledText = { text: string; lines: number; visibleCharacters: number };

/** Groups positioned chunks into reading-order lines. Large gaps become " | " so table cells stay distinguishable. */
export function assembleText(chunks: TextChunk[]): AssembledText {
  if (!chunks.length) return { text: "", lines: 0, visibleCharacters: 0 };
  const byOrientation = new Map<number, TextChunk[]>();
  for (const chunk of chunks) { const list = byOrientation.get(chunk.orientation) ?? []; list.push(chunk); byOrientation.set(chunk.orientation, list); }
  const orientations = [...byOrientation.entries()].sort((a, b) => weight(b[1]) - weight(a[1]));
  const outputLines: string[] = [];
  let visibleCharacters = 0;
  for (const [, list] of orientations) {
    list.sort((a, b) => a.line - b.line || a.along - b.along);
    const lines: TextChunk[][] = [];
    for (const chunk of list) {
      const current = lines.at(-1);
      if (current) {
        const reference = current[0]!;
        const tolerance = Math.max(0.5 * Math.max(reference.fontSize, chunk.fontSize), 0.75);
        if (Math.abs(chunk.line - reference.line) <= tolerance) { current.push(chunk); continue; }
      }
      lines.push([chunk]);
    }
    for (const line of lines) {
      line.sort((a, b) => a.along - b.along);
      let text = "";
      let previous: TextChunk | null = null;
      for (const chunk of line) {
        if (previous) {
          const gap = chunk.along - previous.alongEnd;
          const size = Math.max(previous.fontSize, chunk.fontSize, 1);
          if (gap > 2.5 * size) text += " | ";
          else if (gap > 0.18 * size && !/\s$/u.test(text) && !/^\s/u.test(chunk.text)) text += " ";
          else if (gap < -0.6 * size && !/\s$/u.test(text)) text += " ";
        }
        text += chunk.text;
        previous = chunk;
      }
      const cleaned = text.replace(/[ \t]+/gu, " ").replace(/\s*\|\s*/gu, " | ").trim();
      if (!cleaned) continue;
      outputLines.push(cleaned);
      visibleCharacters += cleaned.replace(/\s|\|/gu, "").length;
    }
  }
  return { text: outputLines.join("\n"), lines: outputLines.length, visibleCharacters };
}

function weight(list: TextChunk[]) { return list.reduce((total, chunk) => total + chunk.text.length, 0); }

export { isDict };
