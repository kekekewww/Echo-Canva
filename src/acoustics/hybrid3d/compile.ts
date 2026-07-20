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
import { primitivePatches } from "@/acoustics/hybrid3d/primitives";

export type HybridGeometry = Readonly<{
  document: SceneDocumentV2;
  staticGeometryHash: string;
  patches: readonly AcousticPatch3[];
  bvh: PatchBvh;
  listenerPosition: Vec3;
  sourcePositions: Readonly<Record<string, Vec3>>;
}>;

export type HybridStaticGeometry = Readonly<{
  staticGeometryHash: string;
  patches: readonly AcousticPatch3[];
  bvh: PatchBvh;
}>;

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function planPointToWorld(point: Readonly<{ x: number; y: number }>, heightM: number): Vec3 {
  return { x: point.x, y: heightM, z: point.y };
}

function requireSpatialDocument(document: SceneDocumentV2): NonNullable<SceneDocumentV2["extensions"]["spatial3d"]> {
  const spatial = document.extensions.spatial3d;
  if (!spatial) throw new Error("Hybrid 3D geometry requires a spatial3d extension.");
  return spatial;
}

/** Fingerprint only the fields that change finite static patches or their BVH. */
export function hybridStaticGeometryHash(document: SceneDocumentV2): string {
  const spatial = requireSpatialDocument(document);
  const scene = document.baseScene;
  return fnv1a(JSON.stringify({
    room: scene.room,
    floorElevationM: spatial.floorElevationM,
    disabledSurfaceIds: [...(spatial.disabledSurfaceIds ?? [])].toSorted(),
    walls: scene.walls.map((wall) => ({
      ...wall,
      vertical: spatial.wallVerticalBoundsM?.[wall.id] ?? null,
    })),
    portals: scene.portals.map((portal) => ({
      id: portal.id,
      wallId: portal.wallId,
      center: portal.center,
      widthM: portal.widthM,
      heightM: portal.heightM,
      open: portal.open,
      vertical: spatial.portalVerticalBoundsM?.[portal.id] ?? null,
    })),
    primitives: spatial.primitives ?? [],
  }));
}

function portalOpening(
  document: SceneDocumentV2,
  wall: SceneDocumentV2["baseScene"]["walls"][number],
  portal: SceneDocumentV2["baseScene"]["portals"][number],
): PortalOpening3 | null {
  if (portal.wallId !== wall.id) return null;
  const spatial = requireSpatialDocument(document);
  const vertical = spatial.portalVerticalBoundsM?.[portal.id];
  const along = normalize3({ x: wall.b.x - wall.a.x, y: 0, z: wall.b.y - wall.a.y });
  const bottomM = vertical?.bottomM ?? 0;
  const topM = vertical?.topM ?? portal.heightM;
  return {
    id: portal.id,
    wallId: wall.id,
    center: planPointToWorld(portal.center, spatial.floorElevationM + (bottomM + topM) * 0.5),
    along,
    widthM: portal.widthM,
    floorElevationM: spatial.floorElevationM + bottomM,
    heightM: topM - bottomM,
  };
}

