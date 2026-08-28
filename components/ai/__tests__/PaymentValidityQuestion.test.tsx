// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveFieldQuestion } from '../ActiveFieldQuestion';
import { quotationFieldFixture, quotationPrompt } from '@/src/application/ai-sales-assistant/__tests__/quotation-field-fixture';

describe('localized payment clarification', () => {
  it.each([true, false])('keeps invalid percentage review visible in the active locale (%s)', async (isArabic) => {
    const { run } = quotationFieldFixture({ locale: isArabic ? 'ar' : 'en', terms: null });
    let draft = await run(quotationPrompt);
    draft = await run(isArabic ? 'المصنع' : 'Factory', draft);
    draft = await run(isArabic ? 'خالد' : 'Khaled', draft);
    draft = await run('أسبوع من تاريخ العرض', draft);
    draft = await run('70% مقدم و20% عند التسليم', draft);
    const onAnswer = vi.fn();
    const { container } = render(<ActiveFieldQuestion draft={draft} isArabic={isArabic} disabled={false} onAnswer={onAnswer} />);
    const question = screen.getByTestId('active-field-question');
    expect(question.textContent).toContain('90%');
    expect(question.textContent).toContain('100%');
    expect(question.textContent).not.toMatch(isArabic ? /[a-z]/i : /[\u0600-\u06ff]/);
    expect(question.textContent).not.toContain('TOTAL_NOT_100');
    expect(container.querySelector('button')).toBeNull();
    expect(onAnswer).not.toHaveBeenCalled();
    expect(draft.activeQuestion?.field).toBe('paymentTerms');
    expect(draft.missingRequired.some((field) => field.key === 'expiryDate')).toBe(false);
  });
});
