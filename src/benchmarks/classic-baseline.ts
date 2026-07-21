import { computeAcousticFrame, type AcousticFrame } from "@/acoustics/compute-frame";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { HARD_ROOM_PRESET } from "@/domain/presets/hard-room";
import { STRESS_100_WALLS_PRESET } from "@/domain/presets/stress-100-walls";
import { TREATED_ROOM_PRESET } from "@/domain/presets/treated-room";
import type { SceneSpec } from "@/domain/scene/types";

export const CLASSIC_BASELINE_SCENARIO_COUNT = 10;

type ClassicBaselineScenario = Readonly<{
  id: string;
  scene: SceneSpec;
}>;

type JsonNumber = number;

export type ClassicBaselineSnapshot = Readonly<{
  id: string;
  room: Readonly<{
    volumeM3: JsonNumber;
    rt60S: Readonly<{ low: JsonNumber; mid: JsonNumber; high: JsonNumber }>;
  }>;
  sources: readonly Readonly<{
    id: string;
    routeType: "direct" | "portal" | "blocked";
    directVisible: boolean;
    physicalDistanceM: JsonNumber;
    effectiveDistanceM: JsonNumber;
    dryGainDb: JsonNumber;
    lowpassHz: JsonNumber;
    virtualPosition: Readonly<{ x: JsonNumber; y: JsonNumber }>;
    occluderWallIds: readonly string[];
    portalIds: readonly string[];
    earlyReflections: readonly Readonly<{
      wallId: string;
      pathLengthM: JsonNumber;
      delayMs: JsonNumber;
      gainDb: JsonNumber;
    }>[];
  }>[];
}>;

function cloneScene(scene: SceneSpec, revision: number): SceneSpec {
  const clone = structuredClone(scene);
  clone.revision = revision;
  return clone;
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function projectFrame(id: string, frame: AcousticFrame): ClassicBaselineSnapshot {
  return {
    id,
    room: {
      volumeM3: round(frame.room.volumeM3),
      rt60S: {
        low: round(frame.room.rt60S.low),
        mid: round(frame.room.rt60S.mid),
        high: round(frame.room.rt60S.high),
      },
    },
    sources: frame.sources.map((source) => ({
      id: source.sourceId,
      routeType: source.routeType,
      directVisible: source.directVisible,
      physicalDistanceM: round(source.physicalDistanceM),
      effectiveDistanceM: round(source.effectiveDistanceM),
      dryGainDb: round(source.dryGainDb),
      lowpassHz: round(source.lowpassHz),
      virtualPosition: { x: round(source.virtualPosition.x), y: round(source.virtualPosition.y) },
      occluderWallIds: [...source.occluderWallIds],
      portalIds: [...source.portalIds],
      earlyReflections: source.earlyReflections.map((reflection) => ({
        wallId: reflection.wallId,
        pathLengthM: round(reflection.pathLengthM),
        delayMs: round(reflection.delayMs),
        gainDb: round(reflection.gainDb),
      })),
    })),
  };
}

function scenarios(): readonly ClassicBaselineScenario[] {
  const concrete = cloneScene(CONCRETE_PARTITION_PRESET, 100);
  const closedPortal = cloneScene(CONCRETE_PARTITION_PRESET, 101);
  closedPortal.portals[0]!.open = false;
  const concretePortal = cloneScene(CONCRETE_PARTITION_PRESET, 102);
  concretePortal.listener.position = { x: 3, y: 1.5 };
  const concretePortalClosed = cloneScene(concretePortal, 103);
  concretePortalClosed.portals[0]!.open = false;
  const concreteMoved = cloneScene(CONCRETE_PARTITION_PRESET, 104);
  concreteMoved.listener.position = { x: 2.5, y: 6.4 };
  const hard = cloneScene(HARD_ROOM_PRESET, 105);
  const hardMoved = cloneScene(HARD_ROOM_PRESET, 106);
  hardMoved.listener.position = { x: 2, y: 2 };
  const treated = cloneScene(TREATED_ROOM_PRESET, 107);
  const treatedMoved = cloneScene(TREATED_ROOM_PRESET, 108);
  treatedMoved.sources[0]!.position = { x: 6, y: 6.5 };
  const stress = cloneScene(STRESS_100_WALLS_PRESET, 109);

  return [
    { id: "C001_CONCRETE_DEFAULT", scene: concrete },
    { id: "C002_CONCRETE_CLOSED_PORTAL", scene: closedPortal },
    { id: "C003_CONCRETE_PORTAL_ROUTE", scene: concretePortal },
    { id: "C004_CONCRETE_BLOCKED", scene: concretePortalClosed },
    { id: "C005_CONCRETE_MOVED_LISTENER", scene: concreteMoved },
    { id: "C006_HARD_ROOM", scene: hard },
    { id: "C007_HARD_ROOM_MOVED_LISTENER", scene: hardMoved },
    { id: "C008_TREATED_ROOM", scene: treated },
    { id: "C009_TREATED_ROOM_MOVED_SOURCE", scene: treatedMoved },
    { id: "C010_STRESS_100_WALLS", scene: stress },
  ];
}

/** A stable, rounded projection used as the non-negotiable Classic regression oracle. */
export function captureClassicBaseline(): readonly ClassicBaselineSnapshot[] {
  return scenarios().map(({ id, scene }) => projectFrame(id, computeAcousticFrame(scene, 0)));
}
