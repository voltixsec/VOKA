// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRecordedVoiceInput } from "../useRecordedVoiceInput";
import type { AudioRecorderOptions, IRawAudioRecorder } from "../recorded-types";

class Recorder implements IRawAudioRecorder {
  options: AudioRecorderOptions = {};
  isSupported() { return true; }
  async start(options: AudioRecorderOptions) { this.options = options; options.onStateChange?.("RECORDING"); }
  stop() { this.options.onComplete?.(new Blob(["complete recording"], { type: "audio/webm" })); }
  reset() {}
}

describe("useRecordedVoiceInput", () => {
  it("discards a late transcription after New Request/reset", async () => {
    let finish!: (text: string) => void;
    const recorder = new Recorder();
    const transcribe = () => new Promise<string>((resolve) => { finish = resolve; });
    const { result } = renderHook(() => useRecordedVoiceInput({ recorder, transcribe }));
    await act(async () => result.current.startRecording());
    act(() => result.current.stopRecording());
    act(() => result.current.resetRecording());
    await act(async () => finish("stale text"));
    expect(result.current.transcript).toBe(""); expect(result.current.state).toBe("IDLE");
  });
  it("transcribes only a completed recording and exposes the final transcript", async () => {
    const recorder = new Recorder();
    const transcribe = vi.fn().mockResolvedValue("final mixed transcript NVR");
    const { result } = renderHook(() => useRecordedVoiceInput({ recorder, transcribe }));
    await act(async () => result.current.startRecording());
    expect(result.current.state).toBe("RECORDING");
    expect(transcribe).not.toHaveBeenCalled();
    act(() => result.current.stopRecording());
    expect(result.current.state).toBe("TRANSCRIBING");
    await waitFor(() => expect(result.current.state).toBe("READY"));
    expect(result.current.transcript).toBe("final mixed transcript NVR");
    expect(transcribe).toHaveBeenCalledTimes(1);
  });
  it("passes bounded context to the transcriber and invokes the action only for clear speech", async () => {
    const recorder = new Recorder();
    const transcribe = vi.fn().mockResolvedValue("180 cameras 4MP");
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useRecordedVoiceInput({ recorder, transcribe, contextHints: ["catalog camera"], onTranscript }));
    await act(async () => result.current.startRecording());
    act(() => result.current.stopRecording());
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("180 cameras 4MP"));
    expect(transcribe).toHaveBeenCalledWith(expect.any(Blob), ["catalog camera"]);
  });
});
