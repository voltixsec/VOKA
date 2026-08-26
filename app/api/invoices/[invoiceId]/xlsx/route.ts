import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { withCompanyAuth } from '@/lib/api';
import { getInvoiceDocumentSnapshot, invoiceIdFromDocumentRequest } from '@/lib/documents/invoice-snapshot';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export const GET = withCompanyAuth(['OWNER', 'ADMIN', 'SALES', 'VIEWER'], async (request, auth, company) => {
  const row = await getInvoiceDocumentSnapshot(company.companyId, invoiceIdFromDocumentRequest(request, 'xlsx'));
  const ar = auth.user.locale.startsWith('ar'); const t = (a: string, e: string) => ar ? a : e;
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'VOKA'; workbook.created = new Date();
  const sheet = workbook.addWorksheet(t('الفاتورة', 'Invoice'), { views: [{ rightToLeft: ar }] });
  sheet.addRows([[t('رقم الفاتورة', 'Invoice number'), row.number], [t('العميل', 'Customer'), ar ? row.customerNameAr ?? row.customerName : row.customerNameEn ?? row.customerName], [t('تاريخ الفاتورة', 'Invoice date'), row.invoiceDate], [t('تاريخ الاستحقاق', 'Due date'), row.dueDate], [t('العملة', 'Currency'), row.currencyCode], []]);
  sheet.addRow([t('البند', 'Item'), t('الكمية', 'Quantity'), t('سعر الوحدة', 'Unit price'), t('الخصم', 'Discount'), t('الضريبة', 'Tax'), t('الإجمالي', 'Total')]);
  row.lines.forEach((line) => sheet.addRow([ar ? line.itemNameAr ?? line.itemName : line.itemNameEn ?? line.itemName, Number(line.quantity), Number(line.unitPrice), Number(line.discountAmount), Number(line.taxAmount), Number(line.totalAmount)]));
  sheet.addRows([[], [t('المجموع الفرعي', 'Subtotal'), Number(row.subtotal)], [t('الخصم', 'Discount'), Number(row.discountAmount)], [t('الضريبة', 'Tax'), Number(row.taxAmount)], [t('الإجمالي', 'Total'), Number(row.totalAmount)], [t('المدفوع', 'Paid'), Number(row.paidAmount)], [t('المتبقي', 'Outstanding'), Number(row.outstandingAmount)]]);
  sheet.columns = [{ width: 36 }, { width: 16 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }]; for (const column of [2,3,4,5,6]) sheet.getColumn(column).numFmt = '#,##0.000';
  const bytes = await workbook.xlsx.writeBuffer(); const filename = row.number.replace(/[^A-Za-z0-9._-]/g, '-');
  return new NextResponse(Buffer.from(bytes), { headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="invoice-${filename}.xlsx"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
