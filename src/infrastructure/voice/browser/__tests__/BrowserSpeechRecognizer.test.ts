// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserSpeechRecognizer } from "../BrowserSpeechRecognizer";

describe("BrowserSpeechRecognizer", () => {
  let recognizer: BrowserSpeechRecognizer;

  beforeEach(() => {
    recognizer = new BrowserSpeechRecognizer();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  it("returns isSupported false and state UNAVAILABLE when browser SpeechRecognition is undefined", () => {
    expect(recognizer.isSupported()).toBe(false);
    expect(recognizer.getState()).toBe("UNAVAILABLE");
  });

  it("returns isSupported true and state IDLE when webkitSpeechRecognition is available", () => {
    (window as any).webkitSpeechRecognition = vi.fn(function () {
      return {};
    });
    expect(recognizer.isSupported()).toBe(true);
    expect(recognizer.getState()).toBe("IDLE");
  });

  it("handles start when unsupported gracefully", () => {
    const onStateChange = vi.fn();
    recognizer.start({ onStateChange });
    expect(onStateChange).toHaveBeenCalledWith("UNAVAILABLE");
    expect(recognizer.getState()).toBe("UNAVAILABLE");
  });

  it("resets session transcript on start so previous session transcripts are not duplicated", () => {
    const mockRecognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: "",
      onstart: null as any,
      onend: null as any,
      onresult: null as any,
      onerror: null as any,
      start: vi.fn(),
      stop: vi.fn(function (this: any) {
        if (this.onend) this.onend();
      }),
      abort: vi.fn(),
    };

    (window as any).SpeechRecognition = vi.fn(function () {
      return mockRecognitionInstance;
    });

    const onTranscriptChange = vi.fn();

    // First session
    recognizer.start({ onTranscriptChange });
    if (mockRecognitionInstance.onresult) {
      mockRecognitionInstance.onresult({
        results: [
          Object.assign([{ transcript: "First" }], { isFinal: true }),
        ],
      });
    }
    expect(recognizer.getTranscript().final).toBe("First");

    // Second session
    recognizer.start({ onTranscriptChange });
    expect(recognizer.getTranscript().final).toBe("");

    if (mockRecognitionInstance.onresult) {
      mockRecognitionInstance.onresult({
        results: [
          Object.assign([{ transcript: "Second" }], { isFinal: true }),
        ],
      });
    }
    expect(recognizer.getTranscript().final).toBe("Second");
  });

  it("handles permission denial safely", () => {
    const mockRecognitionInstance = {
      continuous: false,
      interimResults: false,
      lang: "",
      onstart: null as any,
      onend: null as any,
      onresult: null as any,
      onerror: null as any,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
    };

    (window as any).SpeechRecognition = vi.fn(function () {
      return mockRecognitionInstance;
    });

    const onStateChange = vi.fn();
    const onError = vi.fn();

    recognizer.start({ onStateChange, onError });

    if (mockRecognitionInstance.onerror) {
      mockRecognitionInstance.onerror({ error: "not-allowed" });
    }

    expect(onStateChange).toHaveBeenCalledWith("PERMISSION_DENIED");
    expect(onError).toHaveBeenCalledWith("Microphone permission denied.");
    expect(recognizer.getState()).toBe("PERMISSION_DENIED");
  });
});
