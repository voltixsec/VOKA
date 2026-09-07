// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UniversalLibraryOperatorNav from '../UniversalLibraryOperatorNav';
import PublishedPage from '@/app/dashboard/universal-library/published/page';
import StagingPage from '@/app/dashboard/universal-library/products/page';

let pathname = '/dashboard/universal-library';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/components/i18n/LanguageProvider', () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock('../UniversalLibraryProductsBrowser', () => ({ default: () => <div>Published browser</div> }));
vi.mock('../UniversalLibraryStagedProductsBrowser', () => ({ default: () => <div>Staged browser</div> }));

const pages = [
  ['Overview', ''], ['Batches', '/batches'], ['Hierarchy', '/systems'], ['Staging', '/products'],
  ['Review', '/review'], ['Published', '/published'], ['Population', '/population'],
];
describe('UCL operator navigation', () => {
  it.each(pages)('shows exactly seven consistent links with %s active', (label, suffix) => {
    pathname = `/dashboard/universal-library${suffix}`;
    render(<UniversalLibraryOperatorNav />);
    const links = screen.getAllByRole('link');
    expect(links.map(link => link.textContent)).toEqual(pages.map(([name]) => name));
    expect(links.filter(link => link.getAttribute('aria-current') === 'page')).toEqual([screen.getByRole('link', { name: label })]);
    pages.forEach(([name, route]) => expect(screen.getByRole('link', { name })).toHaveAttribute('href', `/dashboard/universal-library${route}`));
  });
  it('uses the existing published browser on Published', () => {
    render(<PublishedPage />);
    expect(screen.getByText('Published browser')).toBeInTheDocument();
    expect(screen.queryByText('Staged browser')).not.toBeInTheDocument();
  });
  it('keeps the existing staged browser on Staging', () => {
    render(<StagingPage />);
    expect(screen.getByText('Staged browser')).toBeInTheDocument();
    expect(screen.queryByText('Published browser')).not.toBeInTheDocument();
  });
});
