import { describe, expect, it } from 'vitest';
import { Customer } from '../Customer';

function create(overrides: Record<string, unknown> = {}) {
  return Customer.create({ companyId: 'company-1', code: 'C-001', name: 'Acme', ...overrides });
}

describe('Customer canonical contact', () => {
  it('stores a valid dedicated WhatsApp number in canonical E.164 form', () => {
    const result = create({ whatsapp: '+96590000000' });
    expect(result.isSuccess).toBe(true);
    expect(result.getValue().whatsapp).toBe('+96590000000');
  });

  it.each(['96590000000', '0501234567', '+123', '+965abc'])('rejects ambiguous or malformed WhatsApp %s', (whatsapp) => {
    const result = create({ whatsapp });
    expect(result.isSuccess).toBe(false);
    expect(result.getError().code).toBe('INVALID_CUSTOMER_WHATSAPP');
  });

  it('never infers WhatsApp from phone or mobile', () => {
    const customer = create({ phone: '+96522223333', mobile: '+96590000000' }).getValue();
    expect(customer.whatsapp).toBeNull();
  });

  it('supports clearing WhatsApp and changed-fields-only contact updates', () => {
    const customer = create({ email: 'old@example.com', phone: '22223333', whatsapp: '+96590000000' }).getValue();
    expect(customer.updateContactDetails({ whatsapp: null }).isSuccess).toBe(true);
    expect(customer.whatsapp).toBeNull();
    expect(customer.email).toBe('old@example.com');
    expect(customer.phone).toBe('22223333');
  });

  it('retains existing email and country validation during updates', () => {
    const customer = create({ countryCode: 'KW' }).getValue();
    expect(customer.updateDetails({ email: 'bad', countryCode: 'KWT' }).isSuccess).toBe(false);
    expect(customer.countryCode).toBe('KW');
  });
});
