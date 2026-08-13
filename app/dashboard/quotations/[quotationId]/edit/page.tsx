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
  type: string;
  salePrice: number;
  taxRateId?: string | null;
};

type Line = {
  id?: string;
  catalogItemId?: string | null;
  taxRateId?: string | null;
  position: number;
  type: string;
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
  discount?: unknown;
};

type Quote = {
  id: string;
  quotationNumber: string;
  status: string;
  currencyCode: string;
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

  const [catalogError, setCatalogError] =
    useState(false);

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
        const response = await fetch(
          "/api/catalog/items?pageSize=100&isActive=true",
        );

        if (!response.ok) {
          setCatalogError(true);
          return;
        }

        const json = await response.json();
        setItems(
          Array.isArray(json.data)
            ? json.data
            : [],
        );
      } catch {
        setCatalogError(true);
      }
    })();
  }, []);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          line.quantity *
            line.unitPrice,
        0,
      ),
    [lines],
  );

  const discountAmount =
    discountType === "PERCENTAGE"
      ? subtotal *
        Math.min(100, discountValue) /
        100
      : discountType === "FIXED"
        ? Math.min(
            subtotal,
            discountValue,
          )
        : 0;

  const total =
    subtotal - discountAmount;

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

    setLines((current) => [
      ...current,
      {
        position: current.length + 1,
        catalogItemId: item.id,
        taxRateId: item.taxRateId,
        type: item.type,
        itemCode: item.code,
        itemName: item.name,
        unitName: "PCS",
        quantity: 1,
        unitPrice: item.salePrice,
        ...activeLocalizedText(item.name),
      },
    ]);
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

            lines: lines.map(
              (line, index) => ({
                ...line,
                position: index + 1,
              }),
            ),

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
          </label>

          <div className="mt-4 space-y-3">
            {lines.map(
              (line, index) => (
                <div
                  key={line.id ?? index}
                  className="grid gap-3 rounded-2xl border border-white/5 p-4 md:grid-cols-[1fr_100px_120px_140px_140px_auto]"
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

                  <div className="flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.03] px-3 font-semibold text-emerald-300">
                    {(
                      line.quantity *
                      line.unitPrice
                    ).toFixed(3)}
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
            <div>
              <p className="text-sm text-slate-500">
                {t(
                  "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u062a\u0648\u0642\u0639",
                  "Estimated total",
                )}
              </p>

              <p className="mt-1 text-2xl font-semibold text-emerald-300">
                {total.toFixed(3)}{" "}
                {quote.currencyCode}
              </p>
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
