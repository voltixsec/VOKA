import { describe, expect, it } from 'vitest';

import { displayLabel } from '../display-labels';

describe('user-visible domain labels', () => {
  it('localizes commercial, takeoff, and document type enums', () => {
    expect(displayLabel('REVIEW_REQUIRED', 'ar')).toBe('بحاجة إلى مراجعة');
    expect(displayLabel('SALES_ORDER', 'en')).toBe('Sales order');
    expect(displayLabel('NEEDS_CONFIRMATION', 'ar')).toBe('بحاجة إلى تأكيد');
  });

  it('preserves unknown technical identifiers accurately', () => {
    expect(displayLabel('RJ45-CAT6', 'ar')).toBe('RJ45-CAT6');
  });
});
