import { z } from "zod";

import { sceneSpecSchema } from "@/domain/scene/schema";
import { MATERIALS } from "@/domain/materials/registry";

const primitiveSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/),
  name: z.string().min(1).max(80),
  kind: z.enum(["box", "cylinder", "sphere"]),
  position: z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict(),
  dimensions: z.object({ x: z.number().min(0.1).max(50), y: z.number().min(0.1).max(12), z: z.number().min(0.1).max(50) }).strict(),
  rotationYDeg: z.number().finite(),
  materialId: z.enum(MATERIALS.map(({ id }) => id) as [string, ...string[]]),
}).strict();

const spatial3dSchema = z
  .object({
    coordinateSystem: z.literal("x-right-y-up-z-forward"),
    floorElevationM: z.number().min(-10).max(10),
    listenerHeightM: z.number().min(0.1).max(12),
    sourceHeightsM: z.record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), z.number().min(0.1).max(12)),
    wallVerticalBoundsM: z.record(z.string(), z.object({
      bottomM: z.number().min(0).max(12),
      topM: z.number().min(0.1).max(12),
    }).strict()).optional(),
    portalVerticalBoundsM: z.record(z.string(), z.object({
      bottomM: z.number().min(0).max(12),
      topM: z.number().min(0.1).max(12),
      thicknessM: z.number().min(0.02).max(2),
    }).strict()).optional(),
    disabledSurfaceIds: z.array(z.string()).optional(),
    primitives: z.array(primitiveSchema).max(8).optional(),
  })
  .strict();

const propagation3dSchema = z
  .object({
    maxReflectionOrder: z.union([z.literal(1), z.literal(2)]),
    receiverConnection: z.boolean(),
  })
  .strict();

const materialBandExtensionSchema = z.object({ bandCount: z.literal(6) }).strict();

const atmosphericMediaExtensionSchema = z
  .object({
    temperatureC: z.number().min(-20).max(50),
    relativeHumidity: z.number().min(0).max(1),
  })
  .strict();

export const sceneDocumentV2Schema = z
  .object({
    documentVersion: z.literal("2.0"),
    baseScene: sceneSpecSchema,
    extensions: z
      .object({
        spatial3d: spatial3dSchema.optional(),
        propagation3d: propagation3dSchema.optional(),
        materialBands: materialBandExtensionSchema.optional(),
        atmosphericMedia: atmosphericMediaExtensionSchema.optional(),
      })
      .strict(),
    compatibility: z
      .object({
        migratedFrom: z.literal("1.0").optional(),
        classicProjectionHash: z.string().regex(/^[a-f0-9]{8}$/),
      })
      .strict(),
  })
  .strict();
