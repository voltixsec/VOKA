"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Button, Card, Input, SectionHeader } from "@/components/ui";
import { QuotationLineItemCombobox } from "@/components/quotations/QuotationLineItemCombobox";
import { CatalogItemModal, type CatalogItemModalItem } from "@/components/catalog/CatalogItemModal";
import { useLanguage } from "@/components/i18n/LanguageProvider";
import { QuotationCalculator, type QuotationLineType } from "@/src/domain/quotation";
import { MilestoneAmountType } from "@/src/domain/contract";
import { normalizeQuotationLinePositions } from "@/app/dashboard/quotations/quotation-line-order";

type Customer = {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
};

type Item = {
  id: string;
  name: string;
  code: string;
  type: QuotationLineType;
  salePrice: number;
  unitId?: string | null;
  taxRateId?: string | null;
  description?: string | null;
};

type Unit = {
  id: string;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  symbol: string;
};

type TaxRate = {
  id: string;
  name: string;
  percentage: number;
  isSystem: boolean;
};

type ScopeType =
  | "SUPPLY_ONLY"
  | "SUPPLY_AND_INSTALLATION"
  | "INSTALLATION_ONLY"
  | "SERVICE"
  | "MAINTENANCE"
  | "CONSULTATION"
  | "CUSTOM";

type Line = {
  editorKey: string;
  id?: string;
  position: number;
  catalogItemId: string;
  type: QuotationLineType;
  itemCode: string;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unitName: string;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  taxRateId?: string | null;
  taxPercentage?: number;
};

type MilestoneEditor = {
  editorKey: string;
  id?: string;
  position: number;
  title: string;
  titleAr?: string | null;
  titleEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  amountType: MilestoneAmountType;
  percentage?: number | null;
  fixedAmount?: number | null;
  dueDate?: string | null;
};

let lineSeq = 0;
function createLineKey() {
  lineSeq += 1;
  return `edit-line-${lineSeq}`;
}

let milestoneSeq = 0;
function createMilestoneKey() {
  milestoneSeq += 1;
  return `edit-milestone-${milestoneSeq}`;
}

const scopeOptions: Array<{ value: ScopeType; en: string; ar: string }> = [
  { value: "SUPPLY_ONLY", en: "Supply only", ar: "توريد فقط" },
  { value: "SUPPLY_AND_INSTALLATION", en: "Supply and installation", ar: "توريد وتركيب" },
  { value: "INSTALLATION_ONLY", en: "Installation only", ar: "تركيب فقط" },
  { value: "SERVICE", en: "Service", ar: "خدمة" },
  { value: "MAINTENANCE", en: "Maintenance", ar: "صيانة" },
  { value: "CONSULTATION", en: "Consultation", ar: "استشارة" },
  { value: "CUSTOM", en: "Custom", ar: "مخصص" },
];

