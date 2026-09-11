import ExcelJS from "exceljs";

/**
 * Phase 2A-6: real XLSX fixtures.
 *
 * Every workbook here is a genuine OOXML file built with ExcelJS and written
 * through the same serializer a user's spreadsheet application uses, so the
 * tests exercise the production parser rather than a hand-made JSON stand-in.
 * The container helpers at the bottom build raw ZIP/OLE2 bytes deliberately,
 * because those cases (a corrupt container, a legacy .xls, a macro-enabled
 * workbook) are precisely the ones a real parser must refuse.
 */

/** Builds a workbook with the given spec and returns its real .xlsx bytes. */
export async function buildWorkbook(build: (workbook: ExcelJS.Workbook) => void | Promise<void>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VOKA fixtures";
  await build(workbook);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const EN_HEADERS = ["Item", "Description", "Unit", "Qty", "Rate", "Amount"];
const AR_HEADERS = ["رقم البند", "الوصف", "الوحدة", "الكمية", "سعر الوحدة", "المبلغ"];

/**
 * A realistic English BOQ: merged project title, a blank separator, a merged
 * division banner, a header row, two item rows with a formula amount, a
 * repeated header, one more item, then subtotal and total rows.
 */
export async function boqWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("Electrical");
    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = "PROJECT BILL OF QUANTITIES";
    sheet.mergeCells("A3:F3");
    sheet.getCell("A3").value = "DIVISION 26 - ELECTRICAL";
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(4, index + 1).value = header;
    });
    sheet.getCell(5, 1).value = 1;
    sheet.getCell(5, 2).value = "PVC insulated cable 4mm";
    sheet.getCell(5, 3).value = "m";
    sheet.getCell(5, 4).value = 120;
    sheet.getCell(5, 5).value = 2.5;
    sheet.getCell(5, 6).value = { formula: "D5*E5", result: 300 };
    sheet.getCell(6, 1).value = 2;
    sheet.getCell(6, 2).value = "LED light fitting 18W";
    sheet.getCell(6, 3).value = "pcs";
    sheet.getCell(6, 4).value = 24;
    sheet.getCell(6, 5).value = 45;
    sheet.getCell(6, 6).value = { formula: "D6*E6", result: 1080 };
    // The header band repeats inside the long schedule, as printed BOQs do.
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(8, index + 1).value = header;
    });
    sheet.getCell(9, 1).value = 3;
    sheet.getCell(9, 2).value = "Socket outlet 13A";
    sheet.getCell(9, 3).value = "pcs";
    sheet.getCell(9, 4).value = 10;
    sheet.getCell(9, 5).value = 8;
    sheet.getCell(9, 6).value = 80;
    sheet.getCell(11, 2).value = "Subtotal";
    sheet.getCell(11, 6).value = 1160;
    sheet.getCell(12, 2).value = "Total";
    sheet.getCell(12, 6).value = 1460;
  });
}

/** Multi-sheet workbook: five visible discipline sheets plus one hidden sheet. */
export async function multiSheetWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    for (const name of ["Summary", "Civil", "Electrical", "ELV", "Mechanical"]) {
      const sheet = workbook.addWorksheet(name);
      EN_HEADERS.forEach((header, index) => {
        sheet.getCell(1, index + 1).value = header;
      });
      sheet.getCell(2, 1).value = 1;
      sheet.getCell(2, 2).value = `${name} item one`;
      sheet.getCell(2, 3).value = "pcs";
      sheet.getCell(2, 4).value = 5;
      sheet.getCell(2, 5).value = 10;
      sheet.getCell(2, 6).value = 50;
    }
    const hidden = workbook.addWorksheet("Hidden Rates", { state: "hidden" });
    hidden.getCell("A1").value = "Internal rate note";
    hidden.getCell("A2").value = "Not user facing";
    workbook.addWorksheet("Notes");
  });
}

/** A workbook with a hidden row and a hidden column carrying real values. */
export async function hiddenContentWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(1, index + 1).value = header;
    });
    sheet.getCell(2, 1).value = 1;
    sheet.getCell(2, 2).value = "Visible item";
    sheet.getCell(2, 3).value = "pcs";
    sheet.getCell(2, 4).value = 4;
    sheet.getCell(3, 1).value = 2;
    sheet.getCell(3, 2).value = "Hidden row item";
    sheet.getCell(3, 3).value = "set";
    sheet.getCell(3, 4).value = 9;
    sheet.getRow(3).hidden = true;
    sheet.getColumn(5).hidden = true;
    sheet.getCell(2, 5).value = 999;
  });
}

