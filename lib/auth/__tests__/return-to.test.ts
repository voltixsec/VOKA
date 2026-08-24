import { describe, expect, it } from 'vitest';
import { sanitizeReturnTo } from '../return-to';

describe('sanitizeReturnTo', () => {
  it('returns /dashboard when returnTo is missing or empty', () => {
    expect(sanitizeReturnTo(undefined)).toBe('/dashboard');
    expect(sanitizeReturnTo(null)).toBe('/dashboard');
    expect(sanitizeReturnTo('')).toBe('/dashboard');
    expect(sanitizeReturnTo('   ')).toBe('/dashboard');
  });

  it('accepts safe /dashboard relative paths', () => {
    expect(sanitizeReturnTo('/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('/dashboard/quotations')).toBe('/dashboard/quotations');
    expect(sanitizeReturnTo('/dashboard/contracts/123')).toBe('/dashboard/contracts/123');
    expect(sanitizeReturnTo('/dashboard/customers?page=2')).toBe('/dashboard/customers?page=2');
  });

  it('rejects external URLs and protocol-relative URLs', () => {
    expect(sanitizeReturnTo('https://evil.com')).toBe('/dashboard');
    expect(sanitizeReturnTo('http://evil.com/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('//evil.com/dashboard')).toBe('/dashboard');
    expect(sanitizeReturnTo('/\\evil.com/dashboard')).toBe('/dashboard');
  });

  it('rejects non-dashboard internal paths', () => {
    expect(sanitizeReturnTo('/login')).toBe('/dashboard');
    expect(sanitizeReturnTo('/api/auth/login')).toBe('/dashboard');
    expect(sanitizeReturnTo('/dashboard-fake')).toBe('/dashboard');
  });
});
