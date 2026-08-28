import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserRawAudioRecorder } from "./BrowserRawAudioRecorder";
import type { IRawAudioRecorder, RecordedVoiceState } from "./recorded-types";

export type AudioTranscriber = (audio: Blob) => Promise<string>;

async function defaultTranscriber(audio: Blob) {
  const form = new FormData();
  form.set("audio", audio, audio.type.includes("mp4") ? "recording.m4a" : "recording.webm");
  const response = await fetch("/api/ai/transcription", { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok || typeof body?.data?.text !== "string") throw new Error(body?.error?.message || "Unable to transcribe recording.");
  return body.data.text.trim();
}

export function useRecordedVoiceInput(options: { recorder?: IRawAudioRecorder; transcribe?: AudioTranscriber } = {}) {
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
        void transcriber(audio).then((text) => { if (current !== generation.current) return; setTranscript(text); setState("READY"); }).catch((error) => { if (current !== generation.current) return; setErrorMessage(error instanceof Error ? error.message : "Unable to transcribe recording."); setState("ERROR"); });
      },
    });
  }, [recorder, transcriber]);

  const resetRecording = () => { generation.current++; recorder.reset(); setTranscript(""); setErrorMessage(null); setState(recorder.isSupported() ? "IDLE" : "UNAVAILABLE"); };
  return { isSupported: recorder.isSupported(), state, waveform, transcript, errorMessage, startRecording, resetRecording, stopRecording: () => recorder.stop() };
}
