export type CommercialDefaultsProfile = {
  currencyCode: string;
  termsAr: string | null;
  termsEn: string | null;
  payment: string | null;
  delivery: string | null;
  warranty: string | null;
  validity: string | null;
};

const labels = {
  payment: /^(?:شروط\s+الدفع|الدفع|payment(?:\s+terms)?|payable)\s*[:：-]?\s*/i,
  delivery: /^(?:مدة\s+(?:التسليم|التوريد)|التسليم|التوريد|delivery(?:\s+terms)?|lead\s+time)\s*[:：-]?\s*/i,
  warranty: /^(?:مدة\s+الضمان|الضمان|warranty|guarantee)\s*[:：-]?\s*/i,
  validity: /^(?:مدة\s+صلاحية(?:\s+العرض)?|صلاحية\s+العرض|الصلاحية|quotation\s+validity|validity|valid\s+for)\s*[:：-]?\s*/i,
} as const;

export function normalizeCommercialText(value: string | null | undefined): string | null {
  if (!value) return null;
  const source = value.normalize("NFKC").trim();
  if (/^[{[]/.test(source)) {
    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === "object") return null;
    } catch { /* retain ordinary natural text containing braces */ }
  }
  const normalized = source
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .split("\n")
    .filter((line) => !/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line))
    .map((line) => {
      const clean = line.replace(/^\s*```(?:json|markdown)?\s*$/i, "").trim();
      if (/^\|.*\|$/.test(clean)) return clean.split("|").map((cell) => cell.trim()).filter(Boolean).join(" — ");
      return clean;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || null;
}

function clauseValue(text: string | null, pattern: RegExp) {
  if (!text) return null;
  for (const raw of text.split(/[\n;؛]+/)) {
    const line = raw.trim().replace(/^(?:[-•*]|[0-9٠-٩]+[.)-])\s*/, "");
    if (!pattern.test(line)) continue;
    pattern.lastIndex = 0;
    return normalizeCommercialText(line.replace(pattern, ""));
  }
  return null;
}

export function parseCommercialDefaultsProfile(input: {
  currencyCode: string;
  termsAr: string | null;
  termsEn: string | null;
  locale?: "ar" | "en";
}): CommercialDefaultsProfile {
  const termsAr = normalizeCommercialText(input.termsAr);
  const termsEn = normalizeCommercialText(input.termsEn);
  const preferred = input.locale === "en" ? [termsEn, termsAr] : [termsAr, termsEn];
  const read = (pattern: RegExp) => preferred.map((terms) => clauseValue(terms, pattern)).find(Boolean) ?? null;
  return {
    currencyCode: input.currencyCode.trim().toUpperCase(),
    termsAr,
    termsEn,
    payment: read(labels.payment),
    delivery: read(labels.delivery),
    warranty: read(labels.warranty),
    validity: read(labels.validity),
  };
}

function replaceOrAppendClause(terms: string | null, key: keyof typeof labels, value: string | null, locale: "ar" | "en") {
  if (!value) return terms;
  const label = {
    payment: locale === "ar" ? "شروط الدفع" : "Payment terms",
    delivery: locale === "ar" ? "مدة التسليم" : "Delivery",
    warranty: locale === "ar" ? "الضمان" : "Warranty",
    validity: locale === "ar" ? "صلاحية العرض" : "Quotation validity",
  }[key];
  const cleanValue = normalizeCommercialText(value)?.replace(labels[key], "").trim();
  if (!cleanValue) return terms;
  const lines = (terms ?? "").split("\n").filter(Boolean);
  const index = lines.findIndex((line) => labels[key].test(line.trim().replace(/^(?:[-•*]|[0-9٠-٩]+[.)-])\s*/, "")));
  const replacement = `${label}: ${cleanValue}`;
  if (index >= 0) lines[index] = replacement;
  else lines.push(replacement);
  return normalizeCommercialText(lines.join("\n"));
}

export function composeQuotationTerms(
  defaults: CommercialDefaultsProfile,
  values: Pick<CommercialDefaultsProfile, "payment" | "delivery" | "warranty" | "validity">,
  locale: "ar" | "en",
) {
  let terms = locale === "ar" ? defaults.termsAr : defaults.termsEn;
  for (const key of ["payment", "delivery", "warranty", "validity"] as const) {
    terms = replaceOrAppendClause(terms, key, values[key], locale);
  }
  return terms;
}
