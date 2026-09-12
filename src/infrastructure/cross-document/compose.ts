/**
 * Phase 2A-10 composition root.
 *
 * The engine is assembled from explicit ports. The materialization service reads
 * only retained, hash-verified bytes and calls the accepted analyzers directly;
 * the assistant inspection path (the only path that can create a Requirement) is
 * deliberately absent from this composition.
 */

import { randomUUID } from "node:crypto";
import type { ClockPort, IdPort } from "@/src/application/cross-document/ports";
import type { ComparisonDependencies } from "@/src/application/cross-document/ComparisonRunService";
import { createAcceptedArtifactAnalyzer, type AcceptedAnalyzerConfig } from "./AcceptedArtifactAnalyzer";
import { LocalEvidenceMaterialization } from "./LocalEvidenceMaterialization";
import { PrismaCrossDocumentStore } from "./PrismaCrossDocumentStore";
import { PrismaDerivationReader } from "./PrismaDerivationReader";
import { PrismaSourceArtifactReader } from "./PrismaSourceArtifactReader";

export const systemClock: ClockPort = {
  now: () => new Date().toISOString(),
};

export const cryptoIdPort: IdPort = {
  next: (prefix: string) => `${prefix}_${randomUUID().replace(/-/gu, "")}`,
};

export type CrossDocumentCompositionConfig = AcceptedAnalyzerConfig;

/** Assembles the production dependencies. Analyzer providers stay explicit. */
export function composeCrossDocumentDependencies(config: CrossDocumentCompositionConfig = {}): ComparisonDependencies {
  const artifacts = new PrismaSourceArtifactReader();
  return {
    store: new PrismaCrossDocumentStore(),
    artifacts,
    derivations: new PrismaDerivationReader(),
    materialization: new LocalEvidenceMaterialization({
      artifacts,
      analyzer: createAcceptedArtifactAnalyzer(config),
    }),
    clock: systemClock,
    ids: cryptoIdPort,
  };
}
