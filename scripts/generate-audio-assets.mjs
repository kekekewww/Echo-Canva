import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SAMPLE_RATE = 48_000;
const DURATION_SECONDS = 2;
const SAMPLE_COUNT = SAMPLE_RATE * DURATION_SECONDS;

function seededNoise(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

function loopEnvelope(index) {
  const fadeSamples = Math.round(SAMPLE_RATE * 0.025);
  if (index < fadeSamples) return index / fadeSamples;
  if (index >= SAMPLE_COUNT - fadeSamples) return (SAMPLE_COUNT - 1 - index) / fadeSamples;
  return 1;
}

function renderSample(kind, index, random) {
  const t = index / SAMPLE_RATE;
  const noise = random();
  if (kind === "radio") {
    return 0.19 * Math.sin(2 * Math.PI * 220 * t) +
      0.09 * Math.sin(2 * Math.PI * 330 * t) + 0.025 * noise;
  }
  if (kind === "rain") {
    return 0.11 * noise + 0.025 * Math.sin(2 * Math.PI * 137 * t) * noise;
  }
  if (kind === "voice") {
    const carrier = Math.sin(2 * Math.PI * 118 * t);
    return 0.15 * carrier + 0.08 * Math.sin(2 * Math.PI * 236 * t) +
      0.04 * Math.sin(2 * Math.PI * 708 * t) * carrier;
  }
  return 0.09 * Math.sin(2 * Math.PI * 73 * t) +
    0.06 * Math.sin(2 * Math.PI * 181 * t) + 0.035 * noise;
}

function encodeMonoPcmWav(kind, seed) {
  const dataBytes = SAMPLE_COUNT * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(dataBytes, 40);

  const random = seededNoise(seed);
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const value = Math.max(-1, Math.min(1, renderSample(kind, index, random) * loopEnvelope(index)));
    wav.writeInt16LE(Math.round(value * 32767), 44 + index * 2);
  }
  return wav;
}

const outputDirectory = resolve("public/audio");
await mkdir(outputDirectory, { recursive: true });

const assets = [
  ["radio-loop.wav", "radio", 0xec001],
  ["rain-loop.wav", "rain", 0xec002],
  ["voice-loop.wav", "voice", 0xec003],
  ["water-loop.wav", "water", 0xec004],
];

for (const [filename, kind, seed] of assets) {
  await writeFile(resolve(outputDirectory, filename), encodeMonoPcmWav(kind, seed));
}
