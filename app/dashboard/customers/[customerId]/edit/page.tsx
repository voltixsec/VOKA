"use client";

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../../../../components/i18n/LanguageProvider';
import { Card, SectionHeader } from '../../../../../components/ui';
import { CustomerForm, customerFormPayload, emptyCustomerForm, type CustomerFormValue } from '../../../../../features/customers/components/CustomerForm';

function toForm(customer: Record<string, unknown>): CustomerFormValue {
  const text = (field: string) => customer[field] == null ? '' : String(customer[field]);
  return { ...emptyCustomerForm, code: text('code'), name: text('name'), type: customer.type === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY', status: ['LEAD','ACTIVE','INACTIVE','BLOCKED'].includes(String(customer.status)) ? customer.status as CustomerFormValue['status'] : 'LEAD', legalName: text('legalName'), email: text('email'), phone: text('phone'), mobile: text('mobile'), whatsapp: text('whatsapp'), taxNumber: text('taxNumber'), addressLine1: text('addressLine1'), addressLine2: text('addressLine2'), city: text('city'), state: text('state'), postalCode: text('postalCode'), countryCode: text('countryCode') || 'KW', preferredLocale: customer.preferredLocale === 'AR' || customer.preferredLocale === 'EN' ? customer.preferredLocale : '', preferredCurrency: text('preferredCurrency'), creditLimit: text('creditLimit'), paymentTermDays: text('paymentTermDays'), notes: text('notes') };
}

export default function EditCustomerPage() {
  const { isArabic } = useLanguage(); const { customerId } = useParams<{ customerId: string }>(); const router = useRouter();
  const [initial, setInitial] = useState<CustomerFormValue | null>(null); const [error, setError] = useState('');
  useEffect(() => { void (async () => { const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}`); const json = await response.json().catch(() => null); if (!response.ok) return setError(json?.error?.message ?? (isArabic ? 'تعذر تحميل العميل.' : 'Unable to load customer.')); setInitial(toForm(json.data.customer)); })(); }, [customerId, isArabic]);
  return <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}><SectionHeader eyebrow={isArabic ? 'إدارة العملاء' : 'Customer management'} title={isArabic ? 'تعديل العميل' : 'Edit customer'} description={isArabic ? 'حدّث الحقول المطلوبة فقط.' : 'Update the customer profile safely.'} actions={<Link className="text-sm text-sky-300 hover:underline" href={`/dashboard/customers/${encodeURIComponent(customerId)}`}>{isArabic ? 'العودة للعميل' : 'Back to customer'}</Link>} />{error && <Card role="alert" className="border-red-400/20 bg-red-400/5 text-red-300">{error}</Card>}{!initial && !error && <Card>{isArabic ? 'جارٍ التحميل...' : 'Loading...'}</Card>}{initial && <CustomerForm initialValue={initial} isArabic={isArabic} submitLabel={isArabic ? 'حفظ التغييرات' : 'Save changes'} onSubmit={async (value) => { setError(''); const before = customerFormPayload(initial); const after = customerFormPayload(value); const changes = Object.fromEntries(Object.entries(after).filter(([key, next]) => next !== before[key as keyof typeof before])); const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }); const json = await response.json().catch(() => null); if (!response.ok) { setError(json?.error?.message ?? (isArabic ? 'تعذر حفظ العميل.' : 'Unable to save customer.')); return; } router.push(`/dashboard/customers/${encodeURIComponent(customerId)}`); }} />}</section>;
}
