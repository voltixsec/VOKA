import type {
  TranslationPort,
} from "@/src/application/translation";

import {
  OllamaTranslationAdapter,
} from "./ollama/OllamaTranslationAdapter";

import {
  GeminiTranslationAdapter,
} from "./gemini/GeminiTranslationAdapter";

import {
  GoogleCloudTranslationAdapter,
} from "./google/GoogleCloudTranslationAdapter";

export function createTranslationPort():
  TranslationPort | null {
  const provider =
    (
      process.env
        .VOKA_AI_PROVIDER ||
      ""
    )
      .trim()
      .toLowerCase();

  if (
    provider === "ollama"
  ) {
    const baseUrl =
      process.env
        .OLLAMA_BASE_URL
        ?.trim() ||
      "http://127.0.0.1:11434";

    const model =
      process.env
        .OLLAMA_MODEL
        ?.trim() ||
      "qwen3:8b";

    return new OllamaTranslationAdapter(
      baseUrl,
      model,
    );
  }

  if (
    provider === "google"
  ) {
    const apiKey =
      process.env
        .GOOGLE_CLOUD_TRANSLATION_API_KEY
        ?.trim();

    if (!apiKey) {
      return null;
    }

    return new GoogleCloudTranslationAdapter(
      apiKey,
    );
  }

  if (
    provider === "gemini"
  ) {
    const apiKey =
      process.env
        .GEMINI_API_KEY
        ?.trim();

    if (!apiKey) {
      return null;
    }

    return new GeminiTranslationAdapter(
      apiKey,
    );
  }

  return null;
}