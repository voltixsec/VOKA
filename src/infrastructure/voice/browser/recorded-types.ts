export type RecordedVoiceState = "IDLE" | "RECORDING" | "TRANSCRIBING" | "READY" | "UNAVAILABLE" | "PERMISSION_DENIED" | "ERROR";

export type AudioRecorderOptions = {
  onStateChange?: (state: RecordedVoiceState) => void;
  onWaveformChange?: (levels: number[]) => void;
  onComplete?: (audio: Blob) => void;
  onError?: (message: string) => void;
};

export interface IRawAudioRecorder {
  isSupported(): boolean;
  start(options: AudioRecorderOptions): Promise<void>;
  stop(): void;
  reset(): void;
}
