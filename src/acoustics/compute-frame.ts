import { distance, traceDirectPath } from "@/acoustics/geometry";
import { estimateDirectOcclusion } from "@/acoustics/occlusion";
import type { Band3, SceneSpec, Vec2 } from "@/domain/scene/types";

export type AcousticFrameSource = Readonly<{
  sourceId: string;
  routeType: "direct" | "blocked";
  directVisible: boolean;
  physicalDistanceM: number;
  effectiveDistanceM: number;
  dryGainDb: number;
  lowpassHz: number;
  reverbSendDb: number;
  virtualPosition: Vec2;
  occluderWallIds: readonly string[];
  portalIds: readonly string[];
  routePolyline: readonly Vec2[];
  earlyReflections: readonly AcousticEarlyReflection[];
}>;

export type AcousticEarlyReflection = Readonly<{
  wallId: string;
  reflectionPoint: Vec2;
  pathLengthM: number;
  delayMs: number;
  gainDb: number;
  lowpassHz: number;
}>;

export type AcousticFrame = Readonly<{
  revision: number;
  generatedAtMs: number;
  room: Readonly<{
    volumeM3: number;
    totalSurfaceM2: number;
    rt60S: Band3;
    preDelayMs: number;
  }>;
  sources: readonly AcousticFrameSource[];
}>;

const EMPTY_ROOM = {
  volumeM3: 0,
  totalSurfaceM2: 0,
  rt60S: { low: 0, mid: 0, high: 0 },
  preDelayMs: 0,
} as const;

export function computeAcousticFrame(
  scene: SceneSpec,
  generatedAtMs = 0,
): AcousticFrame {
  return {
    revision: scene.revision,
    generatedAtMs,
    room: EMPTY_ROOM,
    sources: scene.sources.map((source) => {
      const trace = traceDirectPath(source.position, scene.listener.position, scene);
      const occlusion = estimateDirectOcclusion(trace);
      const physicalDistanceM = distance(source.position, scene.listener.position);

      return {
        sourceId: source.id,
        routeType: trace.visible ? "direct" : "blocked",
        directVisible: trace.visible,
        physicalDistanceM,
        effectiveDistanceM: physicalDistanceM,
        dryGainDb: occlusion.dryGainDb,
        lowpassHz: occlusion.lowpassHz,
        reverbSendDb: 0,
        virtualPosition: source.position,
        occluderWallIds: occlusion.occluderWallIds,
        portalIds: [],
        routePolyline: trace.polyline,
        earlyReflections: [],
      };
    }),
  };
}
