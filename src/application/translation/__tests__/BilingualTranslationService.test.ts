import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  TranslationPort,
  TranslationRequest,
} from "../ports";

import {
  BilingualTranslationService,
} from "../services";

function createPort(
  implementation:
    TranslationPort["translateMany"],
): TranslationPort {
  return {
    translateMany:
      vi.fn(implementation),
  };
}

describe(
  "BilingualTranslationService",
  () => {
    it(
      "translates Arabic source fields to English in one batch",
      async () => {
        const port =
          createPort(
            async (
              request:
                TranslationRequest,
            ) => ({
              subject:
                "Supply and installation",

              terms:
                "Payment terms",
            }),
          );

        const service =
          new BilingualTranslationService(
            port,
          );

        const result =
          await service
            .translateSourceFields(
              "ar",
              {
                subject:
                  "توريد وتركيب",

                terms:
                  "شروط الدفع",
              },
            );

        expect(
          result.targetLocale,
        ).toBe("en");

        expect(
          result.translated,
        ).toEqual({
          subject:
            "Supply and installation",

          terms:
            "Payment terms",
        });

        expect(
          port.translateMany,
        ).toHaveBeenCalledTimes(1);

        expect(
          port.translateMany,
        ).toHaveBeenCalledWith({
          sourceLocale: "ar",
          targetLocale: "en",

          items: [
            {
              key: "subject",
              text:
                "توريد وتركيب",
            },
            {
              key: "terms",
              text:
                "شروط الدفع",
            },
          ],
        });
      },
    );

    it(
      "translates English source fields to Arabic",
      async () => {
        const port =
          createPort(
            async () => ({
              subject:
                "توريد وتركيب",
            }),
          );

        const service =
          new BilingualTranslationService(
            port,
          );

        const result =
          await service
            .translateSourceFields(
              "en",
              {
                subject:
                  "Supply and installation",
              },
            );

        expect(
          result.targetLocale,
        ).toBe("ar");

        expect(
          result.translated.subject,
        ).toBe(
          "توريد وتركيب",
        );
      },
    );

    it(
      "skips empty fields",
      async () => {
        const port =
          createPort(
            async () => ({
              subject:
                "Quotation",
            }),
          );

        const service =
          new BilingualTranslationService(
            port,
          );

        const result =
          await service
            .translateSourceFields(
              "ar",
              {
                subject:
                  "عرض سعر",

                brief: "   ",

                projectName:
                  null,
              },
            );

        expect(
          result.translated,
        ).toEqual({
          subject:
            "Quotation",

          brief:
            null,

          projectName:
            null,
        });

        expect(
          port.translateMany,
        ).toHaveBeenCalledWith({
          sourceLocale: "ar",
          targetLocale: "en",

          items: [
            {
              key: "subject",
              text:
                "عرض سعر",
            },
          ],
        });
      },
    );

    it(
      "does not call provider when all fields are empty",
      async () => {
        const port =
          createPort(
            async () => ({}),
          );

        const service =
          new BilingualTranslationService(
            port,
          );

        const result =
          await service
            .translateSourceFields(
              "en",
              {
                subject:
                  null,

                brief:
                  "",
              },
            );

        expect(
          port.translateMany,
        ).not.toHaveBeenCalled();

        expect(
          result.translated,
        ).toEqual({
          subject:
            null,

          brief:
            null,
        });
      },
    );

    it(
      "fails when provider omits a requested translation",
      async () => {
        const port =
          createPort(
            async () => ({}),
          );

        const service =
          new BilingualTranslationService(
            port,
          );

        await expect(
          service
            .translateSourceFields(
              "ar",
              {
                subject:
                  "عرض سعر",
              },
            ),
        ).rejects.toThrow(
          'Translation provider did not return "subject".',
        );
      },
    );
  },
);