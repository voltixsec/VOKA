import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput, type StoredPdfPageModel, type StoredSpreadsheetModel } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
// Phase 2A-6: the workbook inspector owns bytes; ingest only orchestrates it.
import { analyzeXlsxBytes, flattenWorkbookText } from "@/src/infrastructure/source-artifacts/spreadsheet";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";
import { analyzePdfInspectionWithOcr } from "@/src/infrastructure/source-artifacts/ocr/OcrDocumentAnalyzer";
import { createProductionOcrPort, resolveProductionOcrConfig } from "@/src/infrastructure/source-artifacts/ocr/createProductionOcrPort";
import type { OcrPort } from "./ports";

const storage = new LocalSourceArtifactStorage();

export async function ingestSourceArtifact(input: { companyId: string; userId: string; file: File; context: unknown; conversationRuntimeId?: string | null; ocr?: OcrPort | null }) {
  const policy = validateSourceArtifactInput(input.file, input.context);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  validateSourceArtifactBytes(policy.kind, bytes);
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.sourceArtifact.findFirst({ where: { companyId: input.companyId, contentSha256, originalFilename: input.file.name }, include: { citations: { orderBy: { pageNumber: "asc" } } } });
  if (existing) return { artifact: existing, idempotent: true };
  const stored = await storage.put(bytes, contentSha256);
  let extractedText: string | null = null;
  let extractedPages: StoredPdfPageModel | null = null;
  let extractedWorkbook: StoredSpreadsheetModel | null = null;
  let processingState: "TEXT_EXTRACTED" | "STORED_PENDING_VISION" = "STORED_PENDING_VISION";
  let processingError: string | null = null;
  /** Phase 2A-6: one citation per worksheet, carrying sheet and range locators instead of a page number. */
  let spreadsheetCitations: Array<{ sheet: string; usedRange: string; claim: string }> = [];
  try {
    if (policy.kind === "PDF") {
      try {
        const inspection = inspectPdfBytes(bytes);
        // Phase 2A-2B: run gated OCR once at ingest and persist the augmented
        // pages, so later inspections reuse the result instead of re-running
        // recognition. No engine configured (or explicit null) keeps the
        // native-only behavior; any OCR failure falls back to native rather
        // than failing the upload.
        const ocr = input.ocr === undefined ? createProductionOcrPort() : input.ocr;
        let pages = inspection.pages;
        let text = inspection.text;
        if (ocr) {
          try {
            const augmented = await analyzePdfInspectionWithOcr(inspection, ocr, {
              artifactId: `pending:${contentSha256}`,
              pdfBytes: bytes,
              maxOcrPages: resolveProductionOcrConfig().maxPages,
            });
            pages = augmented.inspection.pages;
            text = augmented.inspection.text;
          } catch {
            pages = inspection.pages;
            text = inspection.text;
          }
        }
        extractedText = text;
        extractedPages = { version: 2, document: inspection.document, pages };
        processingState = text.trim() ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
        // Extraction limitations are source truth too: keep them with the artifact, never silently drop them.
        const limitations = [...new Set([...inspection.document.limitations, ...pages.flatMap((page) => page.limitations ?? [])])];
        processingError = limitations.length ? limitations.join(" | ").slice(0, 2_000) : null;
      } catch {
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_PDF_UNREADABLE", "The PDF was received but its content could not be read safely.");
      }
    }
    // Phase 2A-6: an .xlsx workbook is inspected by the governed spreadsheet
    // pipeline at ingest so later inspections reuse the result, exactly as the
    // PDF path reuses persisted pages. The analysis produces observed evidence
    // only: no requirement, quotation line, or procurement record is created
    // here or anywhere downstream of it.
    if (policy.kind === "XLSX") {
      try {
        const analysis = await analyzeXlsxBytes(bytes, { filename: input.file.name, mimeType: policy.mimeType });
        extractedText = flattenWorkbookText(analysis.workbook);
        extractedWorkbook = toStoredSpreadsheetModel(analysis);
        processingState = extractedText ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
        const limitations = [...new Set(analysis.limitations)];
        processingError = limitations.length ? limitations.join(" | ").slice(0, 2_000) : null;
        spreadsheetCitations = analysis.workbook.worksheets
          .filter((sheet) => sheet.cells.length > 0)
          .map((sheet) => ({
            sheet: sheet.sheetName,
            usedRange: sheet.usedRange ?? "",
            claim: sheet.regions[0]?.cellRef ?? `${sheet.sheetName}!${sheet.usedRange ?? ""}`,
          }));
      } catch {
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_XLSX_UNREADABLE", "The workbook was received but its content could not be read safely.");
      }
    }
    // One citation per page that carries visible machine-readable text. The page locator is set only
    // when the page tree proved attribution; otherwise it stays null. Invisible-layer text is not cited.
    const citedPages = (extractedPages?.pages ?? []).filter((page) => page.text.trim());
    const pageAttributionReliable = extractedPages?.document.pageAttributionReliable ?? false;
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: input.file.name, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState, processingError, extractedText,
        extractedPages: extractedPages ? (JSON.parse(JSON.stringify(extractedPages)) as object) : extractedWorkbook ? (JSON.parse(JSON.stringify(extractedWorkbook)) as object) : undefined, createdByUserId: input.userId,
        citations: citedPages.length ? { create: citedPages.map((page) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: input.file.name,
          pageNumber: pageAttributionReliable && typeof page.pageNumber === "number" ? page.pageNumber : null,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: page.text.slice(0, 500),
        })) } : spreadsheetCitations.length ? { create: spreadsheetCitations.map((entry) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_SPREADSHEET", title: input.file.name,
          // A worksheet has no page: the locator is the sheet and its used range.
          pageNumber: null, sheet: entry.sheet, lineLocator: entry.usedRange || null,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: entry.claim.slice(0, 500),
        })) } : undefined,
      },
      include: { citations: { orderBy: { pageNumber: "asc" } } },
    });
    return { artifact, idempotent: false };
  } catch (error) {
    // Keep immutable bytes: another tenant/request may already reference this hash.
    // Orphan cleanup requires a separate reference-aware maintenance operation.
    if (error instanceof SourceArtifactPolicyError) throw error;
    throw error;
  }
}

/** Bounded persisted shape for a workbook inspection. Version 3 so the PDF page model (version 2) stays untouched. */
function toStoredSpreadsheetModel(analysis: import("@/src/domain/source-artifact").SpreadsheetAnalysis): StoredSpreadsheetModel {
  return {
    version: 3,
    kind: "XLSX",
    sheetCount: analysis.workbook.sheetCount,
    visibleSheetCount: analysis.workbook.visibleSheetCount,
    hiddenSheetCount: analysis.workbook.hiddenSheetCount,
    limitations: analysis.limitations,
    sheets: analysis.workbook.worksheets.map((sheet) => ({
      name: sheet.sheetName,
      index: sheet.sheetIndex,
      visibility: sheet.visibility,
      usedRange: sheet.usedRange,
      regionCount: sheet.regions.length,
      cellCount: sheet.cellCount,
      hiddenRowCount: sheet.hiddenRowCount,
      hiddenColumnCount: sheet.hiddenColumnCount,
    })),
  };
}

export { SourceArtifactPolicyError };
