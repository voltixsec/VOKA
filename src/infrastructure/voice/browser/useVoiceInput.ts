import { useState, useEffect, useRef, useCallback } from "react";
import {
  VoiceInputState,
  VoiceTranscript,
  IVoiceRecognizer,
} from "./types";
import { BrowserSpeechRecognizer } from "./BrowserSpeechRecognizer";

export interface UseVoiceInputOptions {
  locale?: string; // e.g. "ar" or "en" or specific locale like "ar-KW", "en-US"
  recognizer?: IVoiceRecognizer;
}

export interface UseVoiceInputReturn {
  isSupported: boolean;
  state: VoiceInputState;
  transcript: VoiceTranscript;
  errorMessage: string | null;
  startListening: (overrideLang?: string) => void;
  stopListening: () => void;
  resetVoiceInput: () => void;
}

export function resolveVoiceLocale(appLocaleOrLang?: string): string {
  if (!appLocaleOrLang) return "en-US";
  const lower = appLocaleOrLang.toLowerCase();
  if (lower.startsWith("ar")) {
    return "ar-KW"; // Default Arabic locale for VOKA in Kuwait
  }
  return "en-US"; // Default English locale
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { locale, recognizer: customRecognizer } = options;

  const recognizerRef = useRef<IVoiceRecognizer | null>(null);

  if (!recognizerRef.current) {
    recognizerRef.current = customRecognizer || new BrowserSpeechRecognizer();
  }

  const recognizer = recognizerRef.current;

  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [state, setState] = useState<VoiceInputState>("IDLE");
  const [transcript, setTranscript] = useState<VoiceTranscript>({ interim: "", final: "" });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const supported = recognizer.isSupported();
    setIsSupported(supported);
    setState(supported ? recognizer.getState() : "UNAVAILABLE");
  }, [recognizer]);

  const startListening = useCallback(
    (overrideLang?: string) => {
      setErrorMessage(null);
      setTranscript({ interim: "", final: "" });
      const targetLang = overrideLang || resolveVoiceLocale(locale);

      recognizer.start({
        lang: targetLang,
        continuous: false,
        interimResults: true,
        onStateChange: (newState) => {
          setState(newState);
        },
        onTranscriptChange: (newTranscript) => {
          setTranscript(newTranscript);
        },
        onError: (err) => {
          setErrorMessage(err);
        },
      });
    },
    [locale, recognizer]
  );

  const stopListening = useCallback(() => {
    recognizer.stop();
  }, [recognizer]);

  const resetVoiceInput = useCallback(() => {
    recognizer.reset();
    setTranscript({ interim: "", final: "" });
    setErrorMessage(null);
    setState(recognizer.isSupported() ? "IDLE" : "UNAVAILABLE");
  }, [recognizer]);

  return {
    isSupported,
    state,
    transcript,
    errorMessage,
    startListening,
    stopListening,
    resetVoiceInput,
  };
}
