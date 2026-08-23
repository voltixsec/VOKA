export type CorpusItem = {
  readonly id: string;
  readonly category: "arabic_cctv" | "english_ups" | "mixed_technical" | "commercial_terms" | "warranty" | "contact_urls" | "french_commercial" | "chinese_commercial";
  readonly text: string;
  readonly sourceLocale: string;
  readonly protectedTokens: readonly string[];
};

export const COMMERCIAL_TEST_CORPUS: readonly CorpusItem[] = [
  {
    id: "cctv_ar",
    category: "arabic_cctv",
    text: "توريد وتركيب عدد 8 كاميرات مراقبة 4MP مع جهاز تسجيل 16 قناة وهارد ديسك 8TB",
    sourceLocale: "ar",
    protectedTokens: ["8", "4MP", "16", "8TB"],
  },
  {
    id: "ups_en",
    category: "english_ups",
    text: "Supply and installation of APC LR1250I UPS, Qty 10, Unit Price KD 125.500, Discount 5%",
    sourceLocale: "en",
    protectedTokens: ["APC LR1250I", "10", "KD 125.500", "5%"],
  },
  {
    id: "mixed_tech",
    category: "mixed_technical",
    text: "Hikvision DS-2CD2143G2-I 4MP IP67 PoE Camera - CAT6 - 220V",
    sourceLocale: "en",
    protectedTokens: ["Hikvision", "DS-2CD2143G2-I", "4MP", "IP67", "PoE", "CAT6", "220V"],
  },
  {
    id: "payment_terms",
    category: "commercial_terms",
    text: "Payment Terms: 50% advance and 50% upon delivery",
    sourceLocale: "en",
    protectedTokens: ["50%"],
  },
  {
    id: "warranty_terms",
    category: "warranty",
    text: "Warranty: 24 months from delivery date",
    sourceLocale: "en",
    protectedTokens: ["24"],
  },
  {
    id: "french_commercial",
    category: "french_commercial",
    text: "Fourniture de APC LR1250I, quantité 10, prix KD 125.500, remise 5%",
    sourceLocale: "fr-FR",
    protectedTokens: ["APC LR1250I", "10", "KD 125.500", "5%"],
  },
  {
    id: "chinese_commercial",
    category: "chinese_commercial",
    text: "供应 APC LR1250I，数量 10，价格 KD 125.500，折扣 5%",
    sourceLocale: "zh-CN",
    protectedTokens: ["APC LR1250I", "10", "KD 125.500", "5%"],
  },
  {
    id: "contact_urls",
    category: "contact_urls",
    text: "For support contact support@example.com or visit https://example.com/product/APC-LR1250I",
    sourceLocale: "en",
    protectedTokens: ["support@example.com", "https://example.com/product/APC-LR1250I"],
  },
];
