import { deepFreeze } from "@/domain/deep-freeze";
import type { SceneSpec } from "@/domain/scene/types";

export const CONCRETE_PARTITION_PRESET = deepFreeze({
  schemaVersion: "1.0",
  revision: 0,
  units: "m",
  name: "Concrete Partition",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
    ],
    heightM: 3,
    floorMaterialId: "concrete_hard",
    ceilingMaterialId: "concrete_hard",
  },
  walls: [
    {
      id: "boundary_north",
      a: { x: 0, y: 0 },
      b: { x: 12, y: 0 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "boundary_east",
      a: { x: 12, y: 0 },
      b: { x: 12, y: 8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "boundary_south",
      a: { x: 12, y: 8 },
      b: { x: 0, y: 8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "boundary_west",
      a: { x: 0, y: 8 },
      b: { x: 0, y: 0 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "partition_center",
      a: { x: 6, y: 0 },
      b: { x: 6, y: 8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "partition",
    },
  ],
  portals: [
    {
      id: "partition_door",
      wallId: "partition_center",
      center: { x: 6, y: 4 },
      widthM: 1.2,
      heightM: 2.1,
      open: true,
      lossDb: 3,
    },
  ],
  sources: [
    {
      id: "radio",
      name: "Radio",
      clipId: "radio_loop",
      sourceType: "point",
      position: { x: 9, y: 4 },
      gainDb: -3,
      loop: true,
    },
    {
      id: "rain",
      name: "Rain",
      clipId: "rain_loop",
      sourceType: "point",
      position: { x: 10, y: 1.5 },
      gainDb: -8,
      loop: true,
    },
  ],
  listener: {
    position: { x: 3, y: 4 },
    headingDeg: 0,
  },
  settings: {
    acousticUpdateHz: 12,
    maxEarlyReflections: 6,
    hrtfEnabled: true,
  },
} satisfies SceneSpec);
