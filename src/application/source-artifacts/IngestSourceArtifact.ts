import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { SourceArtifactPolicyError, validateSourceArtifactBytes, validateSourceArtifactInput, type StoredDxfModel, type StoredIfcModel, type StoredPdfPageModel, type StoredSpreadsheetModel } from "@/src/domain/source-artifact";
import { inspectPdfBytes } from "@/src/infrastructure/source-artifacts/PdfTextExtractor";
// Phase 2A-6: the workbook inspector owns bytes; ingest only orchestrates it.
import { analyzeXlsxBytes, flattenWorkbookText } from "@/src/infrastructure/source-artifacts/spreadsheet";
// Phase 2A-7: the CAD inspector owns bytes; ingest only orchestrates it.
import { analyzeDxfBytes, dxfCitationEntries, flattenDxfText } from "@/src/infrastructure/source-artifacts/dxf";
// Phase 2A-8: the BIM inspector owns bytes; ingest only orchestrates it.
import { analyzeIfcBytes, flattenIfcText, ifcCitationEntries } from "@/src/infrastructure/source-artifacts/ifc";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";
import { analyzePdfInspectionWithOcr } from "@/src/infrastructure/source-artifacts/ocr/OcrDocumentAnalyzer";
import { createProductionOcrPort, resolveProductionOcrConfig } from "@/src/infrastructure/source-artifacts/ocr/createProductionOcrPort";
import type { OcrPort } from "./ports";

const storage = new LocalSourceArtifactStorage();

/**
 * Phase 2A-9: the uploaded-file entry point is now a thin wrapper.
 *
 * It resolves the declared type/kind/context from the `File` exactly as
 * before (MIME type first, extension as corroborating evidence for generic
 * types, bytes as the real decision) and hands the bytes to the common
 * internal ingestion primitive, which is also the entry point for derived
 * conversion output. Upload behavior, hash behavior, and every existing
 * format path are unchanged.
 */
export async function ingestSourceArtifact(input: { companyId: string; userId: string; file: File; context: unknown; conversationRuntimeId?: string | null; ocr?: OcrPort | null }) {
  const policy = validateSourceArtifactInput(input.file, input.context);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  return ingestSourceArtifactBytes({
    companyId: input.companyId,
    userId: input.userId,
    bytes,
    filename: input.file.name,
    mimeType: policy.mimeType,
    kind: policy.kind,
    context: policy.context,
    conversationRuntimeId: input.conversationRuntimeId,
    ocr: input.ocr,
  });
}

/**
 * Phase 2A-9: the common internal raw-bytes ingestion primitive.
 *
 * Every artifact — user upload or derived conversion output — enters through
 * here, so derived DXF/IFC files pass exactly the same byte gates, inspection
 * pipelines, citation rules, and idempotency as uploaded ones. There is no
 * second DXF/IFC ingestion implementation.
 */
