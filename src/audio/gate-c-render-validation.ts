import { SchroederReverb } from "@/audio/SchroederReverb";
import { scheduleEqualPowerCrossfade } from "@/audio/parameter-smoothing";
import type { AudioContextLike } from "@/audio/types";
import type { RoomAcousticFrame } from "@/acoustics/types";

const SAMPLE_RATE = 48_000;
const TARGET_RT60_SECONDS = 0.8;
const IMPULSE_START_SECONDS = 0.5;
const REVERB_RENDER_SECONDS = 4;
const TRANSITION_START_SECONDS = 0.25;
const TRANSITION_RENDER_SECONDS = 0.5;
const WINDOW_SECONDS = 0.02;
const RT60_ENERGY_RATIO = 1e-6;

export type GateCAudioRenderValidation = Readonly<{
  available: boolean;
  finite: boolean;
  reverbChannels: readonly Readonly<{
    finite: boolean;
    peak: number;
  }>[];
  peak: number;
  estimatedRt60Seconds: number;
  estimatedRt60Method: "stereo-energy";
  targetRt60Seconds: number;
  transitionMaxStep: number;
  transitionPeak: number;
  transitionMaxStepRatio: number;
}>;

declare global {
  interface Window {
    __echoCanvasRenderGateCValidation?: () => Promise<GateCAudioRenderValidation>;
  }
}

const VALIDATION_ROOM: RoomAcousticFrame = Object.freeze({
  volumeM3: 72,
  totalSurfaceM2: 118,
  // Use equal bands here so this rendered check measures the mid-band comb
  // decay rather than a deliberately longer low-frequency room tail.
  rt60S: { low: TARGET_RT60_SECONDS, mid: TARGET_RT60_SECONDS, high: TARGET_RT60_SECONDS },
  preDelayMs: 20,
});

/**
 * Renders the production Schroeder network with the browser's OfflineAudioContext.
 * It is intentionally only exposed as an automated validation hook; it does not
 * participate in the interactive preview's live audio graph.
 */
export async function renderGateCAudioValidation(): Promise<GateCAudioRenderValidation> {
  if (typeof OfflineAudioContext === "undefined") {
    return unavailableValidation();
  }

  const reverbBuffer = await renderSchroederImpulse();
  const transitionBuffer = await renderModeTransition();
  const reverbChannels = inspectChannels(reverbBuffer);
  const transitionSamples = transitionBuffer.getChannelData(0);
  const transitionMaxStep = maxSampleStep(
    transitionSamples,
    transitionBuffer.sampleRate,
    TRANSITION_START_SECONDS,
    TRANSITION_START_SECONDS + 0.08,
  );
  const transitionPeak = peakAmplitude(transitionSamples);

  return {
    available: true,
    finite: reverbChannels.every((channel) => channel.finite) && transitionSamples.every(Number.isFinite),
    reverbChannels,
    peak: Math.max(...reverbChannels.map((channel) => channel.peak)),
    estimatedRt60Seconds: estimateRt60Seconds(reverbBuffer),
    estimatedRt60Method: "stereo-energy",
    targetRt60Seconds: TARGET_RT60_SECONDS,
    transitionMaxStep,
    transitionPeak,
    transitionMaxStepRatio: transitionPeak > 0 ? transitionMaxStep / transitionPeak : Number.NaN,
  };
}

export function installGateCAudioRenderValidation(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const previous = window.__echoCanvasRenderGateCValidation;
  window.__echoCanvasRenderGateCValidation = renderGateCAudioValidation;
  return () => {
    if (previous) {
      window.__echoCanvasRenderGateCValidation = previous;
    } else {
      delete window.__echoCanvasRenderGateCValidation;
    }
  };
}

