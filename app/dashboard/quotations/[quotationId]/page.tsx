"use client";

import Link from "next/link";
import {
  useParams,
} from "next/navigation";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Badge,
  Button,
  Card,
  Input,
  SectionHeader,
} from "../../../../components/ui";
import {
  useLanguage,
} from "../../../../components/i18n/LanguageProvider";

type ScopeType =
  | "SUPPLY_ONLY"
  | "SUPPLY_AND_INSTALLATION"
  | "INSTALLATION_ONLY"
  | "SERVICE"
  | "MAINTENANCE"
  | "CONSULTATION"
  | "CUSTOM";

type Line = {
  id?: string;
  position: number;
  itemName: string;
  itemNameAr?: string | null;
  itemNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  unitName?: string | null;
  unitNameAr?: string | null;
  unitNameEn?: string | null;
  taxAmount: number;
  totalAmount: number;
};

type Quote = {
  id: string;
  quotationNumber: string;
  status: string;
  issueDate: string;
  expiryDate: string | null;
  currencyCode: string;

  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    mobile?: string | null;
    whatsapp?: string | null;
  };

  projectName?: string | null;
  attentionName?: string | null;
  subjectAr?: string | null;
  subjectEn?: string | null;
  briefAr?: string | null;
  briefEn?: string | null;
  scopeType?: ScopeType | null;

  lines: Line[];

  totals: {
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
  };

  notes?: string | null;
  termsAndConditions?: string | null;
  termsAndConditionsAr?: string | null;
  termsAndConditionsEn?: string | null;
  localizationStatus: "PENDING" | "COMPLETED" | "FAILED";
};

type Delivery = {
  id: string;
  channel: "EMAIL" | "WHATSAPP";
  recipient: string;
  status: "PENDING" | "SENT" | "FAILED";
  attemptedAt: string;
};

type DeliveryChannelAvailability = {
  EMAIL: { configured: boolean };
  WHATSAPP: { configured: boolean; locales: { ar: boolean; en: boolean } };
};

const arabicStatuses:
  Record<string, string> = {
    DRAFT: "\u0645\u0633\u0648\u062f\u0629",
    SENT: "\u0645\u0631\u0633\u0644",
    APPROVED: "\u0645\u0639\u062a\u0645\u062f",
    REJECTED: "\u0645\u0631\u0641\u0648\u0636",
    EXPIRED: "\u0645\u0646\u062a\u0647\u064a",
    CANCELLED: "\u0645\u0644\u063a\u0649",
  };

const lifecycleLabels = {
  send: {
    ar: "\u062a\u062d\u062f\u064a\u062f \u0643\u0645\u0631\u0633\u0644",
    en: "Mark as sent",
  },
  approve: {
    ar: "\u0627\u0639\u062a\u0645\u0627\u062f",
    en: "Approve",
  },
  reject: {
    ar: "\u0631\u0641\u0636",
    en: "Reject",
  },
  cancel: {
    ar: "\u0625\u0644\u063a\u0627\u0621",
    en: "Cancel",
  },
} as const;

const deliveryStatusLabels = {
  PENDING: { ar: "\u0642\u064a\u062f \u0627\u0644\u0625\u0631\u0633\u0627\u0644", en: "Pending" },
  SENT: { ar: "\u062a\u0645 \u0627\u0644\u0625\u0631\u0633\u0627\u0644", en: "Sent" },
  FAILED: { ar: "\u062a\u0639\u0630\u0631 \u0627\u0644\u0625\u0631\u0633\u0627\u0644", en: "Failed" },
} as const;

const localizationLabels = {
  PENDING: {
    ar: "\u062c\u0627\u0631\u064d \u062a\u062c\u0647\u064a\u0632 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u062a\u0631\u062c\u0645\u0629",
    en: "Preparing translated version",
  },
  COMPLETED: {
    ar: "\u0627\u0644\u0646\u0633\u062e\u062a\u0627\u0646 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0648\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u062c\u0627\u0647\u0632\u062a\u0627\u0646",
    en: "Arabic and English versions are ready",
  },
  FAILED: {
    ar: "\u062a\u0639\u0630\u0631\u062a \u0627\u0644\u062a\u0631\u062c\u0645\u0629",
    en: "Translation failed",
  },
} as const;

