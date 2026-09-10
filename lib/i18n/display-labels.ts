export type DisplayLocale = 'ar' | 'en';

const labels: Record<string, Record<DisplayLocale, string>> = {
  AUTO: { ar: 'تلقائي', en: 'Auto' },
  CATALOG_ONLY: { ar: 'الكتالوج فقط', en: 'Catalog only' },
  SUPPLY_INSTALL_SYSTEM: { ar: 'نظام توريد وتركيب', en: 'Supply and install system' },
  DRAWING: { ar: 'مخطط', en: 'Drawing' },
  DRAWING_TAKEOFF: { ar: 'حصر كميات المخطط', en: 'Drawing takeoff' },
  TRANSCRIPT_READY: { ar: 'النص جاهز للفهم', en: 'Transcript ready' },
  READY_FOR_REVIEW: { ar: 'المسودة جاهزة للمراجعة', en: 'Draft ready for review' },
  NEEDS_CLARIFICATION: { ar: 'يحتاج معلومات', en: 'Needs information' },
  RECORDING: { ar: 'جاري التسجيل', en: 'Recording' },
  TRANSCRIBING: { ar: 'جاري التفريغ', en: 'Transcribing' },
  LISTENING: { ar: 'جاري الاستماع', en: 'Listening' },
  PROCESSING: { ar: 'جاري المعالجة', en: 'Processing' },
  UNAVAILABLE: { ar: 'غير متاح', en: 'Unavailable' },
  PERMISSION_DENIED: { ar: 'إذن الميكروفون مرفوض', en: 'Microphone permission denied' },
  ERROR: { ar: 'حدث خطأ', en: 'Error' },
  INVALID_INPUT: { ar: 'مدخلات غير صالحة', en: 'Invalid input' },
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
  COMPLETE: { ar: 'مكتمل', en: 'Complete' },
  EXPIRED: { ar: 'منتهي', en: 'Expired' },
  NEEDS_CONFIRMATION: { ar: 'بحاجة إلى تأكيد', en: 'Needs confirmation' },
  USER_PROVIDED: { ar: 'أدخله المستخدم', en: 'User provided' },
  RULE_CALCULATED: { ar: 'محسوب بقاعدة', en: 'Rule calculated' },
  AI_ESTIMATED: { ar: 'تقدير يحتاج مراجعة', en: 'Estimate — review required' },
  CATALOG_MATCHED: { ar: 'من الكتالوج', en: 'Catalog matched' },
  COMPANY_DEFAULT: { ar: 'إعداد الشركة', en: 'Company default' },
  CUSTOMER_DEFAULT: { ar: 'إعداد العميل', en: 'Customer default' },
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
  SUPPLY_ONLY: { ar: 'توريد فقط', en: 'Supply only' },
  SUPPLY_AND_INSTALLATION: { ar: 'توريد وتركيب', en: 'Supply and installation' },
  INSTALLATION_ONLY: { ar: 'تركيب فقط', en: 'Installation only' },
  SERVICE: { ar: 'خدمة', en: 'Service' },
  PERCENTAGE: { ar: 'نسبة مئوية', en: 'Percentage' },
  FIXED_AMOUNT: { ar: 'مبلغ ثابت', en: 'Fixed amount' },
  FIXED: { ar: 'مبلغ ثابت', en: 'Fixed amount' },
  PRODUCT: { ar: 'منتج', en: 'Product' },
  SHIPPING: { ar: 'شحن', en: 'Shipping' },
  LABOR: { ar: 'عمالة', en: 'Labor' },
  DISCOUNT: { ar: 'خصم', en: 'Discount' },
  CUSTOM: { ar: 'مخصص', en: 'Custom' },
  CODE_REQUIRED: { ar: 'الكود مطلوب', en: 'Code is required' },
  NAME_REQUIRED: { ar: 'الاسم مطلوب', en: 'Name is required' },
  INVALID_TYPE: { ar: 'نوع الصنف غير صالح', en: 'Invalid item type' },
  INVALID_SALE_PRICE: { ar: 'سعر البيع غير صالح', en: 'Invalid sale price' },
  INVALID_PURCHASE_PRICE: { ar: 'سعر الشراء غير صالح', en: 'Invalid purchase price' },
  INVALID_TRACK_INVENTORY: { ar: 'قيمة تتبع المخزون غير صالحة', en: 'Invalid inventory tracking value' },
  INVALID_ALLOW_DISCOUNT: { ar: 'قيمة السماح بالخصم غير صالحة', en: 'Invalid allow-discount value' },
  INVALID_ACTIVE: { ar: 'قيمة الحالة غير صالحة', en: 'Invalid active value' },
  UNRESOLVED_UNIT: { ar: 'تعذر مطابقة الوحدة', en: 'Unit could not be matched' },
  AMBIGUOUS_UNIT: { ar: 'الوحدة غير محددة بشكل كافٍ', en: 'Unit is ambiguous' },
  UNRESOLVED_TAX_RATE: { ar: 'تعذر مطابقة الضريبة', en: 'Tax rate could not be matched' },
  AMBIGUOUS_TAX_RATE: { ar: 'الضريبة غير محددة بشكل كافٍ', en: 'Tax rate is ambiguous' },
  DUPLICATE_CODE_IN_WORKBOOK: { ar: 'الكود مكرر في الملف', en: 'Duplicate code in workbook' },
  DUPLICATE_SKU_IN_WORKBOOK: { ar: 'رمز المخزون مكرر في الملف', en: 'Duplicate SKU in workbook' },
  DUPLICATE_BARCODE_IN_WORKBOOK: { ar: 'الباركود مكرر في الملف', en: 'Duplicate barcode in workbook' },
  CATALOG_ITEM_CODE_ALREADY_EXISTS: { ar: 'الكود موجود مسبقاً في الكتالوج', en: 'Catalog item code already exists' },
  CATALOG_ITEM_SKU_ALREADY_EXISTS: { ar: 'رمز المخزون موجود مسبقاً', en: 'Catalog item SKU already exists' },
  CATALOG_ITEM_BARCODE_ALREADY_EXISTS: { ar: 'الباركود موجود مسبقاً', en: 'Catalog item barcode already exists' },
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
