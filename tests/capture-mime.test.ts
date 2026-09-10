import { describe, it, expect } from "vitest";
import { filenameForAudioMime } from "../src/lib/capture/audio-filename";

describe("filenameForAudioMime", () => {
  it("audio/webm -> voice.webm", () => {
    expect(filenameForAudioMime("audio/webm")).toBe("voice.webm");
  });

  it("audio/webm with codecs param -> voice.webm", () => {
    expect(filenameForAudioMime("audio/webm; codecs=opus")).toBe("voice.webm");
  });

  it("audio/ogg -> voice.ogg", () => {
    expect(filenameForAudioMime("audio/ogg")).toBe("voice.ogg");
  });

  it("audio/mp4 -> voice.mp4", () => {
    expect(filenameForAudioMime("audio/mp4")).toBe("voice.mp4");
  });

  it("audio/mpeg -> voice.mp3", () => {
    expect(filenameForAudioMime("audio/mpeg")).toBe("voice.mp3");
  });

  it("audio/wav -> voice.wav", () => {
    expect(filenameForAudioMime("audio/wav")).toBe("voice.wav");
  });

  it("unknown type falls back to voice.webm", () => {
    expect(filenameForAudioMime("audio/x-mystery")).toBe("voice.webm");
  });

  it("empty/null falls back to voice.webm", () => {
    expect(filenameForAudioMime("")).toBe("voice.webm");
    expect(filenameForAudioMime(null)).toBe("voice.webm");
    expect(filenameForAudioMime(undefined)).toBe("voice.webm");
  });
});
