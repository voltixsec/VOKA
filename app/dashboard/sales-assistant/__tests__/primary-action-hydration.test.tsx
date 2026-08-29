// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SalesAssistantPage from '../page';

vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('Sales Assistant primary action hydration', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  it('keeps SSR and the first client render capability-neutral and detects support after mount', async () => {
    const markup = renderToString(<SalesAssistantPage />);
    expect(markup).toContain('data-testid="primary-voice-action"');
    expect(markup).toContain('Start by Voice');
    expect(markup).not.toContain('Voice input is not supported');
    expect(markup).not.toContain('title=');
    expect(markup).not.toContain('disabled=""');

    const container = document.createElement('div');
    container.innerHTML = markup; document.body.appendChild(container);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, <SalesAssistantPage />); });
    expect(errors.mock.calls.flat().join(' ')).not.toMatch(/hydration|did not match/i);
    await act(async () => root.unmount());
  });
});
