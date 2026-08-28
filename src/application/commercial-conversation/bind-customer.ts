import type { WorkingCommercialDraft } from './types';
import { applyCanonicalIntelligence } from './ConversationalDraftEngine';

/** Bind the explicit customer action without regenerating or replacing any commercial line. */
export function bindDraftCustomer(draft: WorkingCommercialDraft, customer: { id: string; name: string }): WorkingCommercialDraft {
  if (!draft.canonicalProposal) return draft;
  const next = applyCanonicalIntelligence(draft, {
    ...draft.canonicalProposal,
    customer: { ...draft.canonicalProposal.customer, id: customer.id, name: customer.name, mention: customer.name,
      status: 'MATCHED', candidates: [], proposedCustomerName: null, reviewRequired: false },
  });
  return { ...next, selection: { ...draft.selection, customer: { id: customer.id, name: customer.name } } };
}
