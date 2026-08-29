import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRawAudioRecorder } from "./BrowserRawAudioRecorder";
import type { IRawAudioRecorder, RecordedVoiceState } from "./recorded-types";

export type AudioTranscriber = (audio: Blob, contextHints?: string[]) => Promise<string>;

async function defaultTranscriber(audio: Blob, contextHints: string[] = []) {
  const form = new FormData();
  form.set("audio", audio, audio.type.includes("mp4") ? "recording.m4a" : "recording.webm");
  const boundedHints = contextHints.map((hint) => hint.trim()).filter(Boolean).slice(0, 12).map((hint) => hint.slice(0, 80));
  if (boundedHints.length) form.set("hints", JSON.stringify(boundedHints));
  const response = await fetch("/api/ai/transcription", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.data?.text !== "string") throw new Error(body?.error?.message || "Unable to transcribe recording.");
  return body.data.text.trim();
}

export function useRecordedVoiceInput(options: { recorder?: IRawAudioRecorder; transcribe?: AudioTranscriber; contextHints?: string[]; onTranscript?: (text: string) => void } = {}) {
  const recorderRef = useRef<IRawAudioRecorder | null>(null);
  if (!recorderRef.current) recorderRef.current = options.recorder ?? new BrowserRawAudioRecorder();
  const recorder = recorderRef.current;
  const transcriber = options.transcribe ?? defaultTranscriber;
  const [state, setState] = useState<RecordedVoiceState>(recorder.isSupported() ? "IDLE" : "UNAVAILABLE");
  const [waveform, setWaveform] = useState<number[]>(() => Array(9).fill(0.08));
  const [transcript, setTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; recorder.reset(); }, [recorder]);

  const startRecording = useCallback(async () => {
    const current = ++generation.current;
    setErrorMessage(null); setTranscript("");
    await recorder.start({
      onStateChange: (value) => { if (current === generation.current) setState(value); },
      onWaveformChange: (value) => { if (current === generation.current) setWaveform(value); },
      onError: (value) => { if (current === generation.current) setErrorMessage(value); },
      onComplete: (audio) => {
        if (current !== generation.current) return;
        setState("TRANSCRIBING");
        void transcriber(audio, options.contextHints).then((text) => {
          if (current !== generation.current) return;
          const clean = text.trim();
          if (clean.length < 2) throw new Error("No clear speech was detected. Please try again.");
          setTranscript(clean); setState("READY"); options.onTranscript?.(clean);
        }).catch((error) => { if (current !== generation.current) return; setErrorMessage(error instanceof Error ? error.message : "Unable to transcribe recording."); setState("ERROR"); });
      },
    });
  }, [recorder, transcriber, options.contextHints, options.onTranscript]);

  const resetRecording = () => { generation.current++; recorder.reset(); setTranscript(""); setErrorMessage(null); setState(recorder.isSupported() ? "IDLE" : "UNAVAILABLE"); };
  return { isSupported: recorder.isSupported(), state, waveform, transcript, errorMessage, startRecording, resetRecording, stopRecording: () => recorder.stop() };
}
