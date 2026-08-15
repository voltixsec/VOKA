import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CustomerTable } from '../CustomerTable';
import { CountryWhatsAppInput } from '../CountryWhatsAppInput';

describe('customer contact UI', () => {
  it('renders accessible customer navigation links with visible focus styling', () => {
    render(<CustomerTable customers={[{ id: 'customer 1', code: 'C-1', name: 'Acme', type: 'COMPANY', status: 'ACTIVE' }]} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/dashboard/customers/customer%201');
    expect(links[0].className).toContain('focus-visible:ring-2');
  });

  it('uses Kuwait by default, searches countries, and emits canonical E.164', () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('');
      return <CountryWhatsAppInput value={value} countryCode={null} isArabic={false} onChange={(next, valid) => { onChange(next, valid); setValue(next); }} />;
    }
    render(<Harness />);
    expect(screen.getByLabelText('WhatsApp country')).toHaveValue('KW');
    fireEvent.change(screen.getByLabelText('Search countries'), { target: { value: 'Kuwait' } });
    fireEvent.change(screen.getByLabelText('National number'), { target: { value: '90000000' } });
    expect(onChange).toHaveBeenLastCalledWith('+96590000000', true);
    expect(screen.getByText(/Will be saved as:/)).toBeInTheDocument();
  });

  it('renders localized validation without treating mobile as WhatsApp', () => {
    render(<CountryWhatsAppInput value="" countryCode="KW" isArabic onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('الرقم المحلي'), { target: { value: '12' } });
    expect(screen.getByText('أدخل رقماً صحيحاً لهذه الدولة')).toBeInTheDocument();
  });
});
