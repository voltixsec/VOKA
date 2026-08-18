"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../../../components/i18n/LanguageProvider';
import { Badge, Card, SectionHeader } from '../../../../components/ui';

type Customer = Record<string, string | number | null> & { id: string; code: string; name: string; nameAr?: string | null; nameEn?: string | null; status: string };

export default function CustomerDetailPage() {
  const { isArabic } = useLanguage();
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'notFound' | 'forbidden' | 'error'>('loading');
  useEffect(() => { void (async () => {
    const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}`);
    if (response.status === 404) return setState('notFound');
    if (response.status === 401 || response.status === 403) return setState('forbidden');
    if (!response.ok) return setState('error');
    const json = await response.json(); setCustomer(json.data.customer); setState('ready');
  })(); }, [customerId]);
  if (state === 'loading') return <Card>{isArabic ? 'جارٍ تحميل العميل...' : 'Loading customer...'}</Card>;
  if (state !== 'ready' || !customer) return <Card role="alert" className="border-amber-400/20 bg-amber-400/5 text-amber-200">{state === 'notFound' ? (isArabic ? 'العميل غير موجود.' : 'Customer not found.') : state === 'forbidden' ? (isArabic ? 'ليست لديك صلاحية لعرض هذا العميل.' : 'You do not have access to this customer.') : (isArabic ? 'تعذر تحميل العميل.' : 'Unable to load customer.')}</Card>;

  const displayName = isArabic
    ? customer.nameAr || customer.name || customer.nameEn || ''
    : customer.nameEn || customer.name || customer.nameAr || '';

  const fields: Array<[string, string, unknown]> = [
    ['Arabic name', 'الاسم بالعربية', customer.nameAr], ['English name', 'الاسم بالإنكليزية', customer.nameEn],
    ['Legal name', 'الاسم القانوني', customer.legalName], ['Email', 'البريد الإلكتروني', customer.email],
    ['Phone', 'الهاتف', customer.phone], ['Mobile', 'الجوال', customer.mobile], ['WhatsApp', 'واتساب', customer.whatsapp],
    ['Country', 'الدولة', customer.countryCode], ['Address', 'العنوان', [customer.addressLine1, customer.addressLine2, customer.city, customer.state, customer.postalCode].filter(Boolean).join(', ')],
    ['Tax number', 'الرقم الضريبي', customer.taxNumber], ['Preferred language', 'اللغة المفضلة', customer.preferredLocale],
    ['Currency', 'العملة', customer.preferredCurrency], ['Credit limit', 'الحد الائتماني', customer.creditLimit],
    ['Payment terms', 'أيام السداد', customer.paymentTermDays], ['Notes', 'ملاحظات', customer.notes],
  ];
  return <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
    <SectionHeader eyebrow={customer.code} title={displayName} description={isArabic ? 'بيانات العميل الحالية والمؤكدة.' : 'Current canonical customer details.'} actions={<div className="flex gap-3"><Link className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5" href="/dashboard/customers">{isArabic ? 'العملاء' : 'Customers'}</Link><Link className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950" href={`/dashboard/customers/${encodeURIComponent(customer.id)}/edit`}>{isArabic ? 'تعديل العميل' : 'Edit customer'}</Link></div>} />
    <Card><div className="flex items-center justify-between"><span className="text-slate-400">{isArabic ? 'الحالة' : 'Status'}</span><Badge>{customer.status}</Badge></div></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([en, ar, value]) => <Card key={en} padding="sm"><p className="text-sm text-slate-500">{isArabic ? ar : en}</p><p className="mt-2 break-words text-slate-100" dir={en === 'Email' || en === 'Phone' || en === 'Mobile' || en === 'WhatsApp' ? 'ltr' : 'auto'}>{value === null || value === undefined || value === '' ? '—' : String(value)}</p></Card>)}</div>
  </section>;
}
