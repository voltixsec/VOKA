"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  SectionHeader,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "../../../components/ui";
import { useLanguage } from "../../../components/i18n/LanguageProvider";

type CatalogItemType = "PRODUCT" | "SERVICE";

type CatalogItem = {
  id: string;
  companyId: string;
  type: CatalogItemType;
  code: string;
  sku?: string | null;
  barcode?: string | null;
  name: string;
  nameAr?: string | null;
  nameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  salePrice: number;
  purchasePrice?: number | null;
  unitId?: string | null;
  taxRateId?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Unit = {
  id: string;
  name: string;
  symbol: string;
  nameAr?: string | null;
  nameEn?: string | null;
};

type TaxRate = {
  id: string;
  name: string;
  percentage: number;
};

type PaginationMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function ProductsPage() {
  const { isArabic } = useLanguage();
  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [filterType, setFilterType] = useState<CatalogItemType | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  // Form states
  const [formType, setFormType] = useState<CatalogItemType>("PRODUCT");
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formNameAr, setFormNameAr] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formSalePrice, setFormSalePrice] = useState(0);
  const [formPurchasePrice, setFormPurchasePrice] = useState<number | "">("");
  const [formUnitId, setFormUnitId] = useState("");
  const [formTaxRateId, setFormTaxRateId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDescriptionAr, setFormDescriptionAr] = useState("");
  const [formDescriptionEn, setFormDescriptionEn] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const query = new URLSearchParams();
      if (filterType !== "ALL") query.set("type", filterType);
      if (search.trim()) query.set("search", search.trim());
      query.set("page", page.toString());
      query.set("pageSize", pageSize.toString());

      const [itemsRes, unitsRes, taxRatesRes] = await Promise.all([
        fetch(`/api/catalog/items?${query.toString()}`),
        fetch("/api/units"),
        fetch("/api/tax-rates"),
      ]);

      if (!itemsRes.ok) throw new Error(t("تعذر تحميل قائمة المنتجات والخدمات", "Failed to load catalog items"));

      const itemsJson = await itemsRes.json();
      setItems(itemsJson.data || []);
      if (itemsJson.meta?.pagination) {
        setPagination(itemsJson.meta.pagination);
      }

      if (unitsRes.ok) {
        const unitsJson = await unitsRes.json();
        setUnits(unitsJson.data || []);
      }

      if (taxRatesRes.ok) {
        const taxRatesJson = await taxRatesRes.json();
        setTaxRates(taxRatesJson.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [filterType, search, page]);

  function openCreateModal(type: CatalogItemType) {
    setEditingItem(null);
    setFormType(type);
    setFormCode(`${type === "PRODUCT" ? "PROD" : "SRV"}-${Date.now().toString().slice(-5)}`);
    setFormName("");
    setFormNameAr("");
    setFormNameEn("");
    setFormSku("");
    setFormSalePrice(0);
    setFormPurchasePrice("");
    setFormUnitId("");
    setFormTaxRateId("");
    setFormDescription("");
    setFormDescriptionAr("");
    setFormDescriptionEn("");
    setFormIsActive(true);
    setModalError("");
    setModalOpen(true);
  }

  function openEditModal(item: CatalogItem) {
    setEditingItem(item);
    setFormType(item.type);
    setFormCode(item.code);
    setFormName(item.name);
    setFormNameAr(item.nameAr ?? "");
    setFormNameEn(item.nameEn ?? "");
    setFormSku(item.sku ?? "");
    setFormSalePrice(item.salePrice);
    setFormPurchasePrice(item.purchasePrice ?? "");
    setFormUnitId(item.unitId ?? "");
    setFormTaxRateId(item.taxRateId ?? "");
    setFormDescription(item.description ?? "");
    setFormDescriptionAr(item.descriptionAr ?? "");
    setFormDescriptionEn(item.descriptionEn ?? "");
    setFormIsActive(item.isActive);
    setModalError("");
    setModalOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!formCode.trim() || !formName.trim() || formSalePrice < 0) {
      setModalError(t("يرجى تعبئة كافة الحقول المطلوبة بشكل صحيح", "Please fill in all required fields correctly"));
      return;
    }

    try {
      setSaving(true);
      setModalError("");

      const body = {
        type: formType,
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        nameAr: formNameAr.trim() || null,
        nameEn: formNameEn.trim() || null,
        sku: formSku.trim() || null,
        salePrice: Number(formSalePrice),
        purchasePrice: formPurchasePrice === "" ? null : Number(formPurchasePrice),
        unitId: formUnitId || null,
        taxRateId: formTaxRateId || null,
        description: formDescription.trim() || null,
        descriptionAr: formDescriptionAr.trim() || null,
        descriptionEn: formDescriptionEn.trim() || null,
        isActive: formIsActive,
      };

      const url = editingItem
        ? `/api/catalog/items/${editingItem.id}`
        : "/api/catalog/items";
      const method = editingItem ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error?.message ?? t("فشل الحفظ", "Save failed"));
      }

      setModalOpen(false);
      await loadData();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: CatalogItem) {
    try {
      const response = await fetch(`/api/catalog/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.isActive }),
      });
      if (response.ok) {
        await loadData();
      }
    } catch {
      /* ignore toggle error */
    }
  }

  return (
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <SectionHeader
        eyebrow={t("الكتالوج التجارية", "Commercial Catalog")}
        title={t("المنتجات والخدمات", "Products & Services")}
        description={t(
          "إدارة كود الأصناف والخدمات والأسعار المرجعية والبيانات ثنائية اللغة للربط المباشر مع عروض الأسعار.",
          "Manage products, services, reference prices, and bilingual catalog values integrated with proposal creation.",
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => { setFilterType("ALL"); setPage(1); }}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition ${filterType === "ALL" ? "bg-sky-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              {t("الكل", "All")}
            </button>
            <button
              type="button"
              onClick={() => { setFilterType("PRODUCT"); setPage(1); }}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition ${filterType === "PRODUCT" ? "bg-sky-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              {t("المنتجات", "Products")}
            </button>
            <button
              type="button"
              onClick={() => { setFilterType("SERVICE"); setPage(1); }}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition ${filterType === "SERVICE" ? "bg-sky-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"}`}
            >
              {t("الخدمات", "Services")}
            </button>
          </div>

          <Input
            placeholder={t("بحث بالكود، الاسم، أو الوصف...", "Search by code, name or description...")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-64"
          />
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" onClick={() => openCreateModal("SERVICE")}>
            {t("+ خدمة جديدة", "+ Add Service")}
          </Button>
          <Button type="button" onClick={() => openCreateModal("PRODUCT")}>
            {t("+ منتج جديد", "+ Add Product")}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="text-red-300">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card>
          <div className="h-48 animate-pulse rounded-2xl bg-white/5" />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            title={t("لا توجد أصناف", "No items found")}
            description={t("قم بإضافة منتج أو خدمة جديدة للكتالوج.", "Add a new product or service to start building your catalog.")}
            action={
              <Button type="button" onClick={() => openCreateModal("PRODUCT")}>
                {t("+ إضافة منتج", "+ Add product")}
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{t("الكود / SKU", "Code / SKU")}</TableHeaderCell>
                  <TableHeaderCell>{t("النوع", "Type")}</TableHeaderCell>
                  <TableHeaderCell>{t("الاسم العربي", "Arabic Name")}</TableHeaderCell>
                  <TableHeaderCell>{t("الاسم الإنجليزي", "English Name")}</TableHeaderCell>
                  <TableHeaderCell>{t("سعر البيع", "Sale Price")}</TableHeaderCell>
                  <TableHeaderCell>{t("الحالة", "Status")}</TableHeaderCell>
                  <TableHeaderCell className="text-end">{t("الإجراءات", "Actions")}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-mono text-xs font-bold text-sky-300">{item.code}</div>
                      {item.sku && <div className="text-xs text-slate-500">SKU: {item.sku}</div>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.type === "PRODUCT" ? "info" : "warning"}>
                        {item.type === "PRODUCT" ? t("منتج", "Product") : t("خدمة", "Service")}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-white">{item.nameAr || item.name}</TableCell>
                    <TableCell className="text-slate-300">{item.nameEn || "-"}</TableCell>
                    <TableCell className="font-semibold text-emerald-300">{item.salePrice.toFixed(3)}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "neutral"}>
                        {item.isActive ? t("نشط", "Active") : t("غير نشط", "Inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => openEditModal(item)}>
                          {t("تعديل", "Edit")}
                        </Button>
                        <Button
                          type="button"
                          variant={item.isActive ? "danger" : "secondary"}
                          size="sm"
                          onClick={() => toggleActive(item)}
                        >
                          {item.isActive ? t("تعطيل", "Deactivate") : t("تفعيل", "Activate")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-sm text-slate-400">
              <span>
                {t("عرض الصفحات", "Page")} {pagination.page} {t("من", "of")} {pagination.totalPages} ({pagination.total} {t("إجمالي الأصناف", "total items")})
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  {t("السابق", "Previous")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t("التالي", "Next")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {modalOpen && (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingItem ? t("تعديل الصنف", "Edit Catalog Item") : formType === "PRODUCT" ? t("إضافة منتج جديد", "Add New Product") : t("إضافة خدمة جديدة", "Add New Service")}
        >
          <form onSubmit={handleSave} className="space-y-4">
            {modalError && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
                {modalError}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("النوع", "Type")}</span>
                <select
                  value={formType}
                  disabled={Boolean(editingItem)}
                  onChange={(e) => setFormType(e.target.value as CatalogItemType)}
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
                >
                  <option value="PRODUCT">{t("منتج", "Product")}</option>
                  <option value="SERVICE">{t("خدمة", "Service")}</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("كود الصنف", "Item Code")} *</span>
                <Input
                  required
                  value={formCode}
                  disabled={Boolean(editingItem)}
                  onChange={(e) => setFormCode(e.target.value)}
                  placeholder="PROD-001"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-400">{t("الاسم الأساسي", "Primary Name")} *</span>
                <Input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("اسم الصنف باللغة الأساسية", "Primary item name")}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("الاسم بالعربية", "Arabic Name")}</span>
                <Input
                  dir="rtl"
                  value={formNameAr}
                  onChange={(e) => setFormNameAr(e.target.value)}
                  placeholder="كاميرا مراقبة"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("الاسم بالإنجليزية", "English Name")}</span>
                <Input
                  dir="ltr"
                  value={formNameEn}
                  onChange={(e) => setFormNameEn(e.target.value)}
                  placeholder="CCTV Camera"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("سعر البيع المرجعي", "Sale Price")} *</span>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  value={formSalePrice}
                  onChange={(e) => setFormSalePrice(Number(e.target.value))}
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("رمز SKU (اختياري)", "SKU (optional)")}</span>
                <Input
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="SKU-1002"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("الوحدة", "Unit")}</span>
                <select
                  value={formUnitId}
                  onChange={(e) => setFormUnitId(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
                >
                  <option value="">{t("اختر الوحدة", "Select unit")}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name} ({unit.symbol})
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs text-slate-400">{t("الضريبة الافتراضية", "Default Tax Rate")}</span>
                <select
                  value={formTaxRateId}
                  onChange={(e) => setFormTaxRateId(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
                >
                  <option value="">{t("بدون ضريبة", "No tax")}</option>
                  {taxRates.map((rate) => (
                    <option key={rate.id} value={rate.id}>
                      {rate.name} ({rate.percentage.toFixed(2)}%)
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-400">{t("الوصف العربي", "Arabic Description")}</span>
                <textarea
                  dir="rtl"
                  rows={2}
                  value={formDescriptionAr}
                  onChange={(e) => setFormDescriptionAr(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs text-slate-400">{t("الوصف الإنجليزي", "English Description")}</span>
                <textarea
                  dir="ltr"
                  rows={2}
                  value={formDescriptionEn}
                  onChange={(e) => setFormDescriptionEn(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
                />
              </label>
            </div>

            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="h-4 w-4 rounded border-white/10 bg-slate-950 text-sky-400"
                />
                <span>{t("صنف نشط في الكتالوج", "Active catalog item")}</span>
              </label>

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ", "Save")}
                </Button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
