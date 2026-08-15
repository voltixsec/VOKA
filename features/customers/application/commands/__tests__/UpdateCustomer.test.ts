import { describe, expect, it, vi } from 'vitest';
import { Customer } from '../../../domain/entities/Customer';
import type { CustomerRepository } from '../../../domain/repositories/CustomerRepository';
import { UpdateCustomer } from '../UpdateCustomer';

function repository(customer: Customer | null): CustomerRepository {
  return {
    findById: vi.fn(), findByIdAndCompanyId: vi.fn().mockResolvedValue(customer), findByCode: vi.fn().mockResolvedValue(null),
    findAll: vi.fn(), count: vi.fn(), save: vi.fn(async (value) => value), delete: vi.fn(), deleteByIdAndCompanyId: vi.fn(),
  };
}

describe('UpdateCustomer', () => {
  it('loads by customer and company, then changes only selected fields', async () => {
    const customer = Customer.create({ companyId: 'company-1', code: 'C-1', name: 'Old', email: 'old@example.com', phone: '2222' }).getValue();
    const customers = repository(customer);
    const result = await new UpdateCustomer(customers).execute({ companyId: 'company-1', customerId: customer.id.toString(), changes: { email: 'new@example.com' } });
    expect(customers.findByIdAndCompanyId).toHaveBeenCalledWith(customer.id.toString(), 'company-1');
    expect(result.getValue()).toMatchObject({ email: 'new@example.com', phone: '2222', name: 'Old' });
  });

  it('does not reveal missing, cross-tenant, or soft-deleted customers', async () => {
    const result = await new UpdateCustomer(repository(null)).execute({ companyId: 'other', customerId: 'customer-1', changes: { name: 'X' } });
    expect(result.getError().code).toBe('CUSTOMER_NOT_FOUND');
  });
});
