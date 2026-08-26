import ExcelJS from 'exceljs';
import type { IQuotationDocumentRenderer, QuotationDocumentSnapshot } from '@/src/application/document';

export class XlsxQuotationDocumentRenderer implements IQuotationDocumentRenderer {
  async render(snapshot: QuotationDocumentSnapshot): Promise<Uint8Array> {
    const ar = snapshot.locale === 'ar'; const t = (a: string, e: string) => ar ? a : e; const q = snapshot.quotation;
    const book = new ExcelJS.Workbook(); book.creator = 'VOKA'; book.created = new Date();
    const sheet = book.addWorksheet(t('عرض السعر', 'Quotation'), { views: [{ rightToLeft: ar }] });
    const text = (arValue: string | null, enValue: string | null, fallback = '') => ar ? arValue ?? enValue ?? fallback : enValue ?? arValue ?? fallback;
    sheet.addRows([[t('الشركة', 'Company'), snapshot.company.name], [t('رقم العرض', 'Quotation number'), q.number], [t('رقم المراجعة', 'Revision number'), q.revisionNumber ?? 0], [t('الحالة', 'Status'), q.status], [t('تاريخ الإصدار', 'Issue date'), q.issueDate], [t('تاريخ الانتهاء', 'Expiry date'), q.expiryDate], [t('العملة', 'Currency'), q.currencyCode], [t('العميل', 'Customer'), q.customer.name], [t('البريد', 'Email'), q.customer.email], [t('الهاتف', 'Phone'), q.customer.phone], [t('المشروع', 'Project'), text(q.projectNameAr, q.projectNameEn, q.projectName ?? '')], [t('لعناية', 'Attention'), text(q.attentionNameAr, q.attentionNameEn, q.attentionName ?? '')], [t('الموضوع', 'Subject'), text(q.subjectAr, q.subjectEn)], [t('النطاق', 'Scope'), q.scopeType], []]);
    sheet.addRow([t('الترتيب', 'Position'), t('النوع', 'Type'), t('الرمز', 'Code'), t('البند', 'Item'), t('الوصف', 'Description'), t('الوحدة', 'Unit'), t('الكمية', 'Quantity'), t('سعر الوحدة', 'Unit price'), t('الخصم', 'Discount'), t('الضريبة', 'Tax'), t('الإجمالي', 'Total')]);
    q.lines.forEach((line) => sheet.addRow([line.position, line.type, line.itemCode, text(line.itemNameAr, line.itemNameEn, line.itemName), text(line.descriptionAr, line.descriptionEn, line.description ?? ''), text(line.unitNameAr, line.unitNameEn, line.unitName ?? ''), line.quantity, line.unitPrice, line.discountAmount, line.taxAmount, line.totalAmount]));
    sheet.addRows([[], [t('المجموع الفرعي', 'Subtotal'), q.totals.subtotal], [t('الخصم', 'Discount'), q.totals.discountAmount], [t('الضريبة', 'Tax'), q.totals.taxAmount], [t('الإجمالي', 'Total'), q.totals.totalAmount], [], [t('الشروط', 'Terms'), text(q.termsAndConditionsAr, q.termsAndConditionsEn, q.termsAndConditions ?? '')], [t('ملاحظات', 'Notes'), text(q.notesAr, q.notesEn, q.notes ?? '')]]);
    sheet.columns = [{ width: 12 }, { width: 16 }, { width: 18 }, { width: 34 }, { width: 42 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 18 }]; sheet.getColumn(5).alignment = { wrapText: true }; for (const column of [7,8,9,10,11]) sheet.getColumn(column).numFmt = '#,##0.000';
    return new Uint8Array(await book.xlsx.writeBuffer());
  }
}
