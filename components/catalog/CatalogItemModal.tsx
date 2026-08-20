"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import { useLanguage } from "../i18n/LanguageProvider";
import {
  Button,
  Input,
  Modal,
} from "../ui";

export type CatalogItemModalType =
  | "PRODUCT"
  | "SERVICE";

export type CatalogItemModalItem = {
  id: string;
  companyId?: string;
  type: CatalogItemModalType;
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
  createdAt?: string;
  updatedAt?: string;
};

export type CatalogItemModalUnit = {
  id: string;
  name: string;
  symbol: string;
  nameAr?: string | null;
  nameEn?: string | null;
};

export type CatalogItemModalTaxRate = {
  id: string;
  name: string;
  percentage: number;
};

type Props = {
  open: boolean;
  initialType?: CatalogItemModalType;
  initialName?: string;
  initialItem?: CatalogItemModalItem | null;
  units: CatalogItemModalUnit[];
  taxRates: CatalogItemModalTaxRate[];
  onClose: () => void;
  onSaved: (item: CatalogItemModalItem) => void;
};

export function CatalogItemModal({
  open,
  initialType = "PRODUCT",
  initialName = "",
  initialItem = null,
  units,
  taxRates,
  onClose,
  onSaved,
}: Props) {
  const { isArabic } = useLanguage();

  const t = (ar: string, en: string) =>
    isArabic ? ar : en;

  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] =
    useState("");

  const [formType, setFormType] =
    useState<CatalogItemModalType>("PRODUCT");
  const [formCode, setFormCode] =
    useState("");
  const [formName, setFormName] =
    useState("");
  const [formNameAr, setFormNameAr] =
    useState("");
  const [formNameEn, setFormNameEn] =
    useState("");
  const [formSku, setFormSku] =
    useState("");
  const [formSalePrice, setFormSalePrice] =
    useState(0);
  const [
    formPurchasePrice,
    setFormPurchasePrice,
  ] = useState<number | "">("");
  const [formUnitId, setFormUnitId] =
    useState("");
  const [
    formTaxRateId,
    setFormTaxRateId,
  ] = useState("");
  const [
    formDescription,
    setFormDescription,
  ] = useState("");
  const [
    formDescriptionAr,
    setFormDescriptionAr,
  ] = useState("");
  const [
    formDescriptionEn,
    setFormDescriptionEn,
  ] = useState("");
  const [formIsActive, setFormIsActive] =
    useState(true);

  useEffect(() => {
    if (!open) return;

    setModalError("");
    setSaving(false);

    if (initialItem) {
      setFormType(initialItem.type);
      setFormCode(initialItem.code);
      setFormName(initialItem.name);
      setFormNameAr(
        initialItem.nameAr ?? "",
      );
      setFormNameEn(
        initialItem.nameEn ?? "",
      );
      setFormSku(initialItem.sku ?? "");
      setFormSalePrice(
        initialItem.salePrice,
      );
      setFormPurchasePrice(
        initialItem.purchasePrice ?? "",
      );
      setFormUnitId(
        initialItem.unitId ?? "",
      );
      setFormTaxRateId(
        initialItem.taxRateId ?? "",
      );
      setFormDescription(
        initialItem.description ?? "",
      );
      setFormDescriptionAr(
        initialItem.descriptionAr ?? "",
      );
      setFormDescriptionEn(
        initialItem.descriptionEn ?? "",
      );
      setFormIsActive(
        initialItem.isActive,
      );
      return;
    }

    setFormType(initialType);
    setFormCode(
      `${
        initialType === "PRODUCT"
          ? "PROD"
          : "SRV"
      }-${Date.now()
        .toString()
        .slice(-5)}`,
    );
    setFormName(initialName);
    setFormNameAr(
      isArabic ? initialName : "",
    );
    setFormNameEn(
      isArabic ? "" : initialName,
    );
    setFormSku("");
    setFormSalePrice(0);
    setFormPurchasePrice("");
    setFormUnitId("");
    setFormTaxRateId("");
    setFormDescription("");
    setFormDescriptionAr("");
    setFormDescriptionEn("");
    setFormIsActive(true);
  }, [
    open,
    initialItem,
    initialType,
    initialName,
    isArabic,
  ]);

  async function handleSave(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      !formCode.trim() ||
      !formName.trim() ||
      formSalePrice < 0
    ) {
      setModalError(
        t(
          "\u064a\u0631\u062c\u0649 \u062a\u0639\u0628\u0626\u0629 \u0643\u0627\u0641\u0629 \u0627\u0644\u062d\u0642\u0648\u0644 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0628\u0634\u0643\u0644 \u0635\u062d\u064a\u062d",
          "Please fill in all required fields correctly",
        ),
      );
      return;
    }

    try {
      setSaving(true);
      setModalError("");

      const body = {
        type: formType,
        code: formCode
          .trim()
          .toUpperCase(),
        name: formName.trim(),
        nameAr:
          formNameAr.trim() || null,
        nameEn:
          formNameEn.trim() || null,
        sku: formSku.trim() || null,
        salePrice:
          Number(formSalePrice),
        purchasePrice:
          formPurchasePrice === ""
            ? null
            : Number(
                formPurchasePrice,
              ),
        unitId: formUnitId || null,
        taxRateId:
          formTaxRateId || null,
        description:
          formDescription.trim() ||
          null,
        descriptionAr:
          formDescriptionAr.trim() ||
          null,
        descriptionEn:
          formDescriptionEn.trim() ||
          null,
        isActive: formIsActive,
      };

      const url = initialItem
        ? `/api/catalog/items/${initialItem.id}`
        : "/api/catalog/items";

      const response = await fetch(
        url,
        {
          method: initialItem
            ? "PATCH"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json.error?.message ??
            t(
              "\u0641\u0634\u0644 \u0627\u0644\u062d\u0641\u0638",
              "Save failed",
            ),
        );
      }

      const saved =
        json.data as CatalogItemModalItem;

      onSaved(saved);
    } catch (err) {
      setModalError(
        err instanceof Error
          ? err.message
          : "Save failed",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        initialItem
          ? t(
              "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0635\u0646\u0641",
              "Edit Catalog Item",
            )
          : formType === "PRODUCT"
            ? t(
                "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c \u062c\u062f\u064a\u062f",
                "Add New Product",
              )
            : t(
                "\u0625\u0636\u0627\u0641\u0629 \u062e\u062f\u0645\u0629 \u062c\u062f\u064a\u062f\u0629",
                "Add New Service",
              )
      }
    >
      <form
        onSubmit={handleSave}
        className="space-y-4"
      >
        {modalError && (
          <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">
            {modalError}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0646\u0648\u0639",
                "Type",
              )}
            </span>

            <select
              value={formType}
              disabled={Boolean(
                initialItem,
              )}
              onChange={(event) =>
                setFormType(
                  event.target
                    .value as CatalogItemModalType,
                )
              }
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
            >
              <option value="PRODUCT">
                {t(
                  "\u0645\u0646\u062a\u062c",
                  "Product",
                )}
              </option>
              <option value="SERVICE">
                {t(
                  "\u062e\u062f\u0645\u0629",
                  "Service",
                )}
              </option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0643\u0648\u062f \u0627\u0644\u0635\u0646\u0641",
                "Item Code",
              )}{" "}
              *
            </span>

            <Input
              required
              value={formCode}
              disabled={Boolean(
                initialItem,
              )}
              onChange={(event) =>
                setFormCode(
                  event.target.value,
                )
              }
              placeholder="PROD-001"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064a",
                "Primary Name",
              )}{" "}
              *
            </span>

            <Input
              required
              value={formName}
              onChange={(event) =>
                setFormName(
                  event.target.value,
                )
              }
              placeholder={t(
                "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629",
                "Primary item name",
              )}
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
                "Arabic Name",
              )}
            </span>

            <Input
              dir="rtl"
              value={formNameAr}
              onChange={(event) =>
                setFormNameAr(
                  event.target.value,
                )
              }
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0627\u0633\u0645 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629",
                "English Name",
              )}
            </span>

            <Input
              dir="ltr"
              value={formNameEn}
              onChange={(event) =>
                setFormNameEn(
                  event.target.value,
                )
              }
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0633\u0639\u0631 \u0627\u0644\u0628\u064a\u0639 \u0627\u0644\u0645\u0631\u062c\u0639\u064a",
                "Sale Price",
              )}{" "}
              *
            </span>

            <Input
              type="number"
              step="0.001"
              min="0"
              required
              value={formSalePrice}
              onChange={(event) =>
                setFormSalePrice(
                  Number(
                    event.target.value,
                  ),
                )
              }
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0631\u0645\u0632 SKU (\u0627\u062e\u062a\u064a\u0627\u0631\u064a)",
                "SKU (optional)",
              )}
            </span>

            <Input
              value={formSku}
              onChange={(event) =>
                setFormSku(
                  event.target.value,
                )
              }
              placeholder="SKU-1002"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0648\u062d\u062f\u0629",
                "Unit",
              )}
            </span>

            <select
              value={formUnitId}
              onChange={(event) =>
                setFormUnitId(
                  event.target.value,
                )
              }
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
            >
              <option value="">
                {t(
                  "\u0627\u062e\u062a\u0631 \u0627\u0644\u0648\u062d\u062f\u0629",
                  "Select unit",
                )}
              </option>

              {units.map((unit) => (
                <option
                  key={unit.id}
                  value={unit.id}
                >
                  {unit.name} (
                  {unit.symbol})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629",
                "Default Tax Rate",
              )}
            </span>

            <select
              value={formTaxRateId}
              onChange={(event) =>
                setFormTaxRateId(
                  event.target.value,
                )
              }
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
            >
              <option value="">
                {t(
                  "\u0628\u062f\u0648\u0646 \u0636\u0631\u064a\u0628\u0629",
                  "No tax",
                )}
              </option>

              {taxRates.map((rate) => (
                <option
                  key={rate.id}
                  value={rate.id}
                >
                  {rate.name} (
                  {rate.percentage.toFixed(
                    2,
                  )}
                  %)
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0639\u0631\u0628\u064a",
                "Arabic Description",
              )}
            </span>

            <textarea
              dir="rtl"
              rows={2}
              value={formDescriptionAr}
              onChange={(event) =>
                setFormDescriptionAr(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-slate-400">
              {t(
                "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a",
                "English Description",
              )}
            </span>

            <textarea
              dir="ltr"
              rows={2}
              value={formDescriptionEn}
              onChange={(event) =>
                setFormDescriptionEn(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-white/10 bg-slate-950 p-3 text-sm text-white"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-4">
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={formIsActive}
              onChange={(event) =>
                setFormIsActive(
                  event.target.checked,
                )
              }
              className="h-4 w-4 rounded border-white/10 bg-slate-950 text-sky-400"
            />

            <span>
              {t(
                "\u0635\u0646\u0641 \u0646\u0634\u0637 \u0641\u064a \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c",
                "Active catalog item",
              )}
            </span>
          </label>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
            >
              {t(
                "\u0625\u0644\u063a\u0627\u0621",
                "Cancel",
              )}
            </Button>

            <Button
              type="submit"
              disabled={saving}
            >
              {saving
                ? t(
                    "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638...",
                    "Saving...",
                  )
                : t(
                    "\u062d\u0641\u0638",
                    "Save",
                  )}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
