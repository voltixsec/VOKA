"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { displayLabel } from "@/lib/i18n/display-labels";
import {
  CATALOG_XLSX_FIELDS,
  CATALOG_XLSX_FIELD_LABELS,
  REQUIRED_CATALOG_XLSX_FIELDS,
  autoMapCatalogHeaders,
  type CatalogXlsxField,
  type CatalogXlsxMapping,
} from "@/features/catalog/application/xlsx/catalogXlsx";

type PreviewRow = {
  rowNumber: number;
  values: { type?: unknown; code?: unknown; name?: unknown; salePrice?: unknown };
  valid: boolean;
  errors: string[];
};

export function CatalogXlsxPanel({
  isArabic,
  search,
  filterType,
  onImported,
}: {
  isArabic: boolean;
  search: string;
  filterType: string;
  onImported: () => Promise<void>;
}) {
  const t = (ar: string, en: string) => (isArabic ? ar : en);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "map" | "preview">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<CatalogXlsxMapping>({});
  const [preview, setPreview] = useState<{ total: number; valid: number; invalid: number; rows: PreviewRow[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setMapping({});
    setPreview(null);
    setError("");
  }

  async function download(url: string, fallback: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(t("تعذر التنزيل", "Download failed"));
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fallback;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function readHeaders(next: File) {
    try {
      setBusy(true);
      setError("");
      const body = new FormData();
      body.set("file", next);
      const response = await fetch("/api/catalog/items/xlsx/parse-headers", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? t("تعذر قراءة العناوين", "Could not read headers"));
      const names: string[] = Array.isArray(json.data?.headers) ? json.data.headers : [];
      setHeaders(names);
      setMapping(autoMapCatalogHeaders(names));
      setStep("map");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("تعذر قراءة العناوين", "Could not read headers"));
    } finally {
      setBusy(false);
    }
  }

  async function runPreview() {
    if (!file) return;
    try {
      setBusy(true);
      setError("");
      const body = new FormData();
      body.set("file", file);
      body.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/catalog/items/xlsx/preview", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? t("تعذر المعاينة", "Preview failed"));
      setPreview(json.data);
      setStep("preview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file || !preview || preview.invalid > 0) return;
    try {
      setBusy(true);
      setError("");
      const body = new FormData();
      body.set("file", file);
      body.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/catalog/items/xlsx/commit", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message ?? t("تعذر الاستيراد", "Import failed"));
      setOpen(false);
      reset();
      await onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => void download("/api/catalog/items/xlsx/template", "voka-catalog-template.xlsx")}>
          {t("تحميل النموذج", "Download Template")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const q = new URLSearchParams();
            if (search.trim()) q.set("search", search.trim());
            if (filterType && filterType !== "ALL") q.set("type", filterType);
            void download(`/api/catalog/items/xlsx/export?${q}`, "voka-catalog.xlsx");
          }}
        >
          {t("تصدير Excel", "Export Excel")}
        </Button>
        <Button type="button" variant="secondary" onClick={() => { reset(); setOpen(true); }}>
          {t("استيراد Excel", "Import Excel")}
        </Button>
      </div>
      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title={t("استيراد الكتالوج", "Import catalog")}
        description={t("لم يُستورد أي صف بعد. المعاينة ثم التأكيد الصريح.", "Nothing is imported until you explicitly commit.")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset(); }}>{t("إلغاء", "Cancel")}</Button>
            {step === "preview" ? (
              <>
                <Button type="button" variant="secondary" onClick={() => setStep("map")}>{t("العودة للتعيين", "Back to mapping")}</Button>
                <Button type="button" disabled={busy || !preview || preview.invalid > 0} onClick={() => void commit()}>
                  {t("تأكيد الاستيراد", "Commit Import")}
                </Button>
              </>
            ) : step === "map" ? (
              <Button type="button" disabled={busy || REQUIRED_CATALOG_XLSX_FIELDS.some((field) => !mapping[field])} onClick={() => void runPreview()}>
                {t("معاينة", "Preview")}
              </Button>
            ) : null}
          </>
        }
      >
        {error ? <Card className="mb-4 border-red-400/20"><p className="text-red-300">{error}</p></Card> : null}
        {step === "upload" ? (
          <label className="block space-y-2 text-sm text-slate-300">
            <span>{t("ملف Excel", "Excel file")}</span>
            <Input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                if (next) void readHeaders(next);
              }}
            />
          </label>
        ) : null}
        {step === "map" ? (
          <div className="grid gap-3">
            {CATALOG_XLSX_FIELDS.map((field) => (
              <label key={field} className="grid gap-1 text-sm text-slate-300">
                <span>
                  {isArabic ? CATALOG_XLSX_FIELD_LABELS[field].ar : CATALOG_XLSX_FIELD_LABELS[field].en}
                  {REQUIRED_CATALOG_XLSX_FIELDS.includes(field) ? " *" : ""}
                </span>
                <select
                  className="min-h-11 rounded-xl border border-white/10 bg-slate-950 px-3"
                  value={mapping[field] ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMapping((current) => {
                      const next = { ...current };
                      (Object.keys(next) as CatalogXlsxField[]).forEach((key) => {
                        if (next[key] === value) delete next[key];
                      });
                      if (value) next[field] = value;
                      else delete next[field];
                      return next;
                    });
                  }}
                >
                  <option value="">{t("غير معيّن", "Not mapped")}</option>
                  {headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : null}
        {step === "preview" && preview ? (
          <div className="space-y-3 text-sm">
            <p className="text-slate-300">
              {t("الإجمالي", "Total")}: {preview.total} · {t("صالح", "Valid")}: {preview.valid} · {t("غير صالح", "Invalid")}: {preview.invalid}
            </p>
            <div className="max-h-64 overflow-auto rounded-xl border border-white/10">
              <table className="w-full text-start">
                <thead>
                  <tr className="text-slate-400">
                    <th className="p-2">#</th>
                    <th className="p-2">{t("الكود", "Code")}</th>
                    <th className="p-2">{t("الاسم", "Name")}</th>
                    <th className="p-2">{t("النوع", "Type")}</th>
                    <th className="p-2">{t("السعر", "Price")}</th>
                    <th className="p-2">{t("الحالة", "State")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.rowNumber} className={row.valid ? "" : "text-red-300"}>
                      <td className="p-2">{row.rowNumber}</td>
                      <td className="p-2">{String(row.values.code ?? "")}</td>
                      <td className="p-2">{String(row.values.name ?? "")}</td>
                      <td className="p-2">{String(row.values.type ?? "")}</td>
                      <td className="p-2">{row.values.salePrice == null || row.values.salePrice === "" ? t("غير محدد", "Not set") : String(row.values.salePrice)}</td>
                      <td className="p-2">{row.valid ? t("صالح", "Valid") : row.errors.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
