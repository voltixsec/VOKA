import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { OcrPort, SourceArtifactInspectionPort, VisualInspectionPort } from "@/src/application/source-artifacts";
import { projectArtifactInspection, projectDxfInspection, projectIfcInspection, projectSpreadsheetInspection, renderInspectionBrief, unsupportedDrawingMessage, unsupportedIfcMessage, type ArtifactInspectionStatus } from "@/src/application/source-artifacts";
import type { ToolCitation, ToolObservation } from "@/src/application/conversation-runtime";
import { DXF_MIME_TYPES, IFC_MIME_TYPES, isStoredPdfPageModel, type ArtifactPage } from "@/src/domain/source-artifact";
import { LocalSourceArtifactStorage } from "./LocalSourceArtifactStorage";
import { parseBoqCandidates } from "./BoqCandidateParser";
import { extractPdfText } from "./PdfTextExtractor";
import { analyzePdfBytes } from "./DocumentInspectionAnalyzer";
import { analyzePdfBytesWithOcr, priorOcrFromStoredPages } from "./ocr/OcrDocumentAnalyzer";
import { createProductionOcrPort, resolveProductionOcrConfig } from "./ocr/createProductionOcrPort";
import { analyzeImageBytesWithVision } from "./vision/ImageInspectionAnalyzer";
import { createProductionVisionPort, resolveProductionVisionConfig } from "./vision/createProductionVisionPort";
import { analyzeDrawingPages, analyzeImageBytesAsDrawing, resolveDrawingVisionLimits, type DrawingVisionLimits, type DrawingPassSummary } from "./vision/DrawingInspectionAnalyzer";
import { analyzeDrawingGeometry, analyzeDrawingImageGeometry, toDrawingGeometryProjection, type DrawingGeometryResult } from "./DrawingGeometryAnalyzer";
import type { PageRasterizerPort } from "./ocr/PageRasterizer";
// Phase 2A-6: the workbook channel. ExcelJS stays inside the spreadsheet folder.
import { detectSpreadsheetFormat, SpreadsheetInspectionError } from "./spreadsheet/ExcelWorkbookInspector";
import { analyzeXlsxBytes } from "./spreadsheet/SpreadsheetInspectionAnalyzer";
// Phase 2A-7: the CAD channel. The group-code reader stays inside the dxf folder.
import { DxfInspectionError, analyzeDxfBytes, detectDxfFormat } from "./dxf";
// Phase 2A-8: the BIM channel. The STEP reader stays inside the ifc folder.
import { IfcInspectionError, analyzeIfcBytes, detectIfcFormat } from "./ifc";
// Phase 2A-9: proprietary originals and derivation lineage on the runtime path.
import { detectDwgOriginalFormat, detectRvtOriginalFormat } from "@/src/domain/source-artifact";
import { emptyProjectedDxf, emptyProjectedGeometry, emptyProjectedIfc, emptyProjectedProprietaryOriginal, emptyProjectedSpreadsheet, projectDerivationLineage, type ProjectedDerivationLineage } from "@/src/application/source-artifacts";

/**
 * Phase 2A-6: truthful, localized message for a workbook VOKA will not open.
 *
 * The reason comes from the format decision itself, so an unsupported format is
 * named for what it is instead of being reported as a generic failure.
 */
function unsupportedWorkbookMessage(decision: { format: string; reason: string }, locale: "ar" | "en"): string {
  const ar = locale === "ar";
  const detail = decision.reason;
  if (ar) return `لم أفتح هذا الملف كجدول بيانات: ${detail}`;
  return `I did not open this file as a workbook: ${detail}`;
}

const storage = new LocalSourceArtifactStorage();

function citationsFor(artifact: { id: string; originalFilename: string; citations: Array<Record<string, unknown>> }) {
  return artifact.citations.map((citation) => ({
    id: String(citation.id), sourceArtifactId: artifact.id, sourceType: String(citation.sourceType), title: String(citation.title),
    pageNumber: typeof citation.pageNumber === "number" ? citation.pageNumber : null,
    sheet: typeof citation.sheet === "string" ? citation.sheet : null, section: typeof citation.section === "string" ? citation.section : null,
    lineLocator: typeof citation.lineLocator === "string" ? citation.lineLocator : null,
    url: typeof citation.url === "string" ? citation.url : null, publisher: typeof citation.publisher === "string" ? citation.publisher : null,
    provenance: String(citation.provenance), verificationState: String(citation.verificationState),
    confidence: citation.confidence == null ? null : Number(citation.confidence), supportedClaimSummary: String(citation.supportedClaimSummary),
  })) satisfies ToolCitation[];
}

