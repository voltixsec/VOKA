export type DisplayLocale = 'ar' | 'en';

const labels: Record<string, Record<DisplayLocale, string>> = {
  REVIEW_REQUIRED: { ar: 'بحاجة إلى مراجعة', en: 'Review required' },
  CONFIRMED: { ar: 'مؤكد', en: 'Confirmed' },
  CONVERTED: { ar: 'تم إنشاء المستند', en: 'Document created' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled' },
  DRAFT: { ar: 'مسودة', en: 'Draft' },
  SENT: { ar: 'مرسل', en: 'Sent' },
  APPROVED: { ar: 'معتمد', en: 'Approved' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected' },
  ISSUED: { ar: 'صادرة', en: 'Issued' },
  VOID: { ar: 'ملغاة', en: 'Void' },
  UNPAID: { ar: 'غير مدفوعة', en: 'Unpaid' },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partially paid' },
  PAID: { ar: 'مدفوعة', en: 'Paid' },
  COMPLETED: { ar: 'مكتمل', en: 'Complete' },
  NEEDS_CONFIRMATION: { ar: 'بحاجة إلى تأكيد', en: 'Needs confirmation' },
  USER_PROVIDED: { ar: 'أدخله المستخدم', en: 'User provided' },
  DRAWING_COUNTED: { ar: 'محسوب من الرسم', en: 'Counted from drawing' },
  QUOTATION: { ar: 'عرض سعر', en: 'Quotation' },
  SALES_ORDER: { ar: 'أمر بيع', en: 'Sales order' },
  CONTRACT: { ar: 'عقد', en: 'Contract' },
  INVOICE: { ar: 'فاتورة', en: 'Invoice' },
  DIRECT: { ar: 'مباشرة', en: 'Direct' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank transfer' },
  CASH: { ar: 'نقداً', en: 'Cash' },
  CARD: { ar: 'بطاقة', en: 'Card' },
  CHEQUE: { ar: 'شيك', en: 'Cheque' },
  OTHER: { ar: 'أخرى', en: 'Other' },
  ADMIN: { ar: 'مسؤول النظام', en: 'System administrator' },
  SALES: { ar: 'المبيعات', en: 'Sales' },
};

export function displayLabel(value: string, locale: DisplayLocale): string {
  return labels[value]?.[locale] ?? value;
}

export function displayActorName(value: string, locale: DisplayLocale): string {
  if (value.trim().toLowerCase() === 'system administrator') {
    return locale === 'ar' ? 'مسؤول النظام' : 'System administrator';
  }
  return value;
}

export function catalogFallbackDisclosure(locale: DisplayLocale): string {
  return locale === 'ar'
    ? 'يُعرض الاسم الأصلي لعدم إضافة ترجمة عربية حتى الآن.'
    : 'Showing the original name — no English localization has been added yet.';
}
