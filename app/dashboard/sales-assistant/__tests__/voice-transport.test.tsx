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
  it("Blocker 1 Regression: real unsupported browser (no SpeechRecognition) exposes UNAVAILABLE and leaves text input usable", () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    render(createElement(SalesAssistantPage));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();

    expect(screen.getByTitle(/not supported/i)).toBeTruthy();
    expect(screen.getByText(/UNAVAILABLE/)).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "Direct text input works fine" } });
    expect(textarea.value).toBe("Direct text input works fine");

    const voiceButton = screen.getByRole("button", { name: /Voice Input/i });
    expect((voiceButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("Blocker 2 Regression: repeated voice sessions do NOT duplicate previous speech transcripts", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Initial prompt = "Base"
    fireEvent.change(textarea, { target: { value: "Base" } });

    // First voice session
    const startBtn1 = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtn1);

    act(() => {
      mockRecognizer.emitTranscript("First");
      mockRecognizer.stop();
    });

    expect(textarea.value).toBe("Base First");

    // Second explicit voice session
    const startBtn2 = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtn2);

    act(() => {
      mockRecognizer.emitTranscript("Second");
      mockRecognizer.stop();
    });

    // Resulting prompt must contain exactly "Base First Second"
    expect(textarea.value).toBe("Base First Second");

    const matchesFirst = (textarea.value.match(/First/g) || []).length;
    const matchesSecond = (textarea.value.match(/Second/g) || []).length;

    expect(matchesFirst).toBe(1);
    expect(matchesSecond).toBe(1);
  });

  it("Requirement 2 & 3: microphone action starts and user can explicitly stop listening", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtn = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtn);

    expect(mockRecognizer.startCount).toBe(1);
    expect(screen.getByRole("button", { name: /Stop Listening/i })).toBeTruthy();

    const stopBtn = screen.getByRole("button", { name: /Stop Listening/i });
    fireEvent.click(stopBtn);

    expect(mockRecognizer.stopCount).toBe(1);
  });

  it("Requirement 4 & 5: configures correct recognition locale for Arabic and English", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    // Arabic mode
    mockIsArabic = true;
    const { unmount } = render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtnAr = screen.getByRole("button", { name: /بدء الإدخال الصوتي/i });
    fireEvent.click(startBtnAr);

    expect(mockRecognizer.lastOptions?.lang).toBe("ar-KW");

    unmount();
    mockRecognizer.reset();

    // English mode
    mockIsArabic = false;
    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtnEn = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtnEn);

    expect(mockRecognizer.lastOptions?.lang).toBe("en-US");
  });

  it("Requirement 6, 7 & 14: final transcript extends existing prompt, prompt remains editable, and survives provider failure", () => {
    const mockRecognizer = new MockVoiceRecognizer();

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    // Type pre-existing prompt
    fireEvent.change(textarea, { target: { value: "Existing prompt text" } });

    // Start voice
    const startBtn = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtn);

    // Emit final transcript
    act(() => {
      mockRecognizer.emitTranscript("with appended spoken audio text");
    });

    expect(textarea.value).toBe("Existing prompt text with appended spoken audio text");

    // Can still edit text manually afterwards
    fireEvent.change(textarea, { target: { value: "Existing prompt text with appended spoken audio text (manually edited)" } });
    expect(textarea.value).toBe("Existing prompt text with appended spoken audio text (manually edited)");

    // Provider error occurs
    act(() => {
      mockRecognizer.emitError("ERROR", "Speech service disconnected");
    });

    // Prompt content is preserved intact!
    expect(textarea.value).toBe("Existing prompt text with appended spoken audio text (manually edited)");
  });

  it("Requirement 8, 9, 10, 11: interim and final transcripts do NOT trigger AI proposal generation, /api/quotations, or Apply", () => {
    const mockRecognizer = new MockVoiceRecognizer();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(createElement(SalesAssistantPage, { customRecognizer: mockRecognizer }));

    const startBtn = screen.getByRole("button", { name: /Voice Input/i });
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

    const startBtn = screen.getByRole("button", { name: /Voice Input/i });
    fireEvent.click(startBtn);

    // Emit permission denial
    act(() => {
      mockRecognizer.emitError("PERMISSION_DENIED", "Microphone permission denied.");
    });

    expect(screen.getByText(/PERMISSION_DENIED/)).toBeTruthy();
    expect(screen.getByText(/Microphone permission denied/i)).toBeTruthy();

    // Emit provider error
    act(() => {
      mockRecognizer.emitError("ERROR", "Network recognition error");
    });

    expect(screen.getByText(/ERROR/)).toBeTruthy();
    expect(screen.getByText(/Network recognition error/i)).toBeTruthy();
  });
});
