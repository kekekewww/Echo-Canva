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
import type { AcousticFrame } from "@/acoustics/compute-frame";

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
  private operationTail: Promise<void> = Promise.resolve();
  private desiredScene: SceneSpec | null = null;
  private latestAcousticFrame: AcousticFrame | null = null;
  private sceneVersion = 0;
  private desiredRunning = false;
  private runIntentGeneration = 0;
  private hasSuccessfullyStarted = false;
  private disposed = false;

  constructor(dependencies: AudioEngineDependencies = {}) {
    this.createContext = dependencies.createContext ?? createBrowserAudioContext;
    this.fetchArrayBuffer = dependencies.fetchArrayBuffer ?? fetchLocalArrayBuffer;
  }

  async start(scene: SceneSpec): Promise<void> {
    if (this.disposed) throw new Error("Audio engine has been disposed.");
    const runIntent = this.runIntentGeneration + 1;
    this.runIntentGeneration = runIntent;
    this.desiredRunning = true;
    this.requestScene(scene);
    this.status = "starting";
    this.error = null;
    const operation = this.enqueue(() => this.reconcile());
    try {
      await operation;
    } catch (error) {
      if (!this.disposed && runIntent === this.runIntentGeneration) {
        this.desiredRunning = false;
        this.recordError(error, "Audio failed to start.");
      }
      throw error;
    }
  }

  async applyScene(scene: SceneSpec): Promise<void> {
    if (this.disposed) return;
    this.requestScene(scene);
    if (
      !this.context ||
      !this.desiredRunning ||
      (!this.hasSuccessfullyStarted && this.status !== "starting")
    ) {
      return;
    }
    try {
      await this.enqueue(() => this.reconcile());
      if (!this.disposed) this.applyCount += 1;
    } catch (error) {
      this.recordError(error, "Audio scene update failed.");
      throw error;
    }
  }

  setMode(mode: PreviewMode): void {
    this.mode = mode;
    this.applyMode();
  }

  applyAcousticFrame(frame: AcousticFrame): void {
    if (this.disposed || frame.revision !== this.desiredScene?.revision) return;
    this.latestAcousticFrame = frame;
    const context = this.context;
    const scene = this.desiredScene;
    if (!context || !scene) return;
    this.applyFrameParameters(frame, scene, context);
  }

  async stop(): Promise<void> {
    this.runIntentGeneration += 1;
    this.desiredRunning = false;
    if (!this.context || this.disposed) return;
    this.status = "suspended";
    await this.enqueue(async () => {
      const context = this.context;
      if (!context || this.disposed) return;
      if (context.state !== "closed" && context.state !== "suspended") {
        await context.suspend();
      }
      if (!this.disposed && !this.desiredRunning) this.status = "suspended";
    });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.runIntentGeneration += 1;
    this.desiredRunning = false;
    this.desiredScene = null;
    this.sceneVersion += 1;
    this.status = "disposed";
    this.error = null;

    for (const graph of this.sourceGraphs.values()) graph.dispose();
    this.sourceGraphs.clear();
    this.bufferCache.clear();
    try {
      this.masterCompressor?.disconnect();
    } catch {
      // Continue terminal cleanup even if a browser node is already disconnected.
    }
    const context = this.context;
    this.masterCompressor = null;
    this.context = null;
    if (context && context.state !== "closed") await context.close();
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
      acousticFallbackNotice: null,
    };
  }

  private ensureContext(): AudioContextLike {
    if (this.disposed) throw new Error("Audio engine has been disposed.");
    if (this.context) return this.context;
    const context = this.createContext();
    this.contextCreations += 1;
    let compressor: DynamicsCompressorNodeLike | null = null;
    try {
      compressor = context.createDynamicsCompressor();
      compressor.connect(context.destination);
    } catch (error) {
      try {
        compressor?.disconnect();
      } catch {
        // Best-effort rollback of a context that was never committed.
      }
      if (context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
      throw error;
    }
    this.context = context;
    this.masterCompressor = compressor;
    return context;
  }

  private async syncSourceGraphs(
    scene: SceneSpec,
    version: number,
    context: AudioContextLike,
  ): Promise<boolean> {
    const output = this.masterCompressor;
    if (!output || context !== this.context) return false;

    const additions = scene.sources.filter((source) => {
      const committed = this.sourceGraphs.get(source.id);
      return !committed || !committed.matches(source);
    });
    const buffers = await Promise.all(
      additions.map((source) => this.loadBuffer(source.clipId, context)),
    );

    if (
      this.disposed ||
      !this.desiredRunning ||
      version !== this.sceneVersion ||
      context !== this.context ||
      output !== this.masterCompressor
    ) {
      return false;
    }

    const staged = new Map<string, SourceGraph>();
    try {
      for (let index = 0; index < additions.length; index += 1) {
        const source = additions[index]!;
        const graph = new SourceGraph(
          context,
          output,
          source,
          scene.listener,
          buffers[index]!,
          this.mode,
          scene.settings.hrtfEnabled,
        );
        staged.set(source.id, graph);
        this.sourceStarts += 1;
      }
    } catch (error) {
      for (const graph of staged.values()) graph.dispose();
      throw error;
    }

    if (
      this.disposed ||
      !this.desiredRunning ||
      version !== this.sceneVersion ||
      context !== this.context ||
      output !== this.masterCompressor
    ) {
      for (const graph of staged.values()) graph.dispose();
      return false;
    }

    const activeSourceIds = new Set(scene.sources.map(({ id }) => id));
    for (const [sourceId, graph] of this.sourceGraphs) {
      if (!activeSourceIds.has(sourceId) || staged.has(sourceId)) {
        graph.dispose();
        this.sourceGraphs.delete(sourceId);
      }
    }
    for (const [sourceId, graph] of staged) {
      this.sourceGraphs.set(sourceId, graph);
    }
    return true;
  }

  private loadBuffer(
    clipId: string,
    context: AudioContextLike,
  ): Promise<AudioBufferLike> {
    const cached = this.bufferCache.get(clipId);
    if (cached) return cached;
    const asset = ASSET_BY_ID.get(clipId);
    if (!asset) return Promise.reject(new Error(`Unknown local audio asset: ${clipId}`));
    const loading = this.fetchArrayBuffer(asset.url)
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (buffer.numberOfChannels !== 1) {
          throw new Error(`Audio asset ${clipId} must decode as mono.`);
        }
        return buffer;
      })
      .catch((error: unknown) => {
        if (this.bufferCache.get(clipId) === loading) {
          this.bufferCache.delete(clipId);
        }
        throw error;
      });
    this.bufferCache.set(clipId, loading);
    return loading;
  }

  private applySourceParameters(scene: SceneSpec, context: AudioContextLike): void {
    const hasMatchingFrame = this.latestAcousticFrame?.revision === scene.revision;
    for (const source of scene.sources) {
      this.sourceGraphs.get(source.id)?.apply(
        source,
        scene.listener,
        context.currentTime,
        scene.settings.hrtfEnabled,
        !hasMatchingFrame,
      );
    }
  }

  private applyFrameParameters(
    frame: AcousticFrame,
    scene: SceneSpec,
    context: AudioContextLike,
  ): void {
    if (frame.revision !== scene.revision) return;
    for (const sourceFrame of frame.sources) {
      this.sourceGraphs.get(sourceFrame.sourceId)?.applyFrame(
        sourceFrame,
        scene.listener,
        context.currentTime,
      );
    }
  }

  private applyListener(scene: SceneSpec, context: AudioContextLike): void {
    const listener = context.listener;
    const now = context.currentTime;
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

  private requestScene(scene: SceneSpec): void {
    this.desiredScene = scene;
    this.sceneVersion += 1;
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const scheduled = this.operationTail.then(operation);
    this.operationTail = scheduled.catch(() => undefined);
    return scheduled;
  }

  private async reconcile(): Promise<void> {
    while (!this.disposed) {
      if (!this.desiredRunning) {
        if (this.context) this.status = "suspended";
        return;
      }
      const scene = this.desiredScene;
      if (!scene) return;
      const version = this.sceneVersion;
      const context = this.ensureContext();
      const committed = await this.syncSourceGraphs(scene, version, context);
      if (this.disposed) return;
      if (!this.desiredRunning) {
        this.status = "suspended";
        return;
      }
      if (!committed || version !== this.sceneVersion) continue;

      this.applyListener(scene, context);
      this.applySourceParameters(scene, context);
      if (this.latestAcousticFrame?.revision === scene.revision) {
        this.applyFrameParameters(this.latestAcousticFrame, scene, context);
      }
      this.applyMode();
      this.error = null;

      if (!this.desiredRunning) {
        this.status = "suspended";
        return;
      }
      if (context.state !== "running") await context.resume();
      if (this.disposed) return;
      if (!this.desiredRunning) {
        this.status = "suspended";
        return;
      }
      if (version !== this.sceneVersion) continue;
      this.status = "running";
      this.hasSuccessfullyStarted = true;
      return;
    }
  }

  private recordError(error: unknown, fallback: string): void {
    if (this.disposed) return;
    this.status = "error";
    this.error = error instanceof Error ? error.message : fallback;
  }
}
