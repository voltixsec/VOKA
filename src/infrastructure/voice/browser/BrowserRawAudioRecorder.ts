import type { AudioRecorderOptions, IRawAudioRecorder } from "./recorded-types";

export class BrowserRawAudioRecorder implements IRawAudioRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private options: AudioRecorderOptions = {};
  private chunks: Blob[] = [];
  private audioContext: AudioContext | null = null;
  private animationFrame: number | null = null;
  private discardOnStop = false;

  isSupported() {
    return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  }

  async start(options: AudioRecorderOptions = {}) {
    this.options = options;
    this.chunks = [];
    this.discardOnStop = false;
    if (!this.isSupported()) { options.onStateChange?.("UNAVAILABLE"); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) => MediaRecorder.isTypeSupported(type));
      this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
      this.recorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
      this.recorder.onstop = () => {
        const type = this.recorder?.mimeType || this.chunks[0]?.type || "audio/webm";
        const audio = new Blob(this.chunks, { type });
        this.releaseMedia();
        if (!this.discardOnStop) options.onComplete?.(audio);
      };
      this.startWaveform(this.stream);
      this.recorder.start(250);
      options.onStateChange?.("RECORDING");
    } catch (error) {
      this.releaseMedia();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      options.onStateChange?.(denied ? "PERMISSION_DENIED" : "ERROR");
      options.onError?.(denied ? "Microphone permission denied." : "Unable to start audio recording.");
    }
  }

  stop() {
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  reset() {
    if (this.recorder?.state === "recording") { this.discardOnStop = true; this.recorder.stop(); }
    else this.releaseMedia();
  }

  private startWaveform(stream: MediaStream) {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.audioContext = new AudioContextClass();
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 64;
    this.audioContext.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const width = Math.max(1, Math.floor(samples.length / 9));
      const levels = Array.from({ length: 9 }, (_, index) => Math.max(0.08, Math.min(1, (samples.slice(index * width, (index + 1) * width).reduce((sum, value) => sum + value, 0) / width) / 180)));
      this.options.onWaveformChange?.(levels);
      this.animationFrame = requestAnimationFrame(tick);
    };
    tick();
  }

  private releaseMedia() {
    if (this.animationFrame != null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.audioContext?.close();
    this.audioContext = null;
    this.recorder = null;
    this.options.onWaveformChange?.(Array(9).fill(0.08));
  }
}
