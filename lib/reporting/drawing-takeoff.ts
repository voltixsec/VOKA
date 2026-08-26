import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export async function getDrawingTakeoffSnapshot(companyId: string, sessionId: string) {
  const session = await prisma.drawingTakeoffSession.findFirst({
    where: { id: sessionId, companyId },
    select: {
      id: true, sourceFileName: true, sourceMimeType: true, sourceSizeBytes: true,
      userIntent: true, discipline: true, status: true, confirmedAt: true,
      convertedAt: true, quotationId: true, version: true, createdAt: true, updatedAt: true,
      lines: {
        select: {
          id: true, position: true, itemName: true, description: true, quantity: true,
          unitName: true, provenance: true, evidence: true, confidence: true,
          isConfirmed: true, confirmedById: true, confirmedAt: true,
          createdAt: true, updatedAt: true,
        },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!session) throw ApiError.notFound('TAKEOFF_NOT_FOUND', 'Takeoff session was not found.');

  return {
    id: session.id,
    sourceFileName: session.sourceFileName,
    source: { fileName: session.sourceFileName, mimeType: session.sourceMimeType, sizeBytes: session.sourceSizeBytes },
    project: null,
    systemScope: session.discipline,
    userIntent: session.userIntent,
    status: session.status,
    version: session.version,
    quotationId: session.quotationId,
    confirmedAt: session.confirmedAt?.toISOString() ?? null,
    convertedAt: session.convertedAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    review: {
      requiresHumanReview: session.status === 'REVIEW_REQUIRED' || session.lines.some((line) => !line.isConfirmed || line.quantity === null),
      confirmedLines: session.lines.filter((line) => line.isConfirmed).length,
      needsConfirmationLines: session.lines.filter((line) => line.provenance === 'NEEDS_CONFIRMATION' || !line.isConfirmed || line.quantity === null).length,
    },
    lines: session.lines.map((line) => ({
      id: line.id, position: line.position, detectedItem: line.itemName, itemName: line.itemName,
      description: line.description, quantity: line.quantity === null ? null : String(line.quantity),
      unit: line.unitName, unitName: line.unitName, quantityProvenance: line.provenance, provenance: line.provenance, evidence: line.evidence,
      confidence: line.confidence === null ? null : String(line.confidence),
      humanReviewState: line.isConfirmed ? 'CONFIRMED' as const : 'REVIEW_REQUIRED' as const,
      isConfirmed: line.isConfirmed,
      needsConfirmation: line.provenance === 'NEEDS_CONFIRMATION' || !line.isConfirmed || line.quantity === null,
      mappedItem: null, catalogMapping: null, governedUnitPrice: null, currencyCode: null, notes: null,
      confirmedById: line.confirmedById, confirmedAt: line.confirmedAt?.toISOString() ?? null,
      createdAt: line.createdAt.toISOString(), updatedAt: line.updatedAt.toISOString(),
    })),
  };
}
