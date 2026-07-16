import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";

describe("generated local audio assets", () => {
  it("ships each registered WAV as mono 48 kHz PCM with provenance", async () => {
    for (const asset of AUDIO_ASSETS) {
      const bytes = await readFile(join(process.cwd(), "public", asset.url));
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
      expect(bytes.readUInt16LE(20)).toBe(1);
      expect(bytes.readUInt16LE(22)).toBe(1);
      expect(bytes.readUInt32LE(24)).toBe(48_000);
      expect(bytes.readUInt16LE(34)).toBe(16);
      expect(asset.attribution).toMatch(/Echo Canvas procedural generator/i);
    }
  });
});
