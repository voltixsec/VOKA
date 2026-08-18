"use client";

import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
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
  description?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
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
  customerId: string;
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
  customerProfile: { id: string; email: string | null; whatsapp: string | null } | null;
  deliveryContacts: {
    email: { value: string | null; source: "CUSTOMER" | "SNAPSHOT" | "MISSING"; differsFromSnapshot: boolean };
    whatsapp: { value: string | null; source: "CUSTOMER" | "SNAPSHOT" | "MISSING"; differsFromSnapshot: boolean };
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
  errorMessage?: string | null;
  attemptedAt: string;
};

type DeliveryAttemptClientResult = {
  channel: "EMAIL" | "WHATSAPP";
  sent: boolean;
  errorMessage?: string;
};

type DeliveryChannelAvailability = {
  EMAIL: {
    configured: boolean;
    provider?: "RESEND" | null;
    requirements?: {
      providerSelected: boolean;
      apiKeyConfigured: boolean;
      senderConfigured: boolean;
    };
  };
  WHATSAPP: {
    configured: boolean;
    provider?: "META" | null;
    requirements?: {
      providerSelected: boolean;
      accessTokenConfigured: boolean;
      phoneNumberIdConfigured: boolean;
      graphApiVersionConfigured: boolean;
    };
    locales: { ar: boolean; en: boolean };
  };
};

const arabicStatuses: Record<string, string> = {
  DRAFT: "مسودة",
  SENT: "مرسل",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  EXPIRED: "منتهي",
  CANCELLED: "ملغى",
};

const lifecycleLabels = {
  send: {
    ar: "تحديد كمرسل",
    en: "Mark as sent",
  },
  approve: {
    ar: "اعتماد",
    en: "Approve",
  },
  reject: {
    ar: "رفض",
    en: "Reject",
  },
  cancel: {
    ar: "إلغاء",
    en: "Cancel",
  },
} as const;

const deliveryStatusLabels = {
  PENDING: { ar: "قيد الإرسال", en: "Pending" },
  SENT: { ar: "تم الإرسال", en: "Sent" },
  FAILED: { ar: "تعذر الإرسال", en: "Failed" },
} as const;

const localizationLabels = {
  PENDING: {
    ar: "جارٍ تجهيز النسخة المترجمة",
    en: "Preparing translated version",
  },
  COMPLETED: {
    ar: "النسختان العربية والإنجليزية جاهزتان",
    en: "Arabic and English versions are ready",
  },
  FAILED: {
    ar: "تعذرت الترجمة",
    en: "Translation failed",
  },
} as const;

const scopeLabels: Record<
  ScopeType,
  {
    ar: string;
    en: string;
  }
> = {
  SUPPLY_ONLY: {
    ar: "توريد فقط",
    en: "Supply only",
  },
  SUPPLY_AND_INSTALLATION: {
    ar: "توريد وتركيب",
    en: "Supply and installation",
  },
  INSTALLATION_ONLY: {
    ar: "تركيب فقط",
    en: "Installation only",
  },
  SERVICE: {
    ar: "خدمة",
    en: "Service",
  },
  MAINTENANCE: {
    ar: "صيانة",
    en: "Maintenance",
  },
  CONSULTATION: {
    ar: "استشارة",
    en: "Consultation",
  },
  CUSTOM: {
    ar: "مخصص",
    en: "Custom",
  },
};

