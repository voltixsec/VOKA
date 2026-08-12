"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useState,
} from "react";

import {
  useLanguage,
} from "@/components/i18n/LanguageProvider";

type BrandTheme =
  | "NAVY_GOLD"
  | "ROYAL_BLUE"
  | "EMERALD"
  | "BURGUNDY"
  | "CHARCOAL";

const BRAND_THEMES: Array<{
  value: BrandTheme;
  en: string;
  ar: string;
  primary: string;
  accent: string;
}> = [
  {
    value: "NAVY_GOLD",
    en: "Navy + Gold",
    ar: "كحلي وذهبي",
    primary: "#0f172a",
    accent: "#d4a72c",
  },
  {
    value: "ROYAL_BLUE",
    en: "Royal Blue",
    ar: "أزرق ملكي",
    primary: "#1d4ed8",
    accent: "#60a5fa",
  },
  {
    value: "EMERALD",
    en: "Emerald",
    ar: "زمردي",
    primary: "#065f46",
    accent: "#34d399",
  },
  {
    value: "BURGUNDY",
    en: "Burgundy",
    ar: "نبيتي",
    primary: "#7f1d1d",
    accent: "#f59e0b",
  },
  {
    value: "CHARCOAL",
    en: "Charcoal",
    ar: "فحمي",
    primary: "#27272a",
    accent: "#a1a1aa",
  },
];
type CompanyIdentity = {
  id: string;
  name: string;

  nameAr: string | null;
  nameEn: string | null;

  addressAr: string | null;
  addressEn: string | null;

  poBox: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;

  logoUrl: string | null;
  letterheadUrl: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  brandTheme: BrandTheme;

  defaultCurrency: string;
};

type CompanyForm = {
  nameAr: string;
  nameEn: string;

  addressAr: string;
  addressEn: string;

  poBox: string;
  phone: string;
  mobile: string;
  whatsapp: string;

  logoUrl: string;
  letterheadUrl: string;
  signatureUrl: string;
  stampUrl: string;
  brandTheme: BrandTheme;

  defaultCurrency: string;
};

type TermsScopeType =
  | "SUPPLY_ONLY"
  | "SUPPLY_AND_INSTALLATION"
  | "INSTALLATION_ONLY"
  | "SERVICE"
  | "MAINTENANCE"
  | "CONSULTATION"
  | "CUSTOM";

type TermsTemplate = {
  termsAr: string;
  termsEn: string;
};

