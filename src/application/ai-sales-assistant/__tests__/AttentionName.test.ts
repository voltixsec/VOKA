import { describe, expect, it } from 'vitest';
import { cleanAttentionName } from '../services/attention-name';
import { quotationFieldFixture, nationalCustomer } from './quotation-field-fixture';

describe('professional recipient boundary', () => {
  it.each([
    ['أهلاً يا الأستاذ محمد خالد', 'الأستاذ محمد خالد'],
    ['العرض بعناية المهندس أحمد علي', 'المهندس أحمد علي'],
    ['تمام، بعناية للأستاذ محمد خالد', 'الأستاذ محمد خالد'],
    ['للأستاذ محمد خالد', 'الأستاذ محمد خالد'],
    ['المهندس محمد خالد', 'المهندس محمد خالد'],
    ['م. محمد خالد', 'م. محمد خالد'],
    ['الأستاذ محمد خالد', 'الأستاذ محمد خالد'],
    ['ياقوت أحمد', 'ياقوت أحمد'],
    ['Hello, attention: Mr. John Smith', 'Mr. John Smith'],
    ['Mr. John Smith', 'Mr. John Smith'],
    ['أهلاً يا', null],
  ])('cleans only framing in %s', (input, expected) => expect(cleanAttentionName(input)).toBe(expected));

  it('carries a clean recipient through the 180-camera conversation without touching customer/project/terms/lines', async () => {
    const { run } = quotationFieldFixture();
    let draft = await run(`اعمل عرض سعر توريد وتركيب 180 كاميرا ${nationalCustomer}`);
    const customer = draft.canonicalProposal!.customer;
    const lines = draft.canonicalProposal!.lines;
    draft = await run('مصنع الشويخ', draft);
    draft = await run('أهلاً يا الأستاذ محمد خالد', draft, { replySource: 'VOICE' });
    expect(draft.answers?.attentionName).toBe('الأستاذ محمد خالد');
    draft = await run('خمستاشر يوم', draft);
    expect(draft.canonicalProposal?.proposal).toMatchObject({ attentionName: 'الأستاذ محمد خالد', projectName: 'مصنع الشويخ' });
    expect(draft.canonicalProposal?.proposal.expiryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(draft.canonicalProposal?.customer).toEqual(customer);
    expect(draft.canonicalProposal?.lines).toEqual(lines);
    expect(draft.canonicalProposal?.notes).toBeNull();
    expect(draft.canonicalProposal?.termsAndConditions).not.toMatch(/أهلاً|محمد|الشويخ/);
    expect(draft.status).toBe('READY_FOR_REVIEW');
    expect(draft.executed).toBe(false);
    expect(draft.requiresHumanReview).toBe(true);
  });

  it('framing alone is not a completed recipient', async () => {
    const { run } = quotationFieldFixture();
    let draft = await run(`عرض سعر توريد وتركيب 180 كاميرا ${nationalCustomer}`);
    draft = await run('المصنع', draft);
    draft = await run('أهلاً يا', draft);
    expect(draft.activeQuestion?.field).toBe('attentionName');
    expect(draft.canonicalProposal?.proposal.attentionName).toBeNull();
  });
});
