import { describe, expect, it } from "vitest";

import {
  CLASSIC_PROJECT_KEY,
  HYBRID_PROJECT_KEY,
  loadWorkspaceCache,
  saveWorkspaceCache,
} from "@/domain/workspace/persistence";
import {
  createDefaultClassicProject,
  createDefaultHybridProject,
} from "@/domain/workspace/defaults";

class MemoryStorage implements Storage {
  private readonly records = new Map<string, string>();
  get length() { return this.records.size; }
  clear() { this.records.clear(); }
  getItem(key: string) { return this.records.get(key) ?? null; }
  key(index: number) { return [...this.records.keys()][index] ?? null; }
  removeItem(key: string) { this.records.delete(key); }
  setItem(key: string, value: string) { this.records.set(key, value); }
}

describe("workspace persistence", () => {
  it("loads independent defaults from empty storage", () => {
    const storage = new MemoryStorage();
    const classic = loadWorkspaceCache(storage, "classic-2d5d");
    const hybrid = loadWorkspaceCache(storage, "hybrid-3d");

    expect(classic.project).toEqual(createDefaultClassicProject());
    expect(hybrid.project).toEqual(createDefaultHybridProject());
    expect(classic.persistenceAvailable).toBe(true);
    expect(hybrid.persistenceAvailable).toBe(true);
  });

  it("round-trips each project under a separate versioned key", () => {
    const storage = new MemoryStorage();
    const hybrid = createDefaultHybridProject();
    const result = saveWorkspaceCache(storage, "hybrid-3d", hybrid);

    expect(result.ok).toBe(true);
    expect(storage.getItem(HYBRID_PROJECT_KEY)).not.toBeNull();
    expect(storage.getItem(CLASSIC_PROJECT_KEY)).toBeNull();
    expect(loadWorkspaceCache(storage, "hybrid-3d").project).toEqual(hybrid);
  });

  it("falls back without overwriting an unreadable cached record", () => {
    const storage = new MemoryStorage();
    storage.setItem(CLASSIC_PROJECT_KEY, "{broken");

    const result = loadWorkspaceCache(storage, "classic-2d5d");

    expect(result.project).toEqual(createDefaultClassicProject());
    expect(result.warning).toContain("could not be restored");
    expect(storage.getItem(CLASSIC_PROJECT_KEY)).toBe("{broken");
  });
});
