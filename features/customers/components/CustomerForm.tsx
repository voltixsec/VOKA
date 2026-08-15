"use client";

import { useState } from 'react';
import { Button, Card, Input } from '../../../components/ui';
import { CountryWhatsAppInput } from './CountryWhatsAppInput';

export type CustomerFormValue = {
  code: string; name: string; type: 'COMPANY' | 'INDIVIDUAL'; status: 'LEAD' | 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
  legalName: string; email: string; phone: string; mobile: string; whatsapp: string;
  taxNumber: string; addressLine1: string; addressLine2: string; city: string; state: string;
  postalCode: string; countryCode: string; preferredLocale: '' | 'EN' | 'AR'; preferredCurrency: string;
  creditLimit: string; paymentTermDays: string; notes: string;
};

export const emptyCustomerForm: CustomerFormValue = {
  code: '', name: '', type: 'COMPANY', status: 'LEAD', legalName: '', email: '', phone: '', mobile: '', whatsapp: '',
  taxNumber: '', addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', countryCode: 'KW',
  preferredLocale: '', preferredCurrency: 'KWD', creditLimit: '', paymentTermDays: '', notes: '',
};

export function customerFormPayload(value: CustomerFormValue) {
  return {
    ...value,
    legalName: value.legalName || null, email: value.email || null, phone: value.phone || null,
    mobile: value.mobile || null, whatsapp: value.whatsapp || null, taxNumber: value.taxNumber || null,
    addressLine1: value.addressLine1 || null, addressLine2: value.addressLine2 || null, city: value.city || null,
    state: value.state || null, postalCode: value.postalCode || null, countryCode: value.countryCode || null,
    preferredLocale: value.preferredLocale || null, preferredCurrency: value.preferredCurrency || null,
    creditLimit: value.creditLimit === '' ? null : Number(value.creditLimit),
    paymentTermDays: value.paymentTermDays === '' ? null : Number(value.paymentTermDays), notes: value.notes || null,
  };
}

export function CustomerForm(props: {
  initialValue?: CustomerFormValue; isArabic: boolean; submitLabel: string;
  onSubmit: (value: CustomerFormValue) => Promise<void>;
}) {
  const [value, setValue] = useState(props.initialValue ?? emptyCustomerForm);
  const [saving, setSaving] = useState(false);
  const [whatsappValid, setWhatsAppValid] = useState(true);
  const set = (field: keyof CustomerFormValue, next: string) => setValue((current) => ({ ...current, [field]: next }));
  const labels = props.isArabic ? {
    code: 'رمز العميل', name: 'اسم العميل', legal: 'الاسم القانوني', email: 'البريد الإلكتروني', phone: 'الهاتف', mobile: 'الجوال',
    tax: 'الرقم الضريبي', address1: 'العنوان', address2: 'تكملة العنوان', city: 'المدينة', state: 'المنطقة', postal: 'الرمز البريدي',
    country: 'رمز الدولة (ISO)', currency: 'العملة', credit: 'الحد الائتماني', terms: 'أيام السداد', notes: 'ملاحظات',
  } : {
    code: 'Customer code', name: 'Customer name', legal: 'Legal name', email: 'Email', phone: 'Phone', mobile: 'Mobile',
    tax: 'Tax number', address1: 'Address', address2: 'Address line 2', city: 'City', state: 'State', postal: 'Postal code',
    country: 'Country code (ISO)', currency: 'Currency', credit: 'Credit limit', terms: 'Payment term days', notes: 'Notes',
  };
  return (
    <form onSubmit={async (event) => { event.preventDefault(); if (!whatsappValid) return; setSaving(true); try { await props.onSubmit(value); } finally { setSaving(false); } }} className="space-y-6">
      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2"><Input required label={labels.code} value={value.code} onChange={(e) => set('code', e.target.value)} /><Input required label={labels.name} value={value.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="grid gap-4 md:grid-cols-2"><Input label={labels.legal} value={value.legalName} onChange={(e) => set('legalName', e.target.value)} /><Input type="email" label={labels.email} value={value.email} onChange={(e) => set('email', e.target.value)} /></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300"><span className="block font-medium">{props.isArabic ? 'النوع' : 'Type'}</span><select value={value.type} onChange={(e) => set('type', e.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"><option value="COMPANY">{props.isArabic ? 'شركة' : 'Company'}</option><option value="INDIVIDUAL">{props.isArabic ? 'فرد' : 'Individual'}</option></select></label>
          <label className="space-y-2 text-sm text-slate-300"><span className="block font-medium">{props.isArabic ? 'الحالة' : 'Status'}</span><select value={value.status} onChange={(e) => set('status', e.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"><option value="LEAD">LEAD</option><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="BLOCKED">BLOCKED</option></select></label>
        </div>
      </Card>
      <Card className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Input label={labels.phone} value={value.phone} onChange={(e) => set('phone', e.target.value)} /><Input label={labels.mobile} value={value.mobile} onChange={(e) => set('mobile', e.target.value)} /></div><CountryWhatsAppInput value={value.whatsapp} countryCode={value.countryCode} isArabic={props.isArabic} onChange={(next, valid) => { set('whatsapp', next); setWhatsAppValid(valid); }} /></Card>
      <Card className="space-y-5"><div className="grid gap-4 md:grid-cols-2"><Input label={labels.address1} value={value.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} /><Input label={labels.address2} value={value.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} /></div><div className="grid gap-4 md:grid-cols-3"><Input label={labels.city} value={value.city} onChange={(e) => set('city', e.target.value)} /><Input label={labels.state} value={value.state} onChange={(e) => set('state', e.target.value)} /><Input label={labels.postal} value={value.postalCode} onChange={(e) => set('postalCode', e.target.value)} /></div><Input label={labels.country} maxLength={2} value={value.countryCode} onChange={(e) => set('countryCode', e.target.value.toUpperCase())} /></Card>
      <Card className="space-y-5"><div className="grid gap-4 md:grid-cols-3"><Input label={labels.tax} value={value.taxNumber} onChange={(e) => set('taxNumber', e.target.value)} /><Input label={labels.currency} maxLength={3} value={value.preferredCurrency} onChange={(e) => set('preferredCurrency', e.target.value.toUpperCase())} /><label className="space-y-2 text-sm text-slate-300"><span className="block font-medium">{props.isArabic ? 'اللغة المفضلة' : 'Preferred language'}</span><select value={value.preferredLocale} onChange={(e) => set('preferredLocale', e.target.value)} className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 text-white"><option value="">—</option><option value="AR">العربية</option><option value="EN">English</option></select></label></div><div className="grid gap-4 md:grid-cols-2"><Input type="number" min="0" step="0.001" label={labels.credit} value={value.creditLimit} onChange={(e) => set('creditLimit', e.target.value)} /><Input type="number" min="0" step="1" label={labels.terms} value={value.paymentTermDays} onChange={(e) => set('paymentTermDays', e.target.value)} /></div><label className="block space-y-2 text-sm text-slate-300"><span className="font-medium">{labels.notes}</span><textarea value={value.notes} onChange={(e) => set('notes', e.target.value)} className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-sky-400/50" /></label></Card>
      <Button type="submit" disabled={saving || !whatsappValid}>{saving ? (props.isArabic ? 'جارٍ الحفظ...' : 'Saving...') : props.submitLabel}</Button>
    </form>
  );
}
