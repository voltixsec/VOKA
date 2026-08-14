"use client";

import { useRouter } from "next/navigation";
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
} from "../../../../components/ui";
import {
  useLanguage,
} from "../../../../components/i18n/LanguageProvider";
import {
  QuotationCalculator,
  type QuotationLineType,
} from "@/src/domain/quotation";
import {
  moveQuotationLine,
  normalizeQuotationLinePositions,
} from "../quotation-line-order";

type Customer = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
  code: string;
  type: QuotationLineType;
  salePrice: number;
  taxRateId?: string | null;
  description?: string | null;
};

type Line = {
  editorKey: string;
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
  taxUnavailable?: boolean;
};

let editorLineSequence = 0;

function createEditorLineKey(): string {
  editorLineSequence += 1;
  return `new-line-${editorLineSequence}`;
}

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

type QuotationTermsTemplate = {
  termsAr: string;
  termsEn: string;
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

function todayDateInput(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NewQuotationPage() {
  const { isArabic } = useLanguage();
  const router = useRouter();

  const t = (ar: string, en: string) =>
    isArabic ? ar : en;

  const [customers, setCustomers] =
    useState<Customer[]>([]);

  const [items, setItems] =
    useState<Item[]>([]);

  const [taxRates, setTaxRates] =
    useState<TaxRate[]>([]);

  const [catalogError, setCatalogError] =
    useState(false);

  const [taxRateError, setTaxRateError] =
    useState(false);

  const [customerId, setCustomerId] =
    useState("");

  const [currencyCode, setCurrencyCode] =
    useState("KWD");

  const [number, setNumber] = useState(
    "QT-" + Date.now().toString().slice(-6),
  );

  const [expiryDate, setExpiryDate] =
    useState("");

  const [projectName, setProjectName] =
    useState("");

  const [attentionName, setAttentionName] =
    useState("");

  const [scopeType, setScopeType] =
    useState<ScopeType | "">("");

  const [subjectAr, setSubjectAr] =
    useState("");

  const [subjectEn, setSubjectEn] =
    useState("");

  const [briefAr, setBriefAr] =
    useState("");

  const [briefEn, setBriefEn] =
    useState("");

  const [lines, setLines] =
    useState<Line[]>([]);

  const [notes, setNotes] =
    useState("");

  const [terms, setTerms] =
    useState("");

  const [
    termsTemplates,
    setTermsTemplates,
  ] =
    useState<
      Partial<
        Record<
          ScopeType,
          QuotationTermsTemplate
        >
      >
    >({});

  const [
    termsTouched,
    setTermsTouched,
  ] =
    useState(false);

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
    let cancelled = false;

    async function loadCompanyCurrency() {
      try {
        const response =
          await fetch(
            "/api/companies/current",
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
              },
              cache:
                "no-store",
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await response.json();

        const currency =
          payload?.data
            ?.defaultCurrency;

        if (
          !cancelled &&
          typeof currency === "string" &&
          /^[A-Z]{3}$/.test(currency)
        ) {
          setCurrencyCode(currency);
        }
      } catch {
        /*
         * Keep KWD fallback if
         * company settings cannot load.
         */
      }
    }

    void loadCompanyCurrency();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadQuotationTermsTemplates() {
      try {
        const response =
          await fetch(
            "/api/companies/current/quotation-terms",
            {
              method: "GET",
              headers: {
                Accept:
                  "application/json",
              },
              cache:
                "no-store",
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await response.json();

        const next: Partial<
          Record<
            ScopeType,
            QuotationTermsTemplate
          >
        > = {};

        for (
          const template of
          payload?.data?.templates ?? []
        ) {
          const scope =
            template.scopeType as
              ScopeType;

          next[scope] = {
            termsAr:
              template.termsAr ?? "",

            termsEn:
              template.termsEn ?? "",
          };
        }

        if (!cancelled) {
          setTermsTemplates(next);
        }
      } catch {
        /*
         * Terms templates are optional.
         * Quotation creation must still work.
         */
      }
    }

    void loadQuotationTermsTemplates();

    return () => {
      cancelled = true;
    };
  }, []);

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
        setLoading(true);

        const me = await fetch("/api/auth/me");

        if (!me.ok) {
          throw new Error(
            t(
              "\u064a\u0644\u0632\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
              "Please sign in",
            ),
          );
        }

        const auth =
          (await me.json()).data;

        const companyId =
          auth.activeCompanyId;

        if (!companyId) {
          throw new Error(
            t(
              "\u0644\u0627 \u062a\u0648\u062c\u062f \u0634\u0631\u0643\u0629 \u0646\u0634\u0637\u0629",
              "No active company",
            ),
          );
        }

        const [customerResult, itemResult, taxRateResult] =
          await Promise.allSettled([
            fetch(
              "/api/customers?companyId=" +
                companyId +
                "&pageSize=100",
            ),
            fetch(
              "/api/catalog/items?pageSize=100&isActive=true",
            ),
            fetch("/api/tax-rates"),
          ]);

        if (
          customerResult.status === "rejected" ||
          !customerResult.value.ok
        ) {
          throw new Error(
            t(
              "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0646\u0645\u0648\u0630\u062c",
              "Unable to load form data",
            ),
          );
        }

        const customerJson =
          await customerResult.value.json();

        setCustomers(
          customerJson.data.customers,
        );

        if (itemResult.status === "fulfilled" && itemResult.value.ok) {
          const itemJson = await itemResult.value.json();
          setItems(Array.isArray(itemJson.data) ? itemJson.data : []);
        } else {
          setCatalogError(true);
        }

        if (taxRateResult.status === "fulfilled" && taxRateResult.value.ok) {
          const taxRateJson = await taxRateResult.value.json();
          setTaxRates(Array.isArray(taxRateJson.data) ? taxRateJson.data : []);
        } else {
          setTaxRateError(true);
        }
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
  }, [isArabic]);

  useEffect(() => {
    if (
      termsTouched ||
      !scopeType
    ) {
      return;
    }

    const template =
      termsTemplates[
        scopeType
      ];

    if (!template) {
      setTerms("");
      return;
    }

    setTerms(
      isArabic
        ? template.termsAr
        : template.termsEn,
    );
  }, [
    isArabic,
    scopeType,
    termsTemplates,
    termsTouched,
  ]);

  function getDefaultTerms() {
    if (!scopeType) {
      return;
    }

    const template =
      termsTemplates[
        scopeType
      ];

    setTerms(
      template
        ? (
            isArabic
              ? template.termsAr
              : template.termsEn
          )
        : "",
    );

    setTermsTouched(false);
    setDirty(true);
  }

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.id === customerId,
    );

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

  function activeLocalizedLineText(
    itemName: string,
    description: string,
  ): Partial<Line> {
    return isArabic
      ? {
          itemNameAr: itemName,
          unitNameAr: "PCS",
          ...(description ? { descriptionAr: description } : {}),
        }
      : {
          itemNameEn: itemName,
          unitNameEn: "PCS",
          ...(description ? { descriptionEn: description } : {}),
        };
  }

  function addItem(id: string) {
    setDirty(true);

    if (id === "__custom") {
      setLines((current) => [
        ...current,
        {
          editorKey: createEditorLineKey(),
          position: current.length + 1,
          catalogItemId: "",
          type: "CUSTOM",
          itemCode: "",
          itemName: t(
            "\u0628\u0646\u062f \u0645\u062e\u0635\u0635",
            "Custom line",
          ),
          description: "",
          unitName: "PCS",
          quantity: 1,
          unitPrice: 0,
          taxRateId: null,
          taxPercentage: 0,
          ...activeLocalizedLineText(
            t(
              "\u0628\u0646\u062f \u0645\u062e\u0635\u0635",
              "Custom line",
            ),
            "",
          ),
        },
      ]);

      return;
    }

    const item =
      items.find(
        (candidate) =>
          candidate.id === id,
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
        editorKey: createEditorLineKey(),
        position: current.length + 1,
        catalogItemId: item.id,
        type: item.type,
        itemCode: item.code,
        itemName: item.name,
        description: item.description ?? "",
        unitName: "PCS",
        quantity: 1,
        unitPrice: item.salePrice,
        taxRateId: catalogTaxRate?.id ?? null,
        taxPercentage: catalogTaxRate?.percentage ?? 0,
        taxUnavailable: Boolean(item.taxRateId && !catalogTaxRate),
        ...activeLocalizedLineText(item.name, item.description ?? ""),
      },
    ]);
  }

  function changeTaxRate(index: number, taxRateId: string) {
    const selected = taxRates.find((rate) => rate.id === taxRateId);
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex === index
        ? {
          ...line,
          taxRateId: selected?.id ?? null,
          taxPercentage: selected?.percentage ?? 0,
          taxUnavailable: false,
        }
        : line,
    ));
    setDirty(true);
  }

  function changeLine(
    index: number,
    key:
      | "quantity"
      | "unitPrice"
      | "itemName"
      | "unitName"
      | "description",
    value: number | string,
  ) {
    setDirty(true);

    setLines((current) =>
      current.map(
        (line, lineIndex) => {
          if (lineIndex !== index) return line;
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
        },
      ),
    );
  }

  function moveLine(index: number, direction: "up" | "down") {
    setLines((current) => moveQuotationLine(current, index, direction));
    setDirty(true);
  }

  function cancel() {
    const confirmed =
      !dirty ||
      window.confirm(
        t(
          "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u0639\u0631\u0636\u061f \u0633\u062a\u0641\u0642\u062f \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a \u063a\u064a\u0631 \u0627\u0644\u0645\u062d\u0641\u0648\u0638\u0629.",
          "Cancel this quotation? Unsaved changes will be lost.",
        ),
      );

    if (confirmed) {
      router.push(
        "/dashboard/quotations",
      );
    }
  }

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

    if (
      !selectedCustomer ||
      lines.length === 0
    ) {
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        "/api/quotations",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            localizationSourceLocale:
              isArabic ? "ar" : "en",
            customerId,
            quotationNumber: number,
            currencyCode,

            ...(expiryDate
              ? {
                  expiryDate:
                    expiryDateIso(expiryDate),
                }
              : {}),

            customer: {
              name:
                selectedCustomer.name,
            },

            projectName,
            attentionName,
            scopeType:
              scopeType || null,
            ...(isArabic
              ? {
                  subjectAr,
                  briefAr,
                  termsAndConditionsAr: terms,
                }
              : {
                  subjectEn,
                  briefEn,
                  termsAndConditionsEn: terms,
                }),

            lines: lines.map(
              ({
                editorKey: _editorKey,
                taxUnavailable: _taxUnavailable,
                ...line
              }, index) => ({
                ...line,
                catalogItemId:
                  line.catalogItemId ||
                  null,
                position: index + 1,
              }),
            ),

            notes,
            termsAndConditions:
              terms,

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
            "Create failed",
        );
      }

      setDirty(false);

      router.push(
        "/dashboard/quotations/" +
          json.data.id,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Create failed",
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
          "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0644\u0639\u0631\u0648\u0636",
          "Back to quotations",
        )}
      </button>

      <SectionHeader
        eyebrow={t(
          "\u0639\u0631\u0636 \u062c\u062f\u064a\u062f",
          "New quotation",
        )}
        title={t(
          "\u0645\u0646\u0634\u0626 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0641\u0646\u064a \u0648\u0627\u0644\u062a\u062c\u0627\u0631\u064a",
          "Proposal composer",
        )}
        description={t(
          "\u0623\u0646\u0634\u0626 \u063a\u0644\u0627\u0641 \u0627\u0644\u0639\u0631\u0636 \u0648\u0627\u0644\u0645\u0644\u062e\u0635 \u0648\u0628\u0646\u0648\u062f \u0627\u0644\u0623\u0633\u0639\u0627\u0631.",
          "Create the commercial cover, proposal brief and quotation lines.",
        )}
      />

      <form
        onSubmit={submit}
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
              "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u0631\u0636",
              "Quotation information",
            )}
          </h3>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0627\u0644\u0639\u0645\u064a\u0644",
                  "Customer",
                )}
              </span>

              <select
                required
                value={customerId}
                onChange={(event) => {
                  setCustomerId(
                    event.target.value,
                  );
                  setDirty(true);
                }}
                className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-4"
              >
                <option value="">
                  {t(
                    "\u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644",
                    "Select customer",
                  )}
                </option>

                {customers.map(
                  (customer) => (
                    <option
                      key={customer.id}
                      value={customer.id}
                    >
                      {customer.name}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0631\u0642\u0645 \u0627\u0644\u0639\u0631\u0636",
                  "Quotation number",
                )}
              </span>

              <Input
                required
                value={number}
                onChange={(event) => {
                  setNumber(
                    event.target.value,
                  );
                  setDirty(true);
                }}
              />
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
                min={todayDateInput()}
                value={expiryDate}
                onChange={(event) => {
                  setExpiryDate(
                    event.target.value,
                  );
                  setDirty(true);
                }}
              />
            </label>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold">
            {t(
              "\u063a\u0644\u0627\u0641 \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u062a\u062c\u0627\u0631\u064a",
              "Commercial proposal cover",
            )}
          </h3>

          <p className="mt-1 text-sm text-slate-500">
            {t(
              "\u0647\u0630\u0647 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0633\u062a\u0638\u0647\u0631 \u0641\u064a \u0635\u0641\u062d\u0629 \u0627\u0644\u063a\u0644\u0627\u0641.",
              "These details will form the proposal cover page.",
            )}
          </p>

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
                  const nextScope =
                    event.target
                      .value as
                      | ScopeType
                      | "";

                  setScopeType(
                    nextScope,
                  );

                  if (
                    !termsTouched
                  ) {
                    setTerms("");
                  }

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

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u0639\u0631\u0636",
                  "Proposal subject",
                )}
              </span>

              <Input
                dir={isArabic ? "rtl" : "ltr"}
                value={isArabic ? subjectAr : subjectEn}
                onChange={(event) => {
                  if (isArabic) {
                    setSubjectAr(event.target.value);
                  } else {
                    setSubjectEn(event.target.value);
                  }

                  setDirty(true);
                }}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm text-slate-400">
                {t(
                  "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u0631\u0636",
                  "Proposal brief",
                )}
              </span>

              <textarea
                dir={isArabic ? "rtl" : "ltr"}
                value={isArabic ? briefAr : briefEn}
                onChange={(event) => {
                  if (isArabic) {
                    setBriefAr(event.target.value);
                  } else {
                    setBriefEn(event.target.value);
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
              defaultValue=""
              onChange={(event) => {
                addItem(
                  event.target.value,
                );
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
                  "تعذر تحميل الكتالوج. يمكنك إضافة بند مخصص.",
                  "Catalog unavailable. You can still add a custom line.",
                )}
              </span>
            )}
            {taxRateError && (
              <span className="text-xs text-amber-300">
                {t(
                  "تعذر تحميل الضرائب المتاحة.",
                  "Available tax rates could not be loaded.",
                )}
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
              <span>{t("الإجراءات", "Actions")}</span>
            </div>
            {lines.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">
                {t(
                  "\u0623\u0636\u0641 \u0628\u0646\u062f\u064b\u0627 \u0648\u0627\u062d\u062f\u064b\u0627 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644",
                  "Add at least one line",
                )}
              </p>
            )}

            {lines.map(
              (line, index) => (
                <div
                  key={line.editorKey}
                  className="grid gap-3 rounded-2xl border border-white/5 p-4 md:grid-cols-[1fr_100px_100px_130px_170px_140px_auto]"
                >
                  <div>
                    <Input
                      aria-label={`${t("الصنف", "Item")} ${index + 1}`}
                      value={
                        line.itemName
                      }
                      onChange={(
                        event,
                      ) =>
                        changeLine(
                          index,
                          "itemName",
                          event.target
                            .value,
                        )
                      }
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      {line.itemCode ||
                        line.type}
                    </p>
                  </div>

                  <Input
                    aria-label={`${t("الوحدة", "Unit")} ${index + 1}`}
                    value={line.unitName}
                    onChange={(event) =>
                      changeLine(
                        index,
                        "unitName",
                        event.target.value,
                      )
                    }
                    placeholder={t(
                      "\u0627\u0644\u0648\u062d\u062f\u0629",
                      "Unit",
                    )}
                  />

                  <Input
                    aria-label={`${t("الكمية", "Quantity")} ${index + 1}`}
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
                    aria-label={`${t("سعر الوحدة", "Unit price")} ${index + 1}`}
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
                      value={line.taxRateId ?? ""}
                      onChange={(event) => changeTaxRate(index, event.target.value)}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3"
                    >
                      <option value="">{t("بدون ضريبة", "No tax")}</option>
                      {taxRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.name} ({rate.percentage.toFixed(2)}%)
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

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`${t("تحريك لأعلى", "Move up")} ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => moveLine(index, "up")}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`${t("تحريك لأسفل", "Move down")} ${index + 1}`}
                      disabled={index === lines.length - 1}
                      onClick={() => moveLine(index, "down")}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={lines.length === 1}
                      onClick={() => {
                        setLines((current) => normalizeQuotationLinePositions(
                          current.filter((_line, lineIndex) => lineIndex !== index),
                        ));
                        setDirty(true);
                      }}
                    >
                      {t("\u062d\u0630\u0641", "Remove")}
                    </Button>
                  </div>

                  <label className="space-y-1 md:col-span-7">
                    <span className="text-xs text-slate-400">
                      {t("الوصف", "Description")}
                    </span>
                    <textarea
                      aria-label={`${t("الوصف", "Description")} ${index + 1}`}
                      value={line.description ?? ""}
                      onChange={(event) => changeLine(index, "description", event.target.value)}
                      placeholder={t("وصف اختياري", "Optional description")}
                      rows={2}
                      className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/50 focus:ring-4 focus:ring-sky-400/10"
                    />
                  </label>
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
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-slate-400">
                  {t(
                    "\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645",
                    "Terms and conditions",
                  )}
                </span>

                {scopeType ? (
                  <button
                    type="button"
                    onClick={() => {
                      getDefaultTerms();
                    }}
                    className="text-xs font-medium text-sky-400 transition hover:text-sky-300"
                  >
                    {t(
                      "\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629",
                      "Use default terms",
                    )}
                  </button>
                ) : null}
              </div>

              <textarea
                value={terms}
                onChange={(event) => {
                  setTerms(
                    event.target.value,
                  );
                  setTermsTouched(true);
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
                <span>{preview.totals.subtotal.toFixed(3)} {currencyCode}</span>
              </div>
              {preview.totals.discountAmount > 0 && (
                <div className="flex justify-between gap-6 text-amber-300">
                  <span>{t("الخصم", "Discount")}</span>
                  <span>- {preview.totals.discountAmount.toFixed(3)} {currencyCode}</span>
                </div>
              )}
              <div className="flex justify-between gap-6">
                <span>{t("الضريبة", "Tax")}</span>
                <span>{preview.totals.taxAmount.toFixed(3)} {currencyCode}</span>
              </div>
              <div className="flex justify-between gap-6 pt-1 text-lg font-semibold text-emerald-300">
                <span>{t("الإجمالي النهائي", "Total")}</span>
                <span>{preview.totals.totalAmount.toFixed(3)} {currencyCode}</span>
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
                disabled={
                  saving ||
                  !customerId ||
                  lines.length === 0
                }
              >
                {saving
                  ? t(
                      "\u062c\u0627\u0631\u064a \u0627\u0644\u062d\u0641\u0638...",
                      "Saving...",
                    )
                  : t(
                      "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636",
                      "Create proposal",
                    )}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </section>
  );
}
