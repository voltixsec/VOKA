"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Button,
  Card,
  Input,
  SectionHeader,
} from "../../../../../components/ui";
import {
  useLanguage,
} from "../../../../../components/i18n/LanguageProvider";
import {
  QuotationCalculator,
  type Discount,
  type QuotationLineType,
} from "@/src/domain/quotation";

type ScopeType =
  | "SUPPLY_ONLY"
  | "SUPPLY_AND_INSTALLATION"
  | "INSTALLATION_ONLY"
  | "SERVICE"
  | "MAINTENANCE"
  | "CONSULTATION"
  | "CUSTOM";

type Item = {
  id: string;
  name: string;
  code: string;
  type: QuotationLineType;
  salePrice: number;
  taxRateId?: string | null;
};

type Line = {
  id?: string;
  catalogItemId?: string | null;
  taxRateId?: string | null;
  position: number;
  type: QuotationLineType;
  itemCode?: string | null;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  unitName?: string | null;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  taxPercentage?: number;
  discount?: Discount | null;
  taxUnavailable?: boolean;
};

type TaxRate = {
  id: string;
  name: string;
  percentage: number;
  isSystem: boolean;
};

type Quote = {
  id: string;
  quotationNumber: string;
  status: string;
  currencyCode: string;
  issueDate: string;
  expiryDate?: string | null;
  lines: Line[];
  notes?: string | null;
  notesAr?: string | null;
  notesEn?: string | null;

  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  discount?: {
    type: "FIXED" | "PERCENTAGE";
    value: number;
  } | null;
  projectName?: string | null;
  projectNameAr?: string | null;
  projectNameEn?: string | null;

  attentionName?: string | null;
  attentionNameAr?: string | null;
  attentionNameEn?: string | null;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  scopeType?: ScopeType | null;
};

const scopeOptions: Array<{
  value: ScopeType;
  en: string;
  ar: string;
}> = [
  {
    value: "SUPPLY_ONLY",
    en: "Supply only",
    ar: "\u062a\u0648\u0631\u064a\u062f \u0641\u0642\u0637",
  },
  {
    value: "SUPPLY_AND_INSTALLATION",
    en: "Supply and installation",
    ar: "\u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628",
  },
  {
    value: "INSTALLATION_ONLY",
    en: "Installation only",
    ar: "\u062a\u0631\u0643\u064a\u0628 \u0641\u0642\u0637",
  },
  {
    value: "SERVICE",
    en: "Service",
    ar: "\u062e\u062f\u0645\u0629",
  },
  {
    value: "MAINTENANCE",
    en: "Maintenance",
    ar: "\u0635\u064a\u0627\u0646\u0629",
  },
  {
    value: "CONSULTATION",
    en: "Consultation",
    ar: "\u0627\u0633\u062a\u0634\u0627\u0631\u0629",
  },
  {
    value: "CUSTOM",
    en: "Custom",
    ar: "\u0645\u062e\u0635\u0635",
  },
];

function expiryDateIso(value: string): string {
  return `${value}T23:59:59.999+03:00`;
}

