import { deepFreeze } from "@/domain/deep-freeze";
import type { SceneSpec } from "@/domain/scene/types";

const boundaryWalls: SceneSpec["walls"] = [
  { id: "stress_boundary_north", a: { x: 0, y: 0 }, b: { x: 12, y: 0 } },
  { id: "stress_boundary_east", a: { x: 12, y: 0 }, b: { x: 12, y: 8 } },
  { id: "stress_boundary_south", a: { x: 12, y: 8 }, b: { x: 0, y: 8 } },
  { id: "stress_boundary_west", a: { x: 0, y: 8 }, b: { x: 0, y: 0 } },
].map((wall) => ({
  ...wall,
  thicknessM: 0.2,
  materialId: "concrete_hard",
  kind: "boundary" as const,
}));

const stressWalls: SceneSpec["walls"] = Array.from({ length: 96 }, (_, index) => {
  const column = index % 12;
  const row = Math.floor(index / 12);
  const x = 0.45 + column * 0.94;
  const y = 0.55 + row * 0.92;
  return {
    id: `stress_${index}`,
    a: { x, y },
    b: { x: x + 0.42, y: y + 0.18 },
    thicknessM: 0.08,
    materialId: index % 3 === 0 ? "wood_medium" : "concrete_hard",
    kind: "partition" as const,
  };
});

export const STRESS_100_WALLS_PRESET = deepFreeze({
  schemaVersion: "1.0",
  revision: 0,
  units: "m",
  name: "Stress Test — 100 Walls",
  room: {
    outerPolygon: [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
    ],
    heightM: 3,
    floorMaterialId: "concrete_hard",
    ceilingMaterialId: "acoustic_treatment",
  },
  walls: [...boundaryWalls, ...stressWalls],
  portals: [],
  sources: [
    {
      id: "stress_radio",
      name: "Stress radio",
      clipId: "radio_loop",
      sourceType: "point",
      position: { x: 10.8, y: 7.2 },
      gainDb: -6,
      loop: true,
    },
  ],
  listener: { position: { x: 1.2, y: 0.8 }, headingDeg: 0 },
  settings: {
    acousticUpdateHz: 12,
    maxEarlyReflections: 6,
    hrtfEnabled: true,
  },
} satisfies SceneSpec);
