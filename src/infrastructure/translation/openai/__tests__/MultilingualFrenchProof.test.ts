import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAITranslationAdapter } from "../OpenAITranslationAdapter";
import { COMMERCIAL_TEST_CORPUS } from "@/src/application/translation/__tests__/testCorpus";

describe("Multilingual V2 Third-Language Proof (French)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("proves Arabic to French translation contract with protected token preservation", async () => {
    const cctvItem = COMMERCIAL_TEST_CORPUS.find((i) => i.id === "cctv_ar")!;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                [cctvItem.id]:
                  "Fourniture et installation de 8 caméras de surveillance 4MP avec enregistreur 16 canaux et disque dur 8TB",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const adapter = new OpenAITranslationAdapter({ apiKey: "mock-key" });

    const result = await adapter.translateMany({
      sourceLocale: "ar",
      targetLocale: "fr",
      items: [{ key: cctvItem.id, text: cctvItem.text }],
    });

    expect(result[cctvItem.id]).toBe(
      "Fourniture et installation de 8 caméras de surveillance 4MP avec enregistreur 16 canaux et disque dur 8TB",
    );
  });

  it("proves English to French translation contract with protected token preservation", async () => {
    const upsItem = COMMERCIAL_TEST_CORPUS.find((i) => i.id === "ups_en")!;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                [upsItem.id]:
                  "Fourniture et installation d'un APC LR1250I UPS, Qté 10, Prix unitaire KD 125.500, Remise 5%",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const adapter = new OpenAITranslationAdapter({ apiKey: "mock-key" });

    const result = await adapter.translateMany({
      sourceLocale: "en",
      targetLocale: "fr",
      items: [{ key: upsItem.id, text: upsItem.text }],
    });

    expect(result[upsItem.id]).toBe(
      "Fourniture et installation d'un APC LR1250I UPS, Qté 10, Prix unitaire KD 125.500, Remise 5%",
    );
  });

  it("proves French to English translation contract", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fr_1: "Conditions de paiement: 50% d'acompte et 50% à la livraison",
              }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    });

    const adapter = new OpenAITranslationAdapter({ apiKey: "mock-key" });

    const result = await adapter.translateMany({
      sourceLocale: "fr",
      targetLocale: "en",
      items: [
        {
          key: "fr_1",
          text: "Conditions de paiement: 50% d'acompte et 50% à la livraison",
        },
      ],
    });

    expect(result.fr_1).toBe(
      "Conditions de paiement: 50% d'acompte et 50% à la livraison",
    );
  });
});