/**
 * Value-fidelity workbook: leading zeros, a padded number, a percentage, a
 * date, a currency-formatted number, and reference codes that must never be
 * turned into numbers.
 */
export async function fidelityWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("Fidelity");
    sheet.getCell("A1").value = "Code";
    sheet.getCell("B1").value = "Padded";
    sheet.getCell("C1").value = "Percent";
    sheet.getCell("D1").value = "Date";
    sheet.getCell("E1").value = "Currency";
    sheet.getCell("F1").value = "Scientific";
    sheet.getCell("A2").value = "00123";
    sheet.getCell("B2").value = 123;
    sheet.getCell("B2").numFmt = "00000";
    sheet.getCell("C2").value = 0.125;
    sheet.getCell("C2").numFmt = "0.00%";
    sheet.getCell("D2").value = new Date(Date.UTC(2026, 0, 2));
    sheet.getCell("D2").numFmt = "dd/mm/yyyy";
    sheet.getCell("E2").value = 1250;
    sheet.getCell("E2").numFmt = '"KD" #,##0.000';
    sheet.getCell("F2").value = "1E10";
    sheet.getCell("A3").value = "0007-A";
    sheet.getCell("A4").value = 12.5;
  });
}

/** One formula with a stored cached result and one without any cached value. */
export async function formulaWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Description";
    sheet.getCell("B1").value = "Qty";
    sheet.getCell("C1").value = "Rate";
    sheet.getCell("D1").value = "Amount";
    sheet.getCell(2, 1).value = "Cable tray";
    sheet.getCell(2, 2).value = 10;
    sheet.getCell(2, 3).value = 5;
    sheet.getCell(2, 4).value = { formula: "B2*C2", result: 50 };
    sheet.getCell(3, 1).value = "Uncalculated item";
    sheet.getCell(3, 2).value = 7;
    sheet.getCell(3, 3).value = 3;
    sheet.getCell(3, 4).value = { formula: "B3*C3" };
  });
}

/** Two-row header: the commercial columns are named on the second row. */
export async function twoRowHeaderWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Item";
    sheet.getCell("B1").value = "Description";
    sheet.getCell("A2").value = "No";
    sheet.getCell("B2").value = "Text";
    sheet.getCell("C2").value = "Unit";
    sheet.getCell("D2").value = "Qty";
    sheet.getCell(3, 1).value = 1;
    sheet.getCell(3, 2).value = "Cable";
    sheet.getCell(3, 3).value = "m";
    sheet.getCell(3, 4).value = 20;
  });
}

/**
 * Three-row header. A four-row header is deliberately not tested as a supported
 * shape: three rows is the documented maximum, so a fourth row is data.
 */
export async function threeRowHeaderWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Item";
    sheet.getCell("A2").value = "No";
    sheet.getCell("C3").value = "Qty";
    sheet.getCell("D3").value = "Unit";
    sheet.getCell(4, 1).value = 1;
    sheet.getCell(4, 2).value = "Cable";
    sheet.getCell(4, 3).value = 30;
    sheet.getCell(4, 4).value = "m";
    sheet.getCell(5, 1).value = 2;
    sheet.getCell(5, 2).value = "Conduit";
    sheet.getCell(5, 3).value = 12;
    sheet.getCell(5, 4).value = "m";
  });
}

/** Two logical tables on one sheet, separated by a blank row, plus a notes block. */
export async function multiRegionWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(1, index + 1).value = header;
    });
    sheet.getCell(2, 1).value = 1;
    sheet.getCell(2, 2).value = "First table item";
    sheet.getCell(2, 3).value = "pcs";
    sheet.getCell(2, 4).value = 3;
    // Row 3 is blank: the separator that creates the region boundary.
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(4, index + 1).value = header;
    });
    sheet.getCell(5, 1).value = 2;
    sheet.getCell(5, 2).value = "Second table item";
    sheet.getCell(5, 3).value = "set";
    sheet.getCell(5, 4).value = 6;
    // Row 6 blank, then a note block that is not a table.
    sheet.getCell(7, 1).value = "Note: rates exclude tax";
  });
}

