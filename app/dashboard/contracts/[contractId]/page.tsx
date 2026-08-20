"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, Card, SectionHeader } from "@/components/ui";
import { useLanguage } from "@/components/i18n/LanguageProvider";

type ContractLine = {
  id?: string;
  position: number;
  type: string;
  itemCode?: string | null;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  unitName?: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxPercentage: number;
  taxAmount: number;
  subtotal: number;
  totalAmount: number;
};

type Milestone = {
  id?: string;
  position: number;
  title: string;
  titleAr?: string | null;
  titleEn?: string | null;
  description?: string | null;
  amountType: "PERCENTAGE" | "FIXED_AMOUNT";
  percentage?: number | null;
  fixedAmount?: number | null;
  dueDate?: string | null;
};

type ContractDetails = {
  id: string;
  number: string;
  status: string;
  currencyCode: string;
  contractDate: string;
  startDate?: string | null;
  endDate?: string | null;
  customer: {
    name: string;
    nameAr?: string | null;
    nameEn?: string | null;
    email?: string | null;
    phone?: string | null;
    taxNumber?: string | null;
    billingAddress?: string | null;
  };
  projectName?: string | null;
  attentionName?: string | null;
  scopeType?: string | null;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  lines: ContractLine[];
  milestones: Milestone[];
  notes?: string | null;
  termsAndConditions?: string | null;
  createdByName: string;
  createdByRole: string;
  createdAt?: string | null;
};

const statusAr: Record<string, string> = {
  DRAFT: "مسودة",
};