export default function EditQuotationPage() {
  const { isArabic } = useLanguage();

  const params =
    useParams<{
      quotationId: string;
    }>();

  const router = useRouter();

  const t = (ar: string, en: string) =>
    isArabic ? ar : en;

  const [quote, setQuote] =
    useState<Quote | null>(null);

  const [lines, setLines] =
    useState<Line[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [taxRates, setTaxRates] =
    useState<TaxRate[]>([]);

  const [taxRateRefreshLineIds, setTaxRateRefreshLineIds] =
    useState<string[]>([]);

  const [catalogError, setCatalogError] =
    useState(false);

  const [taxRateError, setTaxRateError] =
    useState(false);

  const [projectName, setProjectName] =
    useState("");

  const [attentionName, setAttentionName] =
    useState("");

  const [scopeType, setScopeType] =
    useState<ScopeType | "">("");

  const [expiryDate, setExpiryDate] =
    useState("");

  const [subjectAr, setSubjectAr] =
    useState("");

  const [subjectEn, setSubjectEn] =
    useState("");

  const [briefAr, setBriefAr] =
    useState("");

  const [briefEn, setBriefEn] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [terms, setTerms] =
    useState("");

  const [discountType, setDiscountType] =
    useState<"" | "FIXED" | "PERCENTAGE">("");

  const [discountValue, setDiscountValue] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [dirty, setDirty] =
    useState(false);

  useEffect(() => {
    const warn = (
      event: BeforeUnloadEvent,
    ) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener(
      "beforeunload",
      warn,
    );

    return () =>
      window.removeEventListener(
        "beforeunload",
        warn,
      );
  }, [dirty]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(
          "/api/quotations/" +
            params.quotationId +
            "?locale=" +
            (isArabic ? "ar" : "en"),
        );

        if (!response.ok) {
          throw new Error(
            t(
              "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0639\u0631\u0636",
              "Unable to load quotation",
            ),
          );
        }

        const json =
          await response.json();

        const loaded =
          json.data as Quote;

        if (loaded.status !== "DRAFT") {
          throw new Error(
            t(
              "\u064a\u0645\u0643\u0646 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0633\u0648\u062f\u0627\u062a \u0641\u0642\u0637",
              "Only draft quotations can be edited",
            ),
          );
        }

        setQuote(loaded);
        setLines(loaded.lines);

        setProjectName(
          loaded.projectName ?? "",
        );

        setAttentionName(
          loaded.attentionName ?? "",
        );

        setScopeType(
          loaded.scopeType ?? "",
        );

        setExpiryDate(
          loaded.expiryDate?.slice(0, 10) ?? "",
        );

        setSubjectAr(
          loaded.subjectAr ?? "",
        );

        setSubjectEn(
          loaded.subjectEn ?? "",
        );

        setBriefAr(
          loaded.briefAr ?? "",
        );

        setBriefEn(
          loaded.briefEn ?? "",
        );

        setNotes(
          loaded.notes ?? "",
        );

        setTerms(
          loaded.termsAndConditions ??
            "",
        );

        setDiscountType(
          loaded.discount?.type ?? "",
        );

        setDiscountValue(
          loaded.discount?.value ?? 0,
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Load failed",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [
    isArabic,
    params.quotationId,
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const [catalogResponse, taxRateResponse] = await Promise.all([
          fetch("/api/catalog/items?pageSize=100&isActive=true"),
          fetch("/api/tax-rates"),
        ]);

        if (!catalogResponse.ok) {
          setCatalogError(true);
        } else {
          const json = await catalogResponse.json();
          setItems(Array.isArray(json.data) ? json.data : []);
        }
        if (!taxRateResponse.ok) {
          setTaxRateError(true);
        } else {
          const json = await taxRateResponse.json();
          setTaxRates(Array.isArray(json.data) ? json.data : []);
        }
      } catch {
        setCatalogError(true);
        setTaxRateError(true);
      }
    })();
  }, []);

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

  function activeLocalizedText(
    itemName: string,
  ): Partial<Line> {
    return isArabic
      ? {
          itemNameAr: itemName,
          unitNameAr: "PCS",
        }
      : {
          itemNameEn: itemName,
          unitNameEn: "PCS",
        };
  }

  function addItem(id: string) {
    setDirty(true);

    if (id === "__custom") {
      const itemName = t(
        "\u0628\u0646\u062f \u0645\u062e\u0635\u0635",
        "Custom line",
      );

      setLines((current) => [
        ...current,
        {
          position: current.length + 1,
          catalogItemId: null,
          type: "CUSTOM",
          itemCode: "",
          itemName,
          unitName: "PCS",
          quantity: 1,
          unitPrice: 0,
          taxRateId: null,
          taxPercentage: 0,
          ...activeLocalizedText(itemName),
        },
      ]);
      return;
    }

    const item = items.find(
      (candidate) => candidate.id === id,
    );

    if (!item) {
      return;
    }

    const catalogTaxRate = item.taxRateId
      ? taxRates.find((rate) => rate.id === item.taxRateId)
      : undefined;

    setLines((current) => [
      ...current,
      {
        position: current.length + 1,
        catalogItemId: item.id,
        taxRateId: catalogTaxRate?.id ?? null,
        type: item.type,
        itemCode: item.code,
        itemName: item.name,
        unitName: "PCS",
        quantity: 1,
        unitPrice: item.salePrice,
        taxPercentage: catalogTaxRate?.percentage ?? 0,
        taxUnavailable: Boolean(item.taxRateId && !catalogTaxRate),
        ...activeLocalizedText(item.name),
      },
    ]);
  }

  function changeTaxRate(index: number, selection: string) {
    const [selectionType, taxRateId = ""] = selection.split(":", 2);
    const selected = selectionType === "active"
      ? taxRates.find((rate) => rate.id === taxRateId)
      : undefined;
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex !== index
        ? line
        : selectionType === "saved" && line.id
          ? {
              ...line,
              taxRateId: quote?.lines.find((candidate) => candidate.id === line.id)?.taxRateId ?? null,
              taxPercentage: quote?.lines.find((candidate) => candidate.id === line.id)?.taxPercentage ?? 0,
              taxUnavailable: false,
            }
          : {
              ...line,
              taxRateId: selected?.id ?? null,
              taxPercentage: selected?.percentage ?? 0,
              taxUnavailable: false,
            },
    ));
    const lineId = lines[index]?.id;
    if (lineId) {
      setTaxRateRefreshLineIds((current) =>
        selectionType === "active"
          ? [...new Set([...current, lineId])]
          : current.filter((id) => id !== lineId),
      );
    }
    setDirty(true);
  }

  function taxSelectionValue(line: Line): string {
    const originalLine = line.id
      ? quote?.lines.find((candidate) => candidate.id === line.id)
      : undefined;
    const usesSavedSnapshot = Boolean(
      originalLine?.taxRateId &&
      originalLine.taxRateId === line.taxRateId &&
      !taxRateRefreshLineIds.includes(line.id ?? ""),
    );
    if (usesSavedSnapshot) return `saved:${line.taxRateId}`;
    return line.taxRateId ? `active:${line.taxRateId}` : "";
  }

  function changeLine(
    index: number,
    key:
      | "itemName"
      | "unitName"
      | "quantity"
      | "unitPrice",
    value: string | number,
  ) {
    setDirty(true);

    setLines((current) =>
      current.map(
        (line, lineIndex) => {
          if (lineIndex !== index) {
            return line;
          }

          const localizedKey =
            key === "itemName"
              ? isArabic
                ? "itemNameAr"
                : "itemNameEn"
              : key === "unitName"
                ? isArabic
                  ? "unitNameAr"
                  : "unitNameEn"
                : null;

          return {
            ...line,
            [key]: value,
            ...(localizedKey
              ? {
                  [localizedKey]:
                    value,
                }
              : {}),
          };
        },
      ),
    );
  }

  function cancel() {
    const confirmed =
      !dirty ||
      window.confirm(
        t(
          "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u061f \u0633\u062a\u0641\u0642\u062f \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u063a\u064a\u0631 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629.",
          "Cancel editing? Unsaved changes will be lost.",
        ),
      );

    if (confirmed) {
      router.push(
        "/dashboard/quotations/" +
          params.quotationId,
      );
    }
  }

  async function save(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !quote ||
      lines.length === 0
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        "/api/quotations/" +
          quote.id,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            localizationSourceLocale:
              isArabic ? "ar" : "en",

            expiryDate: expiryDate
              ? expiryDateIso(expiryDate)
              : null,

            lines: lines.map(
              ({ taxUnavailable: _taxUnavailable, ...line }, index) => ({
                ...line,
                position: index + 1,
              }),
            ),
            taxRateRefreshLineIds,

            projectName,

            projectNameAr:
              isArabic
                ? projectName
                : quote.projectNameAr,

            projectNameEn:
              isArabic
                ? quote.projectNameEn
                : projectName,

            attentionName,

            attentionNameAr:
              isArabic
                ? attentionName
                : quote.attentionNameAr,

            attentionNameEn:
              isArabic
                ? quote.attentionNameEn
                : attentionName,
            scopeType:
              scopeType || null,
            subjectAr,
            subjectEn,
            briefAr,
            briefEn,

            notes,

            notesAr:
              isArabic
                ? notes
                : quote.notesAr,

            notesEn:
              isArabic
                ? quote.notesEn
                : notes,

            termsAndConditions:
              terms,

            termsAndConditionsAr:
              isArabic
                ? terms
                : quote.termsAndConditionsAr,

            termsAndConditionsEn:
              isArabic
                ? quote.termsAndConditionsEn
                : terms,

            discount: discountType
              ? {
                  type:
                    discountType,
                  value:
                    discountValue,
                }
              : null,
          }),
        },
      );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json?.error?.message ??
            "Update failed",
        );
      }

      setDirty(false);

      router.push(
        "/dashboard/quotations/" +
          quote.id,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Update failed",
      );
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

  if (error && !quote) {
    return (
      <Card className="border-red-400/20 bg-red-400/5">
        <p className="text-red-300">
          {error}
        </p>

        <Link
          href={
            "/dashboard/quotations/" +
            params.quotationId
          }
          className="mt-4 inline-block text-sky-300"
        >
          {t(
            "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0644\u0639\u0631\u0636",
            "Back to quotation",
          )}
        </Link>
      </Card>
    );
  }

  if (!quote) {
    return null;
  }

  return (
    <section
      className="space-y-6"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <button
        type="button"
        onClick={cancel}
        className="text-sm text-sky-300"
      >
        {t(
          "\u0625\u0644\u063a\u0627\u0621 \u0648\u0627\u0644\u0639\u0648\u062f\u0629",
          "Cancel and return",
        )}
      </button>

      <SectionHeader
        eyebrow={t(
          "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u0633\u0648\u062f\u0629",
          "Edit draft",
        )}
        title={quote.quotationNumber}
        description={t(
          "\u062d\u062f\u0651\u062b \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u063a\u0644\u0627\u0641 \u0648\u0627\u0644\u0645\u0644\u062e\u0635 \u0648\u0627\u0644\u0628\u0646\u0648\u062f.",
          "Update the proposal cover, brief and quotation lines.",
        )}
      />

      <form
        onSubmit={save}
        className="space-y-6"
      >
        {error && (
          <Card className="border-red-400/20 bg-red-400/5">
            <p className="text-red-300">
              {error}
            </p>
          </Card>
        )}

        <Card>
          <h3 className="font-semibold">
            {t(
              "\u063a\u0644\u0627\u0641 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u062a\u062c\u0627\u0631\u064a",
              "Commercial proposal cover",
            )}
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639",
                  "Project name",
                )}
              </span>

              <Input
                value={projectName}
                onChange={(event) => {
                  setProjectName(
                    event.target.value,
                  );
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0639\u0646\u0627\u064a\u0629",
                  "Attention",
                )}
              </span>

              <Input
                value={attentionName}
                onChange={(event) => {
                  setAttentionName(
                    event.target.value,
                  );
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0646\u0648\u0639 \u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644",
                  "Scope type",
                )}
              </span>

              <select
                value={scopeType}
                onChange={(event) => {
                  setScopeType(
                    event.target
                      .value as
                      | ScopeType
                      | "",
                  );
                  setDirty(true);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4"
              >
                <option value="">
                  {t(
                    "\u0627\u062e\u062a\u0631 \u0646\u0648\u0639 \u0627\u0644\u0646\u0637\u0627\u0642",
                    "Select scope type",
                  )}
                </option>

                {scopeOptions.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {isArabic
                        ? option.ar
                        : option.en}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u062a\u0627\u0631\u064a\u062e \u0627\u0646\u062a\u0647\u0627\u0621 \u0627\u0644\u0639\u0631\u0636",
                  "Quotation expiry date",
                )}
              </span>

              <Input
                type="date"
                min={quote.issueDate.slice(0, 10)}
                value={expiryDate}
                onChange={(event) => {
                  setExpiryDate(
                    event.target.value,
                  );
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u0639\u0631\u0636",
                  "Proposal subject",
                )}
              </span>

              <Input
                dir={isArabic ? "rtl" : "ltr"}
                value={
                  isArabic
                    ? subjectAr
                    : subjectEn
                }
                onChange={(event) => {
                  if (isArabic) {
                    setSubjectAr(
                      event.target.value,
                    );
                  } else {
                    setSubjectEn(
                      event.target.value,
                    );
                  }
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u0631\u0636",
                  "Proposal brief",
                )}
              </span>

              <textarea
                dir={isArabic ? "rtl" : "ltr"}
                value={
                  isArabic
                    ? briefAr
                    : briefEn
                }
                onChange={(event) => {
                  if (isArabic) {
                    setBriefAr(
                      event.target.value,
                    );
                  } else {
                    setBriefEn(
                      event.target.value,
                    );
                  }
                  setDirty(true);
                }}
                className="min-h-32 w-full rounded-xl border border-white/10 bg-slate-950 p-4"
              />
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold">
            {t(
              "\u0628\u0646\u0648\u062f \u0627\u0644\u0639\u0631\u0636",
              "Quotation lines",
            )}
          </h3>

          <label className="mt-4 block space-y-2">
            <span className="text-sm text-slate-400">
              {t(
                "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c \u0623\u0648 \u062e\u062f\u0645\u0629",
                "Add product or service",
              )}
            </span>

            <select
              aria-label={t(
                "\u0625\u0636\u0627\u0641\u0629 \u0645\u0646\u062a\u062c \u0623\u0648 \u062e\u062f\u0645\u0629",
                "Add product or service",
              )}
              defaultValue=""
              onChange={(event) => {
                addItem(event.target.value);
                event.target.value = "";
              }}
              className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4"
            >
              <option value="">
                {t(
                  "\u0627\u062e\u062a\u0631 \u0628\u0646\u062f\u064b\u0627",
                  "Select a line",
                )}
              </option>

              <option value="__custom">
                {t(
                  "+ \u0628\u0646\u062f \u0645\u062e\u0635\u0635",
                  "+ Custom line",
                )}
              </option>

              {items.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                >
                  {item.code} - {item.name}
                </option>
              ))}
            </select>

            {catalogError && (
              <span className="text-xs text-amber-300">
                {t(
                  "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0643\u062a\u0627\u0644\u0648\u062c. \u064a\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0628\u0646\u062f \u0645\u062e\u0635\u0635.",
                  "Catalog unavailable. You can still add a custom line.",
                )}
              </span>
            )}
            {taxRateError && (
              <span className="text-xs text-amber-300">
                {t("تعذر تحميل الضرائب المتاحة.", "Available tax rates could not be loaded.")}
              </span>
            )}
          </label>

          <div className="mt-4 space-y-3">
            <div className="hidden gap-3 px-4 text-xs text-slate-500 md:grid md:grid-cols-[1fr_100px_100px_130px_170px_140px_auto]">
              <span>{t("الصنف", "Item")}</span>
              <span>{t("الوحدة", "Unit")}</span>
              <span>{t("الكمية", "Quantity")}</span>
              <span>{t("سعر الوحدة", "Unit price")}</span>
              <span>{t("الضريبة", "Tax")}</span>
              <span>{t("إجمالي البند", "Line total")}</span>
              <span />
            </div>
            {lines.map(
              (line, index) => (
                <div
                  key={line.id ?? index}
                  className="grid gap-3 rounded-2xl border border-white/5 p-4 md:grid-cols-[1fr_100px_100px_130px_170px_140px_auto]"
                >
                  <Input
                    required
                    value={line.itemName}
                    onChange={(event) =>
                      changeLine(
                        index,
                        "itemName",
                        event.target.value,
                      )
                    }
                  />

                  <Input
                    value={
                      line.unitName ?? ""
                    }
                    onChange={(event) =>
                      changeLine(
                        index,
                        "unitName",
                        event.target.value,
                      )
                    }
                  />

                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={line.quantity}
                    onChange={(event) =>
                      changeLine(
                        index,
                        "quantity",
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                  />

                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={line.unitPrice}
                    onChange={(event) =>
                      changeLine(
                        index,
                        "unitPrice",
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                  />

                  <label className="space-y-1">
                    <span className="text-xs text-slate-500">
                      {t("الضريبة", "Tax")}
                    </span>
                    <select
                      aria-label={`${t("الضريبة", "Tax")} ${index + 1}`}
                      value={taxSelectionValue(line)}
                      onChange={(event) => changeTaxRate(index, event.target.value)}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
                    >
                      <option value="">{t("بدون ضريبة", "No tax")}</option>
                      {line.id && quote?.lines.find((candidate) => candidate.id === line.id)?.taxRateId && (
                        <option value={`saved:${quote.lines.find((candidate) => candidate.id === line.id)?.taxRateId}`}>
                          {t("ضريبة محفوظة", "Saved tax")} ({(quote.lines.find((candidate) => candidate.id === line.id)?.taxPercentage ?? 0).toFixed(2)}%)
                        </option>
                      )}
                      {taxRates.map((rate) => (
                        <option key={rate.id} value={`active:${rate.id}`}>
                          {rate.name} ({rate.percentage.toFixed(2)}%){line.id && quote?.lines.find((candidate) => candidate.id === line.id)?.taxRateId === rate.id ? ` — ${t("استخدام الحالي", "Use current")}` : ""}
                        </option>
                      ))}
                    </select>
                    {line.taxUnavailable && (
                      <span className="block text-xs text-amber-300">
                        {t(
                          "ضريبة الكتالوج غير متاحة. اختر ضريبة نشطة.",
                          "Catalog tax is unavailable. Select an active tax rate.",
                        )}
                      </span>
                    )}
                  </label>

                  <div className="flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 font-semibold text-emerald-300">
                    {(preview.lines[index]?.totalAmount ?? 0).toFixed(3)}
                  </div>

                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    disabled={
                      lines.length === 1
                    }
                    onClick={() => {
                      setLines(
                        (current) =>
                          current.filter(
                            (
                              _,
                              lineIndex,
                            ) =>
                              lineIndex !==
                              index,
                          ),
                      );
                      setDirty(true);
                    }}
                  >
                    {t(
                      "\u062d\u0630\u0641",
                      "Remove",
                    )}
                  </Button>
                </div>
              ),
            )}
          </div>
        </Card>

        <Card>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0646\u0648\u0639 \u0627\u0644\u062e\u0635\u0645",
                  "Discount type",
                )}
              </span>

              <select
                value={discountType}
                onChange={(event) => {
                  setDiscountType(
                    event.target
                      .value as
                      | ""
                      | "FIXED"
                      | "PERCENTAGE",
                  );
                  setDirty(true);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4"
              >
                <option value="">
                  {t(
                    "\u0628\u062f\u0648\u0646 \u062e\u0635\u0645",
                    "No discount",
                  )}
                </option>

                <option value="PERCENTAGE">
                  {t(
                    "\u0646\u0633\u0628\u0629 \u0645\u0626\u0648\u064a\u0629",
                    "Percentage",
                  )}
                </option>

                <option value="FIXED">
                  {t(
                    "\u0645\u0628\u0644\u063a \u062b\u0627\u0628\u062a",
                    "Fixed amount",
                  )}
                </option>
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0642\u064a\u0645\u0629 \u0627\u0644\u062e\u0635\u0645",
                  "Discount value",
                )}
              </span>

              <Input
                type="number"
                min="0"
                max={
                  discountType ===
                  "PERCENTAGE"
                    ? 100
                    : undefined
                }
                step="0.001"
                disabled={!discountType}
                value={discountValue}
                onChange={(event) => {
                  setDiscountValue(
                    Number(
                      event.target.value,
                    ),
                  );
                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0645\u0644\u0627\u062d\u0638\u0627\u062a",
                  "Notes",
                )}
              </span>

              <textarea
                value={notes}
                onChange={(event) => {
                  setNotes(
                    event.target.value,
                  );
                  setDirty(true);
                }}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 p-4"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645",
                  "Terms and conditions",
                )}
              </span>

              <textarea
                value={terms}
                onChange={(event) => {
                  setTerms(
                    event.target.value,
                  );
                  setDirty(true);
                }}
                className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-950 p-4"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
            <div className="min-w-72 space-y-1 text-sm">
              <div className="flex justify-between gap-6">
                <span>{t("الإجمالي قبل الخصم والضريبة", "Subtotal")}</span>
                <span>{preview.totals.subtotal.toFixed(3)} {quote.currencyCode}</span>
              </div>
              {preview.totals.discountAmount > 0 && (
                <div className="flex justify-between gap-6 text-amber-300">
                  <span>{t("الخصم", "Discount")}</span>
                  <span>- {preview.totals.discountAmount.toFixed(3)} {quote.currencyCode}</span>
                </div>
              )}
              <div className="flex justify-between gap-6">
                <span>{t("الضريبة", "Tax")}</span>
                <span>{preview.totals.taxAmount.toFixed(3)} {quote.currencyCode}</span>
              </div>
              <div className="flex justify-between gap-6 pt-1 text-lg font-semibold text-emerald-300">
                <span>{t("الإجمالي النهائي", "Total")}</span>
                <span>{preview.totals.totalAmount.toFixed(3)} {quote.currencyCode}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={cancel}
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
                      "\u062d\u0641\u0638 \u0627\u0644\u062a\u0639\u062f\u064a\u0644\u0627\u062a",
                      "Save changes",
                    )}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </section>
  );
}
