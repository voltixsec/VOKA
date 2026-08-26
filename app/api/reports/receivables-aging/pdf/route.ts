import path from 'node:path';
import PDFDocument from 'pdfkit';
import { NextResponse } from 'next/server';
import { withCompanyAuth } from '@/lib/api';
import { getReceivablesAgingSnapshot, parseReceivablesAgingFilters } from '@/lib/reporting/receivables-aging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withCompanyAuth(['OWNER', 'ADMIN', 'SALES', 'VIEWER'], async (request, auth, company) => {
  const snapshot = await getReceivablesAgingSnapshot(company.companyId, parseReceivablesAgingFilters(request));
  const ar = auth.user.locale.startsWith('ar'); const t = (a: string, e: string) => ar ? a : e; const align = { align: ar ? 'right' as const : 'left' as const };
  const doc = new PDFDocument({ size: 'A4', margin: 42, info: { Title: t('أعمار الذمم المدينة', 'Receivables aging'), Author: 'VOKA' } }); const chunks: Buffer[] = []; doc.on('data', (chunk) => chunks.push(Buffer.from(chunk))); const finished = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); }); doc.registerFont('VOKA', path.join(process.cwd(), 'assets', 'fonts', 'Cairo-Variable.ttf')).font('VOKA');
  doc.fontSize(22).fillColor('#0f172a').text(t('أعمار الذمم المدينة', 'Receivables aging'), align).fontSize(10).fillColor('#475569').text(`${t('حتى تاريخ', 'As of')}: ${snapshot.asOf.slice(0, 10)}`, align).text(`${t('العملة', 'Currency')}: ${snapshot.currencyCode}`, align).moveDown().fontSize(14).fillColor('#0369a1').text(`${t('إجمالي المستحق', 'Total outstanding')}: ${snapshot.totalOutstanding} ${snapshot.currencyCode}`, align).fontSize(10).fillColor('#334155').text(`${t('عدد الفواتير', 'Invoice count')}: ${snapshot.invoiceCount}`, align).moveDown();
  for (const invoice of snapshot.invoices) { if (doc.y > 730) doc.addPage(); const customer = ar ? invoice.customer.nameAr ?? invoice.customer.nameEn ?? invoice.customer.name : invoice.customer.nameEn ?? invoice.customer.nameAr ?? invoice.customer.name; doc.fillColor('#0f172a').text(`${invoice.number} — ${customer}`, align).fontSize(9).fillColor('#64748b').text(`${invoice.dueDate?.slice(0, 10) ?? '—'} | ${invoice.overdueDays} | ${invoice.bucket} | ${invoice.outstandingAmount} ${snapshot.currencyCode}`, align).moveDown(0.5).fontSize(10); }
  doc.end(); const bytes = await finished;
  return new NextResponse(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="voka-receivables-${snapshot.asOf.slice(0, 10)}-${snapshot.currencyCode}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
