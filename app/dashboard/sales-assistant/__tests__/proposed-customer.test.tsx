// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SalesAssistantPage from '../page';
import { applyCanonicalIntelligence, ConversationalDraftEngine } from '@/src/application/commercial-conversation/ConversationalDraftEngine';

const ui = vi.hoisted(() => ({ isArabic: true, push: vi.fn() }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: ui.isArabic }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: ui.push }) }));
vi.mock('@/src/infrastructure/voice/browser', () => ({
  useRecordedVoiceInput: () => ({ isSupported: true, state: 'IDLE', transcript: '', waveform: [], resetRecording: vi.fn() }),
  useVoiceInput: () => ({ state: 'IDLE', transcript: { final: '' }, resetVoiceInput: vi.fn() }),
}));
function fixture() {
  const name = ui.isArabic ? 'شركة الأفق' : 'Horizon';
  return applyCanonicalIntelligence(new ConversationalDraftEngine().advance({ reply: 'CCTV NVR', replySource: 'VOICE', locale: ui.isArabic ? 'ar' : 'en', operation: 'QUOTATION' }), {
    customer: { status: 'MISSING', id: null, mention: name, name, candidates: [] },
    proposal: { subjectAr: 'كاميرات', subjectEn: 'Cameras', currencyCode: 'KWD' },
    lines: [{ itemName: 'IP (commercial)', itemNameAr: 'كاميرا IP تجارية', itemNameEn: 'Commercial IP camera', quantity: 36, unitPrice: null, catalogCandidates: [], quantitySource: 'RULE_CALCULATED', formulaExplanation: '36 cameras', formulaExplanationAr: '٣٦ كاميرا' }],
    estimateNotice: true,
  } as any);
}
beforeEach(() => { sessionStorage.clear(); ui.push.mockReset(); ui.isArabic = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe.each([true, false])('proposed quotation handoff Arabic=%s', (arabic) => {
  it('does not bind a late creation response to a new request', async () => {
    ui.isArabic = arabic;
    sessionStorage.setItem('voka_commercial_conversation_draft', JSON.stringify(fixture()));
    let complete!: (value: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { complete = resolve; })));
    render(<SalesAssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: arabic ? 'إنشاء' : 'Create' }));
    fireEvent.click(screen.getByRole('button', { name: arabic ? 'طلب جديد' : 'New Request' }));
    await act(async () => complete({ ok: true, json: async () => ({ data: { customer: { id: 'late', name: 'Horizon' } } }) }));
    expect(ui.push).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('voka_commercial_conversation_draft')).toBeNull();
    expect(screen.queryByTestId('proposed-customer')).toBeNull();
  });
  it('is informational and hands off the same canonical proposal without creating anything', () => {
    ui.isArabic = arabic;
    const draft = fixture();
    sessionStorage.setItem('voka_commercial_conversation_draft', JSON.stringify(draft));
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<SalesAssistantPage />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText(arabic ? 'غير مسجل' : 'Unregistered')).toBeTruthy();
    const content = container.textContent!.replace(/\b(?:VOKA|CCTV|NVR|IP|KWD)\b/g, '');
    expect(content).not.toMatch(arabic ? /[a-z]/i : /[\u0600-\u06ff]/);
    fireEvent.click(screen.getByRole('button', { name: arabic ? 'متابعة عرض السعر' : 'Continue to quotation' }));
    expect(ui.push).toHaveBeenCalledWith('/dashboard/quotations/new');
    expect(JSON.parse(sessionStorage.getItem('voka_ai_proposal_draft')!)).toEqual(draft.canonicalProposal);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('explicit Create binds and opens the same draft; a near match asks instead of duplicating', async () => {
    ui.isArabic = arabic;
    const draft = fixture();
    sessionStorage.setItem('voka_commercial_conversation_draft', JSON.stringify(draft));
    const name = draft.proposedCustomerName!;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { customer: null, candidates: [{ id: 'existing', name, status: 'ACTIVE' }] } }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<SalesAssistantPage />);
    fireEvent.click(screen.getByRole('button', { name: arabic ? 'إنشاء' : 'Create' }));
    await screen.findByText(arabic ? /وجدت عملاء مشابهين/ : /Similar customers found/);
    expect(ui.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(ui.push).toHaveBeenCalledWith('/dashboard/quotations/new'));
    const saved = JSON.parse(sessionStorage.getItem('voka_commercial_conversation_draft')!);
    expect(saved).toMatchObject({ id: draft.id, fields: { customerId: 'existing' }, customerState: 'CUSTOMER_RESOLVED', executed: false });
    expect(saved.canonicalProposal.lines).toEqual(draft.canonicalProposal?.lines);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ name, checkDuplicates: true });
  });
});
