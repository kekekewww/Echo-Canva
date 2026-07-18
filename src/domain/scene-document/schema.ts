import { z } from "zod";

import { sceneSpecSchema } from "@/domain/scene/schema";

const spatial3dSchema = z
  .object({
    coordinateSystem: z.literal("x-right-y-up-z-forward"),
    floorElevationM: z.number().min(-10).max(10),
    listenerHeightM: z.number().min(0.1).max(12),
    sourceHeightsM: z.record(z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/), z.number().min(0.1).max(12)),
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
