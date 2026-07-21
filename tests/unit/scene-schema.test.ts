import { describe, expect, it } from "vitest";

import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import { sceneSpecSchema } from "@/domain/scene/schema";

describe("SceneSpec Zod schema", () => {
  it("accepts the canonical fixture", () => {
    expect(sceneSpecSchema.safeParse(CONCRETE_PARTITION_PRESET).success).toBe(true);
  });

  it("strictly rejects unknown properties", () => {
    const candidate = { ...CONCRETE_PARTITION_PRESET, unexpected: true };

    const result = sceneSpecSchema.safeParse(candidate);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });
});
