import { ACOUSTIC_EPSILON, distance } from "@/acoustics/geometry";
import type { RoomAcousticFrame } from "@/acoustics/types";
import type { Band3, SceneSpec, Vec2 } from "@/domain/scene/types";
import { MATERIALS, type AcousticMaterial } from "@/domain/materials/registry";

const SPEED_OF_SOUND_MPS = 343;
const MIN_RT60_S = 0.12;
const MAX_RT60_S = 4;
const MIN_PRE_DELAY_MS = 5;
const MAX_PRE_DELAY_MS = 80;
const BANDS = ["low", "mid", "high"] as const;

type Surface = Readonly<{
  areaM2: number;
  material: AcousticMaterial | null;
  wallId?: string;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function materialFor(materialId: string): AcousticMaterial {
  const material = MATERIALS.find((candidate) => candidate.id === materialId);
  if (material === undefined) {
    throw new Error(`Unknown acoustic material: ${materialId}`);
  }

  return material;
}

function polygonArea(vertices: readonly Vec2[]): number {
  if (vertices.length < 3) {
    return 0;
  }

  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const point = vertices[index]!;
    const next = vertices[(index + 1) % vertices.length]!;
    twiceArea += point.x * next.y - next.x * point.y;
  }

  return Math.abs(twiceArea) * 0.5;
}

function pointsMatch(a: Vec2, b: Vec2): boolean {
  return distance(a, b) <= ACOUSTIC_EPSILON;
}

function boundaryWallForEdge(
  a: Vec2,
  b: Vec2,
  scene: SceneSpec,
): SceneSpec["walls"][number] | undefined {
  return scene.walls
    .filter((wall) => wall.kind === "boundary")
    .filter((wall) =>
      (pointsMatch(wall.a, a) && pointsMatch(wall.b, b)) ||
      (pointsMatch(wall.a, b) && pointsMatch(wall.b, a)),
    )
    .sort((left, right) => left.id.localeCompare(right.id))[0];
}

function exteriorSurfaces(scene: SceneSpec): readonly Surface[] {
  const { outerPolygon, heightM } = scene.room;
  return outerPolygon.flatMap((point, index): Surface[] => {
    const next = outerPolygon[(index + 1) % outerPolygon.length]!;
    const areaM2 = distance(point, next) * heightM;
    if (areaM2 <= ACOUSTIC_EPSILON) {
      return [];
    }

    const wall = boundaryWallForEdge(point, next, scene);
    return [{
      areaM2,
      material: wall === undefined ? null : materialFor(wall.materialId),
      wallId: wall?.id,
    }];
  });
}

function partitionSurface(wall: SceneSpec["walls"][number], heightM: number): number {
  return distance(wall.a, wall.b) * heightM * 2;
}

function portalOpeningArea(
  wall: SceneSpec["walls"][number],
  scene: SceneSpec,
  surfaceAreaM2: number,
): number {
  const wallFaces = wall.kind === "partition" ? 2 : 1;
  const openings = scene.portals
    .filter((portal) => portal.open && portal.wallId === wall.id)
    .reduce(
      (total, portal) => total + portal.widthM * Math.min(portal.heightM, scene.room.heightM) * wallFaces,
      0,
    );
  return clamp(openings, 0, surfaceAreaM2);
}

function eyringRt60(volumeM3: number, surfaceM2: number, meanAbsorption: number): number {
  const boundedAbsorption = clamp(meanAbsorption, 0, 1 - ACOUSTIC_EPSILON);
  const denominator = -surfaceM2 * Math.log(1 - boundedAbsorption);
  if (!Number.isFinite(denominator) || denominator <= ACOUSTIC_EPSILON || volumeM3 <= 0) {
    return MAX_RT60_S;
  }

  return clamp(0.161 * volumeM3 / denominator, MIN_RT60_S, MAX_RT60_S);
}

/** Estimates room-scale Eyring decay values for the interactive approximation. */
export function estimateRoomAcoustics(
  scene: SceneSpec,
  options: Readonly<{ ceilingEnabled?: boolean }> = {},
): RoomAcousticFrame {
  const areaM2 = polygonArea(scene.room.outerPolygon);
  const heightM = Math.max(0, scene.room.heightM);
  const volumeM3 = areaM2 * heightM;
  const floor = materialFor(scene.room.floorMaterialId);
  const ceiling = materialFor(scene.room.ceilingMaterialId);
  const surfaces: Surface[] = [
    { areaM2, material: floor },
    { areaM2, material: options.ceilingEnabled === false ? null : ceiling },
    ...exteriorSurfaces({ ...scene, room: { ...scene.room, heightM } }),
  ];

  for (const wall of scene.walls.filter((candidate) => candidate.kind === "partition")) {
    const surfaceAreaM2 = partitionSurface(wall, heightM);
    if (surfaceAreaM2 > ACOUSTIC_EPSILON) {
      surfaces.push({ areaM2: surfaceAreaM2, material: materialFor(wall.materialId), wallId: wall.id });
    }
  }

  const totalSurfaceM2 = surfaces.reduce((total, surface) => total + surface.areaM2, 0);
  const absorptionArea: Band3 = { low: 0, mid: 0, high: 0 };

  for (const surface of surfaces) {
    const wall = surface.wallId === undefined
      ? undefined
      : scene.walls.find((candidate) => candidate.id === surface.wallId);
    const openingAreaM2 = wall === undefined ? 0 : portalOpeningArea(wall, scene, surface.areaM2);
    for (const band of BANDS) {
      absorptionArea[band] += surface.material === null
        ? surface.areaM2
        : (surface.areaM2 - openingAreaM2) * surface.material.absorption[band] + openingAreaM2;
    }
  }

  const rt60S = BANDS.reduce<Band3>((result, band) => {
    result[band] = eyringRt60(volumeM3, totalSurfaceM2, absorptionArea[band] / totalSurfaceM2);
    return result;
  }, { low: 0, mid: 0, high: 0 });
  const preDelayMs = clamp((Math.sqrt(areaM2) / SPEED_OF_SOUND_MPS) * 1000, MIN_PRE_DELAY_MS, MAX_PRE_DELAY_MS);

  return { volumeM3, totalSurfaceM2, rt60S, preDelayMs };
}
