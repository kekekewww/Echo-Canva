import { describe, expect, it } from "vitest";

import {
  formatAcousticPoolMetrics,
  type WorkspaceAcousticStatus,
} from "@/components/workspace/WorkspaceStatusBar";

const hybridCompatibleStatus: WorkspaceAcousticStatus = {
  listenerName: "Listener",
  route: "direct",
  gainDb: 0,
  rt60MidS: 1,
  worker: "Worker",
  computeMs: 2,
};

describe("workspace acoustic pool metrics", () => {
  it("formats active Worker and shard timing metrics", () => {
    expect(formatAcousticPoolMetrics({
      workerCount: 3,
      sourceComputeMsMax: 2.5,
      sourceComputeMsTotal: 5.75,
    })).toBe("3 workers · shard max 2.50 ms · shard total 5.75 ms");
  });

  it("keeps old-shape metrics compatible", () => {
    expect(hybridCompatibleStatus.worker).toBe("Worker");
    expect(formatAcousticPoolMetrics({})).toBe("Pool metrics unavailable");
  });
});
