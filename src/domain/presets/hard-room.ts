import { deepFreeze } from "@/domain/deep-freeze";
import type { SceneSpec } from "@/domain/scene/types";

export const HARD_ROOM_PRESET = deepFreeze({
  schemaVersion: "1.0",
  revision: 0,
  units: "m",
  name: "Hard Room",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ],
    heightM: 3,
    floorMaterialId: "concrete_hard",
    ceilingMaterialId: "concrete_hard",
  },
  walls: [
    {
      id: "hard_north",
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "hard_east",
      a: { x: 10, y: 0 },
      b: { x: 10, y: 8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "hard_south",
      a: { x: 10, y: 8 },
      b: { x: 0, y: 8 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
    {
      id: "hard_west",
      a: { x: 0, y: 8 },
      b: { x: 0, y: 0 },
      thicknessM: 0.2,
      materialId: "concrete_hard",
      kind: "boundary",
    },
  ],
  portals: [],
  sources: [
    {
      id: "hard_radio",
      name: "Radio",
      clipId: "radio_loop",
      sourceType: "point",
      position: { x: 7.5, y: 4 },
      gainDb: -3,
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
