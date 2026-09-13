/**
 * Phase 2A-11 → production reader over the ACCEPTED Phase 2A-10 handoff.
 *
 * This is the production implementation of `CrossDocumentHandoffReaderPort`. It
 * does NOT re-parse anything and it does NOT re-implement 2A-10: it delegates to
 * the accepted `buildCrossDocumentHandoff` over the production
 * `PrismaCrossDocumentStore`, then projects the governance view through the
 * domain bridge. Phase 2A-11 therefore consumes exactly the accepted contract,
 * and a change to 2A-10's handoff cannot drift away from what engineering reads.
 *
 * Two rules are load-bearing:
 *
 * - the read is company-scoped. `companyId` is always passed through to 2A-10,
 *   so a cross-tenant scope id resolves to `null` rather than leaking a bundle.
 * - the port returns `CrossDocumentHandoffLike`, which 2A-11 declares
 *   structurally. The accepted bundle is wider; accepting it here is a widening
 *   at the seam, never a copy of 2A-10 internals.
 */

import { buildCrossDocumentHandoff } from "@/src/application/cross-document/CrossDocumentHandoff";
import { PrismaCrossDocumentStore } from "@/src/infrastructure/cross-document/PrismaCrossDocumentStore";
import { buildEngineeringGovernanceView } from "@/src/domain/engineering-takeoff";
import type { CrossDocumentHandoffLike, EngineeringGovernanceView } from "@/src/domain/engineering-takeoff";

import type { CrossDocumentHandoffReaderPort } from "@/src/application/engineering-takeoff/ports";

export class PrismaEngineeringHandoffReader implements CrossDocumentHandoffReaderPort {
  private readonly store: PrismaCrossDocumentStore;

  constructor(store: PrismaCrossDocumentStore = new PrismaCrossDocumentStore()) {
    this.store = store;
  }

  async loadHandoff(input: { companyId: string; comparisonScopeId: string; comparisonRunId?: string | null }): Promise<CrossDocumentHandoffLike | null> {
    const bundle = await buildCrossDocumentHandoff({
      companyId: input.companyId,
      comparisonScopeId: input.comparisonScopeId,
      store: this.store,
    });
    if (!bundle) return null;
    // The accepted bundle IS the contract; 2A-11 declares a structural view of it.
    return bundle as unknown as CrossDocumentHandoffLike;
  }

  async loadGovernanceView(input: { companyId: string; comparisonScopeId: string; comparisonRunId?: string | null }): Promise<EngineeringGovernanceView | null> {
    const handoff = await this.loadHandoff(input);
    if (!handoff) return null;
    return buildEngineeringGovernanceView(handoff);
  }
}