function portalFramePatches(
  document: SceneDocumentV2,
  wall: SceneDocumentV2["baseScene"]["walls"][number],
  portal: SceneDocumentV2["baseScene"]["portals"][number],
  normal: Vec3,
): readonly AcousticPatch3[] {
  const spatial = requireSpatialDocument(document);
  const vertical = spatial.portalVerticalBoundsM?.[portal.id];
  const bottomY = spatial.floorElevationM + (vertical?.bottomM ?? 0);
  const topY = spatial.floorElevationM + (vertical?.topM ?? portal.heightM);
  const along = normalize3({ x: wall.b.x - wall.a.x, y: 0, z: wall.b.y - wall.a.y });
  const center = planPointToWorld(portal.center, bottomY);
  const halfWidth = portal.widthM * 0.5;
  const wallHalf = wall.thicknessM * 0.5;
  const left = add3(center, scale3(along, -halfWidth));
  const right = add3(center, scale3(along, halfWidth));
  const frontOffset = scale3(normal, wallHalf);
  const backOffset = scale3(normal, -wallHalf);
  const lift = { x: 0, y: topY - bottomY, z: 0 };
  const leftFront = add3(left, frontOffset);
  const leftBack = add3(left, backOffset);
  const rightFront = add3(right, frontOffset);
  const rightBack = add3(right, backOffset);
  const patches: AcousticPatch3[] = [
    makePatch3(`${portal.id}:jamb-left`, "wall", wall.materialId, [leftBack, leftFront, add3(leftFront, lift), add3(leftBack, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:jamb-right`, "wall", wall.materialId, [rightFront, rightBack, add3(rightBack, lift), add3(rightFront, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:sill`, "wall", wall.materialId, [leftBack, rightBack, rightFront, leftFront], { wallId: wall.id }),
    makePatch3(`${portal.id}:header`, "wall", wall.materialId, [add3(leftFront, lift), add3(rightFront, lift), add3(rightBack, lift), add3(leftBack, lift)], { wallId: wall.id }),
  ];
  if (portal.open) return patches;

  const slabHalf = (vertical?.thicknessM ?? wall.thicknessM) * 0.5;
  const slabFrontOffset = scale3(normal, slabHalf);
  const slabBackOffset = scale3(normal, -slabHalf);
  const slabLeftFront = add3(left, slabFrontOffset);
  const slabLeftBack = add3(left, slabBackOffset);
  const slabRightFront = add3(right, slabFrontOffset);
  const slabRightBack = add3(right, slabBackOffset);
  patches.push(
    makePatch3(`${portal.id}:slab-face-front`, "wall", wall.materialId, [slabLeftFront, slabRightFront, add3(slabRightFront, lift), add3(slabLeftFront, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:slab-face-back`, "wall", wall.materialId, [slabRightBack, slabLeftBack, add3(slabLeftBack, lift), add3(slabRightBack, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:slab-side-left`, "wall", wall.materialId, [slabLeftBack, slabLeftFront, add3(slabLeftFront, lift), add3(slabLeftBack, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:slab-side-right`, "wall", wall.materialId, [slabRightFront, slabRightBack, add3(slabRightBack, lift), add3(slabRightFront, lift)], { wallId: wall.id }),
    makePatch3(`${portal.id}:slab-bottom`, "wall", wall.materialId, [slabLeftBack, slabRightBack, slabRightFront, slabLeftFront], { wallId: wall.id }),
    makePatch3(`${portal.id}:slab-top`, "wall", wall.materialId, [add3(slabLeftFront, lift), add3(slabRightFront, lift), add3(slabRightBack, lift), add3(slabLeftBack, lift)], { wallId: wall.id }),
  );
  return patches;
}

function wallPatches(document: SceneDocumentV2): readonly AcousticPatch3[] {
  const spatial = requireSpatialDocument(document);
  const scene = document.baseScene;
  const patches: AcousticPatch3[] = [];
  for (const wall of scene.walls) {
    const vertical = spatial.wallVerticalBoundsM?.[wall.id];
    const bottomY = spatial.floorElevationM + (vertical?.bottomM ?? 0);
    const topY = spatial.floorElevationM + (vertical?.topM ?? scene.room.heightM);
    const a = planPointToWorld(wall.a, bottomY);
    const b = planPointToWorld(wall.b, bottomY);
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
    const lift = { x: 0, y: topY - bottomY, z: 0 };
    patches.push(
      makePatch3(`${wall.id}:front`, "wall", wall.materialId, [frontA, frontB, add3(frontB, lift), add3(frontA, lift)], {
        wallId: wall.id,
        openings,
      }),
      makePatch3(`${wall.id}:back`, "wall", wall.materialId, [backB, backA, add3(backA, lift), add3(backB, lift)], {
        wallId: wall.id,
        openings,
      }),
      makePatch3(`${wall.id}:end-a`, "wall", wall.materialId, [backA, frontA, add3(frontA, lift), add3(backA, lift)], { wallId: wall.id }),
      makePatch3(`${wall.id}:end-b`, "wall", wall.materialId, [frontB, backB, add3(backB, lift), add3(frontB, lift)], { wallId: wall.id }),
      makePatch3(`${wall.id}:bottom`, "wall", wall.materialId, [backA, backB, frontB, frontA], { wallId: wall.id }),
      makePatch3(`${wall.id}:top`, "wall", wall.materialId, [add3(frontA, lift), add3(frontB, lift), add3(backB, lift), add3(backA, lift)], { wallId: wall.id }),
    );
    for (const portal of scene.portals.filter(({ wallId }) => wallId === wall.id)) {
      patches.push(...portalFramePatches(document, wall, portal, normal));
    }
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
  const disabledSurfaces = new Set(spatial.disabledSurfaceIds ?? []);
  const patches = [
    makePatch3("floor", "floor", scene.room.floorMaterialId, floor),
    ...(disabledSurfaces.has("ceiling") ? [] : [makePatch3("ceiling", "ceiling", scene.room.ceilingMaterialId, ceiling)]),
    ...wallPatches(document),
    ...(spatial.primitives ?? []).flatMap(primitivePatches),
  ];
  return {
    staticGeometryHash: hybridStaticGeometryHash(document),
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
  if (structure.staticGeometryHash !== hybridStaticGeometryHash(document)) {
    throw new Error("Hybrid 3D static geometry cannot be reused after a geometry change.");
  }
  const sourcePositions = Object.fromEntries(
    scene.sources.map((source) => [
      source.id,
      planPointToWorld(source.position, spatial.sourceHeightsM[source.id] ?? spatial.listenerHeightM),
    ]),
  );
  return {
    document,
    staticGeometryHash: structure.staticGeometryHash,
    patches: structure.patches,
    bvh: structure.bvh,
    listenerPosition: planPointToWorld(scene.listener.position, spatial.listenerHeightM),
    sourcePositions,
  };
}

export function compileHybridGeometry(document: SceneDocumentV2): HybridGeometry {
  return bindHybridPoses(compileHybridStaticGeometry(document), document);
}

export function createHybridGeometryCompiler(
  compileStatic: (document: SceneDocumentV2) => HybridStaticGeometry = compileHybridStaticGeometry,
): Readonly<{ compile: (document: SceneDocumentV2) => HybridGeometry }> {
  let cached: HybridStaticGeometry | null = null;
  return {
    compile(document): HybridGeometry {
      const hash = hybridStaticGeometryHash(document);
      if (!cached || cached.staticGeometryHash !== hash) cached = compileStatic(document);
      return bindHybridPoses(cached, document);
    },
  };
}
