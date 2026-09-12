import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  MAX_DERIVATION_FIDELITY_LIMITATIONS,
  MAX_DERIVATION_WARNINGS,
  SourceArtifactPolicyError,
  automatedDerivationKey,
  canonicalOptionsFingerprint,
  derivationFidelityLimitations,
  derivationKindForOriginalKind,
  derivedFormatForKind,
  isTerminalDerivationStatus,
  sourceFormatForKind,
  type ArtifactDerivationKind,
  type ArtifactDerivationStatus,
  type DerivationOptions,
} from "@/src/domain/source-artifact";
import { detectDxfFormat } from "@/src/infrastructure/source-artifacts/dxf";
import { detectIfcFormat } from "@/src/infrastructure/source-artifacts/ifc";
import { LocalSourceArtifactStorage } from "@/src/infrastructure/source-artifacts/LocalSourceArtifactStorage";
import { createProductionConversionProvider } from "@/src/infrastructure/source-artifacts/conversion/createProductionConversionProvider";
import { unavailableConversionProvider } from "@/src/infrastructure/source-artifacts/conversion/UnavailableConversionProvider";
import { DEFAULT_CONVERSION_LIMITS, type ConversionLimits, type ConversionProvider } from "./ports";
import { ingestSourceArtifactBytes } from "./IngestSourceArtifact";

/**
 * Phase 2A-9: governed automated derivation orchestration.
 *
 * original → deterministic key → existing successful result? reuse
 *          → provider available? run → output re-validated by the ACCEPTED
 *          format detectors → ingest through the COMMON bytes primitive →
 *          lineage SUCCEEDED. Provider unavailable → NOT_CONFIGURED. Provider
 *          failure → FAILED. Invalid output → REJECTED. Terminal derivations
 *          are never retried and never overwritten.
 *
 * This phase ships no real converter: the production factory resolves an
 * explicit unavailable provider, so the recorded outcome is truthfully
 * NOT_CONFIGURED. The seam is proven with deterministic test providers only.
 */

const storage = new LocalSourceArtifactStorage();

/** Canonical MIME types used when storing a derived artifact. */
const DERIVED_MIME_TYPE = { DXF: "image/vnd.dxf", IFC: "application/x-step" } as const;

export type DeriveSourceArtifactOutcome = {
  derivationKey: string;
  status: ArtifactDerivationStatus;
  reused: boolean;
  derivedArtifactId: string | null;
  failureReason: string | null;
  warnings: string[];
};

function boundWarnings(warnings: string[], max: number): string[] {
  return [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))].slice(0, max);
}

/** Re-validates provider output through the accepted format detectors. A converter is never trusted. */
function validateDerivedOutput(kind: ArtifactDerivationKind, bytes: Buffer, filename: string): { ok: true } | { ok: false; reason: string } {
  if (bytes.length === 0) return { ok: false, reason: "the conversion produced no output bytes" };
  if (bytes.length > DEFAULT_CONVERSION_LIMITS.maxOutputBytes) {
    return { ok: false, reason: `the conversion output is ${(bytes.length / (1024 * 1024)).toFixed(1)} MB, above the ${(DEFAULT_CONVERSION_LIMITS.maxOutputBytes / (1024 * 1024))} MB derived-output limit` };
  }
  if (kind === "DWG_TO_DXF") {
    const decision = detectDxfFormat({ bytes, filename });
    if (!decision.supported || decision.format !== "ASCII_DXF") {
      return { ok: false, reason: `the conversion output was not accepted as an ASCII DXF drawing: ${decision.reason}` };
    }
    return { ok: true };
  }
  const decision = detectIfcFormat({ bytes, filename });
  if (!decision.supported || decision.format !== "IFC_SPF") {
    return { ok: false, reason: `the conversion output was not accepted as a textual IFC STEP model: ${decision.reason}` };
  }
  return { ok: true };
}