const TERMS_SCOPE_OPTIONS: Array<{
  value: TermsScopeType;
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

const CURRENCY_OPTIONS = [
  {
    code: "KWD",
    en: "Kuwaiti Dinar",
    ar: "\u062f\u064a\u0646\u0627\u0631 \u0643\u0648\u064a\u062a\u064a",
  },
  {
    code: "USD",
    en: "US Dollar",
    ar: "\u062f\u0648\u0644\u0627\u0631 \u0623\u0645\u0631\u064a\u0643\u064a",
  },
  {
    code: "EUR",
    en: "Euro",
    ar: "\u064a\u0648\u0631\u0648",
  },
  {
    code: "SAR",
    en: "Saudi Riyal",
    ar: "\u0631\u064a\u0627\u0644 \u0633\u0639\u0648\u062f\u064a",
  },
  {
    code: "AED",
    en: "UAE Dirham",
    ar: "\u062f\u0631\u0647\u0645 \u0625\u0645\u0627\u0631\u0627\u062a\u064a",
  },
  {
    code: "QAR",
    en: "Qatari Riyal",
    ar: "\u0631\u064a\u0627\u0644 \u0642\u0637\u0631\u064a",
  },
  {
    code: "BHD",
    en: "Bahraini Dinar",
    ar: "\u062f\u064a\u0646\u0627\u0631 \u0628\u062d\u0631\u064a\u0646\u064a",
  },
  {
    code: "OMR",
    en: "Omani Rial",
    ar: "\u0631\u064a\u0627\u0644 \u0639\u0645\u0627\u0646\u064a",
  },
  {
    code: "GBP",
    en: "British Pound",
    ar: "\u062c\u0646\u064a\u0647 \u0625\u0633\u062a\u0631\u0644\u064a\u0646\u064a",
  },
  {
    code: "EGP",
    en: "Egyptian Pound",
    ar: "\u062c\u0646\u064a\u0647 \u0645\u0635\u0631\u064a",
  },
] as const;

const EMPTY_FORM: CompanyForm = {
  nameAr: "",
  nameEn: "",

  addressAr: "",
  addressEn: "",

  poBox: "",
  phone: "",
  mobile: "",
  whatsapp: "",

  logoUrl: "",
  letterheadUrl: "",
  signatureUrl: "",
  stampUrl: "",

  brandTheme:
    "NAVY_GOLD",

  defaultCurrency: "KWD",
};

function toForm(
  company: CompanyIdentity,
): CompanyForm {
  return {
    nameAr:
      company.nameAr ?? "",

    nameEn:
      company.nameEn ?? "",

    addressAr:
      company.addressAr ?? "",

    addressEn:
      company.addressEn ?? "",

    poBox:
      company.poBox ?? "",

    phone:
      company.phone ?? "",

    mobile:
      company.mobile ?? "",

    whatsapp:
      company.whatsapp ?? "",

    logoUrl:
      company.logoUrl ?? "",
    letterheadUrl: company.letterheadUrl ?? "",
    signatureUrl: company.signatureUrl ?? "",
    stampUrl: company.stampUrl ?? "",

    brandTheme:
      company.brandTheme ??
      "NAVY_GOLD",

    defaultCurrency:
      company.defaultCurrency ??
      "KWD",
  };
}

function optional(
  value: string,
): string | null {
  return value.trim() || null;
}

export default function CompanySettingsPage() {
  const {
    language,
    isArabic,
  } = useLanguage();

  const [
    form,
    setForm,
  ] =
    useState<CompanyForm>(
      EMPTY_FORM,
    );

  const [
    selectedTermsScope,
    setSelectedTermsScope,
  ] =
    useState<TermsScopeType>(
      "SUPPLY_ONLY",
    );

  const [
    termsByScope,
    setTermsByScope,
  ] =
    useState<
      Partial<
        Record<
          TermsScopeType,
          TermsTemplate
        >
      >
    >({});

  const [
    loadingTerms,
    setLoadingTerms,
  ] =
    useState(true);

  const [
    savingTerms,
    setSavingTerms,
  ] =
    useState(false);

  const [
    termsError,
    setTermsError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    termsMessage,
    setTermsMessage,
  ] =
    useState<string | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    success,
    setSuccess,
  ] =
    useState<string | null>(
      null,
    );

  const currentName =
    isArabic
      ? form.nameAr
      : form.nameEn;

  const currentAddress =
    isArabic
      ? form.addressAr
      : form.addressEn;

  useEffect(() => {
    let cancelled =
      false;

    async function loadCompany() {
      try {
        setLoading(true);
        setError(null);

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

        const payload =
          await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error
              ?.message ||
              (
                isArabic
                  ? "تم حفظ إعدادات الشركة بنجاح"
                  : "Unable to load company details."
              ),
          );
        }

        if (!cancelled) {
          setForm(
            toForm(
              payload.data,
            ),
          );
        }
      } catch (
        loadError
      ) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : (
                  isArabic
                    ? "تم حفظ إعدادات الشركة بنجاح"
                    : "Unable to load company details."
                ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCompany();

    return () => {
      cancelled = true;
    };
  }, [isArabic]);

  useEffect(() => {
    let cancelled = false;

    async function loadTermsTemplates() {
      try {
        setLoadingTerms(true);
        setTermsError(null);

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

        const payload =
          await response.json();

        if (!response.ok) {
          throw new Error(
            payload?.error
              ?.message ||
              (
                isArabic
                  ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0634\u0631\u0648\u0637 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631."
                  : "Unable to load quotation terms."
              ),
          );
        }

        const next: Partial<
          Record<
            TermsScopeType,
            TermsTemplate
          >
        > = {};

        for (
          const template of
          payload?.data?.templates ?? []
        ) {
          if (
            typeof template.scopeType !==
            "string"
          ) {
            continue;
          }

          next[
            template.scopeType as
              TermsScopeType
          ] = {
            termsAr:
              template.termsAr ?? "",

            termsEn:
              template.termsEn ?? "",
          };
        }

        if (!cancelled) {
          setTermsByScope(next);
        }
      } catch (loadError) {
        if (!cancelled) {
          setTermsError(
            loadError instanceof Error
              ? loadError.message
              : (
                  isArabic
                    ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0634\u0631\u0648\u0637 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631."
                    : "Unable to load quotation terms."
                ),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingTerms(false);
        }
      }
    }

    void loadTermsTemplates();

    return () => {
      cancelled = true;
    };
  }, [isArabic]);

  const currentTerms =
    termsByScope[
      selectedTermsScope
    ] ?? {
      termsAr: "",
      termsEn: "",
    };

  const currentTermsValue =
    isArabic
      ? currentTerms.termsAr
      : currentTerms.termsEn;

  function updateCurrentTerms(
    value: string,
  ) {
    setTermsByScope(
      (current) => ({
        ...current,

        [selectedTermsScope]: {
          termsAr:
            isArabic
              ? value
              : (
                  current[
                    selectedTermsScope
                  ]?.termsAr ?? ""
                ),

          termsEn:
            isArabic
              ? (
                  current[
                    selectedTermsScope
                  ]?.termsEn ?? ""
                )
              : value,
        },
      }),
    );

    setTermsMessage(null);
    setTermsError(null);
  }

  async function saveCurrentTerms() {
    try {
      setSavingTerms(true);
      setTermsMessage(null);
      setTermsError(null);

      const response =
        await fetch(
          "/api/companies/current/quotation-terms",
          {
            method: "PUT",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                scopeType:
                  selectedTermsScope,

                ...(isArabic
                  ? {
                      termsAr:
                        currentTermsValue,
                    }
                  : {
                      termsEn:
                        currentTermsValue,
                    }),
              }),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error
            ?.message ||
            (
              isArabic
                ? "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0634\u0631\u0648\u0637 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631."
                : "Unable to save quotation terms."
            ),
        );
      }

      const template =
        payload?.data?.template;

      if (template) {
        setTermsByScope(
          (current) => ({
            ...current,

            [selectedTermsScope]: {
              termsAr:
                template.termsAr ?? "",

              termsEn:
                template.termsEn ?? "",
            },
          }),
        );
      }

      setTermsMessage(
        isArabic
          ? "\u062a\u0645 \u062d\u0641\u0638 \u0634\u0631\u0648\u0637 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631."
          : "Quotation terms saved.",
      );
    } catch (saveError) {
      setTermsError(
        saveError instanceof Error
          ? saveError.message
          : (
              isArabic
                ? "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 \u0634\u0631\u0648\u0637 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631."
                : "Unable to save quotation terms."
            ),
      );
    } finally {
      setSavingTerms(false);
    }
  }

  function updateField(
    field: keyof CompanyForm,
    value: string,
  ) {
    setForm(
      (
        current,
      ) => ({
        ...current,
        [field]:
          value,
      }),
    );

    setSuccess(null);
  }

  function updateCurrentName(
    value: string,
  ) {
    updateField(
      isArabic
        ? "nameAr"
        : "nameEn",
      value,
    );
  }

  function updateCurrentAddress(
    value: string,
  ) {
    updateField(
      isArabic
        ? "addressAr"
        : "addressEn",
      value,
    );
  }

  function handleAsset(
    event:
      ChangeEvent<HTMLInputElement>,
    field: "logoUrl" | "letterheadUrl" | "signatureUrl" | "stampUrl",
    maxBytes: number,
  ) {
    const file =
      event.target
        .files?.[0];

    event.target.value =
      "";

    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/png",
      "image/jpeg",
    ];

    if (
      !allowedTypes.includes(
        file.type,
      )
    ) {
      setError(
        isArabic
          ? "يجب أن تكون الصورة بصيغة PNG أو JPG."
            : "Image must be PNG or JPG.",
      );

      return;
    }

    if (
      file.size >
      maxBytes
    ) {
      setError(
        isArabic
          ? `يجب ألا يتجاوز حجم الصورة ${maxBytes / 1024} كيلوبايت.`
            : `Image size must not exceed ${maxBytes / 1024} KB.`,
      );

      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {
        if (
          typeof reader.result ===
          "string"
        ) {
          updateField(
            field,
            reader.result,
          );

          setError(null);
        }
      };

    reader.onerror =
      () => {
        setError(
          isArabic
            ? "تعذر قراءة ملف الصورة."
            : "Unable to read the image file.",
        );
      };

    reader.readAsDataURL(
      file,
    );
  }

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const localizedFields =
        language === "ar"
          ? {
              nameAr:
                optional(
                  form.nameAr,
                ),

              addressAr:
                optional(
                  form.addressAr,
                ),
            }
          : {
              nameEn:
                optional(
                  form.nameEn,
                ),

              addressEn:
                optional(
                  form.addressEn,
                ),
            };

      const response =
        await fetch(
          "/api/companies/current",
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",

              Accept:
                "application/json",
            },

            body:
              JSON.stringify({
                ...localizedFields,

                poBox:
                  optional(
                    form.poBox,
                  ),

                phone:
                  optional(
                    form.phone,
                  ),

                mobile:
                  optional(
                    form.mobile,
                  ),

                whatsapp:
                  optional(
                    form.whatsapp,
                  ),

                logoUrl:
                  optional(
                    form.logoUrl,
                  ),
                letterheadUrl: optional(form.letterheadUrl),
                signatureUrl: optional(form.signatureUrl),
                stampUrl: optional(form.stampUrl),

                brandTheme:
                  form.brandTheme,

                defaultCurrency:
                  form.defaultCurrency,
              }),
          },
        );

      const payload =
        await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.error
            ?.message ||
            (
              isArabic
                ? "تم حفظ إعدادات الشركة بنجاح"
                : "Unable to save company details."
            ),
        );
      }

      setForm(
        toForm(
          payload.data,
        ),
      );

      setSuccess(
        isArabic
          ? "تم حفظ إعدادات الشركة بنجاح"
          : "Company details saved successfully.",
      );
    } catch (
      saveError
    ) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : (
              isArabic
                ? "تم حفظ إعدادات الشركة بنجاح"
                : "Unable to save company details."
            ),
      );
    } finally {
      setSaving(false);
    }
  }

  const labels =
    isArabic
      ? {
          eyebrow:
            "\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629",

          title:
            "\u0627\u0644\u0647\u0648\u064a\u0629 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629 \u0648\u0628\u064a\u0627\u0646\u0627\u062a \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631",

          description:
            "\u0627\u0643\u062a\u0628 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0631\u0629 \u0648\u0627\u062d\u062f\u0629 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629.",

          identity:
            "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629",

          companyName:
            "\u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629",

          companyNamePlaceholder:
            "\u0641\u0648\u0643\u0627",

          address:
            "\u0627\u0644\u0639\u0646\u0648\u0627\u0646",

          addressPlaceholder:
            "\u0627\u0644\u0643\u0648\u064a\u062a\u060c \u0627\u0644\u0633\u0627\u0644\u0645\u064a\u0629...",

          logo:
            "\u0627\u0644\u0644\u0648\u062c\u0648",

          noLogo:
            "\u0644\u0645 \u064a\u062a\u0645 \u0631\u0641\u0639 \u0644\u0648\u062c\u0648",

          selectLogo:
            "\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0644\u0648\u062c\u0648",

          deleteLogo:
            "\u062d\u0630\u0641 \u0627\u0644\u0644\u0648\u062c\u0648",

          logoHelp:
            "PNG \u0623\u0648 JPG\u060c \u0628\u062d\u062f \u0623\u0642\u0635\u0649 750 \u0643\u064a\u0644\u0648\u0628\u0627\u064a\u062a.",
          documentAssets: "\u0623\u0635\u0648\u0644 \u0645\u0633\u062a\u0646\u062f\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629",
          letterhead: "\u0627\u0644\u0648\u0631\u0642 \u0627\u0644\u0631\u0633\u0645\u064a",
          signature: "\u062a\u0648\u0642\u064a\u0639 \u0627\u0644\u0634\u0631\u0643\u0629",
          stamp: "\u062e\u062a\u0645 \u0627\u0644\u0634\u0631\u0643\u0629",
          chooseAsset: "\u0627\u062e\u062a\u064a\u0627\u0631 \u0635\u0648\u0631\u0629",
          removeAsset: "\u0625\u0632\u0627\u0644\u0629",
          noAsset: "\u0644\u0645 \u064a\u062a\u0645 \u0631\u0641\u0639 \u0635\u0648\u0631\u0629",

          currency:
            "\u0627\u0644\u0639\u0645\u0644\u0629",

          termsTitle:
            "\u0634\u0631\u0648\u0637 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631",

          termsDescription:
            "\u062d\u062f\u062f \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629 \u0644\u0643\u0644 \u0646\u0648\u0639 \u0639\u0645\u0644. \u0633\u064a\u062a\u0645 \u0646\u0633\u062e\u0647\u0627 \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627 \u0625\u0644\u0649 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u062c\u062f\u064a\u062f \u0648\u064a\u0645\u0643\u0646 \u062a\u0639\u062f\u064a\u0644\u0647\u0627 \u062f\u0627\u062e\u0644 \u0627\u0644\u0639\u0631\u0636.",

          termsScope:
            "\u0646\u0648\u0639 \u0627\u0644\u0639\u0645\u0644",

          termsBody:
            "\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645",

          termsLoading:
            "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0634\u0631\u0648\u0637...",

          termsSave:
            "\u062d\u0641\u0638 \u0634\u0631\u0648\u0637 \u0647\u0630\u0627 \u0627\u0644\u0646\u0648\u0639",

          termsSaving:
            "\u062c\u0627\u0631\u064d \u062d\u0641\u0638 \u0627\u0644\u0634\u0631\u0648\u0637...",

          contact:
            "\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0627\u062a\u0635\u0627\u0644",

          poBox:
            "\u0635\u0646\u062f\u0648\u0642 \u0627\u0644\u0628\u0631\u064a\u062f",

          phone:
            "\u0627\u0644\u0647\u0627\u062a\u0641",

          mobile:
            "\u0627\u0644\u0645\u0648\u0628\u0627\u064a\u0644",

          whatsapp:
            "\u0648\u0627\u062a\u0633\u0627\u0628",

          loading:
            "\u062c\u0627\u0631\u064d \u062a\u062d\u0645\u064a\u0644 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629...",

          saving:
            "\u062c\u0627\u0631\u064d \u0627\u0644\u062d\u0641\u0638...",

          save:
            "\u062d\u0641\u0638 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0634\u0631\u0643\u0629",
        }
      : {
          eyebrow:
            "Company Settings",

          title:
            "Company Identity & Quotation Details",

          description:
            "Enter your company details once in the current language.",

          identity:
            "Company Details",

          companyName:
            "Company Name",

          companyNamePlaceholder:
            "VOKA",

          address:
            "Address",

          addressPlaceholder:
            "Kuwait, Salmiya...",

          logo:
            "Logo",

          noLogo:
            "No logo uploaded",

          selectLogo:
            "Choose Logo",

          deleteLogo:
            "Remove Logo",

          logoHelp:
            "PNG or JPG. Maximum size 750 KB.",
          documentAssets: "Company Document Assets",
          letterhead: "Letterhead",
          signature: "Company Signature",
          stamp: "Company Stamp",
          chooseAsset: "Choose Image",
          removeAsset: "Remove",
          noAsset: "No image uploaded",

          currency:
            "Currency",

          termsTitle:
            "Quotation Terms",

          termsDescription:
            "Set the default terms for each scope of work. They will be copied into new quotations and can still be edited inside each quotation.",

          termsScope:
            "Scope of Work",

          termsBody:
            "Terms and Conditions",

          termsLoading:
            "Loading terms...",

          termsSave:
            "Save Terms for This Scope",

          termsSaving:
            "Saving terms...",

          contact:
            "Contact Details",

          poBox:
            "P.O. Box",

          phone:
            "Telephone",

          mobile:
            "Mobile",

          whatsapp:
            "WhatsApp",

          loading:
            "Loading company details...",

          saving:
            "Saving...",

          save:
            "Save Company Details",
        };

  if (loading) {
    return (
      <main
        dir={
          isArabic
            ? "rtl"
            : "ltr"
        }
        className="min-h-screen bg-slate-950 p-6 text-white"
      >
        <div className="mx-auto max-w-6xl rounded-3xl border border-slate-800 bg-slate-900 p-8">
          {labels.loading}
        </div>
      </main>
    );
  }

  return (
    <main
      dir={
        isArabic
          ? "rtl"
          : "ltr"
      }
      className="min-h-screen bg-slate-950 p-6 text-white"
    >
      <form
        onSubmit={
          handleSubmit
        }
        className="mx-auto max-w-6xl space-y-6"
      >
        <header className="rounded-3xl border border-slate-800 bg-slate-900 p-7">
          <p className="text-sm font-semibold text-sky-400">
            {labels.eyebrow}
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {labels.title}
          </h1>

          <p className="mt-3 text-sm leading-7 text-slate-400">
            {labels.description}
          </p>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-800 bg-red-950/60 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-950/60 px-5 py-4 text-sm text-emerald-200">
            {success}
          </div>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold">
              {labels.identity}
            </h2>

            <div className="mt-6 space-y-5">
              <label className="block space-y-2">
                <span className="text-sm text-slate-300">
                  {labels.companyName}
                </span>

                <input
                  dir={
                    isArabic
                      ? "rtl"
                      : "ltr"
                  }
                  value={
                    currentName
                  }
                  onChange={(
                    event,
                  ) =>
                    updateCurrentName(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder={
                    labels.companyNamePlaceholder
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">
                  {labels.address}
                </span>

                <textarea
                  dir={
                    isArabic
                      ? "rtl"
                      : "ltr"
                  }
                  value={
                    currentAddress
                  }
                  onChange={(
                    event,
                  ) =>
                    updateCurrentAddress(
                      event.target.value,
                    )
                  }
                  rows={3}
                  className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
                  placeholder={
                    labels.addressPlaceholder
                  }
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm text-slate-300">
                  {labels.currency}
                </span>

                <select
                  value={form.defaultCurrency}
                  onChange={(event) =>
                    updateField(
                      "defaultCurrency",
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
                >
                  {CURRENCY_OPTIONS.map(
                    (currency) => (
                      <option
                        key={currency.code}
                        value={currency.code}
                      >
                        {currency.code}
                        {" ? "}
                        {isArabic
                          ? currency.ar
                          : currency.en}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </div>
          </div>

          {/* BRAND THEME PICKER */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold">
                {isArabic
                  ? "الهوية البصرية"
                  : "Brand identity"}
              </h2>

              <p className="text-sm leading-7 text-slate-400">
                {isArabic
                  ? "اختر هوية ألوان موحدة لعرض السعر والمستندات."
                  : "Choose the visual color identity used across quotation documents."}
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {BRAND_THEMES.map(
                (theme) => {
                  const selected =
                    form.brandTheme ===
                    theme.value;

                  return (
                    <button
                      key={theme.value}
                      type="button"
                      onClick={() =>
                        updateField(
                          "brandTheme",
                          theme.value,
                        )
                      }
                      className={
                        "rounded-2xl border p-4 text-start transition " +
                        (
                          selected
                            ? "border-sky-400 bg-slate-800"
                            : "border-slate-700 bg-slate-950 hover:border-slate-500"
                        )
                      }
                    >
                      <div
                        className="h-16 overflow-hidden rounded-xl"
                        style={{
                          backgroundColor:
                            theme.primary,
                        }}
                      >
                        <div
                          className="mt-11 h-1.5 w-full"
                          style={{
                            backgroundColor:
                              theme.accent,
                          }}
                        />
                      </div>

                      <div className="mt-3 text-sm font-semibold">
                        {isArabic
                          ? theme.ar
                          : theme.en}
                      </div>

                      {selected ? (
                        <div className="mt-1 text-xs text-sky-400">
                          {isArabic
                            ? "محدد"
                            : "Selected"}
                        </div>
                      ) : null}
                    </button>
                  );
                },
              )}
            </div>

            <div
              className="mt-6 overflow-hidden rounded-2xl border border-slate-700"
              style={{
                backgroundColor:
                  BRAND_THEMES.find(
                    (theme) =>
                      theme.value ===
                      form.brandTheme,
                  )?.primary ??
                  "#0f172a",
              }}
            >
              <div className="flex min-h-28 items-center justify-between gap-5 p-6">
                <div
                  className={
                    isArabic
                      ? "order-2 text-right"
                      : "text-left"
                  }
                >
                  <div className="text-lg font-bold text-white">
                    {currentName ||
                      (
                        isArabic
                          ? "اسم الشركة"
                          : "Company name"
                      )}
                  </div>

                  <div className="mt-1 text-xs text-white/70">
                    {currentAddress ||
                      (
                        isArabic
                          ? "عنوان الشركة"
                          : "Company address"
                      )}
                  </div>
                </div>

                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt="Brand preview"
                    className="max-h-16 max-w-32 object-contain"
                  />
                ) : null}
              </div>

              <div
                className="h-1.5"
                style={{
                  backgroundColor:
                    BRAND_THEMES.find(
                      (theme) =>
                        theme.value ===
                        form.brandTheme,
                    )?.accent ??
                    "#d4a72c",
                }}
              />
            </div>
          </div>
          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-bold">
              {labels.logo}
            </h2>

            <div className="mt-5 flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5">
              {form.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={
                    form.logoUrl
                  }
                  alt="Company logo"
                  className="max-h-36 max-w-full object-contain"
                />
              ) : (
                <span className="text-center text-sm text-slate-500">
                  {labels.noLogo}
                </span>
              )}
            </div>

            <label className="mt-4 block cursor-pointer rounded-xl bg-sky-600 px-4 py-3 text-center text-sm font-semibold transition hover:bg-sky-500">
              {labels.selectLogo}

              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={
                  (event) => handleAsset(event, "logoUrl", 750 * 1024)
                }
                className="hidden"
              />
            </label>

            {form.logoUrl ? (
              <button
                type="button"
                onClick={() =>
                  updateField(
                    "logoUrl",
                    "",
                  )
                }
                className="mt-3 w-full rounded-xl border border-red-800 px-4 py-3 text-sm text-red-300 transition hover:bg-red-950"
              >
                {labels.deleteLogo}
              </button>
            ) : null}

            <p className="mt-4 text-xs leading-6 text-slate-500">
              {labels.logoHelp}
            </p>
          </aside>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">{labels.documentAssets}</h2>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {([
              ["letterheadUrl", labels.letterhead, 1536 * 1024, "1.5 MB"],
              ["signatureUrl", labels.signature, 500 * 1024, "500 KB"],
              ["stampUrl", labels.stamp, 500 * 1024, "500 KB"],
            ] as const).map(([field, label, maxBytes, limit]) => (
              <div key={field} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <h3 className="font-semibold">{label}</h3>
                <div className="mt-3 flex min-h-36 items-center justify-center rounded-xl border border-dashed border-slate-700 p-3">
                  {form[field] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form[field]} alt={label} className="max-h-28 max-w-full object-contain" />
                  ) : <span className="text-center text-sm text-slate-500">{labels.noAsset}</span>}
                </div>
                <label className="mt-3 block cursor-pointer rounded-xl bg-sky-600 px-3 py-2 text-center text-sm font-semibold hover:bg-sky-500">
                  {labels.chooseAsset}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(event) => handleAsset(event, field, maxBytes)} />
                </label>
                {form[field] ? <button type="button" onClick={() => updateField(field, "")} className="mt-2 w-full rounded-xl border border-red-800 px-3 py-2 text-sm text-red-300 hover:bg-red-950">{labels.removeAsset}</button> : null}
                <p className="mt-3 text-xs leading-5 text-slate-500">PNG / JPG · {limit}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-bold">
              {labels.termsTitle}
            </h2>

            <p className="max-w-4xl text-sm leading-7 text-slate-400">
              {labels.termsDescription}
            </p>
          </div>

          {termsError ? (
            <div className="mt-5 rounded-2xl border border-red-800 bg-red-950/60 px-5 py-4 text-sm text-red-200">
              {termsError}
            </div>
          ) : null}

          {termsMessage ? (
            <div className="mt-5 rounded-2xl border border-emerald-800 bg-emerald-950/60 px-5 py-4 text-sm text-emerald-200">
              {termsMessage}
            </div>
          ) : null}

          <div className="mt-6 grid gap-5 lg:grid-cols-[280px_1fr]">
            <label className="block space-y-2">
              <span className="text-sm text-slate-300">
                {labels.termsScope}
              </span>

              <select
                value={
                  selectedTermsScope
                }
                onChange={(event) => {
                  setSelectedTermsScope(
                    event.target
                      .value as
                      TermsScopeType,
                  );

                  setTermsMessage(null);
                  setTermsError(null);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
              >
                {TERMS_SCOPE_OPTIONS.map(
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

            <label className="block space-y-2">
              <span className="text-sm text-slate-300">
                {labels.termsBody}
              </span>

              {loadingTerms ? (
                <div className="flex min-h-48 items-center rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-500">
                  {labels.termsLoading}
                </div>
              ) : (
                <textarea
                  dir={
                    isArabic
                      ? "rtl"
                      : "ltr"
                  }
                  value={
                    currentTermsValue
                  }
                  onChange={(event) =>
                    updateCurrentTerms(
                      event.target.value,
                    )
                  }
                  rows={9}
                  className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 leading-7 outline-none transition focus:border-sky-500"
                />
              )}
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => {
                void saveCurrentTerms();
              }}
              disabled={
                savingTerms ||
                loadingTerms
              }
              className="rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingTerms
                ? labels.termsSaving
                : labels.termsSave}
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">
            {labels.contact}
          </h2>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                field:
                  "poBox" as const,

                label:
                  labels.poBox,

                placeholder:
                  "12345",
              },
              {
                field:
                  "phone" as const,

                label:
                  labels.phone,

                placeholder:
                  "+965 2222 2222",
              },
              {
                field:
                  "mobile" as const,

                label:
                  labels.mobile,

                placeholder:
                  "+965 9999 9999",
              },
              {
                field:
                  "whatsapp" as const,

                label:
                  labels.whatsapp,

                placeholder:
                  "+965 9999 9999",
              },
            ].map(
              (
                item,
              ) => (
                <label
                  key={
                    item.field
                  }
                  className="space-y-2"
                >
                  <span className="text-sm text-slate-300">
                    {item.label}
                  </span>

                  <input
                    dir="ltr"
                    value={
                      form[
                        item.field
                      ]
                    }
                    onChange={(
                      event,
                    ) =>
                      updateField(
                        item.field,
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none transition focus:border-sky-500"
                    placeholder={
                      item.placeholder
                    }
                  />
                </label>
              ),
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={
              saving
            }
            className="rounded-xl bg-emerald-600 px-8 py-3 font-semibold transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? labels.saving
              : labels.save}
          </button>
        </div>
      </form>
    </main>
  );
}
