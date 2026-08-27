"use client";

import Link from 'next/link';
import {
  useParams,
} from 'next/navigation';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  useLanguage,
} from '../../../../components/i18n/LanguageProvider';
import { displayLabel } from '@/lib/i18n/display-labels';

import {
  Badge,
  Card,
  SectionHeader,
} from '../../../../components/ui';

type Customer =
  Record<
    string,
    string | number | null
  > & {
    id: string;
    code: string;
    name: string;
    nameAr?:
      string | null;
    nameEn?:
      string | null;
    status: string;
    type?: string | null;
  };
type SummaryGroup = { currencyCode: string; count: number; totalAmount?: number; paidAmount?: number; outstandingAmount?: number; amount?: number };
type SummaryRecord = { id: string; number?: string; status?: string; currencyCode: string; totalAmount?: number; outstandingAmount?: number; amount?: number; method?: string; invoice?: { id: string; number: string } };
type CommercialSummary = Record<"quotations" | "salesOrders" | "contracts" | "invoices" | "payments", { totals: SummaryGroup[]; records: SummaryRecord[]; statuses?: Record<string, number> }>;

function localizedValue(
  customer: Customer,
  field: string,
  isArabic: boolean,
): string {
  const suffix =
    isArabic
      ? 'Ar'
      : 'En';

  const oppositeSuffix =
    isArabic
      ? 'En'
      : 'Ar';

  const active =
    customer[
      `${field}${suffix}`
    ];

  if (
    typeof active === 'string' &&
    active.trim()
  ) {
    return active;
  }

  const legacy =
    customer[field];

  if (
    typeof legacy === 'string' &&
    legacy.trim()
  ) {
    return legacy;
  }

  const opposite =
    customer[
      `${field}${oppositeSuffix}`
    ];

  return typeof opposite ===
    'string'
      ? opposite
      : '';
}

