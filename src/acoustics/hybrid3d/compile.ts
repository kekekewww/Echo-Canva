import { buildPatchBvh, type PatchBvh } from "@/acoustics/hybrid3d/bvh";
import {
  add3,
  makePatch3,
  normalize3,
  scale3,
  type AcousticPatch3,
  type PortalOpening3,
  type Vec3,
} from "@/acoustics/hybrid3d/geometry";
import { isSceneDocumentV2 } from "@/domain/scene-document/validate";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";

export type HybridGeometry = Readonly<{
  document: SceneDocumentV2;
  patches: readonly AcousticPatch3[];
  bvh: PatchBvh;
  listenerPosition: Vec3;
  sourcePositions: Readonly<Record<string, Vec3>>;
}>;

export type HybridStaticGeometry = Readonly<{
  baseSceneHash: string;
  patches: readonly AcousticPatch3[];
  bvh: PatchBvh;
}>;

function planPointToWorld(point: Readonly<{ x: number; y: number }>, heightM: number): Vec3 {
  return { x: point.x, y: heightM, z: point.y };
}

function requireSpatialDocument(document: SceneDocumentV2): NonNullable<SceneDocumentV2["extensions"]["spatial3d"]> {
  const spatial = document.extensions.spatial3d;
  if (!spatial) throw new Error("Hybrid 3D geometry requires a spatial3d extension.");
  return spatial;
}

function portalOpening(
  document: SceneDocumentV2,
  wall: SceneDocumentV2["baseScene"]["walls"][number],
  portal: SceneDocumentV2["baseScene"]["portals"][number],
): PortalOpening3 | null {
  if (!portal.open || portal.wallId !== wall.id) return null;
  const spatial = requireSpatialDocument(document);
  const along = normalize3({ x: wall.b.x - wall.a.x, y: 0, z: wall.b.y - wall.a.y });
  return {
    id: portal.id,
    wallId: wall.id,
    center: planPointToWorld(portal.center, spatial.floorElevationM + portal.heightM * 0.5),
    along,
    widthM: portal.widthM,
    floorElevationM: spatial.floorElevationM,
    heightM: portal.heightM,
  };
}

function wallPatches(document: SceneDocumentV2): readonly AcousticPatch3[] {
  const spatial = requireSpatialDocument(document);
  const scene = document.baseScene;
  const topY = spatial.floorElevationM + scene.room.heightM;
  const patches: AcousticPatch3[] = [];
  for (const wall of scene.walls) {
    const a = planPointToWorld(wall.a, spatial.floorElevationM);
    const b = planPointToWorld(wall.b, spatial.floorElevationM);
    const along = normalize3({ x: b.x - a.x, y: 0, z: b.z - a.z });
    const normal = { x: -along.z, y: 0, z: along.x };
    const offset = scale3(normal, wall.thicknessM * 0.5);
    const openings = scene.portals
      .map((portal) => portalOpening(document, wall, portal))
      .filter((opening): opening is PortalOpening3 => opening !== null);
    const frontA = add3(a, offset);
    const frontB = add3(b, offset);
    const backA = add3(a, scale3(offset, -1));
    const backB = add3(b, scale3(offset, -1));
    const lift = { x: 0, y: topY - spatial.floorElevationM, z: 0 };
    patches.push(
      makePatch3(`${wall.id}:front`, "wall", wall.materialId, [frontA, frontB, add3(frontB, lift), add3(frontA, lift)], {
        wallId: wall.id,
        openings,
      }),
      makePatch3(`${wall.id}:back`, "wall", wall.materialId, [backB, backA, add3(backA, lift), add3(backB, lift)], {
        wallId: wall.id,
        openings,
      }),
    );
  }
  return patches;
}

export function compileHybridStaticGeometry(document: SceneDocumentV2): HybridStaticGeometry {
  if (!isSceneDocumentV2(document)) throw new Error("Hybrid 3D geometry needs a v2 scene document.");
  const spatial = requireSpatialDocument(document);
  const scene = document.baseScene;
  const floor = scene.room.outerPolygon.map((point) => planPointToWorld(point, spatial.floorElevationM));
  const ceiling = scene.room.outerPolygon
    .map((point) => planPointToWorld(point, spatial.floorElevationM + scene.room.heightM))
    .reverse();
  const patches = [
    makePatch3("floor", "floor", scene.room.floorMaterialId, floor),
    makePatch3("ceiling", "ceiling", scene.room.ceilingMaterialId, ceiling),
    ...wallPatches(document),
  ];
  return {
    baseSceneHash: document.compatibility.classicProjectionHash,
    patches,
    bvh: buildPatchBvh(patches),
  };
}

export function bindHybridPoses(
  structure: HybridStaticGeometry,
  document: SceneDocumentV2,
): HybridGeometry {
  const spatial = requireSpatialDocument(document);
  const scene = document.baseScene;
  if (structure.baseSceneHash !== document.compatibility.classicProjectionHash) {
    throw new Error("Hybrid 3D static geometry cannot be reused for a different Classic projection.");
  }
  const sourcePositions = Object.fromEntries(
    scene.sources.map((source) => [
      source.id,
      planPointToWorld(source.position, spatial.sourceHeightsM[source.id] ?? spatial.listenerHeightM),
    ]),
  );
  return {
    document,
    patches: structure.patches,
    bvh: structure.bvh,
    listenerPosition: planPointToWorld(scene.listener.position, spatial.listenerHeightM),
    sourcePositions,
  };
}

export function compileHybridGeometry(document: SceneDocumentV2): HybridGeometry {
  return bindHybridPoses(compileHybridStaticGeometry(document), document);
}
