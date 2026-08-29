import { describe, expect, it, vi } from 'vitest';
import { AISalesAssistantService } from '../../ai-sales-assistant';
import { customerMatchScore } from '@/features/customers/domain/customer-discovery';
import { applyCanonicalIntelligence, ConversationalDraftEngine } from '../ConversationalDraftEngine';
import { bindDraftCustomer } from '../bind-customer';

function service(names: string[] = [], mention: string | null = 'شركة الأفق') {
  const customers = names.map((name, i) => ({ id: `c${i}`, name, code: `C${i}`, status: 'ACTIVE' }));
  const findAll = vi.fn().mockImplementation(async ({ search }) => customers.filter((customer) => customerMatchScore(customer, search)));
  const brain = new AISalesAssistantService({
    companies: { findById: vi.fn().mockResolvedValue({ defaultCurrency: 'KWD' }) }, customers: { findAll },
    catalogItems: { findAll: vi.fn().mockResolvedValue([]) }, units: { findById: vi.fn(), findBySymbol: vi.fn() },
    quotationReferences: { resolveTaxRatePercentages: vi.fn().mockResolvedValue(new Map()) },
    pricing: { resolvePriceListId: vi.fn().mockResolvedValue(null), resolveUnitPrice: vi.fn() },
  } as any, { extractIntent: vi.fn().mockResolvedValue({ customerMention: mention, lines: [] }) });
  return { brain, findAll };
}
const prompt = 'عايز أعمل عرض سعر توريد وتركيب 36 كاميرا مراقبة شركة الأفق';
const initial = (operation: 'QUOTATION' | 'INVOICE' | 'CONTRACT' = 'QUOTATION') => new ConversationalDraftEngine().advance({ reply: prompt, replySource: 'VOICE', locale: 'ar', operation });

describe('proposed customer review boundary', () => {
  it('preserves a clean name without inventing an ID; optional data does not block quotation review', async () => {
    const { brain } = service();
    const proposal = await brain.generateDraftProposal({ companyId: 'tenant', prompt, sourceLocale: 'ar' });
    const draft = applyCanonicalIntelligence(initial(), proposal);
    expect(draft).toMatchObject({ customerState: 'CUSTOMER_PROPOSED_UNREGISTERED', proposedCustomerName: 'شركة الأفق', status: 'READY_FOR_REVIEW', executed: false, requiresHumanReview: true });
    expect(draft.fields.customerId).toBeNull();
    expect(draft.missingRequired).toEqual([]);
    expect(draft.recommended.some((field) => field.key === 'paymentTerms')).toBe(true);
    expect(draft.canonicalProposal?.smartSystem?.status).toBe('COMPLETE');
    for (const operation of ['INVOICE', 'CONTRACT'] as const) {
      const documentDraft = applyCanonicalIntelligence(initial(operation), proposal);
      expect(documentDraft.missingRequired.map((field) => field.key)).not.toContain('customer');
      expect(documentDraft).toMatchObject({ proposedCustomerName: 'شركة الأفق', customerState: 'CUSTOMER_PROPOSED_UNREGISTERED' });
    }
    const noName = applyCanonicalIntelligence(initial(), { ...proposal, customer: { ...proposal.customer, mention: null, proposedCustomerName: null } });
    expect(noName.customerState).toBe('CUSTOMER_MISSING');
    expect(noName.missingRequired.map((field) => field.key)).toContain('customer');
  });
  it('binds explicit creation to the same canonical draft without losing lines, attachment or provenance', async () => {
    const { brain } = service();
    const proposal = await brain.generateDraftProposal({ companyId: 'tenant', prompt, sourceLocale: 'ar' });
    const draft = applyCanonicalIntelligence({ ...initial(), attachment: { name: 'scope.pdf', type: 'application/pdf', size: 100 } }, proposal);
    const bound = bindDraftCustomer(draft, { id: 'created', name: 'شركة الأفق' });
    expect(bound.id).toBe(draft.id);
    expect(bound.fields.customerId).toBe('created');
    expect(bound.customerState).toBe('CUSTOMER_RESOLVED');
    expect(bound.proposedCustomerName).toBeNull();
    expect(bound.canonicalProposal?.lines).toBe(draft.canonicalProposal?.lines);
    expect(bound.canonicalProposal?.proposal).toBe(draft.canonicalProposal?.proposal);
    expect(bound.attachment).toBe(draft.attachment);
    expect(bound.contextText).toBe(draft.contextText);
    expect(bound.selection?.customer?.id).toBe('created');
    expect(bound.executed).toBe(false);
  });
  it('offers all four national customers and never auto-selects a partial match', async () => {
    const names = ['شركة الوطنية لصناعة السكر', 'الوطنية للغاز', 'الشركة الوطنية للتركيب', 'الوطنية للمقاولات'];
    const { brain, findAll } = service(names, 'الوطنية');
    const proposal = await brain.generateDraftProposal({ companyId: 'tenant', prompt, sourceLocale: 'ar' });
    expect(proposal.customer.candidates.map((c) => c.name)).toEqual(names);
    expect(proposal.customer.id).toBeNull();
    expect(applyCanonicalIntelligence(initial(), proposal).customerState).toBe('CUSTOMER_AMBIGUOUS');
    expect(findAll.mock.calls.every(([filter]) => filter.companyId === 'tenant')).toBe(true);
    const single = service(['شركة الأفق للتجهيزات ومقاولات المباني'], 'شركة الافق');
    const partial = await single.brain.generateDraftProposal({ companyId: 'tenant', prompt });
    expect(partial.customer).toMatchObject({ id: null, status: 'AMBIGUOUS' });
    expect(partial.customer.candidates).toHaveLength(1);
  });
  it('auto-resolves only a unique normalized exact identity, including legal bilingual names and codes', async () => {
    const { brain } = service(['شركة الأفق'], 'شركة الافق');
    expect((await brain.generateDraftProposal({ companyId: 'tenant', prompt })).customer).toMatchObject({ id: 'c0', status: 'MATCHED' });
    const ambiguous = service(['شركة الأفق', 'شركة الأفق للتجارة'], 'شركة الافق');
    expect((await ambiguous.brain.generateDraftProposal({ companyId: 'tenant', prompt })).customer.status).toBe('AMBIGUOUS');
  });
});
