import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { withCompanyAuth } from '@/lib/api';
import { getReceivablesAgingSnapshot, parseReceivablesAgingFilters } from '@/lib/reporting/receivables-aging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withCompanyAuth(['OWNER', 'ADMIN', 'SALES', 'VIEWER'], async (request, auth, company) => {
  const snapshot = await getReceivablesAgingSnapshot(company.companyId, parseReceivablesAgingFilters(request));
  const ar = auth.user.locale.startsWith('ar');
  const t = (arabic: string, english: string) => ar ? arabic : english;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'VOKA'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(t('أعمار الذمم', 'Receivables Aging'), { views: [{ rightToLeft: ar }] });
  sheet.columns = [{ header: t('الفاتورة', 'Invoice'), key: 'invoice', width: 20 }, { header: t('العميل', 'Customer'), key: 'customer', width: 32 }, { header: t('الاستحقاق', 'Due'), key: 'due', width: 16 }, { header: t('التأخير', 'Overdue days'), key: 'days', width: 16 }, { header: t('الفئة', 'Bucket'), key: 'bucket', width: 18 }, { header: `${t('المستحق', 'Outstanding')} (${snapshot.currencyCode})`, key: 'outstanding', width: 22 }];
  snapshot.invoices.forEach((invoice) => sheet.addRow({ invoice: invoice.number, customer: ar ? invoice.customer.nameAr ?? invoice.customer.nameEn ?? invoice.customer.name : invoice.customer.nameEn ?? invoice.customer.nameAr ?? invoice.customer.name, due: invoice.dueDate?.slice(0, 10) ?? '', days: invoice.overdueDays, bucket: invoice.bucket, outstanding: Number(invoice.outstandingAmount) }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF075985' } }; sheet.autoFilter = { from: 'A1', to: 'F1' }; sheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: ar }]; sheet.getColumn('outstanding').numFmt = '#,##0.000';
  const summary = workbook.addWorksheet(t('الملخص', 'Summary'), { views: [{ rightToLeft: ar }] }); summary.addRows([[t('حتى تاريخ', 'As of'), snapshot.asOf.slice(0, 10)], [t('العملة', 'Currency'), snapshot.currencyCode], [t('عدد الفواتير', 'Invoice count'), snapshot.invoiceCount], [t('إجمالي المستحق', 'Total outstanding'), Number(snapshot.totalOutstanding)], ...Object.entries(snapshot.buckets).map(([key, value]) => [key, Number(value)])]); summary.getColumn(1).width = 30; summary.getColumn(2).width = 22; summary.getColumn(2).numFmt = '#,##0.000';
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="voka-receivables-${snapshot.asOf.slice(0, 10)}-${snapshot.currencyCode}.xlsx"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
