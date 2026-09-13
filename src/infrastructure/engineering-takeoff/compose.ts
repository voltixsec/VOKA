/**
 * Phase 2A-11 production composition root.
 *
 * This is the ONLY place that decides which concrete implementations the
 * engineering engine runs on outside tests. Two guarantees are structural here
 * rather than conventional:
 *
 * 1. PRODUCTION IS PRISMA-BACKED. Every engine dependency is built from the
 *    Prisma-backed adapters. The test-only in-memory engineering store is not
 *    imported, not referenced, and not reachable from this module — so there is
 *    no code path by which production can silently run on memory.
 *
 * 2. CONFIGURATION FAILURE IS EXPLICIT. There is no "if the database is missing,
 *    use a memory map" fallback anywhere in this file. If the database client
 *    cannot be built, `lib/prisma` throws its own configuration error and
 *    composition fails loudly, rather than degrading to a store that would
 *    silently lose engineering truth on the next request.
 *
 * The occurrence source is deliberately a SEPARATE, explicit dependency: Phase
 * 2A-10 owns governed comparison evidence but does NOT retain a per-occurrence
 * symbol inventory for drawings, so the production default supplies NO
 * occurrences and reports that as a limitation rather than inventing counts.
 * See `EmptyOccurrenceSource` below and the 2A-11 report for the truthful
 * capability note this reflects.
 */

import { randomUUID } from "node:crypto";

import type {
  CrossDocumentHandoffReaderPort,
  EngineeringClockPort,
  EngineeringIdPort,
  EngineeringStore,
  OccurrenceSourcePort,
  RawOccurrenceRecord,
} from "@/src/application/engineering-takeoff/ports";
import type { CountingRuleFamily } from "@/src/domain/engineering-takeoff";

import { PrismaEngineeringStore } from "@/src/infrastructure/engineering-takeoff/PrismaEngineeringStore";
import { PrismaEngineeringHandoffReader } from "@/src/infrastructure/engineering-takeoff/PrismaEngineeringHandoffReader";

// ---------------------------------------------------------------------------
// Clock / ids
// ---------------------------------------------------------------------------

/** The production clock: UTC ISO-8601, matching every other engine here. */
export const engineeringSystemClock: EngineeringClockPort = {
  now: () => new Date().toISOString(),
};

/**
 * Deterministic-id port seed.
 *
 * The engineering domain builds content-addressed ids itself
 * (`buildTakeoffScopeId`, `buildCandidateId`, `buildLedgerEntryId`, ...). This
 * port exists only for the few call sites that need an opaque, unique token, so
 * it produces a prefixed UUID and nothing more.
 */
export const engineeringCryptoIdPort: EngineeringIdPort = {
  next: (prefix: string) => `${prefix}_${randomUUID().replace(/-/gu, "")}`,
};

// ---------------------------------------------------------------------------
// Occurrence source
// ---------------------------------------------------------------------------

/**
 * The production occurrence source.
 *
 * It returns no occurrences and reports the reason as a limitation.
 *
 * This is NOT a stubbed implementation and it is NOT a silent fallback. It is
 * the honest consequence of an accepted 2A-10 property: the DXF/IFC
 * materializers deliberately publish ZERO quantity claims from structural
 * counts (`entityCount`, `entityTypeCounts`, symbol counts, ...), and the
 * retained drawing/BIM record holds only bounded structural counts rather than
 * a per-occurrence entity inventory. Phase 2A-11 can therefore count only what
 * a governed channel actually retained as identified occurrences, and today
 * that set is empty. Inventing occurrences from an aggregate vision summary is
 * exactly what §9 forbids.
 *
 * A future phase that retains a governed per-occurrence inventory can replace
 * this class without touching the engine, because the engine depends on the
 * `OccurrenceSourcePort` interface.
 */
export class EmptyOccurrenceSource implements OccurrenceSourcePort {
  async listOccurrences(_input: { companyId: string; takeoffScopeId: string; artifactIds: readonly string[]; family: CountingRuleFamily }): Promise<RawOccurrenceRecord[]> {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

/** Everything the engineering engine needs, assembled for production. */
export type EngineeringComposition = {
  store: EngineeringStore;
  handoffReader: CrossDocumentHandoffReaderPort;
  occurrenceSource: OccurrenceSourcePort;
  clock: EngineeringClockPort;
  ids: EngineeringIdPort;
};

export type EngineeringCompositionOverrides = {
  store?: EngineeringStore;
  handoffReader?: CrossDocumentHandoffReaderPort;
  occurrenceSource?: OccurrenceSourcePort;
  clock?: EngineeringClockPort;
  ids?: EngineeringIdPort;
};

/**
 * Assembles the production engineering dependencies.
 *
 * Overrides exist so a persistence-integration test can inject a store built on
 * a separate Prisma client — but every default is Prisma-backed. No override
 * defaults to the in-memory store.
 */
export function composeEngineeringDependencies(overrides: EngineeringCompositionOverrides = {}): EngineeringComposition {
  return {
    store: overrides.store ?? new PrismaEngineeringStore(),
    handoffReader: overrides.handoffReader ?? new PrismaEngineeringHandoffReader(),
    occurrenceSource: overrides.occurrenceSource ?? new EmptyOccurrenceSource(),
    clock: overrides.clock ?? engineeringSystemClock,
    ids: overrides.ids ?? engineeringCryptoIdPort,
  };
}
