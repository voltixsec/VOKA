// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
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
