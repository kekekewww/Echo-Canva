import { z } from "zod";

import { sceneSpecSchema } from "@/domain/scene/schema";
import type { SceneValidationIssue, SceneSpec } from "@/domain/scene/types";
import { validateScene } from "@/domain/scene/validate";
import { isSafeModelLabel } from "@/ai/content-policy";
import { MATERIALS } from "@/domain/materials/registry";
import { primitiveFootprint } from "@/domain/workspace/primitives";
import type { GeneratedSpatial3D } from "@/domain/workspace/types";

const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);
const materialIdSchema = z.enum(MATERIALS.map(({ id }) => id) as [string, ...string[]]);
const primitiveSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(64),
  kind: z.enum(["box", "cylinder", "sphere"]),
  position: z.object({
    x: z.number().min(0).max(50),
    y: z.number().min(0).max(12),
    z: z.number().min(0).max(50),
  }).strict(),
  dimensions: z.object({
    x: z.number().min(0.1).max(50),
    y: z.number().min(0.1).max(12),
    z: z.number().min(0.1).max(50),
  }).strict(),
  rotationYDeg: z.number().min(-360).max(360),
  materialId: materialIdSchema,
}).strict();

export const generatedSpatial3dSchema = z.object({
  listenerHeightM: z.number().min(0.1).max(12),
  sourceHeights: z.array(z.object({
    sourceId: idSchema,
    heightM: z.number().min(0.1).max(12),
  }).strict()).max(4),
  wallVerticalBounds: z.array(z.object({
    wallId: idSchema,
    bottomM: z.number().min(0).max(12),
    topM: z.number().min(0.1).max(12),
  }).strict()).max(100),
  portalVerticalBounds: z.array(z.object({
    portalId: idSchema,
    bottomM: z.number().min(0).max(12),
    topM: z.number().min(0.1).max(12),
    thicknessM: z.number().min(0.02).max(2),
  }).strict()).max(8),
  primitives: z.array(primitiveSchema).max(8),
}).strict();

export const generatedHybridSceneSchema = z.object({
  scene: sceneSpecSchema,
  spatial3d: generatedSpatial3dSchema,
}).strict();

export const generatedHybridSceneJsonSchema = generatedHybridSceneSchema.toJSONSchema();

export type GeneratedHybridScene = Readonly<{
  scene: SceneSpec;
  spatial3d: GeneratedSpatial3D;
}>;

export type GeneratedHybridSceneValidation =
  | Readonly<{ ok: true; candidate: GeneratedHybridScene }>
  | Readonly<{ ok: false; errors: readonly SceneValidationIssue[] }>;

function issue(path: string, code: string, message: string): SceneValidationIssue {
  return { path, code, message };
}

function validateCoverage(
  path: string,
  expectedIds: readonly string[],
  actualIds: readonly string[],
): readonly SceneValidationIssue[] {
  const expected = new Set(expectedIds);
  const actual = new Set(actualIds);
  if (actual.size !== actualIds.length) {
    return [issue(path, "duplicate_id", `${path} must contain each referenced object exactly once.`)];
  }
  if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
    return [issue(path, "id_coverage_mismatch", `${path} must cover every generated object exactly once.`)];
  }
  return [];
}

function isOriginAnchoredRectangle(scene: SceneSpec): boolean {
  const points = scene.room.outerPolygon;
  if (points.length !== 4) return false;
  const maxX = Math.max(...points.map(({ x }) => x));
  const maxY = Math.max(...points.map(({ y }) => y));
  if (maxX <= 0 || maxY <= 0) return false;
  const expected = new Set([`0,0`, `${maxX},0`, `${maxX},${maxY}`, `0,${maxY}`]);
  return points.every(({ x, y }) => expected.delete(`${x},${y}`)) && expected.size === 0;
}

