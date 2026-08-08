import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  GoogleCloudTranslationAdapter,
} from "../GoogleCloudTranslationAdapter";

describe(
  "GoogleCloudTranslationAdapter",
  () => {
    it(
      "translates multiple items and preserves their keys",
      async () => {
        const fetcher = vi.fn(
          async (
            _input: string,
            _init: RequestInit,
          ) =>
            new Response(
              JSON.stringify({
                data: {
                  translations: [
                    {
                      translatedText:
                        "Supply and installation",
                    },
                    {
                      translatedText:
                        "Payment terms",
                    },
                  ],
                },
              }),
              {
                status: 200,
                headers: {
                  "Content-Type":
                    "application/json",
                },
              },
            ),
        );

        const adapter =
          new GoogleCloudTranslationAdapter(
            "test-api-key",
            fetcher,
          );

        const result =
          await adapter.translateMany({
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

        expect(result).toEqual({
          subject:
            "Supply and installation",
          terms:
            "Payment terms",
        });

        expect(fetcher).toHaveBeenCalledTimes(1);

        const [
          url,
          init,
        ] = fetcher.mock.calls[0];

        expect(url).toBe(
          "https://translation.googleapis.com/language/translate/v2",
        );

        expect(init.method).toBe("POST");

        expect(init.headers).toEqual({
          "Content-Type":
            "application/json; charset=utf-8",
          "x-goog-api-key":
            "test-api-key",
        });

        expect(
          JSON.parse(
            String(init.body),
          ),
        ).toEqual({
          q: [
            "توريد وتركيب",
            "شروط الدفع",
          ],
          source: "ar",
          target: "en",
          format: "text",
        });
      },
    );

    it(
      "returns empty result without calling provider when there are no items",
      async () => {
        const fetcher = vi.fn();

        const adapter =
          new GoogleCloudTranslationAdapter(
            "test-api-key",
            fetcher as never,
          );

        const result =
          await adapter.translateMany({
            sourceLocale: "en",
            targetLocale: "ar",
            items: [],
          });

        expect(result).toEqual({});

        expect(
          fetcher,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails when provider returns non-success status",
      async () => {
        const fetcher = vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                error: "Unauthorized",
              }),
              {
                status: 401,
              },
            ),
        );

        const adapter =
          new GoogleCloudTranslationAdapter(
            "test-api-key",
            fetcher,
          );

        await expect(
          adapter.translateMany({
            sourceLocale: "ar",
            targetLocale: "en",
            items: [
              {
                key: "terms",
                text:
                  "شروط الدفع",
              },
            ],
          }),
        ).rejects.toThrow(
          "Google Cloud Translation request failed with status 401.",
        );
      },
    );

    it(
      "fails when provider returns wrong translation count",
      async () => {
        const fetcher = vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                data: {
                  translations: [],
                },
              }),
              {
                status: 200,
              },
            ),
        );

        const adapter =
          new GoogleCloudTranslationAdapter(
            "test-api-key",
            fetcher,
          );

        await expect(
          adapter.translateMany({
            sourceLocale: "ar",
            targetLocale: "en",
            items: [
              {
                key: "terms",
                text:
                  "شروط الدفع",
              },
            ],
          }),
        ).rejects.toThrow(
          "Google Cloud Translation returned an invalid translation count.",
        );
      },
    );
  },
);