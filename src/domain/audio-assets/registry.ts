export type AudioAsset = Readonly<{
  id: string;
  label: string;
  url: string;
  channels: 1;
  loop: boolean;
  license: string;
  attribution?: string;
}>;

function defineAudioAsset(asset: AudioAsset): AudioAsset {
  if (!asset.url.startsWith("/audio/") || asset.url.includes("://")) {
    throw new Error(`Audio asset ${asset.id} must use a local URL`);
  }

  return Object.freeze({ ...asset });
}

export const AUDIO_ASSETS: readonly AudioAsset[] = Object.freeze([
  defineAudioAsset({
    id: "radio_loop",
    label: "Radio loop",
    url: "/audio/radio-loop.wav",
    channels: 1,
    loop: true,
    license: "Self-authored procedural audio",
    attribution: "Echo Canvas procedural generator, 2026",
  }),
  defineAudioAsset({
    id: "rain_loop",
    label: "Rain loop",
    url: "/audio/rain-loop.wav",
    channels: 1,
    loop: true,
    license: "Self-authored procedural audio",
    attribution: "Echo Canvas procedural generator, 2026",
  }),
  defineAudioAsset({
    id: "voice_loop",
    label: "Voice loop",
    url: "/audio/voice-loop.wav",
    channels: 1,
    loop: true,
    license: "Self-authored procedural audio",
    attribution: "Echo Canvas procedural generator, 2026",
  }),
  defineAudioAsset({
    id: "water_loop",
    label: "Water loop",
    url: "/audio/water-loop.wav",
    channels: 1,
    loop: true,
    license: "Self-authored procedural audio",
    attribution: "Echo Canvas procedural generator, 2026",
  }),
]);
