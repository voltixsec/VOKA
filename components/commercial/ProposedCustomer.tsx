"use client";

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/ui';
import { CustomerForm, customerFormPayload, emptyCustomerForm } from '@/features/customers/components/CustomerForm';
import type { CommercialCustomerOption } from './CustomerPicker';

type Candidate = CommercialCustomerOption & { status?: string };
type Props = {
  name: string; isArabic: boolean; disabled?: boolean;
  onBound: (customer: CommercialCustomerOption) => void;
  onChange?: () => void;
  onContinue?: () => void;
};

/** In-context creation preserves the owning composer's complete, editable state. */
export function ProposedCustomer({ name, isArabic, disabled, onBound, onChange, onContinue }: Props) {
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(false), [candidates, setCandidates] = useState<Candidate[]>([]);
  const inFlight = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const t = (ar: string, en: string) => isArabic ? ar : en;
  const bind = (customer: Candidate) => { setEditing(false); onBound(customer); };
  async function create(payload: Record<string, unknown>) {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setError(false); setCandidates([]);
    try {
      const response = await fetch('/api/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, checkDuplicates: true }),
      });
      const body = await response.json();
      if (!active.current) return;
      if (!response.ok) throw new Error('CUSTOMER_CREATE_FAILED');
      if (body.data?.customer?.id) bind(body.data.customer);
      else if (body.data?.candidates?.length) setCandidates(body.data.candidates);
      else throw new Error('CUSTOMER_RESPONSE_INVALID');
    } catch { setError(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const feedback = <>
    {error && <p role="alert" className="text-sm text-rose-300">{t('تعذر إنشاء العميل. راجع البيانات وحاول مجدداً.', 'Unable to create the customer. Check the details and try again.')}</p>}
    {candidates.length > 0 && <div className="space-y-2"><p className="text-sm">{t('وجدت عملاء مشابهين. اختر العميل الصحيح؛ لم يتم إنشاء عميل جديد.', 'Similar customers found. Choose the correct customer; no new customer was created.')}</p>
      <div className="flex flex-wrap gap-2">{candidates.map((customer) => <button type="button" key={customer.id} disabled={busy || (customer.status !== undefined && !['ACTIVE', 'LEAD'].includes(customer.status))} onClick={() => bind(customer)} className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm disabled:opacity-50">{isArabic ? customer.nameAr || customer.name : customer.nameEn || customer.name}{customer.status && !['ACTIVE', 'LEAD'].includes(customer.status) ? t(' — غير متاح للمستندات', ' — unavailable for documents') : ''}</button>)}</div>
    </div>}
  </>;
  return <div data-testid="proposed-customer" className="min-w-0 space-y-2 rounded-xl border border-sky-400/30 bg-sky-400/5 p-3" dir={isArabic ? 'rtl' : 'ltr'}>
    <div className="flex flex-wrap items-center gap-2"><strong className="break-words">{name}</strong><span className="rounded-full bg-sky-400/10 px-2 py-1 text-xs text-sky-200">{t('غير مسجل', 'Unregistered')}</span></div>
    <p className="text-sm text-slate-300">{t(`العميل «${name}» غير مسجل في قاعدة العملاء. يمكنك متابعة مسودة عرض السعر الآن.`, `Customer “${name}” is not registered. You can continue reviewing the quotation draft now.`)}</p>
    <div className="flex flex-wrap gap-2">
      {onContinue && <button type="button" disabled={busy || disabled} onClick={onContinue} className="rounded-lg bg-emerald-400 px-3 py-2 text-sm text-slate-950">{t('متابعة عرض السعر', 'Continue to quotation')}</button>}
      <button type="button" disabled={busy || disabled} onClick={() => void create({ name, [/\p{Script=Arabic}/u.test(name) ? 'nameAr' : 'nameEn']: name, type: 'COMPANY', status: 'LEAD' })} className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm">{busy ? t('جاري الإنشاء…', 'Creating…') : t('إنشاء', 'Create')}</button>
      <button type="button" disabled={busy || disabled} onClick={() => setEditing(true)} className="rounded-lg border border-sky-300/30 px-3 py-2 text-sm">{t('إنشاء وتحرير', 'Create and edit')}</button>
      {onChange && <button type="button" disabled={busy || disabled} onClick={onChange} className="rounded-lg px-3 py-2 text-sm text-sky-300">{t('تغيير العميل', 'Change customer')}</button>}
    </div>
    {!editing && feedback}
    {editing && createPortal(<div dir={isArabic ? 'rtl' : 'ltr'} onSubmit={(event) => event.stopPropagation()}><Modal open closeLabel={t('إغلاق', 'Close')} title={t('إنشاء وتحرير العميل', 'Create and edit customer')} onClose={() => { if (!busy) setEditing(false); }}>
      {feedback}
      <CustomerForm isArabic={isArabic} initialValue={{ ...emptyCustomerForm, name, [isArabic ? 'nameAr' : 'nameEn']: name }} submitLabel={t('إنشاء ومتابعة', 'Create and continue')} onSubmit={async (form) => create(customerFormPayload(form))} />
    </Modal></div>, document.body)}
  </div>;
}
