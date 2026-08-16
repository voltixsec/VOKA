import {
  IVoiceRecognizer,
  VoiceInputState,
  VoiceRecognizerOptions,
  VoiceTranscript,
} from "./types";

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

export class BrowserSpeechRecognizer implements IVoiceRecognizer {
  private state: VoiceInputState = "IDLE";
  private transcript: VoiceTranscript = { interim: "", final: "" };
  private recognitionInstance: any = null;
  private options: VoiceRecognizerOptions = {};

  public isSupported(): boolean {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public getState(): VoiceInputState {
    if (!this.isSupported()) {
      return "UNAVAILABLE";
    }
    return this.state;
  }

  public getTranscript(): VoiceTranscript {
    return { ...this.transcript };
  }

  private setState(newState: VoiceInputState): void {
    this.state = newState;
    if (this.options.onStateChange) {
      this.options.onStateChange(newState);
    }
  }

  private setTranscript(transcript: VoiceTranscript): void {
    this.transcript = transcript;
    if (this.options.onTranscriptChange) {
      this.options.onTranscriptChange(this.transcript);
    }
  }

  public start(options: VoiceRecognizerOptions = {}): void {
    this.options = options;

    if (!this.isSupported()) {
      this.setState("UNAVAILABLE");
      return;
    }

    // Always reset session transcript at the start of a new voice recognition session
    this.transcript = { interim: "", final: "" };

    const SpeechRecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    try {
      if (this.recognitionInstance) {
        try {
          this.recognitionInstance.abort();
        } catch {
          // ignore abort error if already stopped
        }
      }

      const recognition = new SpeechRecognitionClass();
      this.recognitionInstance = recognition;

      recognition.continuous = options.continuous ?? false;
      recognition.interimResults = options.interimResults ?? true;
      recognition.lang = options.lang || "en-US";

      recognition.onstart = () => {
        this.setState("LISTENING");
      };

      recognition.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = 0; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0]?.transcript || "";

          if (result.isFinal) {
            finalTranscript += (finalTranscript ? " " : "") + text.trim();
          } else {
            interimTranscript += text;
          }
        }

        this.setTranscript({
          interim: interimTranscript,
          final: finalTranscript,
        });

        if (interimTranscript && !event.results[event.results.length - 1]?.isFinal) {
          if (this.state === "LISTENING") {
            this.setState("PROCESSING");
          }
        }
      };

      recognition.onerror = (event: any) => {
        const error = event.error;
        if (error === "not-allowed" || error === "service-not-allowed") {
          this.setState("PERMISSION_DENIED");
          if (this.options.onError) {
            this.options.onError("Microphone permission denied.");
          }
        } else if (error === "no-speech") {
          this.setState("READY");
        } else if (error === "aborted") {
          if (this.state !== "READY" && this.state !== "IDLE") {
            this.setState("IDLE");
          }
        } else {
          this.setState("ERROR");
          if (this.options.onError) {
            this.options.onError("Speech recognition error occurred.");
          }
        }
      };

      recognition.onend = () => {
        this.recognitionInstance = null;
        if (
          this.state === "LISTENING" ||
          this.state === "PROCESSING"
        ) {
          this.setState("READY");
        }
      };

      recognition.start();
    } catch (err: any) {
      this.setState("ERROR");
      if (this.options.onError) {
        this.options.onError("Failed to start speech recognition.");
      }
    }
  }

  public stop(): void {
    if (this.recognitionInstance) {
      try {
        if (this.state === "LISTENING") {
          this.setState("PROCESSING");
        }
        this.recognitionInstance.stop();
      } catch {
        this.setState("READY");
      }
    } else if (this.state === "LISTENING" || this.state === "PROCESSING") {
      this.setState("READY");
    }
  }

  public reset(): void {
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.abort();
      } catch {
        // ignore
      }
      this.recognitionInstance = null;
    }
    this.transcript = { interim: "", final: "" };
    this.setState(this.isSupported() ? "IDLE" : "UNAVAILABLE");
  }
}
