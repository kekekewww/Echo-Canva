import { distance, traceDirectPath } from "@/acoustics/geometry";
import { findFirstOrderReflections } from "@/acoustics/image-source";
import { estimateDirectOcclusion } from "@/acoustics/occlusion";
import { findBestPortalRoute } from "@/acoustics/portal";
import { estimateRoomAcoustics } from "@/acoustics/room-acoustics";
import type { ReflectionTap, RoomAcousticFrame } from "@/acoustics/types";
import type { SceneSpec, Vec2 } from "@/domain/scene/types";

export type AcousticFrameSource = Readonly<{
  sourceId: string;
  routeType: "direct" | "portal" | "blocked";
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

export type AcousticEarlyReflection = ReflectionTap;

export type AcousticFrame = Readonly<{
  revision: number;
  generatedAtMs: number;
  room: RoomAcousticFrame;
  sources: readonly AcousticFrameSource[];
}>;

export function computeAcousticFrame(
  scene: SceneSpec,
  generatedAtMs = 0,
): AcousticFrame {
  const room = estimateRoomAcoustics(scene);

  return {
    revision: scene.revision,
    generatedAtMs,
    room,
    sources: scene.sources.map((source) => {
      const trace = traceDirectPath(source.position, scene.listener.position, scene);
      const occlusion = estimateDirectOcclusion(trace);
      const portalRoute = trace.visible
        ? null
        : findBestPortalRoute(source.position, scene.listener.position, scene);
      const physicalDistanceM = distance(source.position, scene.listener.position);

      return {
        sourceId: source.id,
        routeType: trace.visible ? "direct" : portalRoute === null ? "blocked" : "portal",
        directVisible: trace.visible,
        physicalDistanceM,
        effectiveDistanceM: portalRoute?.effectiveDistanceM ?? physicalDistanceM,
        dryGainDb: portalRoute?.dryGainDb ?? occlusion.dryGainDb,
        lowpassHz: portalRoute?.lowpassHz ?? occlusion.lowpassHz,
        reverbSendDb: 0,
        virtualPosition: portalRoute?.virtualPosition ?? source.position,
        occluderWallIds: occlusion.occluderWallIds,
        portalIds: portalRoute?.portalIds ?? [],
        routePolyline: portalRoute?.polyline ?? trace.polyline,
        earlyReflections: findFirstOrderReflections(
          source.position,
          scene.listener.position,
          scene,
          scene.settings.maxEarlyReflections,
        ),
      };
    }),
  };
}
