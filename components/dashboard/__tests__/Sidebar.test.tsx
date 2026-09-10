// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from '../Sidebar';

let isArabic = false;
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/universal-library' }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic }) }));

describe('platform-only Sidebar entry', () => {
  it.each([false, true])('shows Universal Library only for platform admin=%s', (allowed) => {
    isArabic = false;
    render(<Sidebar isPlatformAdmin={allowed} />);
    const entry = screen.queryByRole('link', { name: 'Universal Library Platform control' });
    if (allowed) expect(entry).toHaveAttribute('href', '/dashboard/universal-library');
    else expect(entry).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Products & Services Catalog' })).toBeInTheDocument();
  });
  it('uses the Arabic labels', () => {
    isArabic = true;
    render(<Sidebar isPlatformAdmin />);
    expect(screen.getByRole('link', { name: 'المكتبة العالمية إدارة المنصة' })).toHaveAttribute('href', '/dashboard/universal-library');
  });
});

describe('Sidebar localized chrome', () => {
  it('localizes the tagline in Arabic', () => {
    isArabic = true;
    const { container } = render(<Sidebar />);
    expect(screen.getByText('نظام تشغيل المبيعات بالذكاء الاصطناعي')).toBeInTheDocument();
    expect(container.textContent).not.toContain('AI Sales OS');
  });

  it('keeps the English tagline in English', () => {
    isArabic = false;
    render(<Sidebar />);
    expect(screen.getByText('AI Sales OS')).toBeInTheDocument();
  });

  it('renders the established VO brand monogram', () => {
    isArabic = false;
    render(<Sidebar />);
    expect(screen.getByText('VO', { exact: true })).toBeInTheDocument();
  });

  it('does not expose leftover technical jargon descriptions', () => {
    isArabic = false;
    const { container } = render(<Sidebar />);
    expect(container.textContent).not.toContain('CRM');
    expect(container.textContent).not.toContain('CCTV / Low Voltage');
  });

  it('exposes Reports as a navigation destination', () => {
    isArabic = false;
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'Reports Receivables aging' })).toHaveAttribute('href', '/dashboard/reports');
    isArabic = true;
    cleanup();
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'التقارير أعمار الذمم المدينة' })).toHaveAttribute('href', '/dashboard/reports');
  });
});
