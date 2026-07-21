import { describe, expect, it } from "vitest";

import {
  createClassicPoseSnapshot,
  createClassicStaticContext,
} from "@/acoustics/compute-frame";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import {
  createClassicSourceWorkerController,
  type ClassicSourceWorkerResponse,
} from "@/workers/classic-source.worker";

describe("Classic source shard Worker controller", () => {
  it("installs static context and computes only requested source IDs", () => {
    const responses: ClassicSourceWorkerResponse[] = [];
    const context = createClassicStaticContext(CONCRETE_PARTITION_PRESET);
    const snapshot = createClassicPoseSnapshot(CONCRETE_PARTITION_PRESET);
    const times = [10, 14];
    const controller = createClassicSourceWorkerController(
      { postMessage: (response) => responses.push(response) },
      { now: () => times.shift() ?? 14 },
    );

    controller.handle({ type: "INSTALL_STATIC", requestId: 1, context });
    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 2,
      staticFingerprint: context.fingerprint,
      snapshot,
      sourceIds: ["rain"],
    });

    expect(responses[0]).toEqual({
      type: "STATIC_INSTALLED",
      requestId: 1,
      staticFingerprint: context.fingerprint,
    });
    expect(responses[1]).toMatchObject({
      type: "SHARD_RESULT",
      requestId: 2,
      staticFingerprint: context.fingerprint,
      revision: snapshot.revision,
      sourceIds: ["rain"],
      computeMs: 4,
      completedAtMs: 14,
      results: [{ sourceId: "rain" }],
    });
  });

  it("rejects missing and stale static data with typed errors", () => {
    const responses: ClassicSourceWorkerResponse[] = [];
    const context = createClassicStaticContext(CONCRETE_PARTITION_PRESET);
    const snapshot = createClassicPoseSnapshot(CONCRETE_PARTITION_PRESET);
    const controller = createClassicSourceWorkerController({
      postMessage: (response) => responses.push(response),
    });

    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 1,
      staticFingerprint: context.fingerprint,
      snapshot,
      sourceIds: ["radio"],
    });
    controller.handle({ type: "INSTALL_STATIC", requestId: 2, context });
    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 3,
      staticFingerprint: "stale",
      snapshot,
      sourceIds: ["radio"],
    });

    expect(responses[0]).toMatchObject({ type: "ERROR", code: "CLASSIC_STATIC_NOT_INSTALLED" });
    expect(responses[2]).toMatchObject({ type: "ERROR", code: "CLASSIC_STATIC_FINGERPRINT_MISMATCH" });
  });

  it("replaces installed context and ignores work after disposal", () => {
    const responses: ClassicSourceWorkerResponse[] = [];
    const initial = createClassicStaticContext(CONCRETE_PARTITION_PRESET);
    const replacementScene = {
      ...CONCRETE_PARTITION_PRESET,
      walls: CONCRETE_PARTITION_PRESET.walls.slice(0, -1),
    };
    const replacement = createClassicStaticContext(replacementScene);
    const controller = createClassicSourceWorkerController({
      postMessage: (response) => responses.push(response),
    });

    controller.handle({ type: "INSTALL_STATIC", requestId: 1, context: initial });
    controller.handle({ type: "INSTALL_STATIC", requestId: 2, context: replacement });
    controller.handle({ type: "DISPOSE", requestId: 3 });
    controller.handle({
      type: "COMPUTE_SHARD",
      requestId: 4,
      staticFingerprint: replacement.fingerprint,
      snapshot: createClassicPoseSnapshot(replacementScene),
      sourceIds: ["radio"],
    });

    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatchObject({
      type: "STATIC_INSTALLED",
      staticFingerprint: replacement.fingerprint,
    });
  });
});
