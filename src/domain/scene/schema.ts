import { z } from "zod";

const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);

const vec2Schema = z
  .object({
    x: z.number().min(-50).max(50),
    y: z.number().min(-50).max(50),
  })
  .strict();
export const sceneSpecSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    revision: z.number().int().min(0),
    units: z.literal("m"),
    name: z.string().min(1).max(80),
    room: z
      .object({
        outerPolygon: z.array(vec2Schema).min(3).max(32),
        heightM: z.number().min(2).max(12),
        floorMaterialId: idSchema,
        ceilingMaterialId: idSchema,
      })
      .strict(),
    walls: z
      .array(
        z
          .object({
            id: idSchema,
            a: vec2Schema,
            b: vec2Schema,
            thicknessM: z.number().min(0.02).max(2),
            materialId: idSchema,
            kind: z.enum(["boundary", "partition"]),
          })
          .strict(),
      )
      .max(100),
    portals: z
      .array(
        z
          .object({
            id: idSchema,
            wallId: idSchema,
            center: vec2Schema,
            widthM: z.number().min(0.4).max(8),
            heightM: z.number().min(1).max(6),
            open: z.boolean(),
            lossDb: z.number().min(0).max(24),
          })
          .strict(),
      )
      .max(8),
    sources: z
      .array(
        z
          .object({
            id: idSchema,
            name: z.string().min(1).max(60),
            clipId: idSchema,
            sourceType: z.literal("point"),
            position: vec2Schema,
            gainDb: z.number().min(-36).max(6),
            loop: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
    listener: z
      .object({
        position: vec2Schema,
        headingDeg: z.number().min(-360).max(360),
      })
      .strict(),
    settings: z
      .object({
        acousticUpdateHz: z.number().int().min(5).max(20),
        maxEarlyReflections: z.number().int().min(0).max(6),
        hrtfEnabled: z.boolean(),
      })
      .strict(),
  })
  .strict();
