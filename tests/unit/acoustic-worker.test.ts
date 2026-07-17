import { describe, expect, it } from "vitest";

import { acceptWorkerFrame } from "@/hooks/useAcousticFrame";

describe("acoustic Worker frame acceptance", () => {
  it("rejects an older worker frame after a newer scene revision", () => {
    const state = acceptWorkerFrame({ revision: 8 }, { revision: 9, current: null });

    expect(state.current).toBeNull();
  });

  it("accepts a worker frame matching the newest scene revision", () => {
    const frame = { revision: 9 };

    expect(acceptWorkerFrame(frame, { revision: 9, current: null }).current).toBe(frame);
  });
});