/** Arabic BOQ headers with Arabic section context. */
export async function arabicBoqWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("أعمال الكهرباء");
    sheet.mergeCells("A1:F1");
    sheet.getCell("A1").value = "أعمال الكهرباء";
    AR_HEADERS.forEach((header, index) => {
      sheet.getCell(2, index + 1).value = header;
    });
    sheet.getCell(3, 1).value = 1;
    sheet.getCell(3, 2).value = "كابل نحاسي 4 مم";
    sheet.getCell(3, 3).value = "م";
    sheet.getCell(3, 4).value = 150;
    sheet.getCell(3, 5).value = 3;
    sheet.getCell(3, 6).value = 450;
    sheet.getCell(5, 2).value = "المجموع";
    sheet.getCell(5, 6).value = 450;
  });
}

/**
 * A header that supports two different roles equally, so it must stay
 * ambiguous. The other columns are unambiguous on purpose, so the region still
 * has a readable header band and only this one column is in question.
 */
export async function ambiguousHeaderWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Item Unit";
    sheet.getCell("B1").value = "Description";
    sheet.getCell("C1").value = "Qty";
    sheet.getCell("D1").value = "Unit";
    sheet.getCell(2, 1).value = 1;
    sheet.getCell(2, 2).value = "Cable";
    sheet.getCell(2, 3).value = 12;
    sheet.getCell(2, 4).value = "m";
  });
}

/** Currency stated explicitly in a header. */
export async function currencyWorkbook(): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    sheet.getCell("A1").value = "Description";
    sheet.getCell("B1").value = "Qty";
    sheet.getCell("C1").value = "Rate (USD)";
    sheet.getCell("D1").value = "Amount (USD)";
    sheet.getCell(2, 1).value = "Cable";
    sheet.getCell(2, 2).value = 10;
    sheet.getCell(2, 3).value = 5;
    sheet.getCell(2, 4).value = 50;
  });
}

/** A long BOQ, used to prove the bounded projection truncates and says so. */
export async function longBoqWorkbook(rowCount = 40): Promise<Buffer> {
  return buildWorkbook((workbook) => {
    const sheet = workbook.addWorksheet("BOQ");
    EN_HEADERS.forEach((header, index) => {
      sheet.getCell(1, index + 1).value = header;
    });
    for (let index = 0; index < rowCount; index += 1) {
      const row = index + 2;
      sheet.getCell(row, 1).value = index + 1;
      sheet.getCell(row, 2).value = `Item number ${index + 1}`;
      sheet.getCell(row, 3).value = "pcs";
      sheet.getCell(row, 4).value = index + 1;
      sheet.getCell(row, 5).value = 2;
      sheet.getCell(row, 6).value = (index + 1) * 2;
    }
  });
}

// ---------------------------------------------------------------------------
// Containers the parser must refuse, built by hand because a real parser
// cannot produce them.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

/** Builds a stored (uncompressed) ZIP container from raw entries. */
export function zipOf(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    parts.push(local, entry.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + entry.data.length;
  }
  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuffer, eocd]);
}

function contentTypesXml(mainContentType: string | null): Buffer {
  const overrides = mainContentType ? `<Override PartName="/xl/workbook.xml" ContentType="${mainContentType}"/>` : "";
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`,
    "utf8",
  );
}

export const XLSX_MAIN = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
export const XLSM_MAIN = "application/vnd.ms-excel.sheet.macroEnabled.main+xml";
export const XLSB_MAIN = "application/vnd.ms-excel.sheet.binary.macroEnabled.main+xml";
export const WORD_MAIN = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";

/** A container that declares the given OOXML main content type. */
export function containerDeclaring(mainContentType: string | null, extraEntries: string[] = []): Buffer {
  return zipOf([
    { name: "[Content_Types].xml", data: contentTypesXml(mainContentType) },
    ...extraEntries.map((name) => ({ name, data: Buffer.from("<placeholder/>", "utf8") })),
  ]);
}

/** Bytes that are not a ZIP container at all. */
export const NOT_A_ZIP = Buffer.from("%PDF-1.7\nthis is a PDF, not a workbook", "utf8");

/** Legacy binary .xls: the OLE2 compound-file signature. */
export const OLE2_XLS = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(512, 0),
]);

/** A ZIP container whose central directory cannot be read. */
export const CORRUPT_ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0x21)]);
