# Hybrid 3D P1 — Compatibility Envelope and Engine Router

Status: **complete — Gate R1 evidence ready**

P1 introduces the additive seams required by Hybrid 3D. It does not change the Classic acoustic worker, Classic renderer, default route, or v1 export format.

## Scene documents

`SceneSpec` remains the v1 Classic contract. `SceneDocumentV2` wraps it instead of replacing it:

```ts
type SceneDocumentV2 = {
  documentVersion: "2.0";
  baseScene: SceneSpec;
  extensions: {
    spatial3d?: Spatial3DExtension;
    propagation3d?: Propagation3DConfig;
    materialBands?: MaterialBandExtension;
    atmosphericMedia?: AtmosphericMediaExtension;
  };
  compatibility: {
    migratedFrom?: "1.0";
    classicProjectionHash: string;
  };
};
```

The `classicProjectionHash` is a deterministic FNV-1a compatibility fingerprint of the validated `baseScene`. It detects accidental base-scene drift; it is not a cryptographic integrity or security mechanism.

- Existing `serializeScene` continues to emit v1 JSON only.
- Existing `parseScene` accepts both v1 and v2 JSON, but a v2 import is atomically projected back to a validated `baseScene` for Classic editing.
- v1 validation failures and unsupported v1 schema-version messages preserve their previous public behavior.
- v2 extensions reject unknown source IDs, out-of-room heights, invalid structures, and a compatibility-hash mismatch.

## Runtime seams

`EngineRouter` begins in `classic-2d5d`. Hybrid flags default to `false`, and any disabled or uninstalled Hybrid request retains the active Classic engine with an explicit fallback reason.

The router owns an engine instance and disposes it before switching to another instance. The P1 test performs 100 alternating Classic/Hybrid selections with test engines and verifies that every created instance is disposed exactly once after final cleanup.

The router is intentionally not connected to the user-facing worker yet: P2 must first provide a 3D direct solver with analytic geometry evidence. This avoids a UI state that claims 3D while still running 2D calculations.

## Routes

- `/` remains the validated Classic workbench.
- `/classic` explicitly serves the same Classic workbench.
- `/lab` identifies the Hybrid 3D Lab but states that its solver is not enabled; it links back to `/classic`.

## Gate R1 evidence

- v1 and v2 scene-document unit coverage: round-trip, Classic projection, compatibility-hash tampering, unknown 3D source IDs, invalid base scene, and legacy v1 error semantics.
- Feature-flag dependency checks and 100-switch disposal coverage.
- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm test` — PASS, 35 files / 249 tests.
- `pnpm e2e` — PASS, 25 production Chromium tests.
- `pnpm build` — PASS (included in `pnpm e2e`).

## P2 entry rule

P2 may enable `spatial3d` only inside the Hybrid engine and Lab route after it passes free-field distance/delay and 3D segment/patch intersection tests. Classic remains the default and is still protected by the P0 regression oracle.
