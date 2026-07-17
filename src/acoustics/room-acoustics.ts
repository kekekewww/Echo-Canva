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
  material: AcousticMaterial;
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

function polygonPerimeter(vertices: readonly Vec2[]): number {
  return vertices.reduce(
    (total, point, index) => total + distance(point, vertices[(index + 1) % vertices.length]!),
    0,
  );
}

function wallSurface(wall: SceneSpec["walls"][number], heightM: number): number {
  return distance(wall.a, wall.b) * heightM * (wall.kind === "partition" ? 2 : 1);
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
export function estimateRoomAcoustics(scene: SceneSpec): RoomAcousticFrame {
  const areaM2 = polygonArea(scene.room.outerPolygon);
  const perimeterM = polygonPerimeter(scene.room.outerPolygon);
  const heightM = Math.max(0, scene.room.heightM);
  const volumeM3 = areaM2 * heightM;
  const floor = materialFor(scene.room.floorMaterialId);
  const ceiling = materialFor(scene.room.ceilingMaterialId);
  const surfaces: Surface[] = [
    { areaM2, material: floor },
    { areaM2, material: ceiling },
  ];
  const boundaryLengthM = scene.walls
    .filter((wall) => wall.kind === "boundary")
    .reduce((total, wall) => total + distance(wall.a, wall.b), 0);

  for (const wall of scene.walls) {
    const surfaceAreaM2 = wallSurface(wall, heightM);
    if (surfaceAreaM2 > ACOUSTIC_EPSILON) {
      surfaces.push({ areaM2: surfaceAreaM2, material: materialFor(wall.materialId) });
    }
  }

  const uncoveredBoundaryM = Math.max(0, perimeterM - boundaryLengthM);
  if (uncoveredBoundaryM > ACOUSTIC_EPSILON) {
    surfaces.push({ areaM2: uncoveredBoundaryM * heightM, material: floor });
  }

  const totalSurfaceM2 = surfaces.reduce((total, surface) => total + surface.areaM2, 0);
  const absorptionArea: Band3 = { low: 0, mid: 0, high: 0 };

  for (const surface of surfaces) {
    for (const band of BANDS) {
      absorptionArea[band] += surface.areaM2 * surface.material.absorption[band];
    }
  }

  for (const wall of scene.walls) {
    const wallAreaM2 = wallSurface(wall, heightM);
    const openingAreaM2 = portalOpeningArea(wall, scene, wallAreaM2);
    if (openingAreaM2 <= ACOUSTIC_EPSILON) {
      continue;
    }

    const material = materialFor(wall.materialId);
    for (const band of BANDS) {
      absorptionArea[band] += openingAreaM2 * (1 - material.absorption[band]);
    }
  }

  const rt60S = BANDS.reduce<Band3>((result, band) => {
    result[band] = eyringRt60(volumeM3, totalSurfaceM2, absorptionArea[band] / totalSurfaceM2);
    return result;
  }, { low: 0, mid: 0, high: 0 });
  const preDelayMs = clamp((Math.sqrt(areaM2) / SPEED_OF_SOUND_MPS) * 1000, MIN_PRE_DELAY_MS, MAX_PRE_DELAY_MS);

  return { volumeM3, totalSurfaceM2, rt60S, preDelayMs };
}
