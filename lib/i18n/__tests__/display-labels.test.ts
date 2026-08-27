import { describe, expect, it } from 'vitest';

import { catalogFallbackDisclosure, displayActorName, displayLabel } from '../display-labels';

describe('user-visible domain labels', () => {
  it('localizes commercial, takeoff, and document type enums', () => {
    expect(displayLabel('REVIEW_REQUIRED', 'ar')).toBe('بحاجة إلى مراجعة');
    expect(displayLabel('SALES_ORDER', 'en')).toBe('Sales order');
    expect(displayLabel('NEEDS_CONFIRMATION', 'ar')).toBe('بحاجة إلى تأكيد');
  });

  it('preserves unknown technical identifiers accurately', () => {
    expect(displayLabel('RJ45-CAT6', 'ar')).toBe('RJ45-CAT6');
  });

  it('localizes invoice presentation without changing domain values', () => {
    expect(displayLabel('ISSUED', 'ar')).toBe('صادرة');
    expect(displayLabel('UNPAID', 'ar')).toBe('غير مدفوعة');
    expect(displayLabel('DIRECT', 'ar')).toBe('مباشرة');
    expect(displayLabel('ISSUED', 'en')).toBe('Issued');
    expect(displayActorName('System Administrator', 'ar')).toBe('مسؤول النظام');
  });

  it('uses truthful active-language catalog fallback disclosure', () => {
    expect(catalogFallbackDisclosure('ar')).toBe('يُعرض الاسم الأصلي لعدم إضافة ترجمة عربية حتى الآن.');
    expect(catalogFallbackDisclosure('en')).toBe('Showing the original name — no English localization has been added yet.');
  });
});