export default function ContractDetailPage() {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const contractId = params?.contractId as string;

  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [contract, setContract] = useState<ContractDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadContract() {
      if (!contractId) return;

      try {
        setLoading(true);
        setError("");

        const res = await fetch(`/api/contracts/${contractId}`);
        if (res.status === 404) {
          throw new Error(t("العقد غير موجود", "Contract not found"));
        }
        if (!res.ok) {
          throw new Error(t("تعذر تحميل العقد", "Unable to load contract details"));
        }

        const json = await res.json();
        if (!cancelled) {
          setContract(json.data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadContract();
    return () => {
      cancelled = true;
    };
  }, [contractId, isArabic]);

  const money = (amount: number, currency: string) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount);

  if (loading) {
    return (
      <Card>
        <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
      </Card>
    );
  }

  if (error || !contract) {
    return (
      <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
        <button
          type="button"
          onClick={() => router.push("/dashboard/contracts")}
          className="text-sm text-sky-300"
        >
          {t("العودة للعقود", "Back to contracts")}
        </button>
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="text-lg font-semibold text-red-300">{error || t("العقد غير موجود", "Contract not found")}</p>
        </Card>
      </section>
    );
  }

  const customerName = isArabic
    ? contract.customer.nameAr || contract.customer.name
    : contract.customer.nameEn || contract.customer.name;

  const subject = isArabic
    ? contract.subjectAr || contract.subjectEn || ""
    : contract.subjectEn || contract.subjectAr || "";

  const brief = isArabic
    ? contract.briefAr || contract.briefEn || ""
    : contract.briefEn || contract.briefAr || "";

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => router.push("/dashboard/contracts")}
          className="text-sm font-medium text-sky-300 transition hover:text-sky-200"
        >
          ← {t("العودة للعقود", "Back to contracts")}
        </button>

        <Link href={`/dashboard/contracts/${contract.id}/edit`}>
          <Button variant="secondary">
            {t("تعديل العقد", "Edit contract")}
          </Button>
        </Link>
      </div>

      <SectionHeader
        eyebrow={contract.number}
        title={customerName}
        description={subject || t("تفاصيل العقد التجاري", "Commercial contract details")}
        actions={<Badge>{isArabic ? statusAr[contract.status] ?? contract.status : contract.status}</Badge>}
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h3 className="font-semibold text-white">{t("بيانات العقد والعميل", "Contract & Customer Details")}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
            <div>
              <p className="text-xs text-slate-500">{t("العميل", "Customer")}</p>
              <p className="mt-1 font-medium text-slate-200">{customerName}</p>
            </div>
            {contract.customer.email && (
              <div>
                <p className="text-xs text-slate-500">{t("البريد الإلكتروني", "Email")}</p>
                <p className="mt-1 font-medium text-slate-200">{contract.customer.email}</p>
              </div>
            )}
            {contract.customer.phone && (
              <div>
                <p className="text-xs text-slate-500">{t("الهاتف", "Phone")}</p>
                <p className="mt-1 font-medium text-slate-200">{contract.customer.phone}</p>
              </div>
            )}
            {contract.customer.taxNumber && (
              <div>
                <p className="text-xs text-slate-500">{t("الرقم الضريبي", "Tax number")}</p>
                <p className="mt-1 font-medium text-slate-200">{contract.customer.taxNumber}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">{t("تاريخ العقد", "Contract date")}</p>
              <p className="mt-1 font-medium text-slate-200">
                {new Date(contract.contractDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")}
              </p>
            </div>
            {contract.startDate && (
              <div>
                <p className="text-xs text-slate-500">{t("تاريخ البداية", "Start date")}</p>
                <p className="mt-1 font-medium text-slate-200">
                  {new Date(contract.startDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")}
                </p>
              </div>
            )}
            {contract.endDate && (
              <div>
                <p className="text-xs text-slate-500">{t("تاريخ النهاية", "End date")}</p>
                <p className="mt-1 font-medium text-slate-200">
                  {new Date(contract.endDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")}
                </p>
              </div>
            )}
            {contract.projectName && (
              <div>
                <p className="text-xs text-slate-500">{t("اسم المشروع", "Project name")}</p>
                <p className="mt-1 font-medium text-slate-200">{contract.projectName}</p>
              </div>
            )}
            {contract.attentionName && (
              <div>
                <p className="text-xs text-slate-500">{t("عناية", "Attention")}</p>
                <p className="mt-1 font-medium text-slate-200">{contract.attentionName}</p>
              </div>
            )}
          </div>

          {brief && (
            <div className="mt-4 border-t border-white/10 pt-4 text-sm">
              <p className="text-xs text-slate-500">{t("ملخص العقد", "Contract brief")}</p>
              <p className="mt-1 text-slate-300 whitespace-pre-wrap">{brief}</p>
            </div>
          )}
        </Card>

        <Card padding="sm" className="flex flex-col justify-between border-sky-400/20 bg-sky-950/20">
          <div>
            <p className="text-xs uppercase tracking-wider text-sky-400">{t("المبلغ الإجمالي", "Total Contract Value")}</p>
            <p className="mt-2 text-3xl font-bold text-white">{money(contract.totalAmount, contract.currencyCode)}</p>
          </div>
          <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm text-slate-300">
            <div className="flex justify-between">
              <span>{t("المجموع الفرعي", "Subtotal")}</span>
              <span>{money(contract.subtotal, contract.currencyCode)}</span>
            </div>
            {contract.discountAmount > 0 && (
              <div className="flex justify-between text-amber-300">
                <span>{t("الخصم", "Discount")}</span>
                <span>- {money(contract.discountAmount, contract.currencyCode)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>{t("الضريبة", "Tax")}</span>
              <span>{money(contract.taxAmount, contract.currencyCode)}</span>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-semibold text-white">{t("جدول البنود", "Contract Lines")}</h3>
        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-start text-sm">
            <thead className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 text-start">#</th>
                <th className="px-4 py-3 text-start">{t("البند", "Item")}</th>
                <th className="px-4 py-3 text-start">{t("الوحدة", "Unit")}</th>
                <th className="px-4 py-3 text-end">{t("الكمية", "Qty")}</th>
                <th className="px-4 py-3 text-end">{t("سعر الوحدة", "Unit price")}</th>
                <th className="px-4 py-3 text-end">{t("الإجمالي", "Total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {contract.lines.map((line) => {
                const itemName = isArabic
                  ? line.itemNameAr || line.itemName
                  : line.itemNameEn || line.itemName;

                return (
                  <tr key={line.id || line.position}>
                    <td className="px-4 py-3 text-slate-500">{line.position}</td>
                    <td className="px-4 py-3 font-medium text-white">
                      <div>{itemName}</div>
                      {line.description && <div className="text-xs text-slate-500">{line.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{line.unitName || "PCS"}</td>
                    <td className="px-4 py-3 text-end">{line.quantity}</td>
                    <td className="px-4 py-3 text-end">{money(line.unitPrice, contract.currencyCode)}</td>
                    <td className="px-4 py-3 text-end font-semibold text-emerald-300">
                      {money(line.totalAmount, contract.currencyCode)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {contract.milestones && contract.milestones.length > 0 && (
        <Card>
          <h3 className="font-semibold text-white">{t("مراحل الدفع والجداول", "Payment Milestones")}</h3>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">#</th>
                  <th className="px-4 py-3 text-start">{t("المرحلة", "Milestone")}</th>
                  <th className="px-4 py-3 text-start">{t("النوع", "Type")}</th>
                  <th className="px-4 py-3 text-end">{t("القيمة", "Value")}</th>
                  <th className="px-4 py-3 text-end">{t("تاريخ الاستحقاق", "Due date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {contract.milestones.map((m) => {
                  const title = isArabic ? m.titleAr || m.title : m.titleEn || m.title;

                  return (
                    <tr key={m.id || m.position}>
                      <td className="px-4 py-3 text-slate-500">{m.position}</td>
                      <td className="px-4 py-3 font-medium text-white">{title}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {m.amountType === "PERCENTAGE"
                          ? t("نسبة مئوية", "Percentage")
                          : t("مبلغ ثابت", "Fixed amount")}
                      </td>
                      <td className="px-4 py-3 text-end font-semibold text-sky-300">
                        {m.amountType === "PERCENTAGE"
                          ? `${m.percentage}%`
                          : money(m.fixedAmount || 0, contract.currencyCode)}
                      </td>
                      <td className="px-4 py-3 text-end text-slate-400">
                        {m.dueDate
                          ? new Date(m.dueDate).toLocaleDateString(isArabic ? "ar-KW" : "en-GB")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {(contract.notes || contract.termsAndConditions) && (
        <div className="grid gap-6 md:grid-cols-2">
          {contract.notes && (
            <Card>
              <h3 className="font-semibold text-white">{t("ملاحظات", "Notes")}</h3>
              <p className="mt-3 text-sm text-slate-300 whitespace-pre-wrap">{contract.notes}</p>
            </Card>
          )}
          {contract.termsAndConditions && (
            <Card>
              <h3 className="font-semibold text-white">{t("الشروط والأحكام", "Terms and Conditions")}</h3>
              <p className="mt-3 text-sm text-slate-300 whitespace-pre-wrap">{contract.termsAndConditions}</p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
