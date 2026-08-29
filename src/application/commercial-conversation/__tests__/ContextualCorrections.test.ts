import { describe, expect, it } from 'vitest';
import { labelledFieldAnswer } from '../labelled-field-answer';

describe('context-aware commercial corrections', () => {
  it('replaces the canonical camera quantity from a short Arabic correction', () => {
    expect(labelledFieldAnswer('خليهم 200 بدل 180')).toEqual({ field: 'cameraCount', value: '200' });
  });

  it('replaces the customer instead of treating a correction as the pending field answer', () => {
    expect(labelledFieldAnswer('لا، الشركة الوطنية مش العميل، العميل زين')).toEqual({ field: 'customerMention', value: 'زين' });
  });
});
