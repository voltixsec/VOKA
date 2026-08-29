// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SalesAssistantPage from '../page';
import { applyCanonicalIntelligence, ConversationalDraftEngine } from '@/src/application/commercial-conversation/ConversationalDraftEngine';

const ui = vi.hoisted(() => ({ isArabic: true, push: vi.fn() }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: ui.isArabic }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: ui.push }) }));
vi.mock('@/src/infrastructure/voice/browser', () => ({
  useRecordedVoiceInput: () => ({ isSupported: true, state: 'IDLE', transcript: '', waveform: [], resetRecording: vi.fn() }),
  useVoiceInput: () => ({ isSupported: true, state: 'IDLE', transcript: { final: '', interim: '' }, resetVoiceInput: vi.fn() }),
}));

function fixture() {
  const name = ui.isArabic ? 'شركة الأفق' : 'Horizon';
  return applyCanonicalIntelligence(new ConversationalDraftEngine().advance({ reply: 'CCTV NVR', replySource: 'VOICE', locale: ui.isArabic ? 'ar' : 'en', operation: 'QUOTATION' }), {
    customer: { status: 'MISSING', id: null, mention: name, name, candidates: [] },
    proposal: { subject: 'Cameras', subjectAr: 'كاميرات', subjectEn: 'Cameras', currencyCode: 'KWD' },
    lines: [{ itemName: 'IP camera', itemNameAr: 'كاميرا IP', itemNameEn: 'IP camera', quantity: 36, unitPrice: null, catalogCandidates: [], quantitySource: 'RULE_CALCULATED', resolutionStatus: 'CUSTOM', type: 'CUSTOM', catalogItemId: null, itemCode: null, priceSource: 'NEEDS_CONFIRMATION', reviewRequired: true }],
    estimateNotice: true,
  } as any);
}

beforeEach(() => { sessionStorage.clear(); ui.push.mockReset(); });
afterEach(() => cleanup());

describe.each([true, false])('non-blocking proposed customer Arabic=%s', (arabic) => {
  it('shows one concise note, no creation card, and hands off to the real document draft', () => {
    ui.isArabic = arabic;
    const draft = fixture();
    sessionStorage.setItem('voka_commercial_conversation_draft', JSON.stringify(draft));
    const { container } = render(<SalesAssistantPage />);
    expect(screen.getByTestId('proposed-customer-note').textContent).toBe(arabic ? 'العميل غير مسجل حاليًا وسيستمر في المسودة كما هو.' : 'Customer is not registered yet and will be carried into the draft as entered.');
    expect(screen.queryByTestId('proposed-customer')).toBeNull();
    expect(screen.queryByRole('button', { name: arabic ? 'إنشاء' : 'Create' })).toBeNull();
    expect(screen.queryByRole('button', { name: arabic ? 'إنشاء وتحرير' : 'Create and edit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: arabic ? 'فتح للمراجعة البشرية' : 'Open for human review' }));
    expect(ui.push).toHaveBeenCalledWith('/dashboard/quotations/new');
    expect(JSON.parse(sessionStorage.getItem('voka_ai_proposal_draft')!)).toEqual(draft.canonicalProposal);
    const content = container.textContent!.replace(/\b(?:VOKA|CCTV|NVR|IP|KWD)\b/g, '');
    expect(content).not.toMatch(arabic ? /[a-z]/i : /[\u0600-\u06ff]/);
  });
});
