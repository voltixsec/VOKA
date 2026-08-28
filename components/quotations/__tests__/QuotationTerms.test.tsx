// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuotationTerms } from '../QuotationTerms';
import { quotationTermsPresentation } from '@/src/application/document/quotation-terms-presentation';

describe('non-mutating professional terms presentation', () => {
  it.each(['شروط الدفع: 50% مقدم\nمدة التوريد: 14 يوم\nالضمان: سنة', 'Payment: 50% advance\nDelivery: 14 days\nWarranty: 1 year'])('numbers clearly labelled clauses without changing any clause', (text) => {
    render(<QuotationTerms text={text} />);
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(text.split('\n'));
    expect(quotationTermsPresentation(text).text).toBe(text.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n'));
  });
  it.each(['1. Payment: cash\n2. Delivery: 14 days', '١. الدفع: نقداً\n٢. التسليم: أسبوع', '- Payment: cash\n- Warranty: 1 year', 'Payment: 50%\n  payable after inspection.', 'Approved legal paragraph; its exceptions remain in the same sentence.\n\nA separate paragraph.', 'Payment: cash'])('preserves existing legal text exactly: %s', (text) => {
    const { container } = render(<QuotationTerms text={text} />);
    expect(quotationTermsPresentation(text)).toEqual({ text, clauses: null });
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(text);
  });
});