function evidence(citations: ToolCitation[]) {
  return citations.map((citation) => ({ title: citation.title, url: citation.url ?? `artifact://${citation.sourceArtifactId ?? "unknown"}`, publisher: citation.publisher ?? "VOKA source artifact" }));
}

export class PrismaSourceArtifactInspection implements SourceArtifactInspectionPort {
  /**
   * Phase 2A-2B: the OCR engine is injected, defaulting to the production
   * resolution (real engine when `VOKA_OCR_ENGINE` is configured, otherwise
   * native-only analysis). Pass an explicit engine in tests; pass null to
   * force the native-only path.
   */
  constructor(
    private readonly ocr: OcrPort | null = createProductionOcrPort(),
    /**
     * Phase 2A-3: the vision provider is injected, defaulting to the
     * production resolution (real provider when `VOKA_VISION_PROVIDER` is
     * configured, otherwise undescribed images). Pass an explicit provider in
     * tests; pass null to force the vision-unavailable path.
     */
    private readonly vision: VisualInspectionPort | null = createProductionVisionPort(),
    /**
     * Phase 2A-4 drawing pass wiring: operational limits and an injectable
     * rasterizer (tests fake the renderer; production lazily uses the real
     * 2A-2 pdf.js rasterizer at drawing-specific bounds). Nothing runs when
     * no page passes the drawing gate or no vision port is configured.
     */
    private readonly drawing: { limits?: Partial<DrawingVisionLimits>; rasterizer?: PageRasterizerPort | null } = {},
  ) {}

