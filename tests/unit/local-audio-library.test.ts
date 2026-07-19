import { describe, expect, it, vi } from "vitest";

import {
  LocalAudioLibrary,
  validateLocalAudioFile,
} from "@/domain/audio-assets/local-library";

function audioBlob(size: number, type = "audio/wav") {
  return new Blob([new Uint8Array(size)], { type });
}

describe("local audio library", () => {
  it("accepts WAV, MP3, and Ogg within the per-file budget", () => {
    expect(validateLocalAudioFile(audioBlob(32, "audio/wav"), 0).ok).toBe(true);
    expect(validateLocalAudioFile(audioBlob(32, "audio/mpeg"), 0).ok).toBe(true);
    expect(validateLocalAudioFile(audioBlob(32, "audio/ogg"), 0).ok).toBe(true);
  });

  it("rejects unsupported MIME types, files above 25 MB, and a library above 100 MB", () => {
    expect(validateLocalAudioFile(audioBlob(32, "video/mp4"), 0).ok).toBe(false);
    expect(validateLocalAudioFile(audioBlob(25 * 1024 * 1024 + 1), 0).ok).toBe(false);
    expect(validateLocalAudioFile(audioBlob(10), 100 * 1024 * 1024).ok).toBe(false);
  });

  it("preserves existing records after a rejected add and revokes resolved URLs", async () => {
    const revoke = vi.fn();
    const library = new LocalAudioLibrary({
      createObjectURL: (blob) => `blob:${blob.size}`,
      revokeObjectURL: revoke,
    });
    const added = await library.add("Tone.wav", audioBlob(8));
    await expect(library.add("Movie.mp4", audioBlob(8, "video/mp4"))).rejects.toThrow();
    expect(await library.list()).toHaveLength(1);

    const url = await library.resolveObjectUrl(added.id);
    expect(url).toBe("blob:8");
    await library.remove(added.id);
    expect(revoke).toHaveBeenCalledWith("blob:8");
  });

  it("does not persist an asset when browser decoding fails", async () => {
    const library = new LocalAudioLibrary({
      decode: async () => { throw new Error("decode failed"); },
      makeId: () => "local_invalid",
    });

    await expect(library.add("broken.wav", audioBlob(8))).rejects.toThrow("could not be decoded");
    expect(await library.list()).toEqual([]);
  });
});
