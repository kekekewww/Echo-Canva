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

export type ClassicStaticContext = Readonly<{
  fingerprint: string;
  scene: Omit<SceneSpec, "revision" | "listener" | "sources">;
}>;

export type ClassicPoseSnapshot = Readonly<{
  revision: number;
  staticFingerprint: string;
  listener: SceneSpec["listener"];
  sources: readonly SceneSpec["sources"][number][];
}>;

export type ClassicSourceResult = Readonly<{
  sourceId: string;
  revision: number;
  staticFingerprint: string;
  frame: AcousticFrameSource;
}>;

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createClassicStaticContext(scene: SceneSpec): ClassicStaticContext {
  const staticScene: ClassicStaticContext["scene"] = {
    schemaVersion: scene.schemaVersion,
    units: scene.units,
    name: scene.name,
    room: scene.room,
    walls: scene.walls,
    portals: scene.portals,
    settings: scene.settings,
  };
  return {
    fingerprint: fnv1a(JSON.stringify(staticScene)),
    scene: staticScene,
  };
}

export function createClassicPoseSnapshot(scene: SceneSpec): ClassicPoseSnapshot {
  return {
    revision: scene.revision,
    staticFingerprint: createClassicStaticContext(scene).fingerprint,
    listener: scene.listener,
    sources: scene.sources,
  };
}

export function computeClassicSourceFrame(
  source: SceneSpec["sources"][number],
  listener: SceneSpec["listener"],
  context: ClassicStaticContext,
): AcousticFrameSource {
  const scene: SceneSpec = {
    ...context.scene,
    revision: 0,
    listener,
    sources: [source],
  };
  const trace = traceDirectPath(source.position, listener.position, scene);
  const occlusion = estimateDirectOcclusion(trace);
  const portalRoute = trace.visible
    ? null
    : findBestPortalRoute(source.position, listener.position, scene);
  const physicalDistanceM = distance(source.position, listener.position);
  const effectiveDistanceM = portalRoute?.effectiveDistanceM ?? physicalDistanceM;
  const earlyReflections = findFirstOrderReflections(
    source.position,
    listener.position,
    scene,
    scene.settings.maxEarlyReflections,
  ).map((tap) => ({
    ...tap,
    delayMs: Math.max(0, ((tap.pathLengthM - effectiveDistanceM) / 343) * 1000),
  }));

  return {
    sourceId: source.id,
    routeType: trace.visible ? "direct" : portalRoute === null ? "blocked" : "portal",
    directVisible: trace.visible,
    physicalDistanceM,
    effectiveDistanceM,
    dryGainDb: portalRoute?.dryGainDb ?? occlusion.dryGainDb,
    lowpassHz: portalRoute?.lowpassHz ?? occlusion.lowpassHz,
    reverbSendDb: 0,
    virtualPosition: portalRoute?.virtualPosition ?? source.position,
    occluderWallIds: occlusion.occluderWallIds,
    portalIds: portalRoute?.portalIds ?? [],
    routePolyline: portalRoute?.polyline ?? trace.polyline,
    earlyReflections,
  };
}

export function computeClassicSourceResults(
  context: ClassicStaticContext,
  snapshot: ClassicPoseSnapshot,
  sourceIds: readonly string[],
): readonly ClassicSourceResult[] {
  if (snapshot.staticFingerprint !== context.fingerprint) {
    throw new Error("Classic pose snapshot static fingerprint does not match the installed context.");
  }
  const requested = new Set<string>();
  const sourcesById = new Map(snapshot.sources.map((source) => [source.id, source]));
  return sourceIds.map((sourceId) => {
    if (requested.has(sourceId)) throw new Error(`Duplicate Classic source ID requested: ${sourceId}`);
    requested.add(sourceId);
    const source = sourcesById.get(sourceId);
    if (!source) throw new Error(`Unknown Classic source ID requested: ${sourceId}`);
    return {
      sourceId,
      revision: snapshot.revision,
      staticFingerprint: context.fingerprint,
      frame: computeClassicSourceFrame(source, snapshot.listener, context),
    };
  });
}

export function assembleAcousticFrame(
  snapshot: ClassicPoseSnapshot,
  room: RoomAcousticFrame,
  results: readonly ClassicSourceResult[],
  generatedAtMs: number,
): AcousticFrame {
  const expectedIds = new Set(snapshot.sources.map(({ id }) => id));
  const byId = new Map<string, AcousticFrameSource>();
  for (const result of results) {
    if (!expectedIds.has(result.sourceId)) {
      throw new Error(`Unknown Classic source result: ${result.sourceId}`);
    }
    if (byId.has(result.sourceId)) {
      throw new Error(`Duplicate Classic source result: ${result.sourceId}`);
    }
    if (result.revision !== snapshot.revision) {
      throw new Error(`Classic source result revision mismatch for ${result.sourceId}.`);
    }
    if (result.staticFingerprint !== snapshot.staticFingerprint) {
      throw new Error(`Classic source result static fingerprint mismatch for ${result.sourceId}.`);
    }
    if (result.frame.sourceId !== result.sourceId) {
      throw new Error(`Classic source result payload ID mismatch for ${result.sourceId}.`);
    }
    byId.set(result.sourceId, result.frame);
  }
  const missingIds = snapshot.sources
    .map(({ id }) => id)
    .filter((sourceId) => !byId.has(sourceId));
  if (missingIds.length > 0) {
    throw new Error(`Missing Classic source results: ${missingIds.join(", ")}`);
  }
  return {
    revision: snapshot.revision,
    generatedAtMs,
    room,
    sources: snapshot.sources.map(({ id }) => byId.get(id)!),
  };
}

export function computeAcousticFrame(
  scene: SceneSpec,
  generatedAtMs = 0,
): AcousticFrame {
  const context = createClassicStaticContext(scene);
  const snapshot = createClassicPoseSnapshot(scene);
  const room = estimateRoomAcoustics(scene);
  const results = computeClassicSourceResults(
    context,
    snapshot,
    snapshot.sources.map(({ id }) => id),
  );
  return assembleAcousticFrame(snapshot, room, results, generatedAtMs);
}
