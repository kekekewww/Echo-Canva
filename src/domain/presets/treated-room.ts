import type { SceneSpec } from "@/domain/scene/types";

export const TREATED_ROOM_PRESET = {
  schemaVersion: "1.0",
  revision: 0,
  units: "m",
  name: "Treated Room",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ],
    heightM: 3,
    floorMaterialId: "wood_medium",
    ceilingMaterialId: "acoustic_treatment",
  },
  walls: [
    {
      id: "treated_north",
      a: { x: 0, y: 0 },
      b: { x: 10, y: 0 },
      thicknessM: 0.12,
      materialId: "acoustic_treatment",
      kind: "boundary",
    },
    {
      id: "treated_east",
      a: { x: 10, y: 0 },
      b: { x: 10, y: 8 },
      thicknessM: 0.12,
      materialId: "acoustic_treatment",
      kind: "boundary",
    },
    {
      id: "treated_south",
      a: { x: 10, y: 8 },
      b: { x: 0, y: 8 },
      thicknessM: 0.12,
      materialId: "acoustic_treatment",
      kind: "boundary",
    },
    {
      id: "treated_west",
      a: { x: 0, y: 8 },
      b: { x: 0, y: 0 },
      thicknessM: 0.12,
      materialId: "acoustic_treatment",
      kind: "boundary",
    },
  ],
  portals: [],
  sources: [
    {
      id: "treated_voice",
      name: "Voice",
      clipId: "voice_loop",
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
} satisfies SceneSpec;
