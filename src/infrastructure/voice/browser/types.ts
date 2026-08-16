export type VoiceInputState =
  | "IDLE"
  | "LISTENING"
  | "PROCESSING"
  | "READY"
  | "UNAVAILABLE"
  | "PERMISSION_DENIED"
  | "ERROR";

export type VoiceLocale = "ar-KW" | "ar-SA" | "en-US" | "en-GB" | string;

export interface VoiceTranscript {
  interim: string;
  final: string;
}

export interface VoiceRecognizerOptions {
  lang?: VoiceLocale;
  continuous?: boolean;
  interimResults?: boolean;
  onStateChange?: (state: VoiceInputState) => void;
  onTranscriptChange?: (transcript: VoiceTranscript) => void;
  onError?: (errorMessage: string) => void;
}

export interface IVoiceRecognizer {
  isSupported(): boolean;
  start(options?: VoiceRecognizerOptions): void;
  stop(): void;
  getState(): VoiceInputState;
  getTranscript(): VoiceTranscript;
  reset(): void;
}