async function renderSchroederImpulse(): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(
    2,
    Math.ceil(REVERB_RENDER_SECONDS * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  const impulse = context.createBuffer(1, 1, SAMPLE_RATE);
  impulse.getChannelData(0)[0] = 0.1;
  source.buffer = impulse;
  const stereoInput = context.createChannelMerger(2);

  const reverb = new SchroederReverb(
    context as unknown as AudioContextLike,
    context.destination as unknown as AudioContextLike["destination"],
  );
  reverb.apply(VALIDATION_ROOM, 0);
  source.connect(stereoInput, 0, 0);
  source.connect(stereoInput, 0, 1);
  stereoInput.connect(reverb.input as unknown as AudioNode);
  source.start(IMPULSE_START_SECONDS);

  const rendered = await context.startRendering();
  stereoInput.disconnect();
  reverb.dispose();
  return rendered;
}

async function renderModeTransition(): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(
    1,
    Math.ceil(TRANSITION_RENDER_SECONDS * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = context.createBufferSource();
  const signal = context.createBuffer(1, context.length, SAMPLE_RATE);
  signal.getChannelData(0).fill(0.1);
  source.buffer = signal;

  const raw = context.createGain();
  const simulated = context.createGain();
  raw.gain.value = 1;
  simulated.gain.value = 0;
  source.connect(raw);
  source.connect(simulated);
  raw.connect(context.destination);
  simulated.connect(context.destination);
  scheduleEqualPowerCrossfade(raw.gain, simulated.gain, 0, Math.PI * 0.5, TRANSITION_START_SECONDS);
  source.start(0);

  return context.startRendering();
}

function unavailableValidation(): GateCAudioRenderValidation {
  return {
    available: false,
    finite: false,
    reverbChannels: [],
    peak: Number.NaN,
    estimatedRt60Seconds: Number.NaN,
    estimatedRt60Method: "stereo-energy",
    targetRt60Seconds: TARGET_RT60_SECONDS,
    transitionMaxStep: Number.NaN,
    transitionPeak: Number.NaN,
    transitionMaxStepRatio: Number.NaN,
  };
}

function inspectChannels(buffer: AudioBuffer): readonly Readonly<{ finite: boolean; peak: number }>[] {
  const channels: Array<Readonly<{ finite: boolean; peak: number }>> = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    channels.push({ finite: samples.every(Number.isFinite), peak: peakAmplitude(samples) });
  }
  return channels;
}

function peakAmplitude(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

function estimateRt60Seconds(buffer: AudioBuffer): number {
  return estimateDecaySeconds(buffer, RT60_ENERGY_RATIO);
}

function estimateDecaySeconds(
  buffer: AudioBuffer,
  energyRatio: number,
): number {
  const windowLength = Math.max(1, Math.round(WINDOW_SECONDS * buffer.sampleRate));
  const windowCount = Math.floor(buffer.length / windowLength);
  const energy = new Float64Array(windowCount);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const samples = buffer.getChannelData(channel);
    for (let windowIndex = 0; windowIndex < windowCount; windowIndex += 1) {
      const offset = windowIndex * windowLength;
      for (let index = 0; index < windowLength; index += 1) {
        const sample = samples[offset + index]!;
        energy[windowIndex] += sample * sample;
      }
    }
  }

  const remaining = new Float64Array(windowCount);
  let accumulated = 0;
  for (let index = windowCount - 1; index >= 0; index -= 1) {
    accumulated += energy[index]!;
    remaining[index] = accumulated;
  }

  let onset = 0;
  while (onset < windowCount && energy[onset]! <= 1e-14) onset += 1;
  const reference = remaining[onset] ?? 0;
  if (!Number.isFinite(reference) || reference <= 0) return Number.NaN;
  const threshold = reference * energyRatio;
  for (let index = onset; index < windowCount; index += 1) {
    if (remaining[index]! <= threshold) {
      return (index - onset) * WINDOW_SECONDS;
    }
  }
  return Number.NaN;
}

function maxSampleStep(
  samples: Float32Array,
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): number {
  const start = Math.max(1, Math.floor(startSeconds * sampleRate));
  const end = Math.min(samples.length, Math.ceil(endSeconds * sampleRate));
  let maximum = 0;
  for (let index = start; index < end; index += 1) {
    maximum = Math.max(maximum, Math.abs(samples[index]! - samples[index - 1]!));
  }
  return maximum;
}
