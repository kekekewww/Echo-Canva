import { describe, expect, it } from "vitest";

import { acceptWorkerFrame } from "@/hooks/useAcousticFrame";
import { createAcousticWorkerController } from "@/workers/acoustics.worker";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { SceneSpec } from "@/domain/scene/types";

class FakeTimers {
  nowMs = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { callback: () => void; dueMs: number }>();

  schedule = (callback: () => void, delayMs: number): number => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, dueMs: this.nowMs + delayMs });
    return id;
  };

  cancel = (id: number): void => {
    this.tasks.delete(id);
  };

  advance(ms: number): void {
    this.nowMs += ms;
    while (true) {
      const due = [...this.tasks.entries()]
        .filter(([, task]) => task.dueMs <= this.nowMs)
        .sort(([, a], [, b]) => a.dueMs - b.dueMs)[0];
      if (!due) return;
      this.tasks.delete(due[0]);
      due[1].callback();
    }
  }

  pendingDueMs(): number[] {
    return [...this.tasks.values()].map(({ dueMs }) => dueMs);
  }
}

function sceneAt(revision: number, acousticUpdateHz: number): SceneSpec {
  const scene = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.revision = revision;
  scene.settings.acousticUpdateHz = acousticUpdateHz;
  return scene;
}

describe("acoustic Worker frame acceptance", () => {
  it("rejects an older worker frame after a newer scene revision", () => {
    const state = acceptWorkerFrame({ revision: 8 }, { revision: 9, current: null });

    expect(state.current).toBeNull();
  });

  it("accepts a worker frame matching the newest scene revision", () => {
    const frame = { revision: 9 };

    expect(acceptWorkerFrame(frame, { revision: 9, current: null }).current).toBe(frame);
  });

  it("coalesces a Worker burst to the newest revision", () => {
    const timers = new FakeTimers();
    const posted: number[] = [];
    const controller = createAcousticWorkerController(
      { postMessage: (response) => posted.push(response.revision) },
      { cancel: (timer) => timers.cancel(timer as number), now: () => timers.nowMs, schedule: timers.schedule },
    );

    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(10, 10) });
    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(11, 10) });
    timers.advance(0);

    expect(posted).toEqual([11]);
  });

  it("reschedules a queued frame using the newest scene update rate", () => {
    const timers = new FakeTimers();
    const posted: number[] = [];
    const controller = createAcousticWorkerController(
      { postMessage: (response) => posted.push(response.revision) },
      { cancel: (timer) => timers.cancel(timer as number), now: () => timers.nowMs, schedule: timers.schedule },
    );

    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(20, 100) });
    timers.advance(0);
    timers.advance(1);
    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(21, 100) });
    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(22, 1) });

    expect(timers.pendingDueMs()).toEqual([1000]);
    timers.advance(9);
    expect(posted).toEqual([20]);
    timers.advance(990);
    expect(posted).toEqual([20, 22]);
  });

  it("cancels pending work and ignores updates after DISPOSE", () => {
    const timers = new FakeTimers();
    const posted: number[] = [];
    const controller = createAcousticWorkerController(
      { postMessage: (response) => posted.push(response.revision) },
      { cancel: (timer) => timers.cancel(timer as number), now: () => timers.nowMs, schedule: timers.schedule },
    );

    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(30, 10) });
    controller.handle({ type: "DISPOSE" });
    controller.handle({ type: "UPDATE_SCENE", scene: sceneAt(31, 10) });
    timers.advance(1_000);

    expect(posted).toEqual([]);
  });
});
