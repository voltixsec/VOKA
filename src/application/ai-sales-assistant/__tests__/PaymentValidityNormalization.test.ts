import { describe, expect, it } from 'vitest';
import { explicitPaymentTerms, normalizePaymentTerms } from '../services/payment-terms';
import { parseValidityDuration, resolveExpiry } from '../services/commercial-field-values';
import { quotationFieldFixture, quotationPrompt, nationalCustomer } from './quotation-field-fixture';

describe('literal commercial payment percentages', () => {
  it.each([
    ['70% مقدم و30% عند التسليم', '70% دفعة مقدمة، و30% عند التسليم', '70% advance, 30% upon delivery'],
    ['50% مقدم و50% بعد التركيب', '50% دفعة مقدمة، و50% بعد التركيب', '50% advance, 50% after installation'],
    ['30% مقدم و40% بعد التركيب و30% عند التسليم', '30% دفعة مقدمة، و40% بعد التركيب، و30% عند التسليم', '30% advance, 40% after installation, 30% upon delivery'],
    ['100% advance', '100% دفعة مقدمة', '100% advance'],
    ['٧٠٪ مقدم و٣٠٪ عند التسليم', '70% دفعة مقدمة، و30% عند التسليم', '70% advance, 30% upon delivery'],
    ['70% advance; 30% upon delivery', '70% دفعة مقدمة، و30% عند التسليم', '70% advance, 30% upon delivery'],
    ['70% دفعة مقدمة، و30% عند التسليم.', '70% دفعة مقدمة، و30% عند التسليم', '70% advance, 30% upon delivery'],
    ['33.3% advance, 33.3% after installation, 33.4% upon delivery', '33.3% دفعة مقدمة، و33.3% بعد التركيب، و33.4% عند التسليم', '33.3% advance, 33.3% after installation, 33.4% upon delivery'],
  ])('preserves numeric stage amounts and meaning: %s', (input, ar, en) => {
    expect(normalizePaymentTerms(input, 'ar')).toEqual({ text: ar });
    expect(normalizePaymentTerms(input, 'en')).toEqual({ text: en });
    expect(ar).not.toMatch(/[a-z]/i);
    expect(en).not.toMatch(/[\u0600-\u06ff]/);
  });

  it.each(['70% مقدم و20% عند التسليم', '70% مقدم', '70% مقدم و', '70% مقدم و30%', '% مقدم و30% عند التسليم', '-70% advance, 30% upon delivery', '50% advance or 50% upon delivery', '110% advance', '70/30% upon delivery', '100% advance and', '70% و30% عند التسليم', '70% مقدم و30% -', '70% مقدم و-30% عند التسليم', '100% مقدم والباقي عند التسليم'])('keeps malformed/incomplete schedules for review: %s', (input) => {
    expect(normalizePaymentTerms(input, 'ar').review).toBeDefined();
  });
  it('never balances supplied percentages or invents an unstated remainder', () => {
    expect(normalizePaymentTerms('70% مقدم و20% عند التسليم', 'ar')).toEqual({ text: '70% دفعة مقدمة، و20% عند التسليم', review: { reason: 'TOTAL_NOT_100', totalPercentage: 90 } });
    expect(normalizePaymentTerms('نقداً', 'ar')).toEqual({ text: 'نقداً' });
    expect(normalizePaymentTerms('cash', 'en')).toEqual({ text: 'cash' });
    expect(normalizePaymentTerms(null, 'en')).toEqual({ text: null });
    // The user explicitly supplied the balance; preserve that wording, not a fabricated percentage.
    expect(normalizePaymentTerms('50% مقدم والباقي عند التسليم', 'en')).toEqual({ text: '50% advance, the balance upon delivery' });
  });
  it('preserves qualified milestones instead of silently removing extra obligations', () => {
    expect(normalizePaymentTerms('70% مقدم و30% بعد 30 يوم من التسليم', 'ar')).toEqual({ text: '70% دفعة مقدمة، و30% بعد 30 يوم من التسليم' });
    expect(normalizePaymentTerms('70% مقدم و30% بعد 30 يوم من التسليم', 'en').review).toBeDefined();
  });
  it('extracts only explicit payment context, preserving semicolon-separated stages', () => {
    expect(explicitPaymentTerms(`${quotationPrompt}\nشروط الدفع: 30% مقدم; 40% بعد التركيب; 30% عند التسليم\nالضمان: سنة`)).toBe('30% مقدم; 40% بعد التركيب; 30% عند التسليم');
    expect(explicitPaymentTerms(`${quotationPrompt} 70% مقدم و30% عند التسليم`)).toBe('70% مقدم و30% عند التسليم');
    expect(explicitPaymentTerms('Quotation with 20% discount')).toBeNull();
    expect(explicitPaymentTerms('100% down payment')).toBe('100% down payment');
    expect(normalizePaymentTerms(explicitPaymentTerms(`${quotationPrompt} -70% advance, 30% upon delivery`), 'en').review?.reason).toBe('MALFORMED');
  });
});

