import { deflateSync } from "node:zlib";

/**
 * Deterministic, minimal PDF generators for tests. They exercise real PDF
 * structures (page tree, xref table / xref stream, object streams, Flate,
 * WinAnsi + Identity-H fonts with ToUnicode, image XObjects, invisible text)
 * without depending on proprietary sample files.
 */

type Obj = { num: number; body: Buffer };

function obj(num: number, body: string | Buffer): Obj { return { num, body: Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1") }; }

function stream(dict: string, data: Buffer, compress = false) {
  const payload = compress ? deflateSync(data) : data;
  return Buffer.concat([Buffer.from(`<< ${dict} /Length ${payload.length}${compress ? " /Filter /FlateDecode" : ""} >>\nstream\n`, "latin1"), payload, Buffer.from("\nendstream", "latin1")]);
}

/** Classic xref-table PDF. */
export function assemblePdf(objects: Obj[], rootNum: number, infoNum: number | null = null, options: { corruptXref?: boolean; encrypt?: boolean } = {}) {
  let out = Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1");
  const offsets = new Map<number, number>();
  for (const item of objects) {
    offsets.set(item.num, out.length);
    out = Buffer.concat([out, Buffer.from(`${item.num} 0 obj\n`, "latin1"), item.body, Buffer.from("\nendobj\n", "latin1")]);
  }
  const size = Math.max(...objects.map((item) => item.num)) + 1;
  const xrefOffset = out.length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let num = 1; num < size; num++) xref += offsets.has(num) ? `${String(offsets.get(num)).padStart(10, "0")} 00000 n \n` : "0000000000 65535 f \n";
  const trailer = `trailer\n<< /Size ${size} /Root ${rootNum} 0 R${infoNum ? ` /Info ${infoNum} 0 R` : ""}${options.encrypt ? " /Encrypt 99 0 R" : ""} >>\nstartxref\n${options.corruptXref ? 999_999 : xrefOffset}\n%%EOF\n`;
  return Buffer.concat([out, Buffer.from(xref + trailer, "latin1")]);
}

function escapePdf(text: string) { return text.replace(/[\\()]/gu, (char) => `\\${char}`); }

/**
 * Phase 2A-5 added `cropBox` and `extraContent` only. Every earlier field and
 * the PDFs built without them are byte-for-byte unchanged, so the accepted
 * 2A-1A/2A-2/2A-3/2A-4 fixtures keep their existing behavior.
 */
export type PageSpec = {
  width: number;
  height: number;
  lines?: string[];
  invisibleLines?: string[];
  rectangles?: number;
  image?: boolean;
  rotate?: number;
  annotations?: string[];
  /** Emitted as a literal /CropBox array on the page object. */
  cropBox?: [number, number, number, number];
  /** Raw content-stream operators appended after the generated text runs. */
  extraContent?: string;
};

/**
 * Builds a multi-page PDF with a real page tree. Each page gets a Helvetica
 * WinAnsi font; text lines are placed on separate baselines so page-level
 * attribution and reading order can be asserted.
 */
export function buildPdf(pages: PageSpec[], options: { producer?: string; creator?: string; title?: string; compress?: boolean; corruptXref?: boolean; encrypt?: boolean } = {}) {
  const objects: Obj[] = [];
  let next = 1;
  const catalog = next++;
  const pagesNum = next++;
  const font = next++;
  const image = next++;
  const info = next++;
  const kids: number[] = [];
  for (const page of pages) {
    const pageNum = next++;
    const contentNum = next++;
    const annotNums: number[] = [];
    kids.push(pageNum);
    let content = "";
    for (let i = 0; i < (page.rectangles ?? 0); i++) content += `${10 + i} ${10 + i} 50 30 re S\n`;
    if (page.image) content += `q ${page.width} 0 0 ${page.height} 0 0 cm /Im1 Do Q\n`;
    (page.lines ?? []).forEach((line, index) => { content += `BT /F1 11 Tf 40 ${page.height - 60 - index * 16} Td (${escapePdf(line)}) Tj ET\n`; });
    (page.invisibleLines ?? []).forEach((line, index) => { content += `BT 3 Tr /F1 11 Tf 40 ${page.height - 300 - index * 16} Td (${escapePdf(line)}) Tj ET\n`; });
    if (page.extraContent) content += `${page.extraContent}\n`;
    objects.push(obj(contentNum, stream("", Buffer.from(content, "latin1"), options.compress ?? false)));
    for (const annotation of page.annotations ?? []) {
      const annotNum = next++;
      annotNums.push(annotNum);
      objects.push(obj(annotNum, `<< /Type /Annot /Subtype /FreeText /Rect [10 10 100 40] /Contents (${escapePdf(annotation)}) >>`));
    }
    objects.push(obj(pageNum, `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${page.width} ${page.height}]${page.cropBox ? ` /CropBox [${page.cropBox.join(" ")}]` : ""}${page.rotate ? ` /Rotate ${page.rotate}` : ""} /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${font} 0 R >> /XObject << /Im1 ${image} 0 R >> >>${annotNums.length ? ` /Annots [${annotNums.map((num) => `${num} 0 R`).join(" ")}]` : ""} >>`));
  }
  objects.push(obj(catalog, `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`));
  objects.push(obj(pagesNum, `<< /Type /Pages /Kids [${kids.map((num) => `${num} 0 R`).join(" ")}] /Count ${kids.length} >>`));
  objects.push(obj(font, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"));
  objects.push(obj(image, stream("/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode", Buffer.alloc(64, 0xff))));
  const infoParts = [options.producer ? `/Producer (${escapePdf(options.producer)})` : "", options.creator ? `/Creator (${escapePdf(options.creator)})` : "", options.title ? `/Title (${escapePdf(options.title)})` : ""].filter(Boolean).join(" ");
  objects.push(obj(info, `<< ${infoParts} >>`));
  return assemblePdf(objects, catalog, info, { corruptXref: options.corruptXref, encrypt: options.encrypt });
}

/**
 * PDF using an Identity-H Type0 font with a ToUnicode CMap; glyph ids are arbitrary and only the CMap yields text.
 * Like real shaping producers, right-to-left runs are emitted in visual (left-to-right glyph) order.
 */
export function buildCidFontPdf(text: string) {
  const visual = text.replace(/[\u0600-\u06ff][\u0600-\u06ff ]*[\u0600-\u06ff]/gu, (run) => [...run].reverse().join(""));
  const codes = [...visual].map((char, index) => ({ gid: 100 + index, char }));
  const bfchars = codes.map(({ gid, char }) => `<${gid.toString(16).padStart(4, "0")}> <${char.codePointAt(0)!.toString(16).padStart(4, "0")}>`).join("\n");
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CMapName /Adobe-Identity-UCS def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${codes.length} beginbfchar\n${bfchars}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  const hex = codes.map(({ gid }) => gid.toString(16).padStart(4, "0")).join("");
  const content = `BT /F1 12 Tf 40 780 Td <${hex}> Tj ET`;
  const objects: Obj[] = [
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>"),
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"),
    obj(4, stream("", Buffer.from(content, "latin1"), true)),
    obj(5, "<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Cairo /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>"),
    obj(6, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /ABCDEF+Cairo /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 600 >>"),
    obj(7, stream("", Buffer.from(cmap, "latin1"), true)),
  ];
  return assemblePdf(objects, 1);
}

/** PDF 1.5 with catalog, page tree, and font stored in an object stream and indexed by a cross-reference stream. */
export function buildObjectStreamPdf(lines: string[]) {
  const content = Buffer.from(lines.map((line, index) => `BT /F1 11 Tf 40 ${780 - index * 16} Td (${escapePdf(line)}) Tj ET`).join("\n"), "latin1");
  const inner: Array<[number, string]> = [
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 595 842] >>"],
    [3, "<< /Type /Page /Parent 2 0 R /Contents 5 0 R /Resources << /Font << /F1 4 0 R >> >> >>"],
    [4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"],
  ];
  let body = "";
  const offsets: string[] = [];
  for (const [num, dict] of inner) { offsets.push(`${num} ${body.length}`); body += `${dict}\n`; }
  const header = `${offsets.join(" ")}\n`;
  const objStmData = deflateSync(Buffer.from(header + body, "latin1"));
  let out = Buffer.from("%PDF-1.5\n", "latin1");
  const xref = new Map<number, number>();
  const append = (num: number, payload: Buffer) => { xref.set(num, out.length); out = Buffer.concat([out, Buffer.from(`${num} 0 obj\n`, "latin1"), payload, Buffer.from("\nendobj\n", "latin1")]); };
  append(6, Buffer.concat([Buffer.from(`<< /Type /ObjStm /N ${inner.length} /First ${header.length} /Length ${objStmData.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), objStmData, Buffer.from("\nendstream", "latin1")]));
  const compressed = deflateSync(content);
  append(5, Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode >>\nstream\n`, "latin1"), compressed, Buffer.from("\nendstream", "latin1")]));
  const size = 8;
  const rows: Buffer[] = [];
  for (let num = 0; num < size; num++) {
    const row = Buffer.alloc(7);
    if (xref.has(num)) { row[0] = 1; row.writeUInt32BE(xref.get(num)!, 1); }
    else if (inner.some(([innerNum]) => innerNum === num)) { row[0] = 2; row.writeUInt32BE(6, 1); row.writeUInt16BE(inner.findIndex(([innerNum]) => innerNum === num), 5); }
    rows.push(row);
  }
  const xrefData = deflateSync(Buffer.concat(rows));
  const xrefOffset = out.length;
  out = Buffer.concat([out, Buffer.from(`7 0 obj\n<< /Type /XRef /Size ${size} /W [1 4 2] /Root 1 0 R /Filter /FlateDecode /Length ${xrefData.length} >>\nstream\n`, "latin1"), xrefData, Buffer.from(`\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`, "latin1")]);
  return out;
}

export const DRAWING_SHEET: PageSpec = {
  width: 2384, height: 1684, rectangles: 80,
  lines: ["PROJECT: SEAFRONT TOWER", "DRAWING TITLE: LEVEL 6 HVAC LAYOUT", "DRAWING NO: ME-101 REV: B", "SCALE 1:100 SHEET 3 OF 12", "AHU-01 FCU-12 FCU-13", "DUCTWORK TO SMACNA 2005", "NOTE: REFER TO SPECIFICATION SECTION 23 31 13"],
};

export const BOQ_SHEET: PageSpec = {
  width: 595, height: 842,
  lines: ["BILL OF QUANTITIES", "ITEM DESCRIPTION QTY UNIT RATE AMOUNT", "1.1 Supply and install fire pump set 2 nos", "1.2 Fire hose reel cabinet FHR-01 8 nos", "1.3 GI pipe 100mm to BS 1387 250 m", "Total carried to summary"],
};

export const TEXT_SHEET: PageSpec = {
  width: 612, height: 792,
  lines: Array.from({ length: 14 }, (_, index) => `Paragraph ${index + 1}: the contractor shall coordinate all mechanical services with the structural engineer before installation.`),
};

export const SCANNED_SHEET: PageSpec = { width: 595, height: 842, image: true };
export const OCR_LAYER_SHEET: PageSpec = { width: 595, height: 842, image: true, invisibleLines: ["DRAWING NO: A-201 REV 0", "SCANNED OCR LAYER"] };

/**
 * Vector-heavy page with almost no text. It exists to prove that path/vector
 * counts alone never produce a DRAWING classification.
 */
export const VECTOR_ONLY_SHEET: PageSpec = {
  width: 2384, height: 1684, rectangles: 120,
  lines: ["LEVEL 6"],
};

/** Page with neither machine-readable text nor an image XObject. */
export const EMPTY_SHEET: PageSpec = { width: 595, height: 842, lines: [] };

/**
 * One page carrying both schedule structure and drawing identifiers. It exists
 * to prove conflicting evidence degrades instead of choosing a favourite class.
 */
export const AMBIGUOUS_SHEET: PageSpec = {
  width: 1684, height: 1191, rectangles: 20,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-101 SCALE 1:50",
    "BILL OF QUANTITIES",
    "ITEM DESCRIPTION QTY UNIT",
    "1.1 Internal partition 120 m2",
    "1.2 Door set D-01 6 nos",
  ],
};

/**
 * PDF with no reachable page tree: the content stream is real but no page object
 * owns it, so the inspector recovers the text as UNATTRIBUTED with pageNumber null.
 */
export function buildOrphanTextPdf(lines: string[]) {
  const content = lines.map((line, index) => `BT /F1 11 Tf 40 ${780 - index * 16} Td (${escapePdf(line)}) Tj ET`).join("\n");
  return Buffer.from(
    `%PDF-1.4\n1 0 obj\n<< /Type /Page /Parent 9 0 R >>\nendobj\n3 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n%%EOF`,
    "latin1",
  );
}

/**
 * Phase 2A-5: a drawing sheet that carries real vector content AND explicit
 * drawing markers. The markers are what qualify it; the vectors are only what
 * gets measured once it is qualified.
 *
 * Layout (PDF user space, 1000 x 800, origin bottom-left):
 * - a horizontal dimension line from (200,400) to (600,400);
 * - the printed literal "3500" anchored at (380,412), just above that line;
 * - an axis-aligned rectangle from (100,100) to (300,300);
 * - the printed literal "1200 mm" on its own text run, carrying an explicit unit.
 */
export const GEOMETRY_DRAWING_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-101",
    "SCALE 1:100",
    "1200 mm",
    "AHU-01",
  ],
  extraContent: [
    "0.8 w",
    "200 400 m 600 400 l S",
    "BT /F1 12 Tf 380 412 Td (3500) Tj ET",
    "100 100 200 200 re S",
  ].join("\n"),
};

/**
 * Phase 2A-5: the same dimension literal sits exactly between two parallel
 * dimension-line candidates, so neither can be preferred. Both must survive as
 * ambiguous rather than one being chosen by confidence.
 */
export const GEOMETRY_AMBIGUOUS_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-102",
    "SCALE 1:100",
  ],
  extraContent: [
    "0.8 w",
    "200 400 m 600 400 l S",
    "200 424 m 600 424 l S",
    "BT /F1 12 Tf 380 412 Td (3500) Tj ET",
  ].join("\n"),
};