  private drawingLimits(): DrawingVisionLimits {
    return { ...resolveDrawingVisionLimits(), ...(this.drawing.limits ?? {}) };
  }
  async inspect(input: Parameters<SourceArtifactInspectionPort["inspect"]>[0]): Promise<ToolObservation> {
    const artifact = await prisma.sourceArtifact.findFirst({ where: { id: input.artifactId, companyId: input.companyId }, include: { citations: { orderBy: [{ pageNumber: "asc" }, { observedAt: "asc" }] } } });
    if (!artifact) return { kind: input.kind, status: "UNAVAILABLE", artifactId: input.artifactId, summary: "The source artifact was not found for the active company.", evidence: [], citations: [], createdAt: new Date().toISOString() };
    const citations = citationsFor(artifact);
    let bytes: Buffer;
    try {
      bytes = await storage.get(artifact.storageRef);
      if (createHash("sha256").update(bytes).digest("hex") !== artifact.contentSha256) throw new Error("SOURCE_ARTIFACT_HASH_MISMATCH");
    } catch {
      return { kind: input.kind, status: "UNAVAILABLE", artifactId: artifact.id, summary: "The source artifact record exists, but its retained bytes could not be verified.", evidence: evidence(citations), citations, createdAt: new Date().toISOString() };
    }
    if (artifact.kind === "IMAGE") {
      // Phase 2A-4: a standalone image explicitly requested as a drawing is
      // read by the drawing-specific bounded vision profile over the same
      // production port. Geometry, symbol counting, and takeoff remain out of
      // scope: the path produces bounded non-approved observations only.
      if (input.kind === "DRAWING_INSPECTION") {
        const drawing = await analyzeImageBytesAsDrawing(bytes, artifact.mimeType, this.vision, {
          artifactId: artifact.id,
          maxImageBytes: this.drawingLimits().maxImageBytes,
        });
        // Phase 2A-5: an image has no PDF page tree and no page box, so it can
        // only ever carry what the drawing-vision reading reported. No vector
        // geometry is invented for it.
        const imageGeometry = analyzeDrawingImageGeometry({ visionDrafts: drawing.pass.drafts });
        const drawingSummary = projectArtifactInspection({
          artifactId: artifact.id,
          filename: artifact.originalFilename,
          kind: "IMAGE",
          analysis: { ...drawing.analysis, geometry: toDrawingGeometryProjection(imageGeometry) },
          status: drawing.pass.used ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT",
          governedFacts: input.governedFacts,
        });
        const drawingObservation: ToolObservation = {
          kind: input.kind,
          status: drawingSummary.drawing.used ? "COMPLETED" : "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE",
          artifactId: artifact.id,
          summary: renderInspectionBrief(drawingSummary, input.locale ?? "en"),
          evidence: evidence(citations),
          citations,
          artifactInspection: drawingSummary,
          artifactCandidates: drawingSummary.candidates,
          createdAt: new Date().toISOString(),
        };
        return drawingObservation;
      }
      // Semantic image understanding runs through the same governed
      // projection. Visual observations never become requirement candidates:
      // there is no text to parse and no promotion path for vision output.
      const imageLocale = input.locale ?? "en";
      const image = await projectImage(bytes, artifact, input.governedFacts, this.vision);
      const imageInspection = image.summary;
      const imageSummary = renderInspectionBrief(imageInspection, imageLocale);
      if (!imageInspection.vision.used) {
        return { kind: input.kind, status: "STORED_PENDING_VISION", artifactId: artifact.id, summary: imageSummary, evidence: evidence(citations), citations, artifactInspection: imageInspection, artifactCandidates: imageInspection.candidates, createdAt: new Date().toISOString() };
      }
      return { kind: input.kind, status: "COMPLETED", artifactId: artifact.id, summary: imageSummary, evidence: evidence(citations), citations, artifactInspection: imageInspection, artifactCandidates: imageInspection.candidates, createdAt: new Date().toISOString() };
    }
    // Phase 2A-6: an .xlsx artifact takes the workbook channel. It returns
    // before the PDF/BOQ-text path on purpose: a workbook must never be
    // flattened into extracted text and pushed through the legacy BOQ line
    // regex, and that path is the only place requirements are created.
    if (artifact.kind === "XLSX" || isXlsxArtifact(artifact)) {
      return inspectSpreadsheetArtifact({ artifact, bytes, citations, input });
    }
    // Phase 2A-9: a proprietary ORIGINAL never reaches any semantic channel.
    // The bounded truthful answer names what the file is (with its version
    // signature when the bytes carry one) and the governed export path; it
    // returns before PDF, DXF, IFC, and BOQ requirement creation.
    if (artifact.kind === "DWG" || artifact.kind === "RVT") {
      return inspectProprietaryOriginalArtifact({ artifact, bytes, citations, input });
    }
    // Phase 2A-7: a .dxf artifact takes the CAD channel. It returns before the
    // PDF/BOQ-text path on purpose: a drawing must never be flattened into
    // extracted text and pushed through the legacy BOQ line regex, and that
    // path is the only place requirements are created. The format decision is
    // made from the bytes, so a DWG renamed to .dxf is rejected as a DWG.
    if (artifact.kind === "DXF" || isDxfArtifact(artifact)) {
      return inspectDxfArtifact({ artifact, bytes, citations, input, lineage: await derivationLineageFor(input.companyId, artifact.id) });
    }
    // Phase 2A-8: an .ifc artifact takes the BIM channel. It returns before the
    // PDF/BOQ-text path on purpose: a model must never be flattened into
    // extracted text and pushed through the legacy BOQ line regex, and that
    // path is the only place requirements are created. The format decision is
    // made from the bytes, so an RVT renamed to .ifc is rejected as Revit.
    if (artifact.kind === "IFC" || isIfcArtifact(artifact)) {
      return inspectIfcArtifact({ artifact, bytes, citations, input, lineage: await derivationLineageFor(input.companyId, artifact.id) });
    }
    // The brief language follows the runtime locale only; it is never inferred from the file contents.
    const briefLocale = input.locale ?? "en";
    // 2A-1C: run the accepted analysis layer (inspection -> classification -> observations)
    // so the assistant receives a bounded, governed projection instead of raw text.
    // A failure to analyze never becomes a claim that the file was analyzed.
    const projection = await projectPdf(bytes, artifact, input.governedFacts, this.ocr, {
      vision: this.vision,
      limits: this.drawingLimits(),
      rasterizer: this.drawing.rasterizer,
      intent: input.kind === "DRAWING_INSPECTION" ? "DRAWING_INSPECTION" : "ATTACHMENT",
    });
    let extractedText = artifact.extractedText?.trim() || projection.extractedText || "";
    if (!extractedText) {
      try { extractedText = extractPdfText(bytes).text.trim(); } catch { extractedText = ""; }
    }
    const artifactInspection = projection.summary;
    if (!extractedText || artifact.processingState === "FAILED") {
      return { kind: input.kind, status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "STORED_PENDING_VISION", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
    }
    // Phase 2A-4: on the drawing path, an explicit DRAWING_INSPECTION is
    // COMPLETED only when the drawing reading actually produced governed
    // observations; otherwise the accepted "not available" boundary stays and
    // the brief says plainly why (gate refusal, unconfigured provider, or an
    // attempted pass with no usable output). No drawing observations and no
    // requirement candidates are ever created from the drawing channel here.
    if (input.kind === "DRAWING_INSPECTION") return { kind: input.kind, status: artifactInspection.drawing.used ? "COMPLETED" : "DRAWING_VISUAL_ANALYSIS_NOT_AVAILABLE", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, extractedText, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
    const candidates = input.kind === "BOQ_INSPECTION" ? parseBoqCandidates(extractedText, artifact.id, citations) : [];
    if (candidates.length && input.runtimeId) {
      for (const candidate of candidates) {
        const stableKey = `runtime:${input.runtimeId}:${candidate.stableKey}`;
        const requirement = await prisma.requirement.upsert({
          where: { companyId_stableKey: { companyId: input.companyId, stableKey } },
          create: { companyId: input.companyId, stableKey, sourceContext: "SALES_ASSISTANT", description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", reviewState: "NEEDS_REVIEW", provenance: "SOURCE_ARTIFACT_TEXT", correctionTrace: { sourceArtifactId: artifact.id } },
          update: { description: candidate.description, quantity: candidate.quantity, unit: candidate.unit, technicalRequirement: candidate.technicalRequirement, quantityStatus: "EXTRACTED_REVIEW_REQUIRED", provenance: "SOURCE_ARTIFACT_TEXT" },
          select: { id: true },
        });
        if (candidate.citationId) await prisma.requirementCitation.upsert({ where: { requirementId_citationId: { requirementId: requirement.id, citationId: candidate.citationId } }, create: { requirementId: requirement.id, citationId: candidate.citationId, claimSummary: candidate.description }, update: { claimSummary: candidate.description } });
      }
    }
    return { kind: input.kind, status: "COMPLETED", artifactId: artifact.id, summary: renderInspectionBrief(artifactInspection, briefLocale), evidence: evidence(citations), citations, extractedText, requirementCandidates: candidates, artifactInspection, artifactCandidates: artifactInspection.candidates, createdAt: new Date().toISOString() };
  }
}

/**
 * Runs the 2A-1B analyzer and projects it for the assistant. Analysis is best
 * effort: when it cannot run, the projection says the content was not inspected
 * rather than implying otherwise.
 *
 * Phase 2A-2B: when an OCR engine is available the OCR-augmented analyzer
 * runs instead, reusing persisted OCR results from ingest (the artifact bytes
 * were hash-verified above, so reuse is sound) and calling the engine only
 * for pages without one. A null engine keeps the native-only analysis.
 */
async function projectPdf(
  bytes: Buffer,
  artifact: { id: string; originalFilename: string; extractedPages?: unknown },
  governedFacts: Parameters<SourceArtifactInspectionPort["inspect"]>[0]["governedFacts"],
  ocr: OcrPort | null,
  drawing: { vision: VisualInspectionPort | null; limits: DrawingVisionLimits; rasterizer?: PageRasterizerPort | null; intent: "DRAWING_INSPECTION" | "ATTACHMENT" },
): Promise<{ summary: ReturnType<typeof projectArtifactInspection>; extractedText: string; pass: DrawingPassSummary | null; geometry: DrawingGeometryResult | null }> {
  try {
    const storedPages: ArtifactPage[] | undefined = isStoredPdfPageModel(artifact.extractedPages) ? artifact.extractedPages.pages : undefined;
    const analyzed = ocr
      ? await analyzePdfBytesWithOcr(bytes, ocr, {
        artifactId: artifact.id,
        priorOcr: priorOcrFromStoredPages(storedPages),
        maxOcrPages: resolveProductionOcrConfig().maxPages,
      })
      : analyzePdfBytes(bytes);
    // Phase 2A-4: gated drawing semantic pass over the SAME analysis the text
    // channels produced. It never re-reads bytes for text (no OCR here), only
    // rasterizes pages the conservative gate qualified.
    const drawingPass = await analyzeDrawingPages(analyzed, {
      artifactId: artifact.id,
      pdfBytes: bytes,
      vision: drawing.vision,
      intent: drawing.intent,
      limits: drawing.limits,
      rasterizer: drawing.rasterizer,
    });
    // Phase 2A-5: bounded page-space geometry over the SAME qualified pages and
    // the SAME provider reading. It only ever runs on pages the accepted 2A-4
    // gate already qualified, so vector content can never qualify a page by
    // itself, and it never measures, counts, or takes anything off.
    const geometryPass = analyzeDrawingGeometry(analyzed, {
      artifactId: artifact.id,
      pdfBytes: bytes,
      intent: drawing.intent,
      limits: drawing.limits,
      visionDrafts: drawingPass.pass.drafts,
    });
    const hasText = analyzed.inspection.text.trim().length > 0;
    const status: ArtifactInspectionStatus = analyzed.inspection.document.encrypted ? "ENCRYPTED" : hasText ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT";
    const summary = projectArtifactInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      kind: "PDF",
      analysis: { ...drawingPass.analysis, geometry: toDrawingGeometryProjection(geometryPass) },
      status,
      governedFacts,
    });
    return { summary, extractedText: analyzed.inspection.text.trim(), pass: drawingPass.pass, geometry: geometryPass };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return {
      summary: projectArtifactInspection({ artifactId: artifact.id, filename: artifact.originalFilename, kind: "PDF", analysis: null, status: "UNAVAILABLE", failure: `the PDF could not be analyzed safely (${reason})` }),
      extractedText: "",
      pass: null,
      geometry: null,
    };
  }
}

/**
 * Runs the 2A-3 image analyzer and projects it for the assistant. Analysis is
 * best effort: when it cannot run, the projection says the image was not
 * described rather than implying otherwise.
 */
async function projectImage(bytes: Buffer, artifact: { id: string; originalFilename: string; mimeType: string }, governedFacts: Parameters<SourceArtifactInspectionPort["inspect"]>[0]["governedFacts"], vision: VisualInspectionPort | null) {
  try {
    const analysis = await analyzeImageBytesWithVision(bytes, artifact.mimeType, vision, {
      artifactId: artifact.id,
      maxImageBytes: resolveProductionVisionConfig().maxImageBytes,
    });
    const used = analysis.observations.some((observation) => observation.visualOrigin);
    const status: ArtifactInspectionStatus = used ? "INSPECTED" : "INSPECTED_NO_MACHINE_READABLE_TEXT";
    return { summary: projectArtifactInspection({ artifactId: artifact.id, filename: artifact.originalFilename, kind: "IMAGE", analysis, status, governedFacts }) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    return {
      summary: projectArtifactInspection({ artifactId: artifact.id, filename: artifact.originalFilename, kind: "IMAGE", analysis: null, status: "UNAVAILABLE", failure: `the image could not be analyzed safely (${reason})` }),
    };
  }
}

/**
 * True when the stored record could be a workbook even if its kind predates
 * the XLSX enum value: the MIME type and the file name are corroborating
 * evidence, and the byte-level format decision is what actually decides.
 */
function isXlsxArtifact(artifact: { kind: string; mimeType: string; originalFilename: string }): boolean {
  if (artifact.kind === "XLSX") return true;
  if (artifact.mimeType.toLowerCase() === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return true;
  return /\.xlsx$/iu.test(artifact.originalFilename.trim());
}

/**
 * Phase 2A-6: the governed workbook inspection path.
 *
 * It is deliberately self-contained: format detection, structural analysis, and
 * bounded projection happen here, and the method returns without ever reaching
 * the requirement-creation code below. XLSX evidence cannot create a
 * Requirement, a QuotationLine, a BOM, or any procurement object, and there is
 * no promotion path from a line candidate into governed state.
 */
async function inspectSpreadsheetArtifact(context: {
  artifact: { id: string; originalFilename: string; mimeType: string; processingState: string };
  bytes: Buffer;
  citations: ToolCitation[];
  input: Parameters<SourceArtifactInspectionPort["inspect"]>[0];
}): Promise<ToolObservation> {
  const { artifact, bytes, citations, input } = context;
  const locale = input.locale ?? "en";
  const decision = detectSpreadsheetFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
  if (!decision.supported) {
    // An unsupported workbook is still a truthful answer: VOKA says what it
    // found and that it did not read the file, rather than implying otherwise.
    const summary = projectSpreadsheetInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: decision.reason,
    });
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: unsupportedWorkbookMessage(decision, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  let analysis;
  try {
    analysis = await analyzeXlsxBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType });
  } catch (error) {
    const reason = error instanceof SpreadsheetInspectionError || error instanceof Error ? error.message : "unknown";
    const summary = projectSpreadsheetInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: `the workbook could not be inspected safely (${reason})`,
    });
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: renderInspectionBrief(summary, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  const summary = projectSpreadsheetInspection({ artifactId: artifact.id, filename: artifact.originalFilename, analysis });
  return {
    kind: input.kind,
    status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "COMPLETED",
    artifactId: artifact.id,
    summary: renderInspectionBrief(summary, locale),
    evidence: evidence(citations),
    citations,
    // Never populated for a workbook: observed structured line candidates are
    // not requirement candidates, and only an explicit user confirmation
    // creates governed state.
    requirementCandidates: [],
    artifactInspection: summary,
    artifactCandidates: [],
    createdAt: new Date().toISOString(),
  };
}

/** Phase 2A-9: attaches bounded derivation lineage onto an inspection summary. */
function attachLineage<T extends { derivationLineage: ProjectedDerivationLineage | null }>(summary: T, lineage: ProjectedDerivationLineage | null): T {
  summary.derivationLineage = lineage;
  return summary;
}

/**
 * Phase 2A-9: bounded lineage for a DERIVED artifact.
 *
 * Loads the most recent succeeded derivation in which this artifact is the
 * derived result, plus the original artifact's filename, and projects both
 * into the bounded lineage record. Provider internals are never loaded here:
 * only the lineage fields the projection allows.
 *
 * Lineage is AUGMENTATION around the accepted evidence channel, so a lineage
 * lookup problem (including a database that has not received the 2A-9
 * migration yet) degrades to "no lineage shown" and never blocks the
 * inspection itself.
 */
async function derivationLineageFor(companyId: string, artifactId: string): Promise<ProjectedDerivationLineage | null> {
  try {
    const derivation = await prisma.artifactDerivation.findFirst({
      where: { companyId, derivedArtifactId: artifactId, status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    });
    if (!derivation) return null;
    const original = await prisma.sourceArtifact.findFirst({ where: { id: derivation.originalArtifactId, companyId }, select: { originalFilename: true } });
    return projectDerivationLineage({ derivation, originalFilename: original?.originalFilename ?? derivation.sourceHash });
  } catch {
    return null;
  }
}

/**
 * Phase 2A-9: the governed proprietary-original channel.
 *
 * A DWG or RVT original is stored bytes, not parsed content. This path reads
 * only the format/version signature it already accepted at ingest, states it,
 * and returns truthful bounded guidance — before any PDF, DXF, IFC, or BOQ
 * requirement path. No citation, observation, candidate, or requirement is
 * ever produced from a proprietary original here.
 */
function inspectProprietaryOriginalArtifact(context: {
  artifact: { id: string; originalFilename: string; mimeType: string; kind: string; processingState: string };
  bytes: Buffer;
  citations: ToolCitation[];
  input: Parameters<SourceArtifactInspectionPort["inspect"]>[0];
}): ToolObservation {
  const { artifact, bytes, citations, input } = context;
  const locale = input.locale ?? "en";
  const kind = artifact.kind === "RVT" ? "RVT" : "DWG";
  const limitations: string[] = [];
  let versionCode: string | null = null;
  let versionLabel: string | null = null;
  let verified = true;
  if (kind === "DWG") {
    const decision = detectDwgOriginalFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
    versionCode = decision.versionCode;
    versionLabel = decision.versionLabel;
    if (!decision.isDwg) limitations.push(`the retained bytes no longer carry a recognized DWG version signature (${decision.reason})`);
  } else {
    const decision = detectRvtOriginalFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
    verified = decision.decision === "RVT";
    if (!verified) limitations.push(`the retained bytes could not be corroborated as a Revit project (${decision.reason})`);
  }
  limitations.push("VOKA does not parse proprietary CAD/BIM originals; the retained bytes are kept immutable for lineage only");
  const summary = {
    artifactId: artifact.id,
    filename: artifact.originalFilename,
    kind: kind as "DWG" | "RVT",
    status: "UNAVAILABLE" as ArtifactInspectionStatus,
    pageCount: null,
    classification: null,
    pageClassifications: [],
    observations: [],
    observationCount: 0,
    candidates: [],
    conflicts: [],
    limitations: limitations.slice(0, 8),
    excerpt: null,
    excerptTruncated: false,
    governance: [
      "a proprietary original is retained bytes only: it is never semantically inspected, and its derived artifact carries the evidence",
      "observed values are not approved, verified, or selected",
    ],
    ocr: { attempted: false, used: false, pages: [], engines: [], lowConfidence: false },
    vision: { attempted: false, used: false, providers: [], lowConfidence: false },
    drawing: { attempted: false, used: false, pages: [], providers: [], lowConfidence: false, outcome: null },
    geometry: emptyProjectedGeometry(),
    spreadsheet: emptyProjectedSpreadsheet(),
    dxf: emptyProjectedDxf(),
    ifc: emptyProjectedIfc(),
    proprietaryOriginal: { attempted: false, used: false as const, format: kind as "DWG" | "RVT", versionCode, versionLabel, verified, limitations: limitations.slice(0, 8) },
    derivationLineage: null,
  };
  return {
    kind: input.kind,
    status: "UNAVAILABLE",
    artifactId: artifact.id,
    summary: renderInspectionBrief(summary, locale),
    evidence: evidence(citations),
    citations,
    // Never populated for a proprietary original: no semantic parsing ran, so
    // there is nothing to promote and nothing to review.
    requirementCandidates: [],
    artifactInspection: summary,
    artifactCandidates: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Phase 2A-7: true when the stored record could be a drawing even if its kind
 * predates the DXF enum value: the MIME type and the file name are
 * corroborating evidence, and the byte-level format decision is what actually
 * decides. A DWG that was renamed to .dxf is caught here and named for what it
 * is, rather than being parsed as text.
 */
function isDxfArtifact(artifact: { kind: string; mimeType: string; originalFilename: string }): boolean {
  if (artifact.kind === "DXF") return true;
  if (DXF_MIME_TYPES.includes(artifact.mimeType.toLowerCase())) return true;
  return /\.dxf$/iu.test(artifact.originalFilename.trim());
}

/**
 * Phase 2A-7: the governed CAD inspection path.
 *
 * It is deliberately self-contained: format detection, structural analysis, and
 * bounded projection happen here, and the method returns without ever reaching
 * the requirement-creation code below. DXF evidence cannot create a
 * Requirement, a QuotationLine, a BOM, a ProductSelection, or any procurement
 * object, and there is no promotion path from a semantic candidate into
 * governed state.
 */
async function inspectDxfArtifact(context: {
  artifact: { id: string; originalFilename: string; mimeType: string; processingState: string };
  bytes: Buffer;
  citations: ToolCitation[];
  input: Parameters<SourceArtifactInspectionPort["inspect"]>[0];
  /** Phase 2A-9: bounded derivation lineage when this drawing was derived from a proprietary original. */
  lineage: ProjectedDerivationLineage | null;
}): Promise<ToolObservation> {
  // Phase 2A-9: lineage is attached in every branch so a derived drawing stays
  // traceable to its original even when its own inspection fails.
  const { artifact, bytes, citations, input, lineage } = context;
  const locale = input.locale ?? "en";
  const decision = detectDxfFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
  if (!decision.supported) {
    // An unsupported drawing is still a truthful answer: VOKA says what it
    // found and that it did not read the file, rather than implying otherwise.
    // A DWG is named as a DWG, never quietly treated as a DXF.
    const summary = attachLineage(projectDxfInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: decision.reason,
    }), lineage);
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: unsupportedDrawingMessage(decision, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  let analysis;
  try {
    analysis = analyzeDxfBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType });
  } catch (error) {
    const reason = error instanceof DxfInspectionError || error instanceof Error ? error.message : "unknown";
    const summary = attachLineage(projectDxfInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: `the drawing could not be inspected safely (${reason})`,
    }), lineage);
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: renderInspectionBrief(summary, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  const summary = attachLineage(projectDxfInspection({ artifactId: artifact.id, filename: artifact.originalFilename, analysis }), lineage);
  return {
    kind: input.kind,
    status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "COMPLETED",
    artifactId: artifact.id,
    summary: renderInspectionBrief(summary, locale),
    evidence: evidence(citations),
    citations,
    // Never populated for a drawing: semantic candidates are observed readings,
    // not requirement candidates, and only an explicit user confirmation
    // creates governed state.
    requirementCandidates: [],
    artifactInspection: summary,
    artifactCandidates: [],
    createdAt: new Date().toISOString(),
  };
}

/**
 * Phase 2A-8: true when the stored record could be an IFC model even if its
 * kind predates the IFC enum value: the MIME type and the file name are
 * corroborating evidence, and the byte-level format decision is what actually
 * decides. An RVT that was renamed to .ifc is caught here and named for what
 * it is, rather than being parsed as STEP.
 *
 * A file named .dxf is never claimed as IFC here: DXF routing already ran.
 */
function isIfcArtifact(artifact: { kind: string; mimeType: string; originalFilename: string }): boolean {
  if (artifact.kind === "IFC") return true;
  if (IFC_MIME_TYPES.includes(artifact.mimeType.toLowerCase())) return true;
  return /\.ifc$/iu.test(artifact.originalFilename.trim());
}

/**
 * Phase 2A-8: the governed BIM inspection path.
 *
 * It is deliberately self-contained: format detection, structural analysis, and
 * bounded projection happen here, and the method returns without ever reaching
 * the requirement-creation code below. IFC evidence cannot create a
 * Requirement, a QuotationLine, a BOM, a ProductSelection, or any procurement
 * object, and there is no promotion path from a semantic candidate into
 * governed state.
 */
async function inspectIfcArtifact(context: {
  artifact: { id: string; originalFilename: string; mimeType: string; processingState: string };
  bytes: Buffer;
  citations: ToolCitation[];
  input: Parameters<SourceArtifactInspectionPort["inspect"]>[0];
  /** Phase 2A-9: bounded derivation lineage when this model was derived from a proprietary original. */
  lineage: ProjectedDerivationLineage | null;
}): Promise<ToolObservation> {
  // Phase 2A-9: lineage is attached in every branch so a derived model stays
  // traceable to its original even when its own inspection fails.
  const { artifact, bytes, citations, input, lineage } = context;
  const locale = input.locale ?? "en";
  const decision = detectIfcFormat({ bytes, filename: artifact.originalFilename, mimeType: artifact.mimeType });
  if (!decision.supported) {
    const summary = attachLineage(projectIfcInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: decision.reason,
    }), lineage);
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: unsupportedIfcMessage(decision, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  let analysis;
  try {
    analysis = analyzeIfcBytes(bytes, { filename: artifact.originalFilename, mimeType: artifact.mimeType });
  } catch (error) {
    const reason = error instanceof IfcInspectionError || error instanceof Error ? error.message : "unknown";
    const summary = attachLineage(projectIfcInspection({
      artifactId: artifact.id,
      filename: artifact.originalFilename,
      analysis: null,
      status: "UNAVAILABLE",
      failure: `the IFC model could not be inspected safely (${reason})`,
    }), lineage);
    return {
      kind: input.kind,
      status: "UNAVAILABLE",
      artifactId: artifact.id,
      summary: renderInspectionBrief(summary, locale),
      evidence: evidence(citations),
      citations,
      artifactInspection: summary,
      artifactCandidates: [],
      createdAt: new Date().toISOString(),
    };
  }
  const summary = attachLineage(projectIfcInspection({ artifactId: artifact.id, filename: artifact.originalFilename, analysis }), lineage);
  return {
    kind: input.kind,
    status: artifact.processingState === "FAILED" ? "UNAVAILABLE" : "COMPLETED",
    artifactId: artifact.id,
    summary: renderInspectionBrief(summary, locale),
    evidence: evidence(citations),
    citations,
    // Never populated for a model: semantic candidates are observed readings,
    // not requirement candidates, and only an explicit user confirmation
    // creates governed state.
    requirementCandidates: [],
    artifactInspection: summary,
    artifactCandidates: [],
    createdAt: new Date().toISOString(),
  };
}

export { storage };