describe('direct validity duration resolution', () => {
  it.each([
    ['أسبوع من تاريخ العرض', 7, '2026-09-04'], ['أسبوع', 7, '2026-09-04'], ['اسبوع', 7, '2026-09-04'],
    ['أسبوعين', 14, '2026-09-11'], ['أسبوعين من تاريخ العرض', 14, '2026-09-11'],
    ['15 يوم', 15, '2026-09-12'], ['خمسة عشر يوم', 15, '2026-09-12'], ['خمستاشر يوم', 15, '2026-09-12'],
    ['30 يوم', 30, '2026-09-27'], ['ثلاثين يوم', 30, '2026-09-27'],
    ['one week from the quotation date', 7, '2026-09-04'],
  ])('resolves %s at the known issue date', (input, days, expiry) => {
    expect(parseValidityDuration(input)).toEqual({ value: days, unit: 'DAY' });
    expect(resolveExpiry(input, '2026-08-28')).toBe(expiry);
  });
  it('retains the existing precise calendar-month policy, including two months', () => {
    expect(parseValidityDuration('شهر')).toEqual({ value: 1, unit: 'MONTH' });
    expect(parseValidityDuration('شهرين')).toEqual({ value: 2, unit: 'MONTH' });
    expect(resolveExpiry('شهر من تاريخ العرض', '2026-01-31')).toBe('2026-02-28');
    expect(resolveExpiry('شهرين', '2026-01-31')).toBe('2026-03-31');
    expect(resolveExpiry('شهرين', '2026-12-31')).toBe('2027-02-28');
  });
  it.each(['أسبوع أو أسبوعين', 'أسبوع من تاريخ التسليم', 'حوالي أسبوع', 'أسبوع من تاريخ غير معروف'])('does not invent an ambiguous date or anchor: %s', (input) => {
    expect(resolveExpiry(input, '2026-08-28')).toBeNull();
  });
});

