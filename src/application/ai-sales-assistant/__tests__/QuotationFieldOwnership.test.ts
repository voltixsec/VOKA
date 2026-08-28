import { describe, expect, it } from 'vitest';
import { parseValidityDuration, readCommercialClauses, resolveExpiry } from '../services/commercial-field-values';
import { customerLocaleText } from '../services/quotation-customer-text';
import { AISalesAssistantExtractor } from '../services/AISalesAssistantExtractor';
import { quotationFieldFixture, quotationPrompt, nationalCustomer } from './quotation-field-fixture';
import { ESTIMATE_NOTICE_AR, ESTIMATE_NOTICE_EN } from '../estimate-notice';

describe('quotation validity normalization', () => {
  it.each(['15 يوم', '١٥ يوم', '۱۵ يوم', 'خمستاشر يوم', 'خمسة عشر يوم', 'خمسة عشر يوماً', '15 days'])('%s is exactly 15 days', (value) => {
    expect(parseValidityDuration(value)).toEqual({ value: 15, unit: 'DAY' });
    expect(resolveExpiry(value, '2026-08-28')).toBe('2026-09-12');
  });
  it.each([['30 يوم', '2026-09-27'], ['أسبوعين', '2026-09-11'], ['شهر', '2026-09-28']])('normalizes %s', (value, expiry) => {
    expect(resolveExpiry(value, '2026-08-28')).toBe(expiry);
    expect(readCommercialClauses(`صلاحية العرض: ${value}`, '2026-08-28').expiryDate).toBe(expiry);
  });
  it('uses clamped calendar months, not fabricated day counts', () => {
    expect(parseValidityDuration('شهر')).toEqual({ value: 1, unit: 'MONTH' });
    expect(resolveExpiry('شهر', '2026-01-31')).toBe('2026-02-28');
    expect(resolveExpiry('شهر', '2028-01-31')).toBe('2028-02-29');
  });
  it.each(['15 أو 30 يوم', 'حوالي شهر', 'شهر تقريباً', '2026-09-01 أو 2026-10-01', 'نعم', '0 يوم'])('does not guess %s', (value) => {
    expect(resolveExpiry(value, '2026-08-28')).toBeNull();
  });
});

describe('professional customer-facing quotation ownership', () => {
  it.each(['ar', 'en'] as const)('generates %s subject/brief only from actual scope, keeping diagnostics internal', async (locale) => {
    const { service } = quotationFieldFixture({ locale });
    const proposal = await service.generateDraftProposal({ companyId: 'tenant', prompt: quotationPrompt, sourceLocale: locale });
    expect(proposal.proposal.subject).toBe(locale === 'ar' ? 'عرض سعر – توريد وتركيب نظام مراقبة بالكاميرات – 123 كاميرا' : 'Quotation – Supply and installation CCTV surveillance system – 123 cameras');
    expect(proposal.proposal.brief).toContain('123');
    const customerText = [proposal.proposal.subject, proposal.proposal.brief, proposal.notes, proposal.termsAndConditions].filter(Boolean).join('\n');
    expect(customerText).not.toMatch(/اعمل|fabricated|invented|AI_ESTIMATED|337|formula|confidence|تقريبية|افتراض/i);
    expect(customerText).not.toContain(nationalCustomer);
    expect(proposal.notes).toBeNull();
    expect(proposal.termsAndConditions).toContain(locale === 'ar' ? 'الأعمال المدنية غير مشمولة.' : 'Civil works excluded.');
    expect(proposal.termsAndConditions).toContain('50%');
    if (locale === 'ar') expect(customerText.replace(/CCTV|NVR|PoE/g, '')).not.toMatch(/[a-z]/i);
    else expect(customerText).not.toMatch(/[\u0600-\u06ff]/);
    expect(proposal.smartSystem?.status).toBe('COMPLETE');
    expect(proposal.smartSystem?.requirements?.some((line) => line.formulaExplanation)).toBe(true);
    expect(proposal.estimateNotice).toBe(true);
    expect(proposal.lines.find((line) => line.commercializationPending)?.unitPrice).toBeNull();
  });
  it('accepts explicit user notes and payment, never leftover provider brief/notes', async () => {
    const { service } = quotationFieldFixture();
    const proposal = await service.generateDraftProposal({ companyId: 'tenant', prompt: `${quotationPrompt}\nملاحظة: التسليم عند البوابة الرئيسية\nشروط الدفع: 25% مقدم`, sourceLocale: 'ar' });
    expect(proposal.notes).toBe('التسليم عند البوابة الرئيسية');
    expect(proposal.termsAndConditions).toContain('25%');
    expect(proposal.termsAndConditions).not.toContain('50%');
    expect(proposal.termsAndConditions).not.toContain('البوابة');
    expect(proposal.proposal.brief).not.toContain('البوابة');
  });
  it('does not invent terms when neither the company nor user supplied them', async () => {
    const { service } = quotationFieldFixture({ terms: null });
    const proposal = await service.generateDraftProposal({ companyId: 'tenant', prompt: quotationPrompt });
    expect(proposal.termsAndConditions).toBeNull();
    expect(proposal.commercialTerms).toEqual({ paymentTerms: null, delivery: null, warranty: null });
  });
  it('localizes known labels; withholds untranslated/internal text rather than exporting it', async () => {
    expect(customerLocaleText(ESTIMATE_NOTICE_AR, 'ar')).toBeNull();
    expect(customerLocaleText(ESTIMATE_NOTICE_EN, 'en')).toBeNull();
    expect(customerLocaleText('Payment: 50% advance', 'ar')).toBe('الدفع: 50% مقدم');
    expect(customerLocaleText('Warranty: 1 year', 'ar')).toBe('الضمان: 1 سنة');
    expect(customerLocaleText('NVR + PoE + RJ45', 'ar')).toBe('NVR + PoE + RJ45');
    expect(customerLocaleText('الضمان سنة', 'en')).toBeNull();
    const { service } = quotationFieldFixture({ terms: 'Payment: cash\nWarranty: 1 year\nNVR assumptions: 64 channels\nAI_ESTIMATED: prices approximate' });
    const proposal = await service.generateDraftProposal({ companyId: 'tenant', prompt: `${quotationPrompt}\nملاحظة: حسابات هندسية لسعة التخزين المطلوبة` });
    expect(proposal.notes).toBeNull();
    expect(proposal.termsAndConditions).toBe('شروط الدفع: نقداً\nالضمان: 1 سنة');
    expect(proposal.metadata.warnings).toContain('Customer-facing content withheld: internal review text or untranslated prose requires human clarification.');
  });
});

