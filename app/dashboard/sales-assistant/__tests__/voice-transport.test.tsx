// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SalesAssistantPage from "../page";
import {
  IVoiceRecognizer,
  VoiceInputState,
  VoiceRecognizerOptions,
  VoiceTranscript,
} from "@/src/infrastructure/voice/browser";

let mockIsArabic = false;

vi.mock("@/components/i18n/LanguageProvider", () => ({
  useLanguage: () => ({ isArabic: mockIsArabic }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

class MockVoiceRecognizer implements IVoiceRecognizer {
  public supported = true;
  public state: VoiceInputState = "IDLE";
  public transcript: VoiceTranscript = { interim: "", final: "" };
  public lastOptions: VoiceRecognizerOptions | null = null;
  public startCount = 0;
  public stopCount = 0;
  public resetCount = 0;

  isSupported(): boolean {
    return this.supported;
  }

  getState(): VoiceInputState {
    return this.supported ? this.state : "UNAVAILABLE";
  }

  getTranscript(): VoiceTranscript {
    return this.transcript;
  }

  start(options?: VoiceRecognizerOptions): void {
    this.startCount++;
    this.lastOptions = options || null;
    this.transcript = { interim: "", final: "" };
    if (!this.supported) {
      this.state = "UNAVAILABLE";
      if (options?.onStateChange) options.onStateChange("UNAVAILABLE");
      return;
    }
    this.state = "LISTENING";
    if (options?.onStateChange) options.onStateChange("LISTENING");
  }

  stop(): void {
    this.stopCount++;
    this.state = "READY";
    if (this.lastOptions?.onStateChange) this.lastOptions.onStateChange("READY");
  }

  reset(): void {
    this.resetCount++;
    this.state = this.supported ? "IDLE" : "UNAVAILABLE";
    this.transcript = { interim: "", final: "" };
  }

  // Test helpers
  emitTranscript(finalText: string, interimText: string = "") {
    this.transcript = { final: finalText, interim: interimText };
    if (this.lastOptions?.onTranscriptChange) {
      this.lastOptions.onTranscriptChange(this.transcript);
    }
  }

  emitError(state: VoiceInputState, errorMessage: string) {
    this.state = state;
    if (this.lastOptions?.onStateChange) this.lastOptions.onStateChange(state);
    if (this.lastOptions?.onError) this.lastOptions.onError(errorMessage);
  }
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockIsArabic = false;
  delete (window as any).SpeechRecognition;
  delete (window as any).webkitSpeechRecognition;
});

describe("Voice Input Transport Integration Tests", () => {
  it("Blocker 1 Regression: real unsupported browser exposes UNAVAILABLE after mount and leaves text input usable", async () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(createElement(SalesAssistantPage));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    expect(await screen.findByTitle(/not supported/i)).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "Direct text input works fine" } });
    expect(textarea.value).toBe("Direct text input works fine");

    const textButton = screen.getByRole("button", { name: /Start Request/i });
    expect((textButton as HTMLButtonElement).disabled).toBe(false);
  });

  it("Blocker 2 Regression: repeated voice sessions do NOT duplicate previous speech transcripts", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // First voice session
    const startBtn1 = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn1);

    act(() => {
      mockRecognizer.emitTranscript("First");
      mockRecognizer.stop();
    });

    expect(textarea.value).toBe("First");

    // Clear the completed fallback transcript to start another voice session.
    fireEvent.change(textarea, { target: { value: "" } });

    // Second explicit voice session
    const startBtn2 = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn2);

    act(() => {
      mockRecognizer.emitTranscript("Second");
      mockRecognizer.stop();
    });

    expect(textarea.value).toBe("Second");

    const matchesFirst = (textarea.value.match(/First/g) || []).length;
    const matchesSecond = (textarea.value.match(/Second/g) || []).length;

    expect(matchesFirst).toBe(0);
    expect(matchesSecond).toBe(1);
  });

  it("Requirement 2 & 3: microphone action starts continuously and user can explicitly finish", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtn = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn);

    expect(mockRecognizer.startCount).toBe(1);
    expect(mockRecognizer.lastOptions?.continuous).toBe(true);
    const stopBtn = screen.getByRole("button", { name: /Stop & Send/i });
    fireEvent.click(stopBtn);

    expect(mockRecognizer.stopCount).toBe(1);
  });

  it("treats textarea edits and deletions as authoritative across voice continuation and restart", () => {
    const mockRecognizer = new MockVoiceRecognizer();
    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.click(screen.getByRole("button", { name: /Start by Voice/i }));
    act(() => mockRecognizer.emitTranscript("deleted words"));
    expect(textarea.value).toBe("deleted words");
    fireEvent.change(textarea, { target: { value: "kept" } });
    act(() => mockRecognizer.emitTranscript("deleted words new words"));
    expect(textarea.value).toBe("kept new words");

    fireEvent.click(screen.getByRole("button", { name: /Stop & Send/i }));
    fireEvent.change(textarea, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Start by Voice/i }));
    act(() => mockRecognizer.emitTranscript("fresh voice"));
    expect(textarea.value).toBe("fresh voice");
    expect(textarea.value).not.toContain("deleted words");
  });

  it("presents attachment, editable text, voice, and explicit completion in one input surface", () => {
    const mockRecognizer = new MockVoiceRecognizer();
    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    expect(screen.getByLabelText("Attach commercial file")).toBeTruthy();
    expect(screen.getByRole("textbox")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Start by Voice" }));
    expect(screen.getByRole("button", { name: "Stop & Send" })).toBeTruthy();
  });

  it("Requirement 4 & 5: configures correct recognition locale for Arabic and English", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    // Arabic mode
    mockIsArabic = true;
    const { unmount } = render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtnAr = screen.getByRole("button", { name: /ابدأ الطلب صوتيًا/i });
    fireEvent.click(startBtnAr);

    expect(mockRecognizer.lastOptions?.lang).toBe("ar-KW");

    unmount();
    mockRecognizer.reset();

    // English mode
    mockIsArabic = false;
    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtnEn = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtnEn);

    expect(mockRecognizer.lastOptions?.lang).toBe("en-US");
  });

  it("Requirement 6, 7 & 14: final transcript remains editable and survives provider failure", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Start voice
    const startBtn = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn);

    // Emit final transcript
    act(() => {
      mockRecognizer.emitTranscript("with appended spoken audio text");
    });

    expect(textarea.value).toBe("with appended spoken audio text");

    // Can still edit text manually afterwards
    fireEvent.change(textarea, { target: { value: "spoken audio text (manually edited)" } });
    expect(textarea.value).toBe("spoken audio text (manually edited)");

    // Provider error occurs
    act(() => {
      mockRecognizer.emitError("ERROR", "Speech service disconnected");
    });

    // Prompt content is preserved intact!
    expect(textarea.value).toBe("spoken audio text (manually edited)");
  });

  it("Requirement 8, 9, 10, 11: interim and final transcripts do NOT trigger AI proposal generation, /api/quotations, or Apply", () => {
    const mockRecognizer = new MockVoiceRecognizer();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtn = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn);

    // Emit interim result
    act(() => {
      mockRecognizer.emitTranscript("", "interim partial text");
    });
    expect(fetchSpy).not.toHaveBeenCalled();

    // Stop listening / complete final transcript
    act(() => {
      mockRecognizer.emitTranscript("Final recognized speech text");
      mockRecognizer.stop();
    });

    // Zero backend/API calls were made automatically!
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Structured Proposal Draft/i)).toBeNull();
  });

  it("Requirement 12 & 13: permission denial and provider errors render safe visible status without crashing", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtn = screen.getByRole("button", { name: /Start by Voice/i });
    fireEvent.click(startBtn);

    // Emit permission denial
    act(() => {
      mockRecognizer.emitError("PERMISSION_DENIED", "Microphone permission denied.");
    });

    expect(screen.getByText("Microphone permission denied")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Please allow microphone access");

    // Emit provider error
    act(() => {
      mockRecognizer.emitError("ERROR", "Network recognition error");
    });

    expect(screen.getByText("Error")).toBeTruthy();
    expect(screen.getByText("An error occurred during voice recognition.")).toBeTruthy();
    expect(screen.queryByText(/Network recognition error/i)).toBeNull();
  });

  it("privacy: leaving the page terminates the active recognition session", () => {
    const mockRecognizer = new MockVoiceRecognizer();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const view = render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    fireEvent.click(screen.getByRole("button", { name: /Start by Voice/i }));
    expect(mockRecognizer.state).toBe("LISTENING");
    view.unmount();

    expect(mockRecognizer.resetCount).toBe(1);
    expect(mockRecognizer.state).toBe("IDLE");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