const scopeLabels:
  Record<
    ScopeType,
    {
      ar: string;
      en: string;
    }
  > = {
    SUPPLY_ONLY: {
      ar: "\u062a\u0648\u0631\u064a\u062f \u0641\u0642\u0637",
      en: "Supply only",
    },
    SUPPLY_AND_INSTALLATION: {
      ar: "\u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628",
      en: "Supply and installation",
    },
    INSTALLATION_ONLY: {
      ar: "\u062a\u0631\u0643\u064a\u0628 \u0641\u0642\u0637",
      en: "Installation only",
    },
    SERVICE: {
      ar: "\u062e\u062f\u0645\u0629",
      en: "Service",
    },
    MAINTENANCE: {
      ar: "\u0635\u064a\u0627\u0646\u0629",
      en: "Maintenance",
    },
    CONSULTATION: {
      ar: "\u0627\u0633\u062a\u0634\u0627\u0631\u0629",
      en: "Consultation",
    },
    CUSTOM: {
      ar: "\u0645\u062e\u0635\u0635",
      en: "Custom",
    },
  };

export default function QuotationDetailsPage() {
  const { isArabic } = useLanguage();

  const params =
    useParams<{
      quotationId: string;
    }>();

  const t = (ar: string, en: string) =>
    isArabic ? ar : en;

  const [quote, setQuote] =
    useState<Quote | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [acting, setActing] =
    useState("");

  const [deliveries, setDeliveries] =
    useState<Delivery[]>([]);

  const [deliveryChannels, setDeliveryChannels] =
    useState<DeliveryChannelAvailability>({
      EMAIL: { configured: false },
      WHATSAPP: { configured: false, locales: { ar: false, en: false } },
    });

  const [emailRecipient, setEmailRecipient] =
    useState("");

  const [whatsappRecipient, setWhatsAppRecipient] =
    useState("");

  const [deliveryFeedback, setDeliveryFeedback] =
    useState<{ kind: "success" | "error"; message: string } | null>(null);

  const load = useCallback(
    async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch((() => {
      const url = new URL(
        String("/api/quotations/" +
            encodeURIComponent(
              params.quotationId,
            ),),
        window.location.origin,
      );

      url.searchParams.set(
        "locale",
        isArabic ? "ar" : "en",
      );

      return (
        url.pathname +
        url.search
      );
    })());

        if (response.status === 401) {
          throw new Error(
            t(
              "\u064a\u0644\u0632\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0623\u0648\u0644\u064b\u0627",
              "Please sign in first",
            ),
          );
        }

        if (response.status === 404) {
          throw new Error(
            t(
              "\u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f",
              "Quotation not found",
            ),
          );
        }

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

        setQuote(json.data);
        setEmailRecipient((current) =>
          current || json.data.customer?.email || "",
        );
        setWhatsAppRecipient((current) =>
          current || json.data.customer?.whatsapp ||
            json.data.customer?.mobile || json.data.customer?.phone || "",
        );
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unknown error",
        );
      } finally {
        setLoading(false);
      }
    },
    [
      isArabic,
      params.quotationId,
    ],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadDeliveries = useCallback(async () => {
    try {
      const response = await fetch(
        "/api/quotations/" +
          encodeURIComponent(params.quotationId) +
          "/deliveries",
      );

      if (!response.ok) return;
      const json = await response.json();
      setDeliveries(Array.isArray(json.data) ? json.data : []);
      if (json.meta?.channels) {
        setDeliveryChannels({
          EMAIL: { configured: Boolean(json.meta.channels.EMAIL?.configured) },
          WHATSAPP: {
            configured: Boolean(json.meta.channels.WHATSAPP?.configured),
            locales: {
              ar: Boolean(json.meta.channels.WHATSAPP?.locales?.ar),
              en: Boolean(json.meta.channels.WHATSAPP?.locales?.en),
            },
          },
        });
      }
    } catch {
      // Delivery history and availability are supplementary.
    }
  }, [params.quotationId]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  async function sendEmail() {
    if (!quote || !emailRecipient.trim()) {
      setDeliveryFeedback({
        kind: "error",
        message: t(
          "أدخل البريد الإلكتروني للعميل أولًا",
          "Enter the customer email first",
        ),
      });
      return;
    }

    try {
      setActing("deliver-email");
      setDeliveryFeedback(null);
      const response = await fetch(
        `/api/quotations/${encodeURIComponent(quote.id)}/deliver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "EMAIL",
            recipient: emailRecipient.trim(),
            locale: isArabic ? "ar" : "en",
          }),
        },
      );
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          json?.error?.message ??
            t("تعذر إرسال البريد الإلكتروني", "Email delivery failed"),
        );
      }

      if (json?.data?.status === "SENT") {
        setDeliveryFeedback({
          kind: "success",
          message: t(
            "تم إرسال البريد الإلكتروني",
            "Email sent",
          ),
        });
      } else {
        setDeliveryFeedback({
          kind: "error",
          message:
            json?.data?.errorMessage ??
            t("تعذر إرسال البريد الإلكتروني", "Email delivery failed"),
        });
      }

      await loadDeliveries();
    } catch (caught) {
      setDeliveryFeedback({
        kind: "error",
        message: caught instanceof Error
          ? caught.message
          : t("تعذر إرسال البريد الإلكتروني", "Email delivery failed"),
      });
    } finally {
      setActing("");
    }
  }

  async function sendWhatsApp() {
    if (!quote || !whatsappRecipient.trim()) {
      setDeliveryFeedback({
        kind: "error",
        message: t("أدخل رقم واتساب العميل أولًا", "Enter the customer WhatsApp number first"),
      });
      return;
    }

    try {
      setActing("deliver-whatsapp");
      setDeliveryFeedback(null);
      const response = await fetch(
        `/api/quotations/${encodeURIComponent(quote.id)}/deliver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "WHATSAPP",
            recipient: whatsappRecipient.trim(),
            locale: isArabic ? "ar" : "en",
          }),
        },
      );
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(json?.error?.message ?? t("تعذر الإرسال عبر واتساب", "WhatsApp delivery failed"));
      }
      setDeliveryFeedback(json?.data?.status === "SENT"
        ? { kind: "success", message: t("تم الإرسال عبر واتساب", "WhatsApp sent") }
        : {
          kind: "error",
          message: json?.data?.errorMessage ?? t("تعذر الإرسال عبر واتساب", "WhatsApp delivery failed"),
        });
      await loadDeliveries();
    } catch (caught) {
      setDeliveryFeedback({
        kind: "error",
        message: caught instanceof Error
          ? caught.message
          : t("تعذر الإرسال عبر واتساب", "WhatsApp delivery failed"),
      });
    } finally {
      setActing("");
    }
  }

  async function action(
    name: string,
  ) {
    if (
      !quote ||
      !window.confirm(
        t(
          "\u0647\u0644 \u062a\u0631\u064a\u062f \u062a\u0646\u0641\u064a\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062c\u0631\u0627\u0621\u061f",
          "Do you want to continue?",
        ),
      )
    ) {
      return;
    }

    try {
      setActing(name);
      setError("");

      const response = await fetch(
        "/api/quotations/" +
          quote.id +
          "/" +
          name,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const json =
          await response
            .json()
            .catch(() => null);

        throw new Error(
          json?.error?.message ??
            "Action failed",
        );
      }

      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Action failed",
      );
    } finally {
      setActing("");
    }
  }

  const money = (amount: number) =>
    new Intl.NumberFormat(
      isArabic ? "ar-KW" : "en-US",
      {
        style: "currency",
        currency:
          quote?.currencyCode ??
          "KWD",
      },
    ).format(amount);

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
          href="/dashboard/quotations"
          className="mt-4 inline-block text-sky-300"
        >
          {t(
            "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0644\u0639\u0631\u0648\u0636",
            "Back to quotations",
          )}
        </Link>
      </Card>
    );
  }

  if (!quote) {
    return null;
  }

  const actions =
    quote.status === "DRAFT"
      ? ["send", "cancel"]
      : quote.status === "SENT"
        ? [
            "approve",
            "reject",
            "cancel",
          ]
        : quote.status === "APPROVED"
          ? ["cancel"]
          : [];

  const hasProposal =
    quote.projectName ||
    quote.attentionName ||
    quote.subjectAr ||
    quote.subjectEn ||
    quote.briefAr ||
    quote.briefEn ||
    quote.scopeType;

  return (
    <section
      className="space-y-6"
      dir={isArabic ? "rtl" : "ltr"}
    >
      <Link
        href="/dashboard/quotations"
        className="text-sm text-sky-300"
      >
        {t(
          "\u0627\u0644\u0639\u0648\u062f\u0629 \u0644\u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631",
          "Back to quotations",
        )}
      </Link>

      <SectionHeader
        eyebrow={t(
          "\u062a\u0641\u0627\u0635\u064a\u0644 \u0627\u0644\u0639\u0631\u0636",
          "Proposal details",
        )}
        title={
          isArabic
            ? quote.subjectAr || quote.quotationNumber
            : quote.subjectEn || quote.quotationNumber
        }
        description={
          quote.projectName ||
          quote.customer.name
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={
                "/api/quotations/" +
                encodeURIComponent(
                  quote.id,
                ) +
                "/pdf?locale=" +
                (isArabic
                  ? "ar"
                  : "en") +
                "&disposition=inline"
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                size="sm"
                variant="secondary"
              >
                {t(
                  "\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0639\u0631\u0636",
                  "Preview proposal",
                )}
              </Button>
            </a>

            <a
              href={
                "/api/quotations/" +
                encodeURIComponent(
                  quote.id,
                ) +
                "/pdf?locale=" +
                (isArabic
                  ? "ar"
                  : "en")
              }
            >
              <Button
                size="sm"
                variant="secondary"
              >
                {t(
                  "\u062a\u0646\u0632\u064a\u0644 PDF",
                  "Download PDF",
                )}
              </Button>
            </a>

            {quote.status ===
              "DRAFT" && (
              <Link
                href={
                  "/dashboard/quotations/" +
                  quote.id +
                  "/edit"
                }
              >
                <Button
                  size="sm"
                  variant="secondary"
                >
                  {t(
                    "\u062a\u0639\u062f\u064a\u0644",
                    "Edit",
                  )}
                </Button>
              </Link>
            )}

            <Badge>
              {isArabic
                ? arabicStatuses[
                    quote.status
                  ] ??
                  quote.status
                : quote.status}
            </Badge>

            {actions.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={
                  name === "approve"
                    ? "success"
                    : name ===
                          "reject" ||
                        name ===
                          "cancel"
                      ? "danger"
                      : "primary"
                }
                disabled={
                  Boolean(acting) ||
                  (name === "approve" && quote.localizationStatus !== "COMPLETED")
                }
                onClick={() =>
                  action(name)
                }
              >
                {acting === name
                  ? "..."
                  : lifecycleLabels[
                      name as keyof typeof lifecycleLabels
                    ][isArabic ? "ar" : "en"]}
              </Button>
            ))}
          </div>
        }
      />

      {error && (
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="text-red-300">
            {error}
          </p>
        </Card>
      )}

      <div
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
        data-testid="localization-status"
      >
        <Badge>
          {quote.localizationStatus}
        </Badge>

        <span className="text-slate-300">
          {
            localizationLabels[
              quote.localizationStatus
            ][isArabic ? "ar" : "en"]
          }
        </span>
      </div>

      {quote.status === "SENT" && quote.localizationStatus !== "COMPLETED" && (
        <Card className="border-amber-400/20 bg-amber-400/5">
          <p className="text-amber-200">
            {quote.localizationStatus === "FAILED"
              ? t(
                  "تعذرت ترجمة عرض السعر. يجب إعادة المحاولة وإكمال الترجمة قبل الاعتماد.",
                  "Quotation localization failed. Retry and complete localization before approval.",
                )
              : t(
                  "لا تزال ترجمة عرض السعر قيد المعالجة. سيتاح الاعتماد بعد اكتمالها.",
                  "Quotation localization is still processing. Approval will be available when it is complete.",
                )}
          </p>
        </Card>
      )}

      {hasProposal && (
        <Card className="overflow-hidden border-sky-400/20 bg-gradient-to-br from-sky-400/10 via-white/[0.03] to-emerald-400/5">
          <div className="border-b border-white/10 pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-300">
              {t(
                "\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0641\u0646\u064a \u0648\u0627\u0644\u062a\u062c\u0627\u0631\u064a",
                "Technical and Commercial Proposal",
              )}
            </p>

            <h2 className="mt-3 text-2xl font-semibold">
              {isArabic
                ? quote.subjectAr || quote.quotationNumber
                : quote.subjectEn || quote.quotationNumber}
            </h2>

            <p className="mt-2 text-slate-400">
              {quote.projectName ||
                quote.customer.name}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">
                {t(
                  "\u0627\u0644\u0639\u0645\u064a\u0644",
                  "Customer",
                )}
              </p>

              <p className="mt-2 font-medium">
                {quote.customer.name}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                {t(
                  "\u0639\u0646\u0627\u064a\u0629",
                  "Attention",
                )}
              </p>

              <p className="mt-2 font-medium">
                {quote.attentionName ||
                  "-"}
              </p>
            </div>

            <div>
              <p className="text-sm text-slate-500">
                {t(
                  "\u0646\u0637\u0627\u0642 \u0627\u0644\u0639\u0645\u0644",
                  "Scope",
                )}
              </p>

              <p className="mt-2 font-medium">
                {quote.scopeType
                  ? isArabic
                    ? scopeLabels[
                        quote.scopeType
                      ].ar
                    : scopeLabels[
                        quote.scopeType
                      ].en
                  : "-"}
              </p>
            </div>
          </div>

          {(isArabic ? quote.briefAr : quote.briefEn) && (
            <div
              className="mt-6 border-t border-white/10 pt-5"
              dir={isArabic ? "rtl" : "ltr"}
            >
              <p className="text-sm text-slate-500">
                {t(
                  "\u0645\u0644\u062e\u0635 \u0627\u0644\u0639\u0631\u0636",
                  "Proposal brief",
                )}
              </p>

              <p className="mt-2 whitespace-pre-wrap leading-7">
                {isArabic ? quote.briefAr : quote.briefEn}
              </p>
            </div>
          )}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">
            {t(
              "\u0627\u0644\u0639\u0645\u064a\u0644",
              "Customer",
            )}
          </p>

          <p className="mt-3 font-semibold">
            {quote.customer.name}
          </p>

          <p className="mt-1 text-sm text-slate-400">
            {quote.customer.email ||
              quote.customer.phone ||
              "-"}
          </p>
        </Card>

        {quote.expiryDate && (
          <Card>
            <p className="text-sm text-slate-500">
              {t(
                "\u0635\u0627\u0644\u062d \u062d\u062a\u0649",
                "Valid until",
              )}
            </p>

            <p className="mt-3 font-semibold">
              {new Date(
                quote.expiryDate,
              ).toLocaleDateString(
                isArabic
                  ? "ar-KW"
                  : "en-GB",
              )}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-sm text-slate-500">
            {t(
              "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0625\u0635\u062f\u0627\u0631",
              "Issue date",
            )}
          </p>

          <p className="mt-3 font-semibold">
            {new Date(
              quote.issueDate,
            ).toLocaleDateString(
              isArabic
                ? "ar-KW"
                : "en-GB",
            )}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">
            {t(
              "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a",
              "Total",
            )}
          </p>

          <p className="mt-3 text-2xl font-semibold text-emerald-300">
            {money(
              quote.totals
                .totalAmount,
            )}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold">
              {t(
                "\u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0644\u0644\u0639\u0645\u064a\u0644",
                "Delivery",
              )}
            </h3>

            <p className={`mt-1 text-sm ${
              deliveryChannels.EMAIL.configured
                ? "text-emerald-300"
                : "text-amber-300"
            }`}>
              {isArabic
                ? deliveryChannels.EMAIL.configured
                  ? "البريد الإلكتروني متاح"
                  : "مزود البريد الإلكتروني غير مهيأ"
                : deliveryChannels.EMAIL.configured
                  ? "Email delivery available"
                  : "Email provider not configured"}
            </p>
            <p className={`mt-1 text-sm ${
              deliveryChannels.WHATSAPP.configured
                ? "text-emerald-300"
                : "text-amber-300"
            }`}>
              {t(
                deliveryChannels.WHATSAPP.configured
                  ? "واتساب متاح"
                  : "مزود واتساب غير مهيأ",
                deliveryChannels.WHATSAPP.configured
                  ? "WhatsApp delivery available"
                  : "WhatsApp provider not configured",
              )}
            </p>
            {deliveryChannels.WHATSAPP.configured &&
              !deliveryChannels.WHATSAPP.locales[isArabic ? "ar" : "en"] && (
              <p className="mt-1 text-sm text-amber-300">
                {t(
                  "قالب واتساب العربي غير مهيأ",
                  "WhatsApp template is not configured for English",
                )}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !deliveryChannels.EMAIL.configured ||
                !emailRecipient.trim() ||
                Boolean(acting)
              }
              onClick={() => void sendEmail()}
            >
              {acting === "deliver-email"
                ? t("جاري الإرسال...", "Sending...")
                : t("إرسال بالبريد الإلكتروني", "Send by email")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !deliveryChannels.WHATSAPP.configured ||
                !deliveryChannels.WHATSAPP.locales[isArabic ? "ar" : "en"] ||
                !whatsappRecipient.trim() ||
                Boolean(acting)
              }
              onClick={() => void sendWhatsApp()}
            >
              {acting === "deliver-whatsapp"
                ? t("جاري الإرسال...", "Sending...")
                : t("إرسال عبر واتساب", "Send by WhatsApp")}
            </Button>
          </div>
        </div>

        {deliveryChannels.EMAIL.configured && (
          <div className="mt-4 max-w-md">
            <Input
              type="email"
              value={emailRecipient}
              onChange={(event) => setEmailRecipient(event.target.value)}
              placeholder={t("البريد الإلكتروني للعميل", "Customer email")}
              aria-label={t("البريد الإلكتروني للعميل", "Customer email")}
            />
            {!emailRecipient.trim() && (
              <p className="mt-2 text-sm text-amber-300">
                {t(
                  "لا يوجد بريد إلكتروني للعميل. أدخله لإرسال العرض.",
                  "Customer email is missing. Enter one to send the proposal.",
                )}
              </p>
            )}
          </div>
        )}

        {deliveryChannels.WHATSAPP.configured && (
          <div className="mt-4 max-w-md">
            <Input
              type="tel"
              value={whatsappRecipient}
              onChange={(event) => setWhatsAppRecipient(event.target.value)}
              placeholder={t("رقم واتساب بصيغة دولية", "WhatsApp number in international format")}
              aria-label={t("رقم واتساب للعميل", "Customer WhatsApp number")}
            />
            {!whatsappRecipient.trim() && (
              <p className="mt-2 text-sm text-amber-300">
                {t(
                  "رقم واتساب العميل مفقود. أدخله بصيغة دولية لإرسال العرض.",
                  "Customer WhatsApp number is missing. Enter it in international format to send the proposal.",
                )}
              </p>
            )}
          </div>
        )}

        {deliveryFeedback && (
          <p className={`mt-4 text-sm ${
            deliveryFeedback.kind === "success"
              ? "text-emerald-300"
              : "text-red-300"
          }`}>
            {deliveryFeedback.message}
          </p>
        )}

        {deliveries.length > 0 && (
          <div className="mt-5 divide-y divide-white/5 border-t border-white/10">
            {deliveries.map((delivery) => (
              <div
                key={delivery.id}
                className="grid gap-2 py-3 text-sm md:grid-cols-[110px_1fr_100px_180px]"
              >
                <span>{delivery.channel === "EMAIL" ? "Email" : "WhatsApp"}</span>
                <span className="text-slate-300">{delivery.recipient}</span>
                <Badge>
                  {deliveryStatusLabels[delivery.status][isArabic ? "ar" : "en"]}
                </Badge>
                <span className="text-slate-500">
                  {new Date(delivery.attemptedAt).toLocaleString(
                    isArabic ? "ar-KW" : "en-GB",
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="border-b border-white/10 px-6 py-4 font-semibold">
          {t(
            "\u0628\u0646\u0648\u062f \u0627\u0644\u0639\u0631\u0636",
            "Quotation lines",
          )}
        </div>

        <div className="divide-y divide-white/5">
          {quote.lines.map((line) => (
            <div
              key={
                line.id ??
                line.position
              }
              className="grid grid-cols-[1fr_auto] gap-4 px-6 py-4"
            >
              <div>
                <p className="font-medium">
                  {(isArabic ? (line.itemNameAr ?? line.itemName) : (line.itemNameEn ?? line.itemName))}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {line.quantity}{" "}
                  {(isArabic ? (line.unitNameAr ?? line.unitName) : (line.unitNameEn ?? line.unitName)) || ""} x{" "}
                  {money(
                    line.unitPrice,
                  )}
                </p>
              </div>

              <p className="font-semibold">
                {money(
                  line.totalAmount,
                )}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="ms-auto max-w-md space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-500">
              {t(
                "\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a",
                "Subtotal",
              )}
            </span>

            <span>
              {money(
                quote.totals.subtotal,
              )}
            </span>
          </div>

          {quote.totals
            .discountAmount > 0 && (
            <div className="flex justify-between text-amber-300">
              <span>
                {t(
                  "\u0627\u0644\u062e\u0635\u0645",
                  "Discount",
                )}
              </span>

              <span>
                -{" "}
                {money(
                  quote.totals
                    .discountAmount,
                )}
              </span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-slate-500">
              {t(
                "\u0627\u0644\u0636\u0631\u064a\u0628\u0629",
                "Tax",
              )}
            </span>

            <span>
              {money(
                quote.totals
                  .taxAmount,
              )}
            </span>
          </div>

          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold">
            <span>
              {t(
                "\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a",
                "Total",
              )}
            </span>

            <span className="text-emerald-300">
              {money(
                quote.totals
                  .totalAmount,
              )}
            </span>
          </div>
        </div>
      </Card>

      {quote.notes && (
        <Card>
          <p className="text-sm text-slate-500">
            {t(
              "\u0645\u0644\u0627\u062d\u0638\u0627\u062a",
              "Notes",
            )}
          </p>

          <p className="mt-3 whitespace-pre-wrap">
            {quote.notes}
          </p>
        </Card>
      )}

      {(isArabic ? quote.termsAndConditionsAr : quote.termsAndConditionsEn) && (
        <Card>
          <p className="text-sm text-slate-500">
            {t(
              "\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645",
              "Terms and conditions",
            )}
          </p>

          <p className="mt-3 whitespace-pre-wrap">
            {
              isArabic
                ? quote.termsAndConditionsAr
                : quote.termsAndConditionsEn
            }
          </p>
        </Card>
      )}
    </section>
  );
}
