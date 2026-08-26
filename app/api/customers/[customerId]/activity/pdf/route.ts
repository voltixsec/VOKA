import path from 'node:path';
import PDFDocument from 'pdfkit';
import { NextResponse } from 'next/server';
import { ApiError, withCompanyAuth } from '@/lib/api';
import { getCustomerActivitySnapshot } from '@/lib/reporting/customer-activity';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
function customerId(request: Request) { const parts = new URL(request.url).pathname.split('/').filter(Boolean); const index = parts.indexOf('activity'); const value = decodeURIComponent(parts[index - 1] ?? ''); if (!value) throw ApiError.badRequest('CUSTOMER_ID_REQUIRED', 'customerId is required.'); return value; }

export const GET = withCompanyAuth(['OWNER', 'ADMIN', 'SALES', 'VIEWER'], async (request, auth, company) => {
  const snapshot = await getCustomerActivitySnapshot(company.companyId, customerId(request), 'EXPORT'); const ar = auth.user.locale.startsWith('ar'); const t = (a: string, e: string) => ar ? a : e; const align = { align: ar ? 'right' as const : 'left' as const }; const name = ar ? snapshot.customer.nameAr ?? snapshot.customer.nameEn ?? snapshot.customer.name : snapshot.customer.nameEn ?? snapshot.customer.nameAr ?? snapshot.customer.name;
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: t('نشاط العميل', 'Customer Activity'), Author: 'VOKA' } }); const chunks: Buffer[] = []; doc.on('data', (chunk) => chunks.push(Buffer.from(chunk))); const finished = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); }); doc.registerFont('VOKA', path.join(process.cwd(), 'assets', 'fonts', 'Cairo-Variable.ttf')).font('VOKA'); doc.fontSize(22).fillColor('#0f172a').text(t('نشاط العميل', 'Customer Activity'), align).fontSize(11).fillColor('#475569').text(`${name} (${snapshot.customer.code})`, align).text(`${t('تم الإنشاء', 'Generated')}: ${snapshot.generatedAt.slice(0, 19).replace('T', ' ')} UTC`, align).moveDown();
  const section = (title: string, rows: string[]) => { if (doc.y > 680) doc.addPage(); doc.fontSize(15).fillColor('#0f172a').text(title, align).moveDown(.35); if (!rows.length) doc.fontSize(9).fillColor('#64748b').text(t('لا توجد سجلات', 'No records'), align); for (const row of rows) { if (doc.y > 750) doc.addPage(); doc.fontSize(8.5).fillColor('#334155').text(row, align); } doc.moveDown(); };
  section(t('عروض الأسعار', 'Quotations'), snapshot.quotations.records.map((r) => `${r.issueDate.slice(0, 10)} | ${r.number} | ${r.status} | ${r.totalAmount.toFixed(3)} ${r.currencyCode} | family ${r.familyId} / rev ${r.revisionNumber}`));
  section(t('أوامر البيع', 'Sales Orders'), snapshot.salesOrders.records.map((r) => `${r.orderDate.slice(0, 10)} | ${r.number} | ${r.status} | ${r.totalAmount.toFixed(3)} ${r.currencyCode} | ${r.sourceQuotationNumber} / rev ${r.sourceQuotationRevisionNumber}`));
  section(t('العقود', 'Contracts'), snapshot.contracts.records.map((r) => `${r.contractDate.slice(0, 10)} | ${r.number} | ${r.status} | ${r.totalAmount.toFixed(3)} ${r.currencyCode} | ${r.origin}${r.sourceKind ? ` / ${r.sourceKind} ${r.sourceId ?? ''}` : ''}`));
  section(t('الفواتير', 'Invoices'), snapshot.invoices.records.map((r) => `${r.invoiceDate.slice(0, 10)} | ${r.number} | ${r.status}/${r.settlementStatus} | ${r.totalAmount.toFixed(3)} ${r.currencyCode} | ${r.origin}${r.sourceQuotationFamilyId ? ` / family ${r.sourceQuotationFamilyId} rev ${r.sourceQuotationRevisionNumber}` : ''}`));
  section(t('المدفوعات', 'Payments'), snapshot.payments.records.map((r) => `${r.receivedAt.slice(0, 10)} | ${r.reference?.trim() || r.invoice.number} | ${r.method} | ${r.amount.toFixed(3)} ${r.currencyCode} | ${r.invoice.number}`));
  doc.end(); return new NextResponse(await finished, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="customer-activity-${snapshot.customer.code}.pdf"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
