import { describe, expect, it, vi } from 'vitest';

const findFirst = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { drawingTakeoffSession: { findFirst } } }));
import { getDrawingTakeoffSnapshot } from '../drawing-takeoff';

describe('getDrawingTakeoffSnapshot', () => {
  it('preserves tenant scope, provenance, uncertainty, confidence, and review state', async () => {
    const now = new Date('2026-08-26T12:00:00Z');
    findFirst.mockResolvedValue({ id: 'takeoff-1', sourceFileName: 'drawing.pdf', sourceMimeType: 'application/pdf', sourceSizeBytes: 100, userIntent: 'Count CCTV', discipline: 'CCTV_LOW_VOLTAGE', status: 'REVIEW_REQUIRED', confirmedAt: null, convertedAt: null, quotationId: null, version: 2, createdAt: now, updatedAt: now, lines: [{ id: 'line-1', position: 1, itemName: 'Camera', description: null, quantity: null, unitName: 'each', provenance: 'NEEDS_CONFIRMATION', evidence: 'Symbol obscured', confidence: { toString: () => '0.4200' }, isConfirmed: false, confirmedById: null, confirmedAt: null, createdAt: now, updatedAt: now }] });
    const snapshot = await getDrawingTakeoffSnapshot('tenant-trusted', 'takeoff-1');
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'takeoff-1', companyId: 'tenant-trusted' } }));
    expect(snapshot.review).toEqual({ requiresHumanReview: true, confirmedLines: 0, needsConfirmationLines: 1 });
    expect(snapshot.lines[0]).toMatchObject({ quantity: null, quantityProvenance: 'NEEDS_CONFIRMATION', confidence: '0.4200', humanReviewState: 'REVIEW_REQUIRED', needsConfirmation: true, governedUnitPrice: null, currencyCode: null });
  });

  it('returns the safe not-found boundary for a cross-tenant or missing session', async () => {
    findFirst.mockResolvedValue(null);
    await expect(getDrawingTakeoffSnapshot('tenant-trusted', 'foreign')).rejects.toMatchObject({ code: 'TAKEOFF_NOT_FOUND' });
  });
});