export default function QuotationDetailsPage() {
  const { isArabic } = useLanguage();
  const router = useRouter();

  const params = useParams<{ quotationId: string }>();

  const t = (ar: string, en: string) => (isArabic ? ar : en);

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState("");
  const conversionInFlight = useRef(false);

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);

  const [deliveryChannels, setDeliveryChannels] =
    useState<DeliveryChannelAvailability>({
      EMAIL: { configured: false },
      WHATSAPP: { configured: false, locales: { ar: false, en: false } },
    });

  const [emailRecipient, setEmailRecipient] = useState("");
  const [whatsappRecipient, setWhatsAppRecipient] = useState("");
  const [updateCustomerEmail, setUpdateCustomerEmail] = useState(false);
  const [updateCustomerWhatsApp, setUpdateCustomerWhatsApp] = useState(false);

  const [deliveryFeedback, setDeliveryFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        (() => {
          const url = new URL(
            String(
              "/api/quotations/" +
                encodeURIComponent(params.quotationId),
            ),
            window.location.origin,
          );

          url.searchParams.set("locale", isArabic ? "ar" : "en");

          return url.pathname + url.search;
        })(),
      );

      if (response.status === 401) {
        throw new Error(
          t("يلزم تسجيل الدخول أولًا", "Please sign in first"),
        );
      }

      if (response.status === 404) {
        throw new Error(
          t("عرض السعر غير موجود", "Quotation not found"),
        );
      }

      if (!response.ok) {
        throw new Error(
          t("تعذر تحميل العرض", "Unable to load quotation"),
        );
      }

      const json = await response.json();

      const deliveryContacts = json.data.deliveryContacts ?? {
        email: {
          value: json.data.customer?.email ?? null,
          source: json.data.customer?.email ? "SNAPSHOT" : "MISSING",
          differsFromSnapshot: false,
        },
        whatsapp: {
          value: json.data.customer?.phone ?? null,
          source: json.data.customer?.phone ? "SNAPSHOT" : "MISSING",
          differsFromSnapshot: false,
        },
      };
      setQuote({
        ...json.data,
        customerProfile: json.data.customerProfile ?? null,
        deliveryContacts,
      });
      setEmailRecipient((current) => current || deliveryContacts.email.value || "");
      setWhatsAppRecipient((current) => current || deliveryContacts.whatsapp.value || "");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unknown error",
      );
    } finally {
      setLoading(false);
    }
  }, [isArabic, params.quotationId]);

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
          EMAIL: {
            configured: Boolean(json.meta.channels.EMAIL?.configured),
            provider: json.meta.channels.EMAIL?.provider ?? null,
            requirements: json.meta.channels.EMAIL?.requirements,
          },
          WHATSAPP: {
            configured: Boolean(json.meta.channels.WHATSAPP?.configured),
            provider: json.meta.channels.WHATSAPP?.provider ?? null,
            requirements: json.meta.channels.WHATSAPP?.requirements,
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

  const activeLocale = isArabic ? "ar" : "en";
  const emailReady = deliveryChannels.EMAIL.configured;
  const whatsappBaseReady = deliveryChannels.WHATSAPP.configured;
  const whatsappLocaleReady = deliveryChannels.WHATSAPP.locales[activeLocale];
  const whatsappReady = whatsappBaseReady && whatsappLocaleReady;

  const emailHasRecipient = Boolean(emailRecipient.trim());
  const whatsappHasRecipient = Boolean(whatsappRecipient.trim());

  const canSendEmail = emailReady && emailHasRecipient;
  const canSendWhatsApp = whatsappReady && whatsappHasRecipient;
  const canSendBoth = canSendEmail && canSendWhatsApp;

  // Disabled explanations
  const getEmailDisabledReason = () => {
    if (!emailReady) {
      return t(
        "مزود البريد الإلكتروني غير مهيأ على الخادم",
        "Email provider not configured",
      );
    }
    if (!emailHasRecipient) {
      return t(
        "البريد الإلكتروني للعميل مفقود. أدخله لإرسال العرض.",
        "Customer email is missing. Enter one to send the proposal.",
      );
    }
    return null;
  };

  const getWhatsAppDisabledReason = () => {
    if (!whatsappBaseReady) {
      return t(
        "مزود واتساب غير مهيأ على الخادم",
        "WhatsApp provider not configured",
      );
    }
    if (!whatsappLocaleReady) {
      return isArabic
        ? "قالب واتساب العربي غير مهيأ"
        : "WhatsApp template is not configured for English";
    }
    if (!whatsappHasRecipient) {
      return t(
        "رقم واتساب العميل مفقود. أدخله بصيغة دولية لإرسال العرض.",
        "Customer WhatsApp number is missing. Enter it in international format to send the proposal.",
      );
    }
    return null;
  };

  function channelFailure(channel: "EMAIL" | "WHATSAPP") {
    return channel === "EMAIL"
      ? t("تعذر إرسال البريد الإلكتروني", "Email delivery failed")
      : t("تعذر الإرسال عبر واتساب", "WhatsApp delivery failed");
  }

  async function deliverChannel(
    channel: "EMAIL" | "WHATSAPP",
    recipient: string,
    updateCustomerContact = false,
  ): Promise<DeliveryAttemptClientResult> {
    if (!quote) return { channel, sent: false, errorMessage: channelFailure(channel) };

    try {
      const response = await fetch(
        `/api/quotations/${encodeURIComponent(quote.id)}/deliver`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            recipient: recipient.trim(),
            locale: activeLocale,
            ...(updateCustomerContact ? { updateCustomerContact: true } : {}),
          }),
        },
      );
      const json = await response.json().catch(() => null);
      if (!response.ok || json?.data?.status !== "SENT") {
        return {
          channel,
          sent: false,
          errorMessage:
            json?.data?.errorMessage ??
            json?.error?.message ??
            channelFailure(channel),
        };
      }
      return { channel, sent: true };
    } catch {
      return { channel, sent: false, errorMessage: channelFailure(channel) };
    }
  }

  async function sendEmail() {
    if (!canSendEmail) return;

    setActing("deliver-email");
    setDeliveryFeedback(null);
    const result = await deliverChannel("EMAIL", emailRecipient, updateCustomerEmail);
    setUpdateCustomerEmail(false);
    setDeliveryFeedback(
      result.sent
        ? { kind: "success", message: t("تم إرسال البريد الإلكتروني", "Email sent") }
        : {
            kind: "error",
            message: result.errorMessage ?? channelFailure("EMAIL"),
          },
    );
    await loadDeliveries();
    setActing("");
  }

  async function sendWhatsApp() {
    if (!canSendWhatsApp) return;

    setActing("deliver-whatsapp");
    setDeliveryFeedback(null);
    const result = await deliverChannel("WHATSAPP", whatsappRecipient, updateCustomerWhatsApp);
    setUpdateCustomerWhatsApp(false);
    setDeliveryFeedback(
      result.sent
        ? { kind: "success", message: t("تم الإرسال عبر واتساب", "WhatsApp sent") }
        : {
            kind: "error",
            message: result.errorMessage ?? channelFailure("WHATSAPP"),
          },
    );
    await loadDeliveries();
    setActing("");
  }

  async function sendBoth() {
    if (!canSendBoth) return;
    setActing("deliver-both");
    setDeliveryFeedback(null);
    const settled = await Promise.allSettled([
      deliverChannel("EMAIL", emailRecipient, updateCustomerEmail),
      deliverChannel("WHATSAPP", whatsappRecipient, updateCustomerWhatsApp),
    ]);
    setUpdateCustomerEmail(false);
    setUpdateCustomerWhatsApp(false);
    const emailSent = settled[0].status === "fulfilled" && settled[0].value.sent;
    const whatsappSent = settled[1].status === "fulfilled" && settled[1].value.sent;

    if (emailSent && whatsappSent) {
      setDeliveryFeedback({
        kind: "success",
        message: t(
          "تم إرسال العرض بالبريد الإلكتروني وواتساب",
          "Quotation sent by email and WhatsApp",
        ),
      });
    } else if (emailSent) {
      setDeliveryFeedback({
        kind: "error",
        message: t(
          "تم الإرسال بالبريد الإلكتروني، وتعذر الإرسال عبر واتساب",
          "Email sent; WhatsApp delivery failed",
        ),
      });
    } else if (whatsappSent) {
      setDeliveryFeedback({
        kind: "error",
        message: t(
          "تم الإرسال عبر واتساب، وتعذر إرسال البريد الإلكتروني",
          "WhatsApp sent; email delivery failed",
        ),
      });
    } else {
      setDeliveryFeedback({
        kind: "error",
        message: t(
          "تعذر إرسال العرض بالبريد الإلكتروني وواتساب",
          "Email and WhatsApp delivery failed",
        ),
      });
    }
    await loadDeliveries();
    setActing("");
  }

  function retryAvailable(delivery: Delivery) {
    return delivery.channel === "EMAIL" ? emailReady : whatsappReady;
  }

  function retryDisabledReason(delivery: Delivery) {
    if (delivery.channel === "EMAIL") {
      if (!emailReady) {
        return t("إعدادات البريد غير متاحة للإعادة", "Email setup unavailable for retry");
      }
    } else {
      if (!whatsappBaseReady) {
        return t("إعدادات واتساب غير متاحة للإعادة", "WhatsApp setup unavailable for retry");
      }
      if (!whatsappLocaleReady) {
        return t("قالب واتساب للغة الحالية غير متاح", "WhatsApp template for current language unavailable");
      }
    }
    return null;
  }

  async function retryDelivery(delivery: Delivery) {
    if (!retryAvailable(delivery)) return;
    setActing(`retry-${delivery.id}`);
    setDeliveryFeedback(null);
    const result = await deliverChannel(delivery.channel, delivery.recipient, false);
    setDeliveryFeedback(
      result.sent
        ? {
            kind: "success",
            message:
              delivery.channel === "EMAIL"
                ? t("تمت إعادة إرسال البريد الإلكتروني", "Email resent")
                : t("تمت إعادة الإرسال عبر واتساب", "WhatsApp resent"),
          }
        : {
            kind: "error",
            message: result.errorMessage ?? channelFailure(delivery.channel),
          },
    );
    await loadDeliveries();
    setActing("");
  }

  async function action(name: string) {
    if (
      !quote ||
      !window.confirm(
        t("هل تريد تنفيذ هذا الإجراء؟", "Do you want to continue?"),
      )
    ) {
      return;
    }

    try {
      setActing(name);
      setError("");

      const response = await fetch(
        "/api/quotations/" + quote.id + "/" + name,
        { method: "POST" },
      );

      if (!response.ok) {
        const json = await response.json().catch(() => null);

        throw new Error(json?.error?.message ?? "Action failed");
      }

      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action failed");
    } finally {
      setActing("");
    }
  }

  async function createSalesOrder() {
    if (!quote || conversionInFlight.current) return;

    conversionInFlight.current = true;
    try {
      setActing("convert-to-sales-order");
      setError("");
      const response = await fetch(
        `/api/quotations/${encodeURIComponent(quote.id)}/convert-to-sales-order`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data?.salesOrderId) {
        const code = body?.error?.code;
        throw new Error(
          code === "QUOTATION_NOT_APPROVED"
            ? t(
                "يجب اعتماد عرض السعر قبل إنشاء أمر البيع.",
                "The quotation must be approved before creating a Sales Order.",
              )
            : t(
                "تعذر إنشاء أمر البيع. يرجى المحاولة مرة أخرى.",
                "Could not create the Sales Order. Please try again.",
              ),
        );
      }
      router.push(
        `/dashboard/sales-orders/${encodeURIComponent(body.data.salesOrderId)}`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("تعذر إنشاء أمر البيع.", "Could not create the Sales Order."),
      );
    } finally {
      conversionInFlight.current = false;
      setActing("");
    }
  }

  const money = (amount: number) =>
    new Intl.NumberFormat(isArabic ? "ar-KW" : "en-US", {
      style: "currency",
      currency: quote?.currencyCode ?? "KWD",
    }).format(amount);

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
        <p className="text-red-300">{error}</p>

        <Link
          href="/dashboard/quotations"
          className="mt-4 inline-block text-sky-300"
        >
          {t("العودة للعروض", "Back to quotations")}
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
        ? ["approve", "reject", "cancel"]
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
    <section className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <Link href="/dashboard/quotations" className="text-sm text-sky-300">
        {t("العودة لعارضات الأسعار", "Back to quotations")}
      </Link>

      <SectionHeader
        eyebrow={t("تفاصيل العرض", "Proposal details")}
        title={
          isArabic
            ? quote.subjectAr || quote.quotationNumber
            : quote.subjectEn || quote.quotationNumber
        }
        description={quote.projectName || quote.customer.name}
        actions={
          <div className="flex flex-wrap gap-2">
            <a
              href={
                "/api/quotations/" +
                encodeURIComponent(quote.id) +
                "/pdf?locale=" +
                (isArabic ? "ar" : "en") +
                "&disposition=inline"
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" variant="secondary">
                {t("معاينة العرض", "Preview proposal")}
              </Button>
            </a>

            <a
              href={
                "/api/quotations/" +
                encodeURIComponent(quote.id) +
                "/pdf?locale=" +
                (isArabic ? "ar" : "en")
              }
            >
              <Button size="sm" variant="secondary">
                {t("تنزيل PDF", "Download PDF")}
              </Button>
            </a>

            {quote.status === "DRAFT" && (
              <Link href={"/dashboard/quotations/" + quote.id + "/edit"}>
                <Button size="sm" variant="secondary">
                  {t("تعديل", "Edit")}
                </Button>
              </Link>
            )}

            <Badge>
              {isArabic ? arabicStatuses[quote.status] ?? quote.status : quote.status}
            </Badge>

            {quote.status === "APPROVED" && (
              <Button
                size="sm"
                variant="success"
                disabled={Boolean(acting)}
                aria-label={t("إنشاء أمر بيع", "Create Sales Order")}
                onClick={() => void createSalesOrder()}
              >
                {acting === "convert-to-sales-order"
                  ? t("جارٍ الإنشاء...", "Creating...")
                  : t("إنشاء أمر بيع", "Create Sales Order")}
              </Button>
            )}

            {actions.map((name) => (
              <Button
                key={name}
                size="sm"
                variant={
                  name === "approve"
                    ? "success"
                    : name === "reject" || name === "cancel"
                      ? "danger"
                      : "primary"
                }
                disabled={
                  Boolean(acting) ||
                  (name === "approve" && quote.localizationStatus !== "COMPLETED")
                }
                onClick={() => action(name)}
              >
                {acting === name
                  ? "..."
                  : lifecycleLabels[name as keyof typeof lifecycleLabels][
                      isArabic ? "ar" : "en"
                    ]}
              </Button>
            ))}
          </div>
        }
      />

      {quote.status === "APPROVED" && (
        <p
          className="rounded-xl border border-sky-400/15 bg-sky-400/5 px-4 py-3 text-sm text-sky-200"
          data-testid="branding-snapshot-lock"
        >
          {t(
            "هوية المستند مقفلة على لقطة الاعتماد.",
            "Document branding is locked to the approval snapshot.",
          )}
        </p>
      )}

      {error && (
        <Card className="border-red-400/20 bg-red-400/5">
          <p className="text-red-300">{error}</p>
        </Card>
      )}

      <div
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm"
        data-testid="localization-status"
      >
        <Badge>{quote.localizationStatus}</Badge>

        <span className="text-slate-300">
          {localizationLabels[quote.localizationStatus][isArabic ? "ar" : "en"]}
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
                "العرض الفني والتجاري",
                "Technical and Commercial Proposal",
              )}
            </p>

            <h2 className="mt-3 text-2xl font-semibold">
              {isArabic
                ? quote.subjectAr || quote.quotationNumber
                : quote.subjectEn || quote.quotationNumber}
            </h2>

            <p className="mt-2 text-slate-400">
              {quote.projectName || quote.customer.name}
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-slate-500">{t("العميل", "Customer")}</p>
              <p className="mt-2 font-medium">{quote.customer.name}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">{t("عناية", "Attention")}</p>
              <p className="mt-2 font-medium">{quote.attentionName || "-"}</p>
            </div>

            <div>
              <p className="text-sm text-slate-500">{t("نطاق العمل", "Scope")}</p>
              <p className="mt-2 font-medium">
                {quote.scopeType
                  ? isArabic
                    ? scopeLabels[quote.scopeType].ar
                    : scopeLabels[quote.scopeType].en
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
                {t("ملخص العرض", "Proposal brief")}
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
          <p className="text-sm text-slate-500">{t("العميل", "Customer")}</p>
          <p className="mt-3 font-semibold">{quote.customer.name}</p>
          <p className="mt-1 text-sm text-slate-400">
            {quote.customer.email || quote.customer.phone || "-"}
          </p>
        </Card>

        {quote.expiryDate && (
          <Card>
            <p className="text-sm text-slate-500">{t("صالح حتى", "Valid until")}</p>
            <p className="mt-3 font-semibold">
              {new Date(quote.expiryDate).toLocaleDateString(
                isArabic ? "ar-KW" : "en-GB",
              )}
            </p>
          </Card>
        )}

        <Card>
          <p className="text-sm text-slate-500">{t("تاريخ الإصدار", "Issue date")}</p>
          <p className="mt-3 font-semibold">
            {new Date(quote.issueDate).toLocaleDateString(
              isArabic ? "ar-KW" : "en-GB",
            )}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">{t("الإجمالي", "Total")}</p>
          <p className="mt-3 text-2xl font-semibold text-emerald-300">
            {money(quote.totals.totalAmount)}
          </p>
        </Card>
      </div>

      {/* POLISHED QUOTATION DELIVERY CARD */}
      <Card data-testid="delivery-card">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white">
              {t("الإرسال للمستلم", "Delivery")}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              {t(
                "إرسال عرض السعر مباشرة للعميل بواسطة البريد الإلكتروني أو واتساب.",
                "Send the quotation proposal directly to the customer via Email or WhatsApp.",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-testid="delivery-channel-badges">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                emailReady
                  ? "border border-emerald-800 bg-emerald-950/80 text-emerald-300"
                  : "border border-amber-800 bg-amber-950/80 text-amber-300"
              }`}
              data-testid="email-readiness-badge"
            >
              <span className="font-medium">
                {t("البريد الإلكتروني:", "EMAIL:")}
              </span>
              <span>
                {emailReady
                  ? t("جاهز", "Ready")
                  : t("مطلوب الإعداد", "Setup required")}
              </span>
            </span>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                whatsappBaseReady
                  ? "border border-emerald-800 bg-emerald-950/80 text-emerald-300"
                  : "border border-amber-800 bg-amber-950/80 text-amber-300"
              }`}
              data-testid="whatsapp-readiness-badge"
            >
              <span className="font-medium">
                {t("واتساب:", "WHATSAPP:")}
              </span>
              <span>
                {whatsappBaseReady
                  ? t("جاهز", "Ready")
                  : t("مطلوب الإعداد", "Setup required")}
              </span>
            </span>

            {whatsappBaseReady && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                  whatsappLocaleReady
                    ? "border border-sky-800 bg-sky-950/80 text-sky-300"
                    : "border border-amber-800 bg-amber-950/80 text-amber-300"
                }`}
                data-testid="whatsapp-template-locale-badge"
              >
                <span className="font-medium">
                  {isArabic ? "قالب العربية:" : "English template:"}
                </span>
                <span>
                  {whatsappLocaleReady
                    ? t("جاهز", "Ready")
                    : t("غير مهيأ", "Missing")}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* INPUT RECIPIENT FIELDS */}
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          {/* EMAIL CHANNEL COLUMN */}
          <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t("عنوان البريد الإلكتروني", "Email Address")}
              </span>
              <Input
                type="email"
                value={emailRecipient}
                onChange={(event) => {
                  setEmailRecipient(event.target.value);
                  setUpdateCustomerEmail(false);
                }}
                placeholder={t("البريد الإلكتروني للعميل", "Customer email")}
                aria-label={t("البريد الإلكتروني للعميل", "Customer email")}
              />
            </label>

            <p className="text-xs text-slate-400">
              {quote.deliveryContacts.email.source === "CUSTOMER"
                ? t("من ملف العميل الحالي", "From current customer profile")
                : quote.deliveryContacts.email.source === "SNAPSHOT"
                  ? t(
                      "احتياطي من لقطة عرض السعر — لم يُحفظ في ملف العميل",
                      "Fallback from quotation snapshot — not saved to customer",
                    )
                  : t("لا يوجد بريد محفوظ", "No saved email")}
              {quote.deliveryContacts.email.differsFromSnapshot &&
                ` · ${t("يختلف عن لقطة العرض", "Differs from quotation snapshot")}`}
            </p>

            {quote.customerProfile &&
              emailRecipient.trim() &&
              emailRecipient.trim() !== (quote.customerProfile.email ?? "") && (
                <label className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={updateCustomerEmail}
                    onChange={(event) => setUpdateCustomerEmail(event.target.checked)}
                  />
                  <span>
                    {t(
                      "حدّث بريد العميل قبل الإرسال (يبقى محفوظاً إذا فشل الإرسال)",
                      "Update customer email before delivery (remains saved if delivery fails)",
                    )}
                  </span>
                </label>
              )}

            {getEmailDisabledReason() ? (
              <p className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-2.5 text-xs text-amber-300" data-testid="email-disabled-explanation">
                {getEmailDisabledReason()}
              </p>
            ) : (
              <p className="text-xs text-emerald-400">
                {t("جاهز للإرسال بالبريد الإلكتروني", "Ready to send via email")}
              </p>
            )}
          </div>

          {/* WHATSAPP CHANNEL COLUMN */}
          <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                {t("رقم واتساب", "WhatsApp Number")}
              </span>
              <Input
                type="tel"
                value={whatsappRecipient}
                onChange={(event) => {
                  setWhatsAppRecipient(event.target.value);
                  setUpdateCustomerWhatsApp(false);
                }}
                placeholder={t(
                  "رقم واتساب بصيغة دولية",
                  "WhatsApp number in international format",
                )}
                aria-label={t("رقم واتساب للعميل", "Customer WhatsApp number")}
              />
            </label>

            <p className="text-xs text-slate-400">
              {quote.deliveryContacts.whatsapp.source === "CUSTOMER"
                ? t("من رقم واتساب المؤكد في ملف العميل", "From confirmed customer WhatsApp")
                : quote.deliveryContacts.whatsapp.source === "SNAPSHOT"
                  ? t(
                      "احتياطي من هاتف لقطة العرض — ليس واتساباً مؤكداً",
                      "Fallback from quotation phone snapshot — not confirmed WhatsApp",
                    )
                  : t("لا يوجد رقم واتساب محفوظ", "No saved WhatsApp number")}
              {quote.deliveryContacts.whatsapp.differsFromSnapshot &&
                ` · ${t("يختلف عن لقطة العرض", "Differs from quotation snapshot")}`}
            </p>

            {quote.customerProfile &&
              whatsappRecipient.trim() &&
              whatsappRecipient.trim() !== (quote.customerProfile.whatsapp ?? "") && (
                <label className="flex items-start gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={updateCustomerWhatsApp}
                    onChange={(event) =>
                      setUpdateCustomerWhatsApp(event.target.checked)
                    }
                  />
                  <span>
                    {t(
                      "حدّث واتساب العميل قبل الإرسال (يبقى محفوظاً إذا فشل الإرسال)",
                      "Update customer WhatsApp before delivery (remains saved if delivery fails)",
                    )}
                  </span>
                </label>
              )}

            {getWhatsAppDisabledReason() ? (
              <p className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-2.5 text-xs text-amber-300" data-testid="whatsapp-disabled-explanation">
                {getWhatsAppDisabledReason()}
              </p>
            ) : (
              <p className="text-xs text-emerald-400">
                {t("جاهز للإرسال عبر واتساب", "Ready to send via WhatsApp")}
              </p>
            )}
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-white/10 pt-4">
          <Button
            size="sm"
            variant="secondary"
            disabled={!canSendEmail || Boolean(acting)}
            onClick={() => void sendEmail()}
          >
            {acting === "deliver-email"
              ? t("جاري الإرسال...", "Sending...")
              : t("إرسال بالبريد الإلكتروني", "Send by email")}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={!canSendWhatsApp || Boolean(acting)}
            onClick={() => void sendWhatsApp()}
          >
            {acting === "deliver-whatsapp"
              ? t("جاري الإرسال...", "Sending...")
              : t("إرسال عبر واتساب", "Send by WhatsApp")}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            disabled={!canSendBoth || Boolean(acting)}
            onClick={() => void sendBoth()}
          >
            {acting === "deliver-both"
              ? t("جاري الإرسال...", "Sending...")
              : t("إرسال بالبريد وواتساب", "Send by both")}
          </Button>
        </div>

        {deliveryFeedback && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              deliveryFeedback.kind === "success"
                ? "border border-emerald-800 bg-emerald-950/60 text-emerald-300"
                : "border border-red-800 bg-red-950/60 text-red-300"
            }`}
          >
            {deliveryFeedback.message}
          </p>
        )}

        {quote.customerProfile &&
          !emailRecipient.trim() &&
          !whatsappRecipient.trim() && (
            <p className="mt-4 text-sm text-amber-300">
              {t("بيانات التواصل مفقودة. ", "Customer contact details are missing. ")}
              <Link
                href={`/dashboard/customers/${encodeURIComponent(quote.customerProfile.id)}/edit`}
                className="underline focus:outline-none focus:ring-2 focus:ring-amber-300"
              >
                {t("افتح ملف العميل", "Open customer profile")}
              </Link>
            </p>
          )}

        {/* DELIVERY HISTORY LIST */}
        {deliveries.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              {t("سجل الإرسال السابق", "Delivery History")}
            </h4>

            <div className="divide-y divide-white/5">
              {deliveries.map((delivery) => {
                const canRetry = retryAvailable(delivery);
                const retryReason = retryDisabledReason(delivery);

                return (
                  <div
                    key={delivery.id}
                    className="grid gap-2 py-3 text-sm md:grid-cols-[100px_1fr_100px_180px_110px] items-center"
                  >
                    <span className="font-medium text-slate-200">
                      {delivery.channel === "EMAIL" ? "Email" : "WhatsApp"}
                    </span>
                    <span className="text-slate-300">
                      {delivery.recipient}
                      {delivery.status === "FAILED" && delivery.errorMessage && (
                        <span className="mt-1 block text-xs text-red-300">
                          {delivery.errorMessage}
                        </span>
                      )}
                    </span>
                    <Badge>
                      {deliveryStatusLabels[delivery.status][isArabic ? "ar" : "en"]}
                    </Badge>
                    <span className="text-xs text-slate-400">
                      {new Date(delivery.attemptedAt).toLocaleString(
                        isArabic ? "ar-KW" : "en-GB",
                      )}
                    </span>
                    <div>
                      {delivery.status === "FAILED" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!canRetry || Boolean(acting)}
                          title={retryReason ?? undefined}
                          onClick={() => void retryDelivery(delivery)}
                        >
                          {acting === `retry-${delivery.id}`
                            ? t("جاري الإرسال...", "Sending...")
                            : t("إعادة المحاولة", "Retry")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card padding="none">
        <div className="border-b border-white/10 px-6 py-4 font-semibold">
          {t("بنود العرض", "Quotation lines")}
        </div>

        <div className="divide-y divide-white/5">
          {quote.lines.map((line) => (
            <div
              key={line.id ?? line.position}
              className="grid grid-cols-[1fr_auto] gap-4 px-6 py-4"
            >
              <div>
                <p className="font-medium">
                  {isArabic
                    ? line.itemNameAr ?? line.itemName
                    : line.itemNameEn ?? line.itemName}
                </p>

                {(isArabic
                  ? line.descriptionAr ?? line.description
                  : line.descriptionEn ?? line.description) && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">
                    {isArabic
                      ? line.descriptionAr ?? line.description
                      : line.descriptionEn ?? line.description}
                  </p>
                )}

                <p className="mt-1 text-sm text-slate-500">
                  {line.quantity}{" "}
                  {(isArabic ? line.unitNameAr ?? line.unitName : line.unitNameEn ?? line.unitName) ||
                    ""}{" "}
                  x {money(line.unitPrice)}
                </p>
              </div>

              <p className="font-semibold">{money(line.totalAmount)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="ms-auto max-w-md space-y-3">
          <div className="flex justify-between">
            <span className="text-slate-500">{t("المجموع الفرعي", "Subtotal")}</span>
            <span>{money(quote.totals.subtotal)}</span>
          </div>

          {quote.totals.discountAmount > 0 && (
            <div className="flex justify-between text-amber-300">
              <span>{t("الخصم", "Discount")}</span>
              <span>- {money(quote.totals.discountAmount)}</span>
            </div>
          )}

          <div className="flex justify-between">
            <span className="text-slate-500">{t("الضريبة", "Tax")}</span>
            <span>{money(quote.totals.taxAmount)}</span>
          </div>

          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-semibold">
            <span>{t("الإجمالي", "Total")}</span>
            <span className="text-emerald-300">
              {money(quote.totals.totalAmount)}
            </span>
          </div>
        </div>
      </Card>

      {quote.notes && (
        <Card>
          <p className="text-sm text-slate-500">{t("ملاحظات", "Notes")}</p>
          <p className="mt-3 whitespace-pre-wrap">{quote.notes}</p>
        </Card>
      )}

      {(isArabic ? quote.termsAndConditionsAr : quote.termsAndConditionsEn) && (
        <Card>
          <p className="text-sm text-slate-500">
            {t("الشروط والأحكام", "Terms and conditions")}
          </p>

          <p className="mt-3 whitespace-pre-wrap">
            {isArabic
              ? quote.termsAndConditionsAr
              : quote.termsAndConditionsEn}
          </p>
        </Card>
      )}
    </section>
  );
}
