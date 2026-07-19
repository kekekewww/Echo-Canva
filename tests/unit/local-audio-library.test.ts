import { describe, expect, it, vi } from "vitest";

import {
  FallbackAudioStore,
  LocalAudioLibrary,
  type LocalAudioStore,
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

  it("rejects decoded stereo before creating a local record", async () => {
    const library = new LocalAudioLibrary({
      decode: async () => ({ numberOfChannels: 2 }),
      makeId: () => "local_stereo",
    });

    await expect(library.add("stereo.wav", audioBlob(8))).rejects.toThrow(/mono/i);
    expect(await library.list()).toEqual([]);
  });

  it("relinks a missing asset under the same stable ID and revokes its old URL", async () => {
    const revoke = vi.fn();
    const library = new LocalAudioLibrary({
      createObjectURL: (blob) => `blob:${blob.size}`,
      revokeObjectURL: revoke,
      makeId: () => "local_voice",
    });
    const record = await library.add("old.wav", audioBlob(8));
    expect(await library.resolveObjectUrl(record.id)).toBe("blob:8");

    const replacement = await library.relink(record.id, "new.wav", audioBlob(12));

    expect(replacement.id).toBe("local_voice");
    expect(replacement.name).toBe("new.wav");
    expect(revoke).toHaveBeenCalledWith("blob:8");
    expect(await library.resolveArrayBuffer(record.id)).toHaveProperty("byteLength", 12);
  });

  it("falls back to memory after an IndexedDB-style operation failure", async () => {
    const primary: LocalAudioStore = {
      list: async () => { throw new Error("blocked"); },
      put: async () => { throw new Error("blocked"); },
      delete: async () => { throw new Error("blocked"); },
    };
    const warning = vi.fn();
    const store = new FallbackAudioStore(primary, undefined, warning);
    const library = new LocalAudioLibrary({ store, makeId: () => "local_memory" });

    await library.add("memory.wav", audioBlob(8));

    expect((await library.list()).map(({ id }) => id)).toEqual(["local_memory"]);
    expect(warning).toHaveBeenCalledOnce();
    expect(store.persistent).toBe(false);
  });
});