function dateToInputString(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function EditContractPage() {
  const { isArabic } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const contractId = params?.contractId as string;

  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);

  const [contractNumber, setContractNumber] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("KWD");
  const [contractDate, setContractDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [projectName, setProjectName] = useState("");
  const [attentionName, setAttentionName] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType | "">("");

  const [subjectAr, setSubjectAr] = useState("");
  const [subjectEn, setSubjectEn] = useState("");
  const [briefAr, setBriefAr] = useState("");
  const [briefEn, setBriefEn] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [milestones, setMilestones] = useState<MilestoneEditor[]>([]);

  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  const [discountType, setDiscountType] = useState<"" | "FIXED" | "PERCENTAGE">("");
  const [discountValue, setDiscountValue] = useState(0);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);

  const pendingFocusLineKeyRef = useRef<string | null>(null);
  const itemInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [catalogItemModalOpen, setCatalogItemModalOpen] = useState(false);
  const [catalogItemModalLineKey, setCatalogItemModalLineKey] = useState<string | null>(null);
  const [catalogItemModalInitialName, setCatalogItemModalInitialName] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!contractId) return;

      try {
        setLoading(true);

        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) throw new Error(t("يلزم تسجيل الدخول", "Please sign in"));

        const auth = (await meRes.json()).data;
        const companyId = auth.activeCompanyId;
        if (!companyId) throw new Error(t("لا توجد شركة نشطة", "No active company"));

        const [contractRes, custRes, itemRes, taxRes, unitRes] = await Promise.allSettled([
          fetch(`/api/contracts/${contractId}`),
          fetch(`/api/customers?companyId=${companyId}&pageSize=100`),
          fetch("/api/catalog/items?pageSize=100&isActive=true"),
          fetch("/api/tax-rates"),
          fetch("/api/units"),
        ]);

        if (contractRes.status !== "fulfilled" || !contractRes.value.ok) {
          throw new Error(t("تعذر تحميل بيانات العقد", "Unable to load contract data"));
        }

        const contractJson = await contractRes.value.json();
        const data = contractJson.data;

        if (custRes.status === "fulfilled" && custRes.value.ok) {
          const custJson = await custRes.value.json();
          setCustomers(custJson.data.customers || []);
        }

        if (itemRes.status === "fulfilled" && itemRes.value.ok) {
          const itemJson = await itemRes.value.json();
          setItems(Array.isArray(itemJson.data) ? itemJson.data : []);
        }

        if (taxRes.status === "fulfilled" && taxRes.value.ok) {
          const taxJson = await taxRes.value.json();
          setTaxRates(Array.isArray(taxJson.data) ? taxJson.data : []);
        }

        if (unitRes.status === "fulfilled" && unitRes.value.ok) {
          const unitJson = await unitRes.value.json();
          setUnits(Array.isArray(unitJson.data) ? unitJson.data : []);
        }

        if (!cancelled) {
          setContractNumber(data.number);
          setCustomerId(data.customerId);
          setCurrencyCode(data.currencyCode || "KWD");
          setContractDate(dateToInputString(data.contractDate));
          setStartDate(dateToInputString(data.startDate));
          setEndDate(dateToInputString(data.endDate));
          setProjectName(data.projectName || "");
          setAttentionName(data.attentionName || "");
          setScopeType(data.scopeType || "");
          setSubjectAr(data.subjectAr || "");
          setSubjectEn(data.subjectEn || "");
          setBriefAr(data.briefAr || "");
          setBriefEn(data.briefEn || "");
          setDiscountType(data.discountType || "");
          setDiscountValue(data.discountValue || 0);
          setNotes(data.notes || "");
          setTerms(data.termsAndConditions || "");

          if (Array.isArray(data.lines) && data.lines.length > 0) {
            setLines(
              data.lines.map((l: any, idx: number) => ({
                editorKey: createLineKey(),
                id: l.id,
                position: idx + 1,
                catalogItemId: l.catalogItemId || "",
                type: l.type || "PRODUCT",
                itemCode: l.itemCode || "",
                itemName: l.itemName || "",
                itemNameAr: l.itemNameAr || l.itemName || "",
                itemNameEn: l.itemNameEn || l.itemName || "",
                description: l.description || "",
                descriptionAr: l.descriptionAr || "",
                descriptionEn: l.descriptionEn || "",
                unitName: l.unitName || "PCS",
                unitNameAr: l.unitNameAr || "PCS",
                unitNameEn: l.unitNameEn || "PCS",
                quantity: l.quantity ?? 1,
                unitPrice: l.unitPrice ?? 0,
                taxRateId: l.taxRateId || null,
                taxPercentage: l.taxPercentage || 0,
              })),
            );
          }

          if (Array.isArray(data.milestones)) {
            setMilestones(
              data.milestones.map((m: any, idx: number) => ({
                editorKey: createMilestoneKey(),
                id: m.id,
                position: idx + 1,
                title: m.title || "",
                titleAr: m.titleAr || m.title || "",
                titleEn: m.titleEn || m.title || "",
                description: m.description || "",
                amountType: m.amountType || MilestoneAmountType.PERCENTAGE,
                percentage: m.percentage ?? null,
                fixedAmount: m.fixedAmount ?? null,
                dueDate: dateToInputString(m.dueDate),
              })),
            );
          }
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

    void init();
    return () => {
      cancelled = true;
    };
  }, [contractId, isArabic]);

  const preview = useMemo(() => {
    if (lines.length === 0) {
      return {
        lines: [],
        totals: { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 },
      };
    }
    try {
      return QuotationCalculator.calculate(
        lines.map((line, index) => ({ ...line, position: index + 1 })),
        discountType ? { type: discountType, value: discountValue } : null,
      );
    } catch {
      return {
        lines: [],
        totals: { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 },
      };
    }
  }, [discountType, discountValue, lines]);

  function activeLocalizedText(itemName: string, description: string): Partial<Line> {
    return isArabic
      ? { itemNameAr: itemName, unitNameAr: "PCS", ...(description ? { descriptionAr: description } : {}) }
      : { itemNameEn: itemName, unitNameEn: "PCS", ...(description ? { descriptionEn: description } : {}) };
  }

  function appendCustomLineAndFocus() {
    const lineKey = createLineKey();
    setDirty(true);
    pendingFocusLineKeyRef.current = lineKey;
    setLines((curr) => [
      ...curr,
      {
        editorKey: lineKey,
        position: curr.length + 1,
        catalogItemId: "",
        type: "CUSTOM",
        itemCode: "",
        itemName: "",
        description: "",
        unitName: "",
        quantity: 1,
        unitPrice: 0,
        taxRateId: null,
        taxPercentage: 0,
      },
    ]);
  }

  function changeLine(
    index: number,
    key: "quantity" | "unitPrice" | "itemName" | "unitName" | "description",
    value: number | string,
  ) {
    setDirty(true);
    setLines((curr) =>
      curr.map((line, idx) => {
        if (idx !== index) return line;
        const localizedKey =
          key === "itemName"
            ? isArabic ? "itemNameAr" : "itemNameEn"
            : key === "unitName"
            ? isArabic ? "unitNameAr" : "unitNameEn"
            : key === "description"
            ? isArabic ? "descriptionAr" : "descriptionEn"
            : null;
        return {
          ...line,
          [key]: value,
          ...(localizedKey ? { [localizedKey]: value } : {}),
        };
      }),
    );
  }

  function addMilestone() {
    setDirty(true);
    setMilestones((curr) => [
      ...curr,
      {
        editorKey: createMilestoneKey(),
        position: curr.length + 1,
        title: isArabic ? `دفعة ${curr.length + 1}` : `Milestone ${curr.length + 1}`,
        amountType: MilestoneAmountType.PERCENTAGE,
        percentage: curr.length === 0 ? 100 : 0,
        fixedAmount: null,
        dueDate: null,
      },
    ]);
  }

  function removeMilestone(index: number) {
    setDirty(true);
    setMilestones((curr) =>
      curr
        .filter((_, idx) => idx !== index)
        .map((m, idx) => ({ ...m, position: idx + 1 })),
    );
  }

  function changeMilestone(index: number, updates: Partial<MilestoneEditor>) {
    setDirty(true);
    setMilestones((curr) =>
      curr.map((m, idx) => {
        if (idx !== index) return m;
        return { ...m, ...updates };
      }),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();

    if (!customerId || lines.length === 0) return;

    try {
      setSaving(true);
      setError("");

      const payload = {
        customerId,
        currencyCode,
        contractDate,
        startDate: startDate || null,
        endDate: endDate || null,
        projectName,
        attentionName,
        scopeType: scopeType || null,
        subjectAr: isArabic ? subjectAr : undefined,
        subjectEn: !isArabic ? subjectEn : undefined,
        briefAr: isArabic ? briefAr : undefined,
        briefEn: !isArabic ? briefEn : undefined,
        discountType: discountType || null,
        discountValue: discountType ? discountValue : 0,
        lines: lines.map((l, idx) => ({
          id: l.id,
          catalogItemId: l.catalogItemId || null,
          taxRateId: l.taxRateId || null,
          position: idx + 1,
          type: l.type,
          itemCode: l.itemCode || null,
          itemName: l.itemName,
          itemNameAr: l.itemNameAr || l.itemName,
          itemNameEn: l.itemNameEn || l.itemName,
          description: l.description || null,
          descriptionAr: l.descriptionAr || l.description || null,
          descriptionEn: l.descriptionEn || l.description || null,
          unitName: l.unitName || "PCS",
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        })),
        milestones: milestones.map((m, idx) => ({
          id: m.id,
          position: idx + 1,
          title: m.title,
          titleAr: isArabic ? m.title : m.titleAr,
          titleEn: !isArabic ? m.title : m.titleEn,
          description: m.description || null,
          amountType: m.amountType,
          percentage: m.amountType === MilestoneAmountType.PERCENTAGE ? Number(m.percentage) : null,
          fixedAmount: m.amountType === MilestoneAmountType.FIXED_AMOUNT ? Number(m.fixedAmount) : null,
          dueDate: m.dueDate || null,
        })),
        notes,
        notesAr: isArabic ? notes : undefined,
        notesEn: !isArabic ? notes : undefined,
        termsAndConditions: terms,
        termsAndConditionsAr: isArabic ? terms : undefined,
        termsAndConditionsEn: !isArabic ? terms : undefined,
      };

      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || t("تعذر حفظ التغييرات", "Failed to save updates"));

      setDirty(false);
      router.push(`/dashboard/contracts/${contractId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
      </Card>
    );
  }

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <button
        type="button"
        onClick={() => router.push(`/dashboard/contracts/${contractId}`)}
        className="text-sm text-sky-300"
      >
        ← {t("العودة لتفاصيل العقد", "Back to contract details")}
      </button>

      <SectionHeader
        eyebrow={contractNumber}
        title={t("تعديل العقد", "Edit Contract")}
        description={t(
          "تعديل بيانات وتفاصيل وبنود ومراحل العقد الحالية.",
          "Update contract metadata, lines, and payment milestones.",
        )}
      />

      <form onSubmit={submit} className="space-y-6">
        {error && (
          <Card className="border-red-400/20 bg-red-400/5">
            <p className="text-red-300">{error}</p>
          </Card>
        )}

        <Card>
          <h3 className="font-semibold">{t("بيانات العقد الأساسية", "Contract information")}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("العميل", "Customer")}</span>
              <select
                required
                value={customerId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setCustomerId(e.target.value);
                  setDirty(true);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-white"
              >
                <option value="">{t("اختر العميل", "Select customer")}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isArabic ? c.nameAr || c.name : c.nameEn || c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("تاريخ العقد", "Contract date")}</span>
              <Input
                type="date"
                required
                value={contractDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setContractDate(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("تاريخ البداية", "Start date")}</span>
              <Input
                type="date"
                value={startDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setStartDate(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("تاريخ النهاية", "End date")}</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setEndDate(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold">{t("تفاصيل المشروع والتغطية", "Project & Commercial details")}</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("اسم المشروع", "Project name")}</span>
              <Input
                value={projectName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setProjectName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("عناية", "Attention")}</span>
              <Input
                value={attentionName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setAttentionName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">{t("نوع نطاق العمل", "Scope type")}</span>
              <select
                value={scopeType}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setScopeType(e.target.value as ScopeType | "");
                  setDirty(true);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4 text-white"
              >
                <option value="">{t("اختر نوع النطاق", "Select scope type")}</option>
                {scopeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {isArabic ? o.ar : o.en}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("موضوع العقد", "Contract subject")}</span>
              <Input
                dir={isArabic ? "rtl" : "ltr"}
                value={isArabic ? subjectAr : subjectEn}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (isArabic) setSubjectAr(e.target.value);
                  else setSubjectEn(e.target.value);
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("ملخص العقد", "Contract brief")}</span>
              <textarea
                dir={isArabic ? "rtl" : "ltr"}
                value={isArabic ? briefAr : briefEn}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  if (isArabic) setBriefAr(e.target.value);
                  else setBriefEn(e.target.value);
                  setDirty(true);
                }}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-white"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold">{t("بنود العقد", "Contract lines")}</h3>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
            <div className="hidden min-w-[900px] items-center gap-1 border-b border-white/10 bg-white/[0.025] px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[minmax(280px,1fr)_150px_100px_140px_150px_44px]">
              <span>{t("الصنف", "Item")}</span>
              <span>{t("الوحدة", "Unit")}</span>
              <span>{t("الكمية", "Quantity")}</span>
              <span>{t("سعر الوحدة", "Unit price")}</span>
              <span>{t("إجمالي البند", "Line total")}</span>
              <span aria-hidden="true" />
            </div>

            {lines.map((line, index) => (
              <div
                key={line.editorKey}
                className="grid min-w-[900px] items-start gap-1 border-b border-white/5 px-2 py-1.5 last:border-b-0 md:grid-cols-[minmax(280px,1fr)_150px_100px_140px_150px_44px]"
              >
                <div>
                  <QuotationLineItemCombobox
                    ref={(el: HTMLInputElement | null) => {
                      itemInputRefs.current[line.editorKey] = el;
                    }}
                    ariaLabel={`${t("الصنف", "Item")} ${index + 1}`}
                    value={line.itemName}
                    items={items}
                    placeholder={t("ابحث أو اكتب الصنف", "Search or type an item")}
                    createLabel={(val: string) => t(`إنشاء "${val}"`, `Create "${val}"`)}
                    createAndEditLabel={(val: string) => t(`إنشاء وتعديل "${val}"`, `Create & Edit "${val}"`)}
                    onValueChange={(val: string) => changeLine(index, "itemName", val)}
                    onSelectItem={(id: string) => {
                      const item = items.find((candidate) => candidate.id === id);
                      if (!item) return;

                      const catalogTaxRate = item.taxRateId
                        ? taxRates.find((rate) => rate.id === item.taxRateId)
                        : undefined;

                      setDirty(true);
                      setLines((curr) =>
                        curr.map((c, lineIdx) => {
                          if (lineIdx !== index) return c;
                          const itemDesc = item.description ?? "";
                          return {
                            ...c,
                            catalogItemId: item.id,
                            type: item.type,
                            itemCode: item.code,
                            itemName: item.name,
                            description: itemDesc,
                            unitName: "PCS",
                            unitPrice: item.salePrice,
                            taxRateId: catalogTaxRate?.id ?? null,
                            taxPercentage: catalogTaxRate?.percentage ?? 0,
                            ...activeLocalizedText(item.name, itemDesc),
                          };
                        }),
                      );
                    }}
                    onCreateCustom={(val: string) => {
                      setDirty(true);
                      setLines((curr) =>
                        curr.map((c, lineIdx) => {
                          if (lineIdx !== index) return c;
                          return {
                            ...c,
                            catalogItemId: "",
                            type: "CUSTOM",
                            itemCode: "",
                            itemName: val,
                            unitName: "PCS",
                            taxRateId: null,
                            taxPercentage: 0,
                            ...activeLocalizedText(val, c.description ?? ""),
                          };
                        }),
                      );
                    }}
                    onCreateAndEdit={(val: string) => {
                      setCatalogItemModalLineKey(line.editorKey);
                      setCatalogItemModalInitialName(val);
                      setCatalogItemModalOpen(true);
                    }}
                  />
                </div>

                <Input
                  className="min-h-9 rounded-lg px-2 py-1.5 text-sm"
                  aria-label={`${t("الوحدة", "Unit")} ${index + 1}`}
                  value={line.unitName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => changeLine(index, "unitName", e.target.value)}
                  placeholder={t("الوحدة", "Unit")}
                />

                <Input
                  className="min-h-9 rounded-lg px-2 py-1.5 text-sm"
                  aria-label={`${t("الكمية", "Quantity")} ${index + 1}`}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={line.quantity}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => changeLine(index, "quantity", Number(e.target.value))}
                />

                <Input
                  className="min-h-9 rounded-lg px-2 py-1.5 text-sm"
                  aria-label={`${t("سعر الوحدة", "Unit price")} ${index + 1}`}
                  type="number"
                  min="0"
                  step="0.001"
                  value={line.unitPrice}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => changeLine(index, "unitPrice", Number(e.target.value))}
                />

                <div className="flex min-h-9 items-center rounded-lg border border-white/10 bg-white/[0.03] px-2 text-sm font-semibold text-emerald-300">
                  {(preview.lines[index]?.totalAmount ?? 0).toFixed(3)}
                </div>

                <div className="flex min-h-9 items-center justify-center">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="h-8 min-h-0 w-8 px-0 py-0 text-base leading-none"
                    disabled={lines.length === 1}
                    onClick={() => {
                      setLines((curr) =>
                        normalizeQuotationLinePositions(curr.filter((_, idx) => idx !== index)),
                      );
                      setDirty(true);
                    }}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={appendCustomLineAndFocus}
              className="flex min-h-9 min-w-[900px] items-center border-t border-white/5 px-3 text-left text-sm font-medium text-sky-300 transition hover:bg-sky-400/5 hover:text-sky-200"
            >
              <span className="me-2 text-base">+</span>
              {t("إضافة بند", "Add line")}
            </button>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-semibold">{t("مراحل الدفع", "Payment Milestones")}</h3>
            <Button type="button" size="sm" variant="secondary" onClick={addMilestone}>
              + {t("إضافة مرحلة", "Add milestone")}
            </Button>
          </div>

          {milestones.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              {t(
                "لم يتم إضافة مراحل دفع بعد. انقر على 'إضافة مرحلة' لجدولة الدفعات.",
                "No payment milestones added yet. Click 'Add milestone' to schedule payments.",
              )}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {milestones.map((m, index) => (
                <div
                  key={m.editorKey}
                  className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 md:grid-cols-[1fr_120px_130px_150px_auto]"
                >
                  <Input
                    value={m.title}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => changeMilestone(index, { title: e.target.value })}
                    placeholder={t("عنوان المرحلة", "Milestone title")}
                  />

                  <select
                    value={m.amountType}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      changeMilestone(index, {
                        amountType: e.target.value as MilestoneAmountType,
                        percentage: e.target.value === MilestoneAmountType.PERCENTAGE ? 0 : null,
                        fixedAmount: e.target.value === MilestoneAmountType.FIXED_AMOUNT ? 0 : null,
                      })
                    }
                    className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-2 text-sm text-white"
                  >
                    <option value={MilestoneAmountType.PERCENTAGE}>
                      {t("نسبة %", "Percentage %")}
                    </option>
                    <option value={MilestoneAmountType.FIXED_AMOUNT}>
                      {t("مبلغ ثابت", "Fixed amount")}
                    </option>
                  </select>

                  {m.amountType === MilestoneAmountType.PERCENTAGE ? (
                    <Input
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={m.percentage ?? 0}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => changeMilestone(index, { percentage: Number(e.target.value) })}
                      placeholder="%"
                    />
                  ) : (
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={m.fixedAmount ?? 0}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => changeMilestone(index, { fixedAmount: Number(e.target.value) })}
                      placeholder={currencyCode}
                    />
                  )}

                  <Input
                    type="date"
                    value={m.dueDate || ""}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => changeMilestone(index, { dueDate: e.target.value || null })}
                  />

                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    className="h-11 w-11 p-0 text-lg"
                    onClick={() => removeMilestone(index)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("ملاحظات", "Notes")}</span>
              <textarea
                value={notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-white"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">{t("الشروط والأحكام", "Terms and conditions")}</span>
              <textarea
                value={terms}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                  setTerms(e.target.value);
                  setDirty(true);
                }}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 p-4 text-white"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
            <div className="min-w-72 space-y-1 text-sm">
              <div className="flex justify-between gap-6 text-slate-300">
                <span>{t("الإجمالي قبل الخصم والضريبة", "Subtotal")}</span>
                <span>{preview.totals.subtotal.toFixed(3)} {currencyCode}</span>
              </div>
              {preview.totals.discountAmount > 0 && (
                <div className="flex justify-between gap-6 text-amber-300">
                  <span>{t("الخصم", "Discount")}</span>
                  <span>- {preview.totals.discountAmount.toFixed(3)} {currencyCode}</span>
                </div>
              )}
              <div className="flex justify-between gap-6 text-slate-300">
                <span>{t("الضريبة", "Tax")}</span>
                <span>{preview.totals.taxAmount.toFixed(3)} {currencyCode}</span>
              </div>
              <div className="flex justify-between gap-6 pt-1 text-lg font-semibold text-emerald-300">
                <span>{t("الإجمالي النهائي", "Total")}</span>
                <span>{preview.totals.totalAmount.toFixed(3)} {currencyCode}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => router.push(`/dashboard/contracts/${contractId}`)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" disabled={saving || !customerId || lines.length === 0}>
                {saving ? t("جارٍ الحفظ...", "Saving...") : t("حفظ التغييرات", "Save changes")}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <CatalogItemModal
        open={catalogItemModalOpen}
        initialType="PRODUCT"
        initialName={catalogItemModalInitialName}
        units={units}
        taxRates={taxRates}
        onClose={() => {
          setCatalogItemModalOpen(false);
          setCatalogItemModalLineKey(null);
          setCatalogItemModalInitialName("");
        }}
        onSaved={(savedItem: CatalogItemModalItem) => {
          const targetLineKey = catalogItemModalLineKey;
          if (!targetLineKey) {
            setCatalogItemModalOpen(false);
            setCatalogItemModalInitialName("");
            return;
          }

          const catalogTaxRate = savedItem.taxRateId
            ? taxRates.find((rate) => rate.id === savedItem.taxRateId)
            : null;

          setItems((curr) => [...curr.filter((item) => item.id !== savedItem.id), savedItem]);
          setDirty(true);

          setLines((curr) =>
            curr.map((candidate) => {
              if (candidate.editorKey !== targetLineKey) return candidate;
              return {
                ...candidate,
                catalogItemId: savedItem.id,
                type: savedItem.type,
                itemCode: savedItem.code,
                itemName: savedItem.name,
                description: savedItem.description ?? "",
                unitName: "PCS",
                unitPrice: savedItem.salePrice,
                taxRateId: catalogTaxRate?.id ?? null,
                taxPercentage: catalogTaxRate?.percentage ?? 0,
                ...activeLocalizedText(savedItem.name, savedItem.description ?? ""),
              };
            }),
          );

          setCatalogItemModalOpen(false);
          setCatalogItemModalLineKey(null);
          setCatalogItemModalInitialName("");
        }}
      />
    </section>
  );
}
