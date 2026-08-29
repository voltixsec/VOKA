// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SalesAssistantPage from "../page";
import type { AudioRecorderOptions, IRawAudioRecorder } from "@/src/infrastructure/voice/browser";

vi.mock("@/components/i18n/LanguageProvider", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

class MockRawAudioRecorder implements IRawAudioRecorder {
  options: AudioRecorderOptions = {};
  startCount = 0;
  stopCount = 0;
  isSupported() { return true; }
  async start(options: AudioRecorderOptions) { this.startCount += 1; this.options = options; options.onStateChange?.("RECORDING"); options.onWaveformChange?.([.1, .2, .3, .4, .5, .6, .5, .3, .1]); }
  stop() { this.stopCount += 1; this.options.onComplete?.(new Blob(["audio"], { type: "audio/webm" })); }
  reset() {}
}

describe("Voice V2 recorded transcription", () => {
  beforeEach(() => sessionStorage.clear());

  it("records without live typing, then Stop transcribes and understands through the canonical path", async () => {
    const recorder = new MockRawAudioRecorder();
    const transcribe = vi.fn().mockResolvedValue("12 cameras NVR PoE RJ45 4MP");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "test stop" } }) });
    vi.stubGlobal("fetch", fetchSpy);
    render(<SalesAssistantPage customAudioRecorder={recorder} customTranscribe={transcribe} />);
    expect(screen.getAllByTestId("primary-voice-action")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Tell VOKA|Record voice/i })).toBeNull();

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.click(screen.getByRole("button", { name: "Start by Voice" }));
    expect(recorder.startCount).toBe(1);
    expect(textarea.value).toBe("");
    expect(screen.getByLabelText("Audio recording waveform")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop & Send" }));
    expect(recorder.stopCount).toBe(1);
    await waitFor(() => expect(textarea.value).toBe("12 cameras NVR PoE RJ45 4MP"));
    expect(transcribe).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toMatchObject({ reply: "12 cameras NVR PoE RJ45 4MP", replySource: "VOICE" });

    fireEvent.change(textarea, { target: { value: "edited NVR request" } });
    expect(textarea.value).toBe("edited NVR request");
  });

  it("does not mutate or understand when no clear speech is detected", async () => {
    const recorder = new MockRawAudioRecorder();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SalesAssistantPage customAudioRecorder={recorder} customTranscribe={vi.fn().mockResolvedValue(" ")} />);
    fireEvent.click(screen.getByRole("button", { name: "Start by Voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop & Send" }));
    await screen.findByText("Audio recording or transcription failed. Try again or type your request.");
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the same primary action for pasted text and renders no separate Understand button", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "stop" } }) });
    vi.stubGlobal("fetch", fetchSpy);
    render(<SalesAssistantPage customAudioRecorder={new MockRawAudioRecorder()} />);
    const action = screen.getByTestId("primary-voice-action");
    expect(action.textContent).toBe("Start by Voice");
    expect(screen.queryByRole("button", { name: "Understand" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create quotation for 4 cameras" } });
    expect(action.textContent).toBe("Start Request");
    fireEvent.click(action);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  });
});
