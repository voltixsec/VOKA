export type QuotationBrandTheme =
  | "NAVY_GOLD"
  | "ROYAL_BLUE"
  | "EMERALD"
  | "BURGUNDY"
  | "CHARCOAL";

export type QuotationBrandPalette = {
  primary: string;
  accent: string;
  soft: string;
  softStrong: string;
  textOnPrimary: string;
  line: string;
};

export const DEFAULT_QUOTATION_BRAND_THEME:
  QuotationBrandTheme =
  "NAVY_GOLD";

export const QUOTATION_BRAND_PALETTES:
  Record<
    QuotationBrandTheme,
    QuotationBrandPalette
  > = {
  NAVY_GOLD: {
    primary: "#0f172a",
    accent: "#d4a72c",
    soft: "#fffaf0",
    softStrong: "#fef3c7",
    textOnPrimary: "#ffffff",
    line: "#d6dbe4",
  },

  ROYAL_BLUE: {
    primary: "#1e3a8a",
    accent: "#3b82f6",
    soft: "#eff6ff",
    softStrong: "#dbeafe",
    textOnPrimary: "#ffffff",
    line: "#cbd5e1",
  },

  EMERALD: {
    primary: "#064e3b",
    accent: "#10b981",
    soft: "#ecfdf5",
    softStrong: "#d1fae5",
    textOnPrimary: "#ffffff",
    line: "#d1d5db",
  },

  BURGUNDY: {
    primary: "#701a36",
    accent: "#d4a72c",
    soft: "#fff1f2",
    softStrong: "#ffe4e6",
    textOnPrimary: "#ffffff",
    line: "#d6d3d1",
  },

  CHARCOAL: {
    primary: "#27272a",
    accent: "#a1a1aa",
    soft: "#f4f4f5",
    softStrong: "#e4e4e7",
    textOnPrimary: "#ffffff",
    line: "#d4d4d8",
  },
};

export function resolveQuotationBrandTheme(
  value:
    | string
    | null
    | undefined,
): QuotationBrandPalette {
  const theme =
    (
      value &&
      value in
        QUOTATION_BRAND_PALETTES
    )
      ? value as
          QuotationBrandTheme
      : DEFAULT_QUOTATION_BRAND_THEME;

  return (
    QUOTATION_BRAND_PALETTES[
      theme
    ]
  );
}
