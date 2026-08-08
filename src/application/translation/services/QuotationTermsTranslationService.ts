import type {
  TranslationLocale,
} from "../ports";

import {
  BilingualTranslationService,
} from "./BilingualTranslationService";

export type QuotationTermsTranslationInput = {
  sourceLocale: TranslationLocale;
  terms: string | null;
};

export type QuotationTermsTranslationResult = {
  termsAr: string | null;
  termsEn: string | null;
};

export class QuotationTermsTranslationService {
  constructor(
    private readonly bilingual:
      BilingualTranslationService,
  ) {}

  async translate(
    input: QuotationTermsTranslationInput,
  ): Promise<QuotationTermsTranslationResult> {
    const source =
      input.terms?.trim() || null;

    if (!source) {
      return {
        termsAr: null,
        termsEn: null,
      };
    }

    const result =
      await this.bilingual
        .translateSourceFields(
          input.sourceLocale,
          {
            terms: source,
          },
        );

    const translated =
      result.translated.terms;

    if (!translated) {
      throw new Error(
        "Quotation terms translation is missing.",
      );
    }

    if (input.sourceLocale === "ar") {
      return {
        termsAr: source,
        termsEn: translated,
      };
    }

    return {
      termsAr: translated,
      termsEn: source,
    };
  }
}