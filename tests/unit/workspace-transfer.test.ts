import { describe, expect, it } from "vitest";

import { createDefaultHybridProject } from "@/domain/workspace/defaults";
import {
  parseWorkspaceProject,
  serializeWorkspaceProject,
} from "@/domain/workspace/transfer";

describe("workspace authoring transfer", () => {
  it("round-trips listeners, disabled entities, view state and local metadata", () => {
    const initial = createDefaultHybridProject();
    const project = {
      ...initial,
      disabledEntityIds: [initial.scene.walls[0]!.id, "ceiling"],
      view: {
        ...initial.view,
        camera: { yawDeg: 90, pitchDeg: 35, zoom: 1.25 },
      },
    };
    const json = serializeWorkspaceProject(project, [{
      id: "local_voice",
      name: "voice.wav",
      mimeType: "audio/wav",
      size: 128,
      createdAt: 1,
    }]);
    const parsed = parseWorkspaceProject(json, "hybrid-3d", new Set(["local_voice"]));

    expect(parsed.project).toEqual(project);
    expect(parsed.localAssets).toEqual([expect.objectContaining({ id: "local_voice", name: "voice.wav" })]);
  });

  it("retains a source transform and marks an unavailable imported local asset for relinking", () => {
    const initial = createDefaultHybridProject();
    const source = { ...initial.scene.sources[0]!, clipId: "local_missing", position: { x: 7.25, y: 4.5 } };
    const project = { ...initial, scene: { ...initial.scene, sources: [source] } };
    const json = serializeWorkspaceProject(project, [{
      id: "local_missing",
      name: "missing.ogg",
      mimeType: "audio/ogg",
      size: 512,
      createdAt: 2,
    }]);

    const parsed = parseWorkspaceProject(json, "hybrid-3d", new Set());

    expect(parsed.project.scene.sources[0]?.position).toEqual({ x: 7.25, y: 4.5 });
    expect(parsed.project.missingAudioAssetIds).toEqual(["local_missing"]);
  });

  it("rejects importing one mode into the other without conversion", () => {
    const json = serializeWorkspaceProject(createDefaultHybridProject(), []);
    expect(() => parseWorkspaceProject(json, "classic-2d5d", new Set())).toThrow(/3D project/i);
  });
});
