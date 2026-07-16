import { SourceGraph } from "@/audio/SourceGraph";
import { smoothParameter } from "@/audio/parameter-smoothing";
import type {
  AudioBufferLike,
  AudioContextLike,
  AudioEngineDiagnostics,
  AudioEngineStatus,
  DynamicsCompressorNodeLike,
} from "@/audio/types";
import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import type { PreviewMode } from "@/domain/editor/state";
import type { SceneSpec } from "@/domain/scene/types";

type AudioEngineDependencies = Readonly<{
  createContext?: () => AudioContextLike;
  fetchArrayBuffer?: (url: string) => Promise<ArrayBuffer>;
}>;

function createBrowserAudioContext(): AudioContextLike {
  if (typeof window === "undefined") {
    throw new Error("Audio can only start in a browser after a user gesture.");
  }
  const Context = window.AudioContext;
  if (!Context) throw new Error("Web Audio is not supported by this browser.");
  return new Context() as unknown as AudioContextLike;
}

async function fetchLocalArrayBuffer(url: string): Promise<ArrayBuffer> {
  if (!url.startsWith("/audio/") || url.includes("://")) {
    throw new Error("Audio assets must use the local registry.");
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load local audio asset (${response.status}).`);
  return response.arrayBuffer();
}

const ASSET_BY_ID = new Map(AUDIO_ASSETS.map((asset) => [asset.id, asset]));

export class AudioEngine {
  private readonly createContext: () => AudioContextLike;
  private readonly fetchArrayBuffer: (url: string) => Promise<ArrayBuffer>;
  private readonly sourceGraphs = new Map<string, SourceGraph>();
  private readonly bufferCache = new Map<string, Promise<AudioBufferLike>>();
  private context: AudioContextLike | null = null;
  private masterCompressor: DynamicsCompressorNodeLike | null = null;
  private status: AudioEngineStatus = "idle";
  private mode: PreviewMode = "raw";
  private applyCount = 0;
  private sourceStarts = 0;
  private contextCreations = 0;
  private error: string | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(dependencies: AudioEngineDependencies = {}) {
    this.createContext = dependencies.createContext ?? createBrowserAudioContext;
    this.fetchArrayBuffer = dependencies.fetchArrayBuffer ?? fetchLocalArrayBuffer;
  }

  async start(scene: SceneSpec): Promise<void> {
    if (this.startPromise) {
      await this.startPromise;
      return;
    }
    const operation = this.startInternal(scene);
    this.startPromise = operation;
    try {
      await operation;
    } finally {
      if (this.startPromise === operation) this.startPromise = null;
    }
  }

  private async startInternal(scene: SceneSpec): Promise<void> {
    if (this.status === "disposed") throw new Error("Audio engine has been disposed.");
    this.status = "starting";
    this.error = null;
    try {
      const context = this.ensureContext();
      await this.syncSourceGraphs(scene);
      this.applyListener(scene);
      this.applySourceParameters(scene);
      this.applyMode();
      await context.resume();
      this.status = "running";
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : "Audio failed to start.";
      throw error;
    }
  }

  async applyScene(scene: SceneSpec): Promise<void> {
    if (!this.context || this.status === "disposed") return;
    try {
      await this.syncSourceGraphs(scene);
      this.applyListener(scene);
      this.applySourceParameters(scene);
      this.applyCount += 1;
      this.error = null;
    } catch (error) {
      this.status = "error";
      this.error = error instanceof Error ? error.message : "Audio scene update failed.";
      throw error;
    }
  }

  setMode(mode: PreviewMode): void {
    this.mode = mode;
    this.applyMode();
  }

  async stop(): Promise<void> {
    if (!this.context || this.status === "disposed") return;
    await this.context.suspend();
    this.status = "suspended";
  }

  async dispose(): Promise<void> {
    if (this.status === "disposed") return;
    for (const graph of this.sourceGraphs.values()) graph.dispose();
    this.sourceGraphs.clear();
    this.bufferCache.clear();
    this.masterCompressor?.disconnect();
    if (this.context && this.context.state !== "closed") await this.context.close();
    this.masterCompressor = null;
    this.context = null;
    this.status = "disposed";
  }

  getDiagnostics(): AudioEngineDiagnostics {
    return {
      status: this.status,
      mode: this.mode,
      graphCount: this.sourceGraphs.size,
      sourceStarts: this.sourceStarts,
      applyCount: this.applyCount,
      contextCreations: this.contextCreations,
      sourceGraphIds: Object.fromEntries(
        [...this.sourceGraphs].map(([sourceId, graph]) => [sourceId, graph.identity]),
      ),
      error: this.error,
    };
  }

  private ensureContext(): AudioContextLike {
    if (this.context) return this.context;
    this.context = this.createContext();
    this.contextCreations += 1;
    this.masterCompressor = this.context.createDynamicsCompressor();
    this.masterCompressor.connect(this.context.destination);
    return this.context;
  }

  private async syncSourceGraphs(scene: SceneSpec): Promise<void> {
    const context = this.context;
    const output = this.masterCompressor;
    if (!context || !output) return;
    const activeSourceIds = new Set(scene.sources.map(({ id }) => id));
    for (const [sourceId, graph] of this.sourceGraphs) {
      if (!activeSourceIds.has(sourceId)) {
        graph.dispose();
        this.sourceGraphs.delete(sourceId);
      }
    }
    for (const source of scene.sources) {
      if (this.sourceGraphs.has(source.id)) continue;
      const buffer = await this.loadBuffer(source.clipId);
      this.sourceGraphs.set(
        source.id,
        new SourceGraph(context, output, source, buffer, this.mode),
      );
      this.sourceStarts += 1;
    }
  }

  private loadBuffer(clipId: string): Promise<AudioBufferLike> {
    const cached = this.bufferCache.get(clipId);
    if (cached) return cached;
    const asset = ASSET_BY_ID.get(clipId);
    if (!asset) return Promise.reject(new Error(`Unknown local audio asset: ${clipId}`));
    const loading = this.fetchArrayBuffer(asset.url)
      .then((data) => this.context!.decodeAudioData(data))
      .then((buffer) => {
        if (buffer.numberOfChannels !== 1) {
          throw new Error(`Audio asset ${clipId} must decode as mono.`);
        }
        return buffer;
      });
    this.bufferCache.set(clipId, loading);
    return loading;
  }

  private applySourceParameters(scene: SceneSpec): void {
    if (!this.context) return;
    for (const source of scene.sources) {
      this.sourceGraphs.get(source.id)?.apply(source, scene.listener, this.context.currentTime);
    }
  }

  private applyListener(scene: SceneSpec): void {
    if (!this.context) return;
    const listener = this.context.listener;
    const now = this.context.currentTime;
    const headingRad = (scene.listener.headingDeg * Math.PI) / 180;
    smoothParameter(listener.positionX, 0, now);
    smoothParameter(listener.positionY, 0, now);
    smoothParameter(listener.positionZ, 0, now);
    smoothParameter(listener.forwardX, Math.sin(headingRad), now);
    smoothParameter(listener.forwardY, 0, now);
    smoothParameter(listener.forwardZ, -Math.cos(headingRad), now);
    smoothParameter(listener.upX, 0, now);
    smoothParameter(listener.upY, 1, now);
    smoothParameter(listener.upZ, 0, now);
  }

  private applyMode(): void {
    if (!this.context) return;
    for (const graph of this.sourceGraphs.values()) {
      graph.applyMode(this.mode, this.context.currentTime);
    }
  }
}
