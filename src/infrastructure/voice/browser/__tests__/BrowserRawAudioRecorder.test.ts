// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRawAudioRecorder } from "../BrowserRawAudioRecorder";

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  requestData = vi.fn(() => this.ondataavailable?.({ data: new Blob(["final"], { type: this.mimeType }) }));
  constructor(_stream: MediaStream, public options: MediaRecorderOptions) { this.mimeType = options.mimeType || "audio/webm"; instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
const instances: MockMediaRecorder[] = [];

describe("BrowserRawAudioRecorder", () => {
  beforeEach(() => { instances.length = 0; vi.stubGlobal("MediaRecorder", MockMediaRecorder); });

  it("feature-detects speech constraints and flushes the final encoder data", async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getSupportedConstraints: () => ({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }), getUserMedia } });
    const completed = vi.fn();
    const recorder = new BrowserRawAudioRecorder();
    await recorder.start({ onComplete: completed });
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    expect(instances[0].options.audioBitsPerSecond).toBe(128_000);
    recorder.stop();
    expect(instances[0].requestData).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0][0].size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalled();
  });

  it("starts safely when optional speech constraints are unsupported", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getSupportedConstraints: () => ({}), getUserMedia } });
    await new BrowserRawAudioRecorder().start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: {} });
  });
});
