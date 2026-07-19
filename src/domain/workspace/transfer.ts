import { z } from "zod";

import { AUDIO_ASSETS } from "@/domain/audio-assets/registry";
import { migrateWorkspaceCache } from "@/domain/workspace/persistence";
import type { LocalAudioAssetMetadata, WorkspaceMode, WorkspaceProject } from "@/domain/workspace/types";

export type LocalAudioMetadata = LocalAudioAssetMetadata;

const metadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  createdAt: z.number().finite(),
}).strict();

const transferSchema = z.object({
  format: z.literal("echo-canvas-authoring-project"),
  version: z.literal("1.0"),
  project: z.unknown(),
  localAssets: z.array(metadataSchema),
}).strict();

export function serializeWorkspaceProject(
  project: WorkspaceProject,
  localAssets: readonly LocalAudioMetadata[],
): string {
  return JSON.stringify({
    format: "echo-canvas-authoring-project",
    version: "1.0",
    project,
    localAssets,
  }, null, 2);
}

export function parseWorkspaceProject(
  json: string,
  expectedMode: WorkspaceMode,
  availableAudioIds: ReadonlySet<string>,
): Readonly<{ project: WorkspaceProject; localAssets: readonly LocalAudioMetadata[] }> {
  let input: unknown;
  try {
    input = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Authoring project JSON must be valid JSON.");
  }
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) throw new Error("This is not a supported Echo Canvas authoring project.");
  const project = migrateWorkspaceCache(parsed.data.project, expectedMode);
  if (!project) {
    const sourceMode = typeof parsed.data.project === "object" && parsed.data.project !== null && "mode" in parsed.data.project
      ? String(parsed.data.project.mode)
      : "another mode";
    throw new Error(`${sourceMode === "hybrid-3d" ? "3D" : "2.5D"} project cannot be imported into this mode.`);
  }
  const builtIn = new Set(AUDIO_ASSETS.map(({ id }) => id));
  const missing = project.scene.sources
    .map(({ clipId }) => clipId)
    .filter((clipId) => !builtIn.has(clipId) && !availableAudioIds.has(clipId));
  return {
    project: {
      ...project,
      missingAudioAssetIds: [...new Set(missing)],
      localAudioMetadata: {
        ...project.localAudioMetadata,
        ...Object.fromEntries(parsed.data.localAssets.map((metadata) => [metadata.id, metadata])),
      },
    },
    localAssets: parsed.data.localAssets,
  };
}
