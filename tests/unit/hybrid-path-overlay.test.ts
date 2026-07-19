import { describe, expect, it } from "vitest";

import { compileHybridGeometry } from "@/acoustics/hybrid3d/compile";
import { computeHybridDirectFrame } from "@/acoustics/hybrid3d/direct";
import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import { projectHybridDocument } from "@/domain/workspace/projections";
import { deriveHybridPathDisplay } from "@/components/workspace/HybridPathOverlay";

describe("Hybrid path overlay", () => {
  it("rejects stale frames", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    expect(deriveHybridPathDisplay(frame, geometry, "radio", false, frame.revision + 1, [])).toEqual([]);
  });

  it("emits XYZ direct and first-order surface paths for the selected source", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const paths = deriveHybridPathDisplay(frame, geometry, "radio", false, frame.revision, []);

    expect(paths.length).toBeGreaterThan(1);
    expect(paths.every(({ sourceId }) => sourceId === "radio")).toBe(true);
    expect(paths[0]!.vertices).toHaveLength(2);
    expect(paths.filter(({ kind }) => kind === "reflection").every(({ vertices }) => vertices.length === 3)).toBe(true);
    expect(paths.some(({ surfaceKind }) => surfaceKind === "floor" || surfaceKind === "ceiling" || surfaceKind === "wall")).toBe(true);
  });

  it("shows every source only when requested", () => {
    const project = createDefaultHybridProject();
    const geometry = compileHybridGeometry(projectHybridDocument(project));
    const frame = computeHybridDirectFrame(geometry);
    const paths = deriveHybridPathDisplay(frame, geometry, "radio", true, frame.revision, []);
    expect(new Set(paths.map(({ sourceId }) => sourceId))).toEqual(new Set(["radio", "rain"]));
  });
});
