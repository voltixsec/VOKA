import { describe, expect, it } from 'vitest';
import { commercialUnitLabel, unitLabel } from '../unit-labels';

describe('commercial unit display', () => {
  it.each([['Unit', 'وحدة'], ['Package', 'حزمة'], ['Roll', 'بكرة'], ['Set', 'طقم'], ['Point', 'نقطة']])('%s is localized without mutating its code', (unitName, ar) => {
    const line = { unitName, unitNameAr: unitName, unitNameEn: unitName };
    expect(commercialUnitLabel(line, true)).toBe(ar);
    expect(commercialUnitLabel(line, false)).toBe(unitName);
    expect(line.unitName).toBe(unitName);
    expect(unitLabel(ar, false)).toBe(unitName);
  });
  it.each(['CCTV', 'NVR', 'PoE', 'CAT6', 'RJ45', 'IP', 'TB'])('does not translate technical token %s', (token) => {
    expect(unitLabel(token, true)).toBe(token);
    expect(unitLabel(token, false)).toBe(token);
  });
});
