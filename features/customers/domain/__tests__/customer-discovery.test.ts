import { describe, expect, it } from 'vitest';
import { customerMatchScore, normalizeCustomerIdentity } from '../customer-discovery';

describe('Arabic customer discovery', () => {
  it('normalizes hamza, company prefixes, whitespace, punctuation and diacritics', () => {
    expect(normalizeCustomerIdentity('شَرِكَة   الأفق')).toBe('الافق');
    expect(normalizeCustomerIdentity('الشركة، إِآ')).toBe('اا');
    expect(customerMatchScore({ name: 'شركة الأفق للتجهيزات ومقاولات المباني' }, 'شركة الافق')).toBe(80);
  });
  it('returns every relevant الوطنية candidate', () => {
    const names = ['شركة الوطنية لصناعة السكر', 'الوطنية للغاز', 'الشركة الوطنية للتركيب', 'الوطنية للمقاولات'];
    expect(names.filter((name) => customerMatchScore({ name }, 'الوطنية') > 0)).toEqual(names);
  });
  it('matches legal names, bilingual names, aliases and codes; fuzzy remains low confidence', () => {
    expect(customerMatchScore({ name: 'Other', legalName: 'شركة الأفق' }, 'شركة الافق')).toBe(100);
    expect(customerMatchScore({ name: 'Other', nameEn: 'Horizon' }, 'Horizon')).toBe(100);
    expect(customerMatchScore({ name: 'Other', aliases: ['Horizon'] }, 'Horizon')).toBe(100);
    expect(customerMatchScore({ name: 'Other', code: 'CUST-0042' }, 'CUST 0042')).toBe(100);
    expect(customerMatchScore({ name: 'Horizon' }, 'Horizn')).toBe(40);
    expect(customerMatchScore({ name: 'Alpha' }, 'Zeta')).toBe(0);
    expect(customerMatchScore({ name: 'ABC' }, 'AB')).toBe(0);
  });
});
