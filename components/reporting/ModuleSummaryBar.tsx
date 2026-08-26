'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
type CurrencySummary = { currencyCode: string; count: number; totalAmount?: string; paidAmount?: string; outstandingAmount?: string; collectedAmount?: string };
type Summary = { totalCount: number; byStatus?: Record<string, number>; byCurrency: CurrencySummary[] };
type Module = 'quotations' | 'contracts' | 'invoices' | 'payments';
export function ModuleSummaryBar({ module, isArabic }: { module: Module; isArabic: boolean }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => { let active = true; void fetch('/api/dashboard/module-summaries', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).then((body) => { if (active && body?.data?.[module]) setSummary(body.data[module]); }); return () => { active = false; }; }, [module]);
  if (!summary) return <div className="h-24 animate-pulse rounded-2xl bg-white/5" aria-label={isArabic ? 'جارٍ تحميل الملخص' : 'Loading summary'} />;
  const t = (ar: string, en: string) => isArabic ? ar : en;
  const statuses = Object.entries(summary.byStatus ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Card padding="sm"><p className="text-sm text-slate-500">{t('إجمالي السجلات', 'Total records')}</p><p className="mt-2 text-2xl font-semibold">{summary.totalCount}</p>{statuses.length ? <p className="mt-2 text-xs text-slate-400">{statuses.map(([status, count]) => `${status}: ${count}`).join(' · ')}</p> : null}</Card>{summary.byCurrency.map((row) => <Card key={row.currencyCode} padding="sm" className="border-sky-400/20"><p className="text-sm font-semibold text-sky-300">{row.currencyCode} · {row.count}</p>{row.totalAmount !== undefined ? <p className="mt-2 text-sm">{t('القيمة', 'Value')}: {row.totalAmount}</p> : null}{row.paidAmount !== undefined ? <p className="text-xs text-emerald-300">{t('المدفوع', 'Paid')}: {row.paidAmount}</p> : null}{row.outstandingAmount !== undefined ? <p className="text-xs text-amber-300">{t('المتبقي', 'Outstanding')}: {row.outstandingAmount}</p> : null}{row.collectedAmount !== undefined ? <p className="mt-2 text-sm text-emerald-300">{t('المحصّل', 'Collected')}: {row.collectedAmount}</p> : null}</Card>)}</div>;
}