export function validateGeneratedHybridScene(input: unknown): GeneratedHybridSceneValidation {
  const parsed = generatedHybridSceneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(({ path, code, message }) => issue(path.join("."), code, message)),
    };
  }

  const sceneResult = validateScene(parsed.data.scene);
  if (!sceneResult.ok) return sceneResult;
  const scene = sceneResult.scene;
  const spatial3d = parsed.data.spatial3d;
  const errors: SceneValidationIssue[] = [];
  if (!isOriginAnchoredRectangle(scene)) {
    errors.push(issue(
      "scene.room.outerPolygon",
      "hybrid_room_must_be_rectangular",
      "Hybrid rooms must be an origin-anchored rectangle so 2D and 3D coordinates stay aligned.",
    ));
  }
  errors.push(
    ...validateCoverage("spatial3d.sourceHeights", scene.sources.map(({ id }) => id), spatial3d.sourceHeights.map(({ sourceId }) => sourceId)),
    ...validateCoverage("spatial3d.wallVerticalBounds", scene.walls.map(({ id }) => id), spatial3d.wallVerticalBounds.map(({ wallId }) => wallId)),
    ...validateCoverage("spatial3d.portalVerticalBounds", scene.portals.map(({ id }) => id), spatial3d.portalVerticalBounds.map(({ portalId }) => portalId)),
  );

  const ceiling = scene.room.heightM;
  if (spatial3d.listenerHeightM >= ceiling) {
    errors.push(issue("spatial3d.listenerHeightM", "height_out_of_room", "Listener height must be below the room ceiling."));
  }
  for (const [index, source] of spatial3d.sourceHeights.entries()) {
    if (source.heightM >= ceiling) {
      errors.push(issue(`spatial3d.sourceHeights.${index}.heightM`, "height_out_of_room", "Source height must be below the room ceiling."));
    }
  }
  const wallBounds = new Map(spatial3d.wallVerticalBounds.map((bounds) => [bounds.wallId, bounds]));
  for (const [index, wall] of spatial3d.wallVerticalBounds.entries()) {
    if (wall.topM > ceiling || wall.topM - wall.bottomM < 0.1) {
      errors.push(issue(`spatial3d.wallVerticalBounds.${index}`, "invalid_vertical_bounds", "Wall bounds must fit inside the room and be at least 0.1 m tall."));
    }
  }
  for (const [index, portal] of spatial3d.portalVerticalBounds.entries()) {
    const hostId = scene.portals.find(({ id }) => id === portal.portalId)?.wallId;
    const host = hostId ? wallBounds.get(hostId) : undefined;
    if (!host || portal.bottomM < host.bottomM || portal.topM > host.topM || portal.topM - portal.bottomM < 0.4) {
      errors.push(issue(`spatial3d.portalVerticalBounds.${index}`, "invalid_portal_bounds", "Portal bounds must fit inside the host wall and be at least 0.4 m tall."));
    }
  }
  const primitiveIds = new Set<string>();
  const roomWidthM = Math.max(...scene.room.outerPolygon.map(({ x }) => x));
  const roomDepthM = Math.max(...scene.room.outerPolygon.map(({ y }) => y));
  for (const [index, primitive] of spatial3d.primitives.entries()) {
    if (primitiveIds.has(primitive.id)) {
      errors.push(issue(`spatial3d.primitives.${index}.id`, "duplicate_id", "Primitive IDs must be unique."));
    }
    primitiveIds.add(primitive.id);
    if (!isSafeModelLabel(primitive.name)) {
      errors.push(issue(`spatial3d.primitives.${index}.name`, "unsafe_model_text", "Primitive name must be a safe display label."));
    }
    const footprintInside = primitiveFootprint(primitive).every(({ x, y }) => (
      x >= 0 && x <= roomWidthM && y >= 0 && y <= roomDepthM
    ));
    const bottomM = primitive.position.y - primitive.dimensions.y / 2;
    const topM = primitive.position.y + primitive.dimensions.y / 2;
    if (!footprintInside || bottomM < 0 || topM > ceiling) {
      errors.push(issue(
        `spatial3d.primitives.${index}`,
        "primitive_out_of_room",
        "Primitive extents must fit completely inside the generated room.",
      ));
    }
  }

  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, candidate: { scene, spatial3d } };
}