export default function CustomerDetailPage() {
  const { isArabic } =
    useLanguage();

  const { customerId } =
    useParams<{
      customerId: string;
    }>();

  const [
    customer,
    setCustomer,
  ] =
    useState<
      Customer | null
    >(null);

  const [
    state,
    setState,
  ] =
    useState<
      | 'loading'
      | 'ready'
      | 'notFound'
      | 'forbidden'
      | 'error'
    >('loading');
  const [commercial, setCommercial] = useState<CommercialSummary | null>(null);

  useEffect(() => {
    void (async () => {
      const response =
        await fetch(
          `/api/customers/${encodeURIComponent(
            customerId,
          )}`,
        );

      if (
        response.status === 404
      ) {
        setState(
          'notFound',
        );

        return;
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        setState(
          'forbidden',
        );

        return;
      }

      if (!response.ok) {
        setState(
          'error',
        );

        return;
      }

      const json =
        await response.json();

      setCustomer(
        json.data.customer,
      );

      try { const summaryResponse = await fetch(`/api/customers/${encodeURIComponent(customerId)}/commercial-summary`, { cache: 'no-store' }); if (summaryResponse.ok) { const summary = (await summaryResponse.json()).data; if (summary?.quotations?.totals && summary?.salesOrders?.totals && summary?.contracts?.totals && summary?.invoices?.totals && summary?.payments?.totals) setCommercial(summary); } } catch { setCommercial(null); }

      setState(
        'ready',
      );
    })();
  }, [customerId]);

  const regionNames =
    useMemo(
      () =>
        new Intl.DisplayNames(
          [
            isArabic
              ? 'ar'
              : 'en',
          ],
          {
            type: 'region',
          },
        ),
      [isArabic],
    );

  if (
    state === 'loading'
  ) {
    return (
      <Card>
        {
          isArabic
            ? 'جارٍ تحميل العميل...'
            : 'Loading customer...'
        }
      </Card>
    );
  }

  if (
    state !== 'ready' ||
    !customer
  ) {
    return (
      <Card
        role="alert"
        className="border-amber-400/20 bg-amber-400/5 text-amber-200"
      >
        {
          state ===
          'notFound'
            ? isArabic
              ? 'العميل غير موجود.'
              : 'Customer not found.'
            : state ===
                'forbidden'
              ? isArabic
                ? 'ليست لديك صلاحية لعرض هذا العميل.'
                : 'You do not have access to this customer.'
              : isArabic
                ? 'تعذر تحميل العميل.'
                : 'Unable to load customer.'
        }
      </Card>
    );
  }

  const displayName =
    localizedValue(
      customer,
      'name',
      isArabic,
    );

  const address =
    [
      localizedValue(
        customer,
        'addressLine1',
        isArabic,
      ),

      localizedValue(
        customer,
        'addressLine2',
        isArabic,
      ),

      localizedValue(
        customer,
        'city',
        isArabic,
      ),

      localizedValue(
        customer,
        'state',
        isArabic,
      ),

      customer.postalCode,
    ]
      .filter(Boolean)
      .join(', ');

  const localizedNotes =
    localizedValue(
      customer,
      'notes',
      isArabic,
    );

  const countryCode =
    typeof customer
      .countryCode ===
      'string'
      ? customer
          .countryCode
          .toUpperCase()
      : '';

  const countryDisplay =
    countryCode
      ? (
          regionNames.of(
            countryCode,
          ) ??
          countryCode
        )
      : '';

  const statusLabels:
    Record<
      string,
      string
    > =
      isArabic
        ? {
            LEAD:
              'عميل محتمل',
            ACTIVE:
              'نشط',
            INACTIVE:
              'غير نشط',
            BLOCKED:
              'محظور',
          }
        : {
            LEAD:
              'Lead',
            ACTIVE:
              'Active',
            INACTIVE:
              'Inactive',
            BLOCKED:
              'Blocked',
          };

  const fields:
    Array<
      [
        string,
        string,
        unknown,
      ]
    > = [
      [
        'Legal name',
        'الاسم القانوني',
        customer.legalName,
      ],

      [
        'Email',
        'البريد الإلكتروني',
        customer.email,
      ],

      [
        'Phone',
        'الهاتف',
        customer.phone,
      ],

      [
        'Mobile',
        'الجوال',
        customer.mobile,
      ],

      [
        'WhatsApp',
        'واتساب',
        customer.whatsapp,
      ],

      [
        'Country',
        'الدولة',
        countryDisplay,
      ],

      [
        'Address',
        'العنوان',
        address,
      ],

      [
        'Tax number',
        'الرقم الضريبي',
        customer.taxNumber,
      ],

      [
        'Preferred language',
        'اللغة المفضلة',
        customer.preferredLocale,
      ],

      [
        'Currency',
        'العملة',
        customer.preferredCurrency,
      ],

      [
        'Credit limit',
        'الحد الائتماني',
        customer.creditLimit,
      ],

      [
        'Payment terms',
        'أيام السداد',
        customer.paymentTermDays,
      ],

      [
        'Notes',
        'ملاحظات',
        localizedNotes,
      ],
    ];

  const modules = commercial ? [
    { key: 'quotations', ar: 'عروض الأسعار', en: 'Quotations', href: '/dashboard/quotations', totalField: 'totalAmount' },
    { key: 'salesOrders', ar: 'أوامر البيع', en: 'Sales Orders', href: '/dashboard/sales-orders', totalField: 'totalAmount' },
    { key: 'contracts', ar: 'العقود', en: 'Contracts', href: '/dashboard/contracts', totalField: 'totalAmount' },
    { key: 'invoices', ar: 'الفواتير والذمم', en: 'Invoices & Receivables', href: '/dashboard/invoices', totalField: 'totalAmount' },
    { key: 'payments', ar: 'المدفوعات', en: 'Payments', href: '/dashboard/payments', totalField: 'amount' },
  ] as const : [];

  return (
    <section
      className="space-y-6"
      dir={
        isArabic
          ? 'rtl'
          : 'ltr'
      }
    >
      <SectionHeader
        eyebrow={
          customer.code
        }
        title={
          displayName
        }
        description={
          isArabic
            ? 'بيانات العميل الحالية والمؤكدة.'
            : 'Current customer details.'
        }
        actions={
          <div className="flex flex-wrap gap-3">
            <a className="rounded-xl border border-sky-500/40 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/10" href={`/api/customers/${encodeURIComponent(customer.id)}/activity/pdf`}>{isArabic ? 'نشاط العميل PDF' : 'Activity PDF'}</a>
            <a className="rounded-xl border border-sky-500/40 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/10" href={`/api/customers/${encodeURIComponent(customer.id)}/activity/xlsx`}>{isArabic ? 'نشاط العميل Excel' : 'Activity Excel'}</a>
            <Link
              className="rounded-xl border border-emerald-500/40 px-4 py-2 text-sm text-emerald-200 hover:bg-emerald-500/10"
              href={`/dashboard/customers/${encodeURIComponent(customer.id)}/statement`}
            >
              {isArabic ? 'كشف الحساب' : 'Statement'}
            </Link>
            <Link
              className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
              href="/dashboard/customers"
            >
              {
                isArabic
                  ? 'العملاء'
                  : 'Customers'
              }
            </Link>

            <Link
              className="rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950"
              href={`/dashboard/customers/${encodeURIComponent(
                customer.id,
              )}/edit`}
            >
              {
                isArabic
                  ? 'تعديل العميل'
                  : 'Edit customer'
              }
            </Link>
          </div>
        }
      />

      <Card>
        <div className="flex items-center justify-between">
          <span className="text-slate-400">
            {
              isArabic
                ? 'الحالة'
                : 'Status'
            }
          </span>

          <Badge>
            {
              statusLabels[
                customer.status
              ] ??
              customer.status
            }
          </Badge>
        </div>
      </Card>

      {commercial ? <div className="space-y-4"><div><h2 className="text-xl font-semibold">{isArabic ? 'نظرة تجارية شاملة' : 'Commercial 360 overview'}</h2><p className="mt-1 text-sm text-slate-500">{isArabic ? 'المجاميع مفصولة حسب العملة؛ لا يتم جمع العملات المختلفة.' : 'Totals are grouped by currency; unlike currencies are never added together.'}</p></div><div className="grid gap-4 lg:grid-cols-2">{modules.map((module) => { const data = commercial[module.key]; const locale = isArabic ? 'ar' : 'en'; return <Card key={module.key}><div className="flex items-center justify-between"><h3 className="font-semibold">{isArabic ? module.ar : module.en}</h3><Link href={`${module.href}?customerId=${encodeURIComponent(customer.id)}`} className="text-sm text-sky-300">{isArabic ? 'فتح الوحدة' : 'Open workspace'}</Link></div><div className="mt-4 flex flex-wrap gap-2">{data.totals.length ? data.totals.map((group) => <span key={group.currencyCode} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm"><strong>{group.count}</strong> · {new Intl.NumberFormat(isArabic ? 'ar-KW' : 'en-US', { style: 'currency', currency: group.currencyCode }).format(Number(group[module.totalField] ?? 0))}{module.key === 'invoices' ? <small className="ms-2 text-amber-300">{isArabic ? 'مستحق' : 'due'} {new Intl.NumberFormat(isArabic ? 'ar-KW' : 'en-US', { style: 'currency', currency: group.currencyCode }).format(group.outstandingAmount ?? 0)}</small> : null}</span>) : <span className="text-sm text-slate-500">{isArabic ? 'لا توجد سجلات' : 'No records'}</span>}</div>{data.records.length ? <div className="mt-4 space-y-2 border-t border-white/10 pt-3">{data.records.slice(0, 4).map((record) => <Link key={record.id} href={module.key === 'payments' ? `/dashboard/payments?invoiceId=${encodeURIComponent(record.invoice?.id ?? '')}` : `${module.href}/${encodeURIComponent(record.id)}`} className="flex justify-between text-sm text-slate-300 hover:text-sky-200"><span>{record.number ?? record.invoice?.number ?? (record.method ? displayLabel(record.method, locale) : '')}</span><span>{displayLabel(record.status ?? record.currencyCode, locale)}</span></Link>)}</div> : null}</Card>; })}</div></div> : <Card><p className="text-sm text-slate-500">{isArabic ? 'تعذر تحميل الملخص التجاري؛ بيانات العميل ما زالت متاحة.' : 'Commercial summary is unavailable; customer details remain available.'}</p></Card>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {
          fields.map(
            ([
              en,
              ar,
              fieldValue,
            ]) => (
              <Card
                key={en}
                padding="sm"
              >
                <p className="text-sm text-slate-500">
                  {
                    isArabic
                      ? ar
                      : en
                  }
                </p>

                <p
                  className="mt-2 break-words text-slate-100"
                  dir={
                    en ===
                      'Email' ||
                    en ===
                      'Phone' ||
                    en ===
                      'Mobile' ||
                    en ===
                      'WhatsApp'
                      ? 'ltr'
                      : 'auto'
                  }
                >
                  {
                    fieldValue ===
                      null ||
                    fieldValue ===
                      undefined ||
                    fieldValue ===
                      ''
                      ? '—'
                      : String(
                          fieldValue,
                        )
                  }
                </p>
              </Card>
            ),
          )
        }
      </div>
    </section>
  );
}