export async function ingestSourceArtifactBytes(input: { companyId: string; userId: string; bytes: Buffer; filename: string; mimeType: string; kind: import("@/src/domain/source-artifact").SourceArtifactKind; context: import("@/src/domain/source-artifact").SourceArtifactContext; conversationRuntimeId?: string | null; ocr?: OcrPort | null }) {
  const policy = { filename: input.filename, mimeType: input.mimeType, kind: input.kind, context: input.context };
  validateSourceArtifactBytes(policy.kind, input.bytes);
  const bytes = input.bytes;
  const contentSha256 = createHash("sha256").update(bytes).digest("hex");
  const existing = await prisma.sourceArtifact.findFirst({ where: { companyId: input.companyId, contentSha256, originalFilename: policy.filename }, include: { citations: { orderBy: { pageNumber: "asc" } } } });
  if (existing) return { artifact: existing, idempotent: true };
  const stored = await storage.put(bytes, contentSha256);
  let extractedText: string | null = null;
  let extractedPages: StoredPdfPageModel | null = null;
  let extractedWorkbook: StoredSpreadsheetModel | null = null;
  let extractedDrawing: StoredDxfModel | null = null;
  let extractedIfc: StoredIfcModel | null = null;
  let processingState: "TEXT_EXTRACTED" | "STORED_PENDING_VISION" | "RECEIVED" = "STORED_PENDING_VISION";
  let processingError: string | null = null;
  /** Phase 2A-6: one citation per worksheet, carrying sheet and range locators instead of a page number. */
  let spreadsheetCitations: Array<{ sheet: string; usedRange: string; claim: string }> = [];
  /** Phase 2A-7: one citation per significant layer or block, carrying a CAD locator instead of a page number. */
  let dxfCitations: Array<{ locator: string; claim: string }> = [];
  /** Phase 2A-8: one citation per significant STEP locator instead of a page number. */
  let ifcCitations: Array<{ locator: string; claim: string }> = [];
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
        const analysis = await analyzeXlsxBytes(bytes, { filename: policy.filename, mimeType: policy.mimeType });
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
    // Phase 2A-7: an ASCII DXF drawing is inspected by the governed CAD
    // pipeline at ingest so later inspections reuse the result, exactly as the
    // PDF and workbook paths reuse their persisted models. The analysis
    // produces observed evidence only: no requirement, quotation line, BOM,
    // product selection, or procurement record is created here or anywhere
    // downstream of it. A drawing that is really a DWG fails here truthfully,
    // because the format decision comes from the bytes rather than the name.
    if (policy.kind === "DXF") {
      try {
        const analysis = analyzeDxfBytes(bytes, { filename: policy.filename, mimeType: policy.mimeType });
        extractedText = flattenDxfText(analysis.inspection);
        extractedDrawing = toStoredDxfModel(analysis);
        processingState = extractedText ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
        const limitations = [...new Set(analysis.limitations)];
        processingError = limitations.length ? limitations.join(" | ").slice(0, 2_000) : null;
        dxfCitations = dxfCitationEntries(analysis.inspection);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_DXF_UNREADABLE", `The drawing was received but its content could not be read safely: ${reason}`);
      }
    }
    // Phase 2A-8: a textual IFC STEP model is inspected by the governed BIM
    // pipeline at ingest so later inspections reuse the result. The analysis
    // produces observed evidence only: no requirement, quotation line, BOM,
    // product selection, or procurement record is created here or anywhere
    // downstream of it. A file that is really an RVT, DWG, or IFCZIP fails
    // here truthfully, because the format decision comes from the bytes rather
    // than the name.
    if (policy.kind === "IFC") {
      try {
        const analysis = analyzeIfcBytes(bytes, { filename: policy.filename, mimeType: policy.mimeType });
        extractedText = flattenIfcText(analysis.inspection);
        extractedIfc = toStoredIfcModel(analysis);
        processingState = extractedText ? "TEXT_EXTRACTED" : "STORED_PENDING_VISION";
        const limitations = [...new Set(analysis.limitations)];
        processingError = limitations.length ? limitations.join(" | ").slice(0, 2_000) : null;
        ifcCitations = ifcCitationEntries(analysis.inspection);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown";
        throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_IFC_UNREADABLE", `The IFC model was received but its content could not be read safely: ${reason}`);
      }
    }
    // Phase 2A-9: a proprietary DWG/RVT ORIGINAL is stored, never parsed.
    //
    // The bytes already passed their structural gate above (a recognized DWG
    // release signature, or an OLE2 compound signature corroborated by the
    // Revit BasicFileInfo marker). Nothing else happens to them here: no text
    // extraction, no CAD/BIM semantic analysis, no citation, and no page
    // model. The original stays byte-immutable and independently addressable;
    // intelligence enters the picture only through an explicit
    // ArtifactDerivation to a separately stored DXF/IFC artifact.
    if (policy.kind === "DWG" || policy.kind === "RVT") {
      processingState = "RECEIVED";
    }
    // One citation per page that carries visible machine-readable text. The page locator is set only
    // when the page tree proved attribution; otherwise it stays null. Invisible-layer text is not cited.
    const citedPages = (extractedPages?.pages ?? []).filter((page) => page.text.trim());
    const pageAttributionReliable = extractedPages?.document.pageAttributionReliable ?? false;
    const artifact = await prisma.sourceArtifact.create({
      data: {
        companyId: input.companyId, originalFilename: policy.filename, mimeType: policy.mimeType, sizeBytes: bytes.byteLength,
        contentSha256, kind: policy.kind, storageRef: stored.storageRef, context: policy.context,
        conversationRuntimeId: input.conversationRuntimeId ?? null, processingState, processingError, extractedText,
        extractedPages: extractedPages ? (JSON.parse(JSON.stringify(extractedPages)) as object) : extractedWorkbook ? (JSON.parse(JSON.stringify(extractedWorkbook)) as object) : extractedDrawing ? (JSON.parse(JSON.stringify(extractedDrawing)) as object) : extractedIfc ? (JSON.parse(JSON.stringify(extractedIfc)) as object) : undefined, createdByUserId: input.userId,
        citations: citedPages.length ? { create: citedPages.map((page) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_TEXT", title: policy.filename,
          pageNumber: pageAttributionReliable && typeof page.pageNumber === "number" ? page.pageNumber : null,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: page.text.slice(0, 500),
        })) } : spreadsheetCitations.length ? { create: spreadsheetCitations.map((entry) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_SPREADSHEET", title: policy.filename,
          // A worksheet has no page: the locator is the sheet and its used range.
          pageNumber: null, sheet: entry.sheet, lineLocator: entry.usedRange || null,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: entry.claim.slice(0, 500),
        })) } : dxfCitations.length ? { create: dxfCitations.map((entry) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_DXF", title: policy.filename,
          // A drawing has no page: the locator is the CAD locator, carried in
          // `lineLocator` alongside the section so it stays exact and traceable.
          pageNumber: null, lineLocator: entry.locator,
          provenance: "FILE_CONTENT", verificationState: "RECEIVED_NOT_USER_VERIFIED", confidence: null,
          supportedClaimSummary: entry.claim.slice(0, 500),
        })) } : ifcCitations.length ? { create: ifcCitations.map((entry) => ({
          companyId: input.companyId, sourceType: "SOURCE_ARTIFACT_IFC", title: policy.filename,
          // A model has no page: the locator is the STEP locator, carried in
          // `lineLocator` so it stays exact and traceable.
          pageNumber: null, lineLocator: entry.locator,
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

/** Bounded persisted shape for a drawing inspection. Version 4 so the PDF page model (2) and workbook model (3) stay untouched. */
function toStoredDxfModel(analysis: import("@/src/domain/source-artifact").DxfAnalysis): StoredDxfModel {
  const inspection = analysis.inspection;
  return {
    version: 4,
    kind: "DXF",
    versionCode: inspection.document.version.code,
    versionLabel: inspection.document.version.label,
    unitsCode: inspection.document.units.code,
    unitsName: inspection.document.units.name,
    layerCount: inspection.layers.length,
    blockCount: inspection.blocks.length,
    entityCount: inspection.entityCount,
    insertCount: inspection.inserts.length,
    textCount: inspection.texts.length,
    dimensionCount: inspection.dimensions.length,
    externalReferenceCount: inspection.externalReferences.length,
    modelSpaceEntityCount: inspection.spaces.MODEL_SPACE.entityCount,
    paperSpaceEntityCount: inspection.spaces.PAPER_SPACE.entityCount,
    truncated: inspection.truncated,
    limitations: analysis.limitations,
  };
}

/** Bounded persisted shape for an IFC inspection. Version 5 so the PDF page model (2), workbook model (3), and DXF model (4) stay untouched. */
function toStoredIfcModel(analysis: import("@/src/domain/source-artifact").IfcAnalysis): StoredIfcModel {
  const inspection = analysis.inspection;
  return {
    version: 5,
    kind: "IFC",
    schema: inspection.document.schema.declared,
    schemaFamily: inspection.document.schema.family,
    projectName: inspection.project?.name ?? null,
    siteCount: inspection.sites.length,
    buildingCount: inspection.buildings.length,
    storeyCount: inspection.storeys.length,
    spaceCount: inspection.spaces.length,
    elementCount: inspection.elements.length,
    systemCount: inspection.systems.length,
    truncated: inspection.truncated,
    limitations: analysis.limitations,
  };
}

export { SourceArtifactPolicyError };
