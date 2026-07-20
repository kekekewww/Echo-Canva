import { describe, expect, it } from "vitest";

import { computeAcousticFrame } from "@/acoustics/compute-frame";
import { AcousticFrameClient } from "@/hooks/useAcousticFrame";
import type { AcousticWorkerRequest, AcousticWorkerResponse } from "@/workers/acoustics.worker";
import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import type { SceneSpec } from "@/domain/scene/types";

class FakeTimers {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  schedule = (callback: () => void): number => {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  };

  cancel = (id: number): void => {
    this.callbacks.delete(id);
  };

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    callbacks.forEach((callback) => callback());
  }
}

class FakeWorker {
  readonly posted: AcousticWorkerRequest[] = [];
  onerror: ((event: ErrorEvent) => unknown) | null = null;
  onmessage: ((event: MessageEvent<AcousticWorkerResponse>) => void) | null = null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null = null;
  terminateCalls = 0;

  postMessage(message: AcousticWorkerRequest): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminateCalls += 1;
  }
}

class FakeTimeline {
  nowMs = 0;
  private nextId = 1;
  private readonly tasks = new Map<number, { callback: () => void; dueMs: number }>();

  schedule = (callback: () => void, delayMs = 0): number => {
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
      const task = [...this.tasks.entries()]
        .filter(([, candidate]) => candidate.dueMs <= this.nowMs)
        .sort(([, left], [, right]) => left.dueMs - right.dueMs)[0];
      if (!task) return;
      this.tasks.delete(task[0]);
      task[1].callback();
    }
  }
}

function sceneAt(revision: number): SceneSpec {
  const scene = structuredClone(CONCRETE_PARTITION_PRESET);
  scene.revision = revision;
  return scene;
}

describe("AcousticFrameClient", () => {
  it("forwards the Worker compute duration with the frame", () => {
    const timers = new FakeTimers();
    const worker = new FakeWorker();
    const received: unknown[] = [];
    const client = new AcousticFrameClient({
      cancel: (timer) => timers.cancel(timer as number),
      cancelFrame: (frame) => timers.cancel(frame as number),
      createWorker: () => worker,
      onFallback: () => undefined,
      onFrame: (_, metrics) => received.push(metrics),
      schedule: timers.schedule,
      scheduleFrame: timers.schedule,
    });
    const scene = sceneAt(59);

    client.start(scene);
    worker.onmessage?.({
      data: {
        type: "FRAME",
        revision: scene.revision,
        frame: computeAcousticFrame(scene),
        metrics: {
          computeMs: 3.25,
          completedAtMs: 40,
          workerCount: 2,
          sourceComputeMsMax: 2.5,
          sourceComputeMsTotal: 4.5,
        },
      },
    } as MessageEvent<AcousticWorkerResponse>);

    expect(received).toEqual([{
      source: "worker",
      computeMs: 3.25,
      workerCount: 2,
      sourceComputeMsMax: 2.5,
      sourceComputeMsTotal: 4.5,
    }]);
  });

  it("rate-limits and coalesces fallback computations across a drag timeline", () => {
    const timeline = new FakeTimeline();
    const fallbackRevisions: number[] = [];
    const fallbackMetrics: unknown[] = [];
    const client = new AcousticFrameClient({
      cancel: (timer) => timeline.cancel(timer as number),
      cancelFrame: (frame) => timeline.cancel(frame as number),
      createWorker: () => {
        throw new Error("Worker unavailable");
      },
      onFallback: (frame, metrics) => {
        fallbackRevisions.push(frame.revision);
        fallbackMetrics.push(metrics);
      },
      onFrame: () => undefined,
      schedule: timeline.schedule,
      scheduleFrame: timeline.schedule,
      now: () => timeline.nowMs,
    });
    const initial = sceneAt(60);
    initial.settings.acousticUpdateHz = 10;
    const intermediate = sceneAt(61);
    intermediate.settings.acousticUpdateHz = 10;
    const latest = sceneAt(62);
    latest.settings.acousticUpdateHz = 10;

    client.start(initial);
    client.updateScene(intermediate);
    client.updateScene(latest);
    expect(fallbackRevisions).toEqual([60]);

    timeline.advance(99);
    expect(fallbackRevisions).toEqual([60]);
    timeline.advance(1);
    expect(fallbackRevisions).toEqual([60, 62]);
    expect(fallbackMetrics).toEqual([
      { source: "fallback", computeMs: 0 },
      { source: "fallback", computeMs: 0 },
    ]);
  });

  it("posts only the newest client-side scene revision from a burst", () => {
    const timers = new FakeTimers();
    const frameTimers = new FakeTimers();
    const worker = new FakeWorker();
    const client = new AcousticFrameClient({
      cancel: (timer) => timers.cancel(timer as number),
      cancelFrame: (frame) => frameTimers.cancel(frame as number),
      createWorker: () => worker,
      onFallback: () => undefined,
      onFrame: () => undefined,
      schedule: timers.schedule,
      scheduleFrame: frameTimers.schedule,
    });

    client.start(sceneAt(40));
    client.updateScene(sceneAt(41));
    client.updateScene(sceneAt(42));
    timers.flush();
    frameTimers.flush();

    expect(worker.posted).toEqual([{ type: "UPDATE_SCENE", scene: sceneAt(42) }]);
  });

  it("retains the newest scene when a later pointer update follows the settle callback", () => {
    const timers = new FakeTimers();
    const frameTimers = new FakeTimers();
    const worker = new FakeWorker();
    const client = new AcousticFrameClient({
      cancel: (timer) => timers.cancel(timer as number),
      cancelFrame: (frame) => frameTimers.cancel(frame as number),
      createWorker: () => worker,
      onFallback: () => undefined,
      onFrame: () => undefined,
      schedule: timers.schedule,
      scheduleFrame: frameTimers.schedule,
    });

    client.start(sceneAt(43));
    client.updateScene(sceneAt(44));
    timers.flush();
    client.updateScene(sceneAt(45));

    expect(worker.posted).toEqual([]);
    frameTimers.flush();
    expect(worker.posted).toEqual([{ type: "UPDATE_SCENE", scene: sceneAt(45) }]);
  });

  it.each(["unavailable", "onerror", "onmessageerror"])(
    "falls back deterministically when Worker is %s",
    (failureMode) => {
      const timers = new FakeTimers();
      const fallbackRevisions: number[] = [];
      const worker = new FakeWorker();
      const client = new AcousticFrameClient({
        cancel: (timer) => timers.cancel(timer as number),
        cancelFrame: (frame) => timers.cancel(frame as number),
        createWorker: () => {
          if (failureMode === "unavailable") throw new Error("Worker unavailable");
          return worker;
        },
        onFallback: (frame) => fallbackRevisions.push(frame.revision),
        onFrame: () => undefined,
        schedule: timers.schedule,
        scheduleFrame: timers.schedule,
      });

      client.start(sceneAt(50));
      if (failureMode === "onerror") worker.onerror?.(new Event("error") as ErrorEvent);
      if (failureMode === "onmessageerror") worker.onmessageerror?.(new MessageEvent("messageerror"));

      expect(fallbackRevisions).toEqual([50]);
      expect(worker.terminateCalls).toBe(failureMode === "unavailable" ? 0 : 1);
    },
  );
});