/**
 * Runs (or reuses) one governed automated derivation for a proprietary
 * original artifact.
 *
 * `provider` is injectable for tests; when omitted the production factory
 * resolves the runtime configuration. Passing explicit `null` forces the
 * unavailable provider. No caller can reach the deterministic test double
 * through production wiring.
 */
export async function deriveSourceArtifact(input: {
  companyId: string;
  userId: string;
  originalArtifactId: string;
  options?: DerivationOptions | null;
  provider?: ConversionProvider | null;
  limits?: Partial<ConversionLimits>;
}): Promise<DeriveSourceArtifactOutcome> {
  const options = input.options ?? {};
  const original = await prisma.sourceArtifact.findFirst({ where: { id: input.originalArtifactId, companyId: input.companyId } });
  if (!original) throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_NOT_FOUND", "The original artifact was not found for the active company.");
  if (original.kind !== "DWG" && original.kind !== "RVT") {
    throw new SourceArtifactPolicyError("DERIVATION_ORIGINAL_KIND_UNSUPPORTED", "Only a DWG drawing or an RVT model can be used as a derivation original.");
  }
  const derivationKind = derivationKindForOriginalKind(original.kind);

  // The original bytes are immutable and hash-verified before any provider sees them.
  let bytes: Buffer;
  try {
    bytes = await storage.get(original.storageRef);
    if (createHash("sha256").update(bytes).digest("hex") !== original.contentSha256) throw new Error("hash mismatch");
  } catch {
    throw new SourceArtifactPolicyError("SOURCE_ARTIFACT_BYTES_UNAVAILABLE", "The original artifact's retained bytes could not be verified, so nothing was derived.");
  }

  const converter = input.provider === undefined ? createProductionConversionProvider() : input.provider ?? unavailableConversionProvider("no conversion provider was provided");
  const converterId = converter.providerId;
  const converterVersion = converter.converterVersion;
  const optionsFingerprint = canonicalOptionsFingerprint(options);
  const derivationKey = automatedDerivationKey({ derivationKind, sourceHash: original.contentSha256, converterId, converterVersion, options });

  const existing = await prisma.artifactDerivation.findUnique({ where: { companyId_derivationKey: { companyId: input.companyId, derivationKey } } });
  if (existing) {
    // Idempotency: a terminal derivation is final history and is never
    // retried or rewritten; an in-flight one is never duplicated.
    if (isTerminalDerivationStatus(existing.status)) {
      return { derivationKey, status: existing.status, reused: true, derivedArtifactId: existing.derivedArtifactId, failureReason: existing.failureReason, warnings: existing.warnings };
    }
    return { derivationKey, status: existing.status, reused: true, derivedArtifactId: existing.derivedArtifactId, failureReason: existing.failureReason, warnings: existing.warnings };
  }

  const limits: ConversionLimits = { ...DEFAULT_CONVERSION_LIMITS, ...(input.limits ?? {}) };
  const record = async (status: ArtifactDerivationStatus, failureReason: string | null, warnings: string[], derivedArtifactId: string | null, derivedHash: string | null) => {
    const derivation = await prisma.artifactDerivation.upsert({
      where: { companyId_derivationKey: { companyId: input.companyId, derivationKey } },
      create: {
        companyId: input.companyId,
        originalArtifactId: original.id,
        derivedArtifactId,
        derivationKind,
        derivationMethod: "AUTOMATED_CONVERSION",
        converterId,
        converterVersion,
        optionsFingerprint,
        sourceFormat: sourceFormatForKind(derivationKind),
        derivedFormat: derivedFormatForKind(derivationKind),
        sourceHash: original.contentSha256,
        derivedHash,
        status,
        failureReason,
        warnings: boundWarnings(warnings, limits.maxWarnings),
        fidelityLimitations: derivationFidelityLimitations(derivationKind).slice(0, MAX_DERIVATION_FIDELITY_LIMITATIONS).slice(0, limits.maxFidelityLimitations),
        derivationKey,
        completedAt: status === "SUCCEEDED" || status === "FAILED" || status === "REJECTED" ? new Date() : null,
      },
      update: {
        status,
        failureReason,
        derivedArtifactId,
        derivedHash,
        warnings: boundWarnings(warnings, limits.maxWarnings),
        completedAt: status === "SUCCEEDED" || status === "FAILED" || status === "REJECTED" ? new Date() : null,
      },
    });
    return derivation;
  };

  // A provider that cannot serve this kind is a configuration failure, not a conversion failure.
  if (!converter.supportedDerivationKinds.includes(derivationKind)) {
    await record("NOT_CONFIGURED", `the configured conversion provider does not support ${derivationKind}`, [], null, null);
    return { derivationKey, status: "NOT_CONFIGURED", reused: false, derivedArtifactId: null, failureReason: `the configured conversion provider does not support ${derivationKind}`, warnings: [] };
  }

  let result;
  try {
    // The wall-clock limit is enforced through the request's cancellation
    // signal, so a future provider is bounded by the same contract the tests
    // see. No subprocess, shell, or network is involved in this phase.
    result = await converter.convert({
      derivationKind,
      sourceBytes: new Uint8Array(bytes),
      sourceHash: original.contentSha256,
      targetFormat: derivedFormatForKind(derivationKind),
      options,
      limits,
      signal: AbortSignal.timeout(limits.wallClockMs),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "the conversion provider failed unexpectedly";
    await record("FAILED", reason.slice(0, 2_000), [], null, null);
    return { derivationKey, status: "FAILED", reused: false, derivedArtifactId: null, failureReason: reason.slice(0, 2_000), warnings: [] };
  }

  if (result.status === "UNAVAILABLE") {
    const reason = result.reason || "the conversion provider is not available";
    await record("NOT_CONFIGURED", reason, result.warnings, null, null);
    return { derivationKey, status: "NOT_CONFIGURED", reused: false, derivedArtifactId: null, failureReason: reason, warnings: boundWarnings(result.warnings, limits.maxWarnings) };
  }
  if (result.status === "FAILED") {
    const reason = result.reason || "the conversion failed";
    await record("FAILED", reason.slice(0, 2_000), result.warnings, null, null);
    return { derivationKey, status: "FAILED", reused: false, derivedArtifactId: null, failureReason: reason.slice(0, 2_000), warnings: boundWarnings(result.warnings, limits.maxWarnings) };
  }

  // Output re-validation: only a derived file the accepted detectors accept is ingested.
  const derivedKind = derivedFormatForKind(derivationKind);
  const baseName = original.originalFilename.replace(/\.[A-Za-z0-9]{1,8}$/u, "") || "original";
  const derivedFilename = `${baseName}.${derivedKind.toLowerCase()}`;
  const outputBytes = Buffer.from(result.outputBytes);
  const validation = validateDerivedOutput(derivationKind, outputBytes, derivedFilename);
  if (!validation.ok) {
    await record("REJECTED", validation.reason, result.warnings, null, null);
    return { derivationKey, status: "REJECTED", reused: false, derivedArtifactId: null, failureReason: validation.reason, warnings: boundWarnings(result.warnings, limits.maxWarnings) };
  }

  // The derived artifact enters through the COMMON ingestion primitive: same
  // byte gates, same inspection, same citation rules, same idempotency. If the
  // lineage write below fails, the derived artifact remains a valid standalone
  // artifact — never a dangling lineage pointer.
  const ingested = await ingestSourceArtifactBytes({
    companyId: input.companyId,
    userId: input.userId,
    bytes: outputBytes,
    filename: derivedFilename,
    mimeType: DERIVED_MIME_TYPE[derivedKind],
    kind: derivedKind,
    context: original.context,
    conversationRuntimeId: original.conversationRuntimeId,
    ocr: null,
  });

  await record("SUCCEEDED", null, result.warnings, ingested.artifact.id, createHash("sha256").update(outputBytes).digest("hex"));
  return { derivationKey, status: "SUCCEEDED", reused: false, derivedArtifactId: ingested.artifact.id, failureReason: null, warnings: boundWarnings(result.warnings, limits.maxWarnings) };
}
