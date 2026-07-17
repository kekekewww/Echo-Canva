import type { PreviewMode } from "@/domain/editor/state";

export interface AudioParamLike {
  value: number;
  cancelAndHoldAtTime(cancelTime: number): AudioParamLike;
  cancelScheduledValues(cancelTime: number): AudioParamLike;
  setValueCurveAtTime(
    values: Float32Array,
    startTime: number,
    duration: number,
  ): AudioParamLike;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParamLike;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike): AudioNodeLike;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
  readonly gain: AudioParamLike;
}

export interface PannerNodeLike extends AudioNodeLike {
  panningModel: PanningModelType;
  distanceModel: DistanceModelType;
  rolloffFactor: number;
  refDistance: number;
  maxDistance: number;
  readonly positionX: AudioParamLike;
  readonly positionY: AudioParamLike;
  readonly positionZ: AudioParamLike;
}

export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
}

export type AudioBufferLike = Readonly<{
  numberOfChannels: number;
}>;

export interface AudioBufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  start(): void;
  stop(): void;
}

export type DynamicsCompressorNodeLike = AudioNodeLike;

export interface AudioListenerLike {
  readonly positionX: AudioParamLike;
  readonly positionY: AudioParamLike;
  readonly positionZ: AudioParamLike;
  readonly forwardX: AudioParamLike;
  readonly forwardY: AudioParamLike;
  readonly forwardZ: AudioParamLike;
  readonly upX: AudioParamLike;
  readonly upY: AudioParamLike;
  readonly upZ: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: AudioContextState;
  readonly destination: AudioNodeLike;
  readonly listener: AudioListenerLike;
  createGain(): GainNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createPanner(): PannerNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createDynamicsCompressor(): DynamicsCompressorNodeLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}

export type AudioEngineStatus =
  | "idle"
  | "starting"
  | "running"
  | "suspended"
  | "error"
  | "disposed";

export type AudioEngineDiagnostics = Readonly<{
  status: AudioEngineStatus;
  mode: PreviewMode;
  graphCount: number;
  sourceStarts: number;
  applyCount: number;
  contextCreations: number;
  sourceGraphIds: Readonly<Record<string, number>>;
  error: string | null;
  acousticFallbackNotice: string | null;
}>;
