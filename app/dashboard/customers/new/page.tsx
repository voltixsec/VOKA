"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useLanguage } from '../../../../components/i18n/LanguageProvider';
import { Card, SectionHeader } from '../../../../components/ui';
import { CustomerForm, customerFormPayload } from '../../../../features/customers/components/CustomerForm';

export default function NewCustomerPage() {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const [error, setError] = useState('');
  return <section className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
    <SectionHeader eyebrow={isArabic ? 'إدارة العملاء' : 'Customer management'} title={isArabic ? 'عميل جديد' : 'New customer'} description={isArabic ? 'أنشئ ملف العميل وبيانات التواصل المؤكدة.' : 'Create the customer profile and confirmed contact details.'} actions={<Link className="text-sm text-sky-300 hover:underline" href="/dashboard/customers">{isArabic ? 'العودة للعملاء' : 'Back to customers'}</Link>} />
    {error && <Card className="border-red-400/20 bg-red-400/5 text-red-300" role="alert">{error}</Card>}
    <CustomerForm isArabic={isArabic} submitLabel={isArabic ? 'إنشاء العميل' : 'Create customer'} onSubmit={async (value) => {
      setError('');
      const response = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(customerFormPayload(value)) });
      const json = await response.json().catch(() => null);
      if (!response.ok) { setError(json?.error?.message ?? (isArabic ? 'تعذر إنشاء العميل.' : 'Unable to create customer.')); return; }
      router.push(`/dashboard/customers/${encodeURIComponent(json.data.customer.id)}`);
    }} />
  </section>;
}
