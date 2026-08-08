import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  TranslationPort,
} from "../ports";

import {
  BilingualTranslationService,
  QuotationTermsTranslationService,
} from "../services";

function createService(
  translateMany:
    TranslationPort["translateMany"],
) {
  const port: TranslationPort = {
    translateMany:
      vi.fn(translateMany),
  };

  const bilingual =
    new BilingualTranslationService(
      port,
    );

  return {
    port,
    service:
      new QuotationTermsTranslationService(
        bilingual,
      ),
  };
}

describe(
  "QuotationTermsTranslationService",
  () => {
    it(
      "stores Arabic source and English translation",
      async () => {
        const { service } =
          createService(
            async () => ({
              terms:
                "50% advance payment.",
            }),
          );

        const result =
          await service.translate({
            sourceLocale: "ar",
            terms:
              "دفعة مقدمة 50%.",
          });

        expect(result).toEqual({
          termsAr:
            "دفعة مقدمة 50%.",
          termsEn:
            "50% advance payment.",
        });
      },
    );

    it(
      "stores English source and Arabic translation",
      async () => {
        const { service } =
          createService(
            async () => ({
              terms:
                "دفعة مقدمة 50%.",
            }),
          );

        const result =
          await service.translate({
            sourceLocale: "en",
            terms:
              "50% advance payment.",
          });

        expect(result).toEqual({
          termsAr:
            "دفعة مقدمة 50%.",
          termsEn:
            "50% advance payment.",
        });
      },
    );

    it(
      "does not call provider for empty terms",
      async () => {
        const {
          service,
          port,
        } =
          createService(
            async () => ({}),
          );

        const result =
          await service.translate({
            sourceLocale: "ar",
            terms: "   ",
          });

        expect(result).toEqual({
          termsAr: null,
          termsEn: null,
        });

        expect(
          port.translateMany,
        ).not.toHaveBeenCalled();
      },
    );
  },
);