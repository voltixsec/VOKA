import { ApiError, apiSuccess, withCompanyAuth } from "@/lib/api";
import { normalizeTechnicalSpeech } from "@/src/application/commercial-conversation";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export const POST = withCompanyAuth(["OWNER", "ADMIN", "SALES"], async (request) => {
  const form = await request.formData();
  const audio = form.get("audio");
  if (!(audio instanceof File) || !audio.type.startsWith("audio/") || audio.size < 1 || audio.size > MAX_AUDIO_BYTES) {
    throw ApiError.badRequest("VOICE_AUDIO_INVALID", "A valid audio recording up to 25 MB is required.");
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw ApiError.internal("Audio transcription is not configured.");
  const upstream = new FormData();
  upstream.set("file", audio, audio.name || "recording.webm");
  upstream.set("model", process.env.VOKA_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe");
  upstream.set("prompt", "Egyptian Arabic and English commercial request. Preserve these exact technical tokens when spoken: NVR, DVR, PoE, RJ45, 4MP.");
  const response = await fetch(`${(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "")}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: upstream });
  const body = await response.json().catch(() => null) as { text?: unknown; error?: { message?: string } } | null;
  if (!response.ok || typeof body?.text !== "string") throw ApiError.internal(body?.error?.message || "Audio transcription failed.");
  return apiSuccess({ text: normalizeTechnicalSpeech(body.text) }, { headers: { "Cache-Control": "private, no-store" } });
});
