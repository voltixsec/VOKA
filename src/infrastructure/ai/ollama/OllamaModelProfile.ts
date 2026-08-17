/**
 * OllamaModelProfile
 *
 * Encapsulates per-model generation options so that cloud and local Ollama
 * models can coexist without scattered string-comparison logic in adapters.
 *
 * CLOUD (e.g. minimax-m3:cloud):
 *   - Do NOT send `format: "json"` → causes empty content
 *   - Do NOT send `num_predict` ceiling → causes truncation / done_reason="length"
 *   - Do NOT send `num_ctx: 2048` → cloud manages context
 *   - Rely on prompt-enforced JSON; validate server-side
 *
 * LOCAL (e.g. qwen3:1.7b):
 *   - `format: "json"` proven compatible
 *   - `num_predict`/`num_ctx` options are appropriate
 */

export type OllamaGenerationOptions = {
  temperature: number;
  num_predict?: number;
  num_ctx?: number;
};

export type OllamaModelProfile = {
  /** The Ollama model identifier, e.g. "minimax-m3:cloud" or "qwen3:1.7b" */
  model: string;
  /** Whether to send `format: "json"` in the request body */
  sendFormatJson: boolean;
  /** Options forwarded inside the Ollama `options` block */
  generationOptions: OllamaGenerationOptions;
  /** Timeout in milliseconds for this model */
  timeoutMs: number;
};

const CLOUD_MODEL_SUFFIX = ":cloud";

/**
 * Returns true when the model name indicates an Ollama Cloud model.
 * Detection is intentionally conservative: only the explicit `:cloud` suffix
 * is treated as cloud.  Unknown names are treated as local.
 */
export function isCloudModel(model: string): boolean {
  return model.trim().toLowerCase().endsWith(CLOUD_MODEL_SUFFIX);
}

/**
 * Build a ready-to-use OllamaModelProfile for a given model string.
 *
 * Cloud models receive lenient generation options and no `format` constraint.
 * Local models receive the bounded options that have been validated locally.
 */
export function buildModelProfile(
  model: string,
  timeoutMs: number,
): OllamaModelProfile {
  if (isCloudModel(model)) {
    return {
      model,
      sendFormatJson: false,
      generationOptions: {
        temperature: 0,
        // num_predict and num_ctx intentionally omitted for cloud
      },
      timeoutMs,
    };
  }

  // Local model defaults
  return {
    model,
    sendFormatJson: true,
    generationOptions: {
      temperature: 0,
      num_predict: 500,
      num_ctx: 2048,
    },
    timeoutMs,
  };
}
