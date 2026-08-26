import { ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export function invoiceIdFromDocumentRequest(request: Request, format: 'pdf' | 'xlsx') {
  const parts = new URL(request.url).pathname.split('/').filter(Boolean);
  const index = parts.indexOf(format);
  if (index < 1) throw ApiError.badRequest('INVOICE_ID_REQUIRED', 'invoiceId is required.');
  return decodeURIComponent(parts[index - 1]);
}

export async function getInvoiceDocumentSnapshot(companyId: string, invoiceId: string) {
  const row = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, include: { company: true, lines: { orderBy: { position: 'asc' } } } });
  if (!row) throw ApiError.notFound('INVOICE_NOT_FOUND', 'Invoice not found.');
  return row;
}