describe('customer and field ownership across clarification turns', () => {
  it.each(['resolved', 'proposed', 'ambiguous'] as const)('retains %s customer across four unrelated turns and reanalysis', async (state) => {
    const { run, findAll, extractIntent } = quotationFieldFixture({ names: state === 'proposed' ? [] : state === 'ambiguous' ? [`${nationalCustomer} للتجارة`, `${nationalCustomer} للمقاولات`] : [nationalCustomer] });
    let draft = await run(quotationPrompt);
    const customer = draft.canonicalProposal!.customer;
    extractIntent.mockResolvedValue({ customerMention: null, lines: [], subject: 'wrong subject' });
    for (const [field, value] of [['projectName', 'مصنع الشويخ'], ['attentionName', 'المهندس خالد'], ['expiryDate', 'خمستاشر يوم'], ['paymentTerms', '25% مقدم']]) {
      draft = await run(value, draft, { answer: { field, value }, replySource: field === 'expiryDate' ? 'VOICE' : 'TEXT' });
      expect(draft.canonicalProposal?.customer).toEqual(customer);
    }
    expect(draft.canonicalProposal?.proposal).toMatchObject({ projectName: 'مصنع الشويخ', attentionName: 'المهندس خالد' });
    expect(draft.canonicalProposal?.proposal.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.answers?.expiryDate).toBe(draft.canonicalProposal?.proposal.expiryDate);
    expect(draft.canonicalProposal?.proposal.subject).not.toMatch(/الشويخ|خالد|الوطنية|خمستاشر/);
    expect(draft.canonicalProposal?.notes).toBeNull();
    expect(draft.canonicalProposal?.termsAndConditions).not.toMatch(/الشويخ|خالد|الوطنية|خمستاشر/);
    const before = draft.canonicalProposal?.proposal.expiryDate;
    draft = await run(quotationPrompt, draft, { reanalyze: true });
    expect(draft.canonicalProposal?.customer).toEqual(customer);
    expect(draft.canonicalProposal?.proposal.expiryDate).toBe(before);
    expect(draft.executed).toBe(false);
    expect(draft.requiresHumanReview).toBe(true);
    expect(findAll.mock.calls.every(([filter]) => filter.companyId === 'tenant' && filter.search === nationalCustomer)).toBe(true);
    if (state === 'ambiguous') expect(draft.activeQuestion?.field).toBe('customerMention');
  });
  it('explicit labelled customer and notes cannot be swallowed by the project question', async () => {
    const { run } = quotationFieldFixture({ names: [] });
    let draft = await run(quotationPrompt);
    expect(draft.activeQuestion?.field).toBe('projectName');
    draft = await run('العميل: الشركة المتحدة', draft, { answer: { field: 'projectName', value: 'العميل: الشركة المتحدة' } });
    expect(draft.proposedCustomerName).toBe('الشركة المتحدة');
    expect(draft.canonicalProposal?.proposal.projectName).toBeNull();
    draft = await run('ملاحظة: التواصل قبل التسليم', draft);
    expect(draft.activeQuestion?.field).toBe('projectName');
    expect(draft.canonicalProposal?.notes).toBe('التواصل قبل التسليم');
    draft = await run('المصنع الجديد', draft);
    expect(draft.canonicalProposal?.notes).toBe('التواصل قبل التسليم');
    expect(draft.canonicalProposal?.proposal.projectName).toBe('المصنع الجديد');
  });
  it('recognizes the definite Arabic company name without a provider', async () => {
    const { intent } = await new AISalesAssistantExtractor().extractIntent(quotationPrompt, 'ar');
    expect(intent.customerMention).toBe(nationalCustomer);
  });
  it('anchors explicit duration to known issue/base date and keeps ambiguous replies pending', async () => {
    const { service, run } = quotationFieldFixture();
    const proposal = await service.generateDraftProposal({ companyId: 'tenant', prompt: quotationPrompt, validityBaseDate: '2026-08-28', answers: { expiryDate: '15 يوم' } });
    expect(proposal.proposal.expiryDate).toBe('2026-09-12');
    let draft = await run(quotationPrompt);
    draft = await run('مشروع', draft);
    draft = await run('خالد', draft);
    draft = await run('15 أو 30 يوم', draft);
    expect(draft.activeQuestion?.field).toBe('expiryDate');
    expect(draft.status).toBe('NEEDS_CLARIFICATION');
  });
});
