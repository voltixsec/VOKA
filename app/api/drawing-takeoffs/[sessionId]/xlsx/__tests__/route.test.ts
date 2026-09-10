import { beforeEach, describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  locale: "en",
}));

vi.mock("@/lib/reporting/drawing-takeoff", () => ({
  getDrawingTakeoffSnapshot: mocks.getSnapshot,
}));

vi.mock("@/lib/api", async () => {
  const errors = await vi.importActual<typeof import("@/lib/api/ApiError")>("@/lib/api/ApiError");
  const responses = await vi.importActual<typeof import("@/lib/api/ApiResponse")>("@/lib/api/ApiResponse");
  return {
    ApiError: errors.ApiError,
    withCompanyAuth: (
      _roles: readonly string[],
      handler: (request: Request, auth: { user: { locale: string } }, company: { companyId: string }) => Promise<Response>,
    ) => {
      return async (request: Request) => {
        try {
          return await handler(request, { user: { locale: mocks.locale } }, { companyId: "company-1" });
        } catch (error) {
          return responses.handleApiError(error);
        }
      };
    },
  };
});

import { GET } from "../route";

function snapshot() {
  return {
    id: "takeoff-1",
    source: { fileName: "drawing.pdf", mimeType: "application/pdf", sizeBytes: 100 },
    project: null,
    systemScope: "CCTV_LOW_VOLTAGE",
    userIntent: "Count CCTV",
    status: "REVIEW_REQUIRED",
    version: 2,
    quotationId: null,
    createdAt: "2026-08-26T12:00:00.000Z",
    review: { requiresHumanReview: true, confirmedLines: 0, needsConfirmationLines: 1 },
    lines: [
      {
        position: 1,
        detectedItem: "Camera",
        description: null,
        quantity: null,
        unit: "each",
        quantityProvenance: "NEEDS_CONFIRMATION",
        confidence: "0.42",
        humanReviewState: "REVIEW_REQUIRED",
        needsConfirmation: true,
        evidence: "Symbol obscured",
        mappedItem: null,
        catalogMapping: null,
        governedUnitPrice: null,
        currencyCode: null,
        notes: null,
      },
    ],
  };
}

async function loadWorkbook(response: Response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  return book;
}

function cellText(book: ExcelJS.Workbook, sheet: number, address: string) {
  return String(book.worksheets[sheet].getCell(address).value ?? "");
}

describe("drawing takeoff xlsx localization", () => {
  beforeEach(() => {
    mocks.getSnapshot.mockResolvedValue(snapshot());
    mocks.locale = "en";
  });

  it("produces English labels and localized status for an English locale", async () => {
    const response = await GET(new Request("https://voka.local/api/drawing-takeoffs/takeoff-1/xlsx"));
    expect(response.status).toBe(200);
    const book = await loadWorkbook(response);

    expect(book.worksheets[0].name).toBe("Summary");
    expect(book.worksheets[1].name).toBe("BOQ");

    // Summary label column localized.
    expect(cellText(book, 0, "A1")).toBe("Takeoff ID");
    // Status enum rendered through displayLabel, not the raw enum.
    const summaryText = book.worksheets[0].getSheetValues().join(" ");
    expect(summaryText).toContain("Review required");
    expect(summaryText).not.toContain("REVIEW_REQUIRED");

    // BOQ header localized.
    expect(cellText(book, 1, "A1")).toBe("Position");
    const boqText = book.worksheets[1].getSheetValues().join(" ");
    expect(boqText).toContain("Needs confirmation");
    expect(boqText).not.toContain("NEEDS_CONFIRMATION");
  });

  it("produces Arabic labels and localized status for an Arabic locale", async () => {
    mocks.locale = "ar";
    const response = await GET(new Request("https://voka.local/api/drawing-takeoffs/takeoff-1/xlsx"));
    expect(response.status).toBe(200);
    const book = await loadWorkbook(response);

    expect(book.worksheets[0].name).toBe("ملخص");
    expect(book.worksheets[1].name).toBe("جدول الكميات");

    expect(cellText(book, 0, "A1")).toBe("رقم الحصر");
    const summaryText = book.worksheets[0].getSheetValues().join(" ");
    expect(summaryText).toContain("بحاجة إلى مراجعة");
    expect(summaryText).not.toContain("Takeoff ID");
    expect(summaryText).not.toContain("REVIEW_REQUIRED");

    expect(cellText(book, 1, "A1")).toBe("الموضع");
    const boqText = book.worksheets[1].getSheetValues().join(" ");
    expect(boqText).not.toContain("Position");
    expect(boqText).not.toContain("NEEDS_CONFIRMATION");
  });

  it("keeps the RTL view flag aligned with the requested locale", async () => {
    mocks.locale = "ar";
    const response = await GET(new Request("https://voka.local/api/drawing-takeoffs/takeoff-1/xlsx"));
    const book = await loadWorkbook(response);
    expect(book.worksheets[0].views[0].rightToLeft).toBe(true);
  });
});