/** Phase 2A-5: one sheet printing two different scales. Neither may win. */
export const GEOMETRY_CONFLICTING_SCALE_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-103",
    "SCALE 1:50",
    "SCALE 1:100",
  ],
  extraContent: "200 400 m 600 400 l S",
};

/** Phase 2A-5: a sheet whose declared CropBox is smaller than its MediaBox. */
export const GEOMETRY_CROP_BOX_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  cropBox: [0, 0, 500, 400],
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-104",
    "SCALE 1:100",
  ],
  extraContent: [
    "100 100 m 400 100 l S",
    "BT /F1 12 Tf 150 120 Td (3500) Tj ET",
  ].join("\n"),
};

/** Phase 2A-5: the same geometry as the drawing sheet, rotated a quarter turn. */
export const GEOMETRY_ROTATED_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  rotate: 90,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-105",
    "SCALE 1:100",
  ],
  extraContent: "200 400 m 600 400 l S",
};

/** Phase 2A-5: more vector paths than the per-page retention bound allows. */
export const GEOMETRY_OVERFLOW_SHEET: PageSpec = {
  width: 1000,
  height: 800,
  lines: [
    "DRAWING TITLE: LEVEL 6 PART PLAN",
    "DRAWING NO: A-106",
    "SCALE 1:100",
  ],
  extraContent: Array.from({ length: 500 }, (_, index) => `${10 + (index % 400)} ${10 + (index % 300)} 4 4 re S`).join("\n"),
};
