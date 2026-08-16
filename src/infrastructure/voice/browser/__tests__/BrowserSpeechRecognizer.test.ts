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

  it("returns isSupported false when window.SpeechRecognition is undefined", () => {
    expect(recognizer.isSupported()).toBe(false);
  });

  it("returns isSupported true when webkitSpeechRecognition is available", () => {
    (window as any).webkitSpeechRecognition = vi.fn(function () {
      return {};
    });
    expect(recognizer.isSupported()).toBe(true);
  });

  it("handles start when unsupported gracefully", () => {
    const onStateChange = vi.fn();
    recognizer.start({ onStateChange });
    expect(onStateChange).toHaveBeenCalledWith("UNAVAILABLE");
    expect(recognizer.getState()).toBe("UNAVAILABLE");
  });

  it("starts recognition and fires state changes when supported", () => {
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

    const onStateChange = vi.fn();
    const onTranscriptChange = vi.fn();

    recognizer.start({
      lang: "ar-KW",
      onStateChange,
      onTranscriptChange,
    });

    // Simulate browser firing onstart event
    if (mockRecognitionInstance.onstart) {
      mockRecognitionInstance.onstart();
    }

    expect(onStateChange).toHaveBeenCalledWith("LISTENING");
    expect(recognizer.getState()).toBe("LISTENING");

    // Simulate final result
    if (mockRecognitionInstance.onresult) {
      mockRecognitionInstance.onresult({
        resultIndex: 0,
        results: [
          Object.assign([{ transcript: "طلب كاميرات مراقبة" }], { isFinal: true }),
        ],
      });
    }

    expect(onTranscriptChange).toHaveBeenCalledWith({
      interim: "",
      final: "طلب كاميرات مراقبة",
    });

    recognizer.stop();
    expect(mockRecognitionInstance.stop).toHaveBeenCalled();
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