describe('canonical field completion and handoff', () => {
  it('commits an explicit payment correction over the prior user schedule and re-renders Terms', async () => {
    const { run } = quotationFieldFixture({ terms: null });
    const first = await run(`${quotationPrompt} والدفع 50% مقدم و50% بعد التوريد`);
    expect(first.canonicalProposal?.paymentSchedule?.milestones.map((item) => [item.percentage, item.timing])).toEqual([[50, 'ADVANCE'], [50, 'AFTER_SUPPLY']]);
    const corrected = await run('الدفع: 40% مقدم و60% بعد التوريد', first);
    expect(corrected.canonicalProposal?.paymentSchedule?.milestones.map((item) => [item.percentage, item.timing])).toEqual([[40, 'ADVANCE'], [60, 'AFTER_SUPPLY']]);
    expect(corrected.transactionalState?.ledger.facts.paymentSchedule.source).toBe('USER_CORRECTION');
    expect(corrected.canonicalProposal?.termsAndConditions).toContain('40%');
    expect(corrected.canonicalProposal?.termsAndConditions).not.toContain('50%');
  });

  it.each(['ar', 'en'] as const)('takes complete raw percentages over provider abbreviation or prose (%s)', async (locale) => {
    const { service, extractIntent } = quotationFieldFixture({ locale });
    extractIntent.mockResolvedValue({ customerMention: nationalCustomer, lines: [], paymentTerms: 'مقدم' });
    const result = await service.generateDraftProposal({ companyId: 'tenant', prompt: `${quotationPrompt} 70% مقدم و30% عند التسليم`, sourceLocale: locale });
    expect(result.commercialTerms?.paymentTerms).toBe(locale === 'ar' ? '70% دفعة مقدمة، و30% عند التسليم' : '70% advance, 30% upon delivery');
    expect(result.paymentTermsReview).toBeUndefined();
    expect(result.termsAndConditions).not.toMatch(/سبعين|ثلاثين|seventy|thirty|50%/i);
    expect(result.termsAndConditions).toContain('70%');
  });

  it.each(['VOICE', 'TEXT', 'CHIP'] as const)('%s replies resolve the active fields without repeat questions or lost BOM', async (replySource) => {
    const { run } = quotationFieldFixture({ terms: null });
    let draft = await run(quotationPrompt);
    const original = draft.canonicalProposal!;
    draft = await run('مصنع الشويخ', draft);
    draft = await run('المهندس خالد', draft);
    expect(draft.activeQuestion?.field).toBe('expiryDate');
    draft = await run('أسبوع من تاريخ العرض', draft, { replySource });
    const expiry = resolveExpiry('أسبوع', original.proposal.validityBaseDate!);
    expect(draft.canonicalProposal?.proposal.expiryDate).toBe(expiry);
    expect(draft.answers?.expiryDate).toBe(expiry);
    expect(draft.activeQuestion?.field).toBe('paymentTerms');
    draft = await run('70% مقدم و30% عند التسليم', draft, { replySource });
    expect(draft.activeQuestion?.field).toBe('delivery');
    expect(draft.missingRequired.map((field) => field.key)).not.toContain('expiryDate');
    expect(draft.missingRequired.map((field) => field.key)).not.toContain('paymentTerms');
    draft = await run('أسبوعين', draft);
    draft = await run('سنة', draft);
    expect(draft.status).toBe('READY_FOR_REVIEW');
    expect(draft.canonicalProposal?.customer).toEqual(original.customer);
    expect(draft.canonicalProposal?.lines).toEqual(original.lines);
    expect(draft.canonicalProposal?.proposal).toMatchObject({ subject: original.proposal.subject, brief: original.proposal.brief, projectName: 'مصنع الشويخ', attentionName: 'المهندس خالد', expiryDate: expiry });
    expect(draft.canonicalProposal?.commercialTerms?.paymentTerms).toBe('70% دفعة مقدمة، و30% عند التسليم');
    expect(draft.executed).toBe(false);
    expect(draft.requiresHumanReview).toBe(true);
    const again = await run(quotationPrompt, draft, { reanalyze: true });
    expect(again.status).toBe('READY_FOR_REVIEW');
    expect(again.canonicalProposal?.proposal.expiryDate).toBe(expiry);
    expect(again.canonicalProposal?.commercialTerms?.paymentTerms).toBe(draft.canonicalProposal?.commercialTerms?.paymentTerms);
  });

  it('asks to complete an invalid split, never falls back to approved defaults or marks ready', async () => {
    const { run } = quotationFieldFixture();
    let draft = await run(quotationPrompt);
    draft = await run('المصنع', draft);
    draft = await run('خالد', draft);
    draft = await run('أسبوع', draft);
    draft = await run('شروط الدفع: 70% مقدم و20% عند التسليم', draft);
    expect(draft.activeQuestion?.field).toBe('paymentTerms');
    expect(draft.activeQuestion?.ar).toContain('90%');
    expect(draft.canonicalProposal?.termsAndConditions).toContain('20%');
    expect(draft.canonicalProposal?.termsAndConditions).not.toContain('50%');
    expect(draft.status).toBe('NEEDS_CLARIFICATION');
    draft = await run('70% مقدم و30% عند التسليم', draft);
    expect(draft.activeQuestion).toBeNull();
    expect(draft.status).toBe('READY_FOR_REVIEW');
    expect(draft.canonicalProposal?.paymentTermsReview).toBeUndefined();
  });
});
