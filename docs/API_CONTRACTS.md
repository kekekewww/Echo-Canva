# API and Data Contracts

## Workspace authoring contract

The browser-only `WorkspaceProject` schema is versioned independently from API-facing `SceneSpec`. It stores mode, revision, listener collection and active listener, authoring selection, reversible disabled IDs, rectangular room dimensions and materials, source heights, finite wall/Portal settings, bounded acoustic primitives, missing/local-audio metadata, and per-mode view state.

Limits are eight listeners, four sources, one hundred walls, eight Portals, eight basic acoustic shapes, 50 m room width/depth, and 12 m room height. At least one enabled listener and the floor are mandatory. Disabled host walls suspend attached Portals. Projectors filter disabled entities before either deterministic worker runs.

`AcousticPrimitive` is restricted to `box`, `cylinder`, or `sphere` and stores an ID, safe display
name, XYZ centre, XYZ dimensions, Y rotation, and a registered material ID. All extents must fit
inside the room. Classic projection emits the shape footprint as deterministic synthetic wall
segments. Hybrid projection retains the complete record for finite faceted compilation.

Local audio IDs use the `local_` prefix and resolve only from browser IndexedDB. WAV/MP3/Ogg files are limited to 25 MB each and 100 MB total, decoded as mono before source creation, and never accepted as arbitrary remote URLs. Authoring JSON records `{id,name,mimeType,size,createdAt}` but never embeds blobs. Missing imported assets remain silent and retain their Source transform until a same-ID relink succeeds.

The local cache envelope is version `3.0` and contains `present`, `past`, and `future`. History arrays contain at most 50 reversible value/splice patches, not repeated full-scene snapshots. View-only selection, camera, overlay, and panel changes do not enter history; active-listener changes do. Cache migration failure does not overwrite the unread input.

`Portal3DSettings` stores bottom/top/thickness while the planar Portal center is the authoritative projection of its along-host `offsetM`. Inspector edits convert offset to center through the finite host-wall unit vector. Wall endpoint edits preserve the Portal's normalized attachment when possible. Open Portals carve the complete wall depth; closed Portals compile a finite slab using authored thickness.

## `SceneSpec`

Canonical TypeScript concept:

```ts
type Vec2 = { x: number; y: number };
type Band3 = { low: number; mid: number; high: number };

type SceneSpec = {
  schemaVersion: "1.0";
  revision: number;
  units: "m";
  name: string;
  room: {
    outerPolygon: Vec2[];
    heightM: number;
    floorMaterialId: string;
    ceilingMaterialId: string;
  };
  walls: Array<{
    id: string;
    a: Vec2;
    b: Vec2;
    thicknessM: number;
    materialId: string;
    kind: "boundary" | "partition";
  }>;
  portals: Array<{
    id: string;
    wallId: string;
    center: Vec2;
    widthM: number;
    heightM: number;
    open: boolean;
    lossDb: number;
  }>;
  sources: Array<{
    id: string;
    name: string;
    clipId: string;
    sourceType: "point";
    position: Vec2;
    gainDb: number;
    loop: boolean;
  }>;
  listener: {
    position: Vec2;
    headingDeg: number;
  };
  settings: {
    acousticUpdateHz: number;
    maxEarlyReflections: number;
    hrtfEnabled: boolean;
  };
};
```

## `AcousticFrame`

```ts
type AcousticFrame = {
  revision: number;
  generatedAtMs: number;
  room: {
    volumeM3: number;
    totalSurfaceM2: number;
    rt60S: Band3;
    preDelayMs: number;
  };
  sources: Array<{
    sourceId: string;
    routeType: "direct" | "portal" | "blocked";
    directVisible: boolean;
    physicalDistanceM: number;
    effectiveDistanceM: number;
    dryGainDb: number;
    lowpassHz: number;
    reverbSendDb: number;
    virtualPosition: Vec2;
    occluderWallIds: string[];
    portalIds: string[];
    routePolyline: Vec2[];
    earlyReflections: Array<{
      wallId: string;
      reflectionPoint: Vec2;
      pathLengthM: number;
      delayMs: number;
      gainDb: number;
      lowpassHz: number;
    }>;
  }>;
};
```

## Material registry

```ts
type AcousticMaterial = {
  id: string;
  displayName: string;
  absorption: Band3;
  transmissionLossDb: Band3;
  scattering: number;
  referenceThicknessM: number;
};
```

Initial presets must be explicitly described as perceptually tuned:

- `concrete_hard`;
- `soft_foliage`;
- `water_like`;
- `wood_medium`;
- `acoustic_treatment`.

Do not source fake precision from random online tables. Document any measured dataset if later adopted.

## Audio asset registry

```ts
type AudioAsset = {
  id: string;
  label: string;
  url: string;
  channels: 1;
  loop: boolean;
  license: string;
  attribution?: string;
};
```

The model may select only IDs in this registry.

## `POST /api/scene/compile`

Request:

```json
{
  "prompt": "A narrow concrete passage with rain outside an open doorway.",
  "targetMode": "classic-2d5d"
}
```

`targetMode` is `classic-2d5d` or `hybrid-3d` and defaults to Classic for backwards compatibility. `baseScene` is optional; when supplied it must be a complete valid `SceneSpec` for Classic or `SceneDocumentV2` for Hybrid (not `null`).

Classic Structured Output is one `SceneSpec`. Hybrid Structured Output is `{scene, spatial3d}`. Its `scene` stores horizontal X/Z as planar x/y; `spatial3d` stores Listener/source Y heights and complete Wall/Portal vertical bounds:

```ts
type GeneratedSpatial3D = {
  listenerHeightM: number;
  sourceHeights: Array<{ sourceId: string; heightM: number }>;
  wallVerticalBounds: Array<{ wallId: string; bottomM: number; topM: number }>;
  portalVerticalBounds: Array<{
    portalId: string;
    bottomM: number;
    topM: number;
    thicknessM: number;
  }>;
  primitives: Array<{
    id: string;
    name: string;
    kind: "box" | "cylinder" | "sphere";
    position: { x: number; y: number; z: number };
    dimensions: { x: number; y: number; z: number };
    rotationYDeg: number;
    materialId: string;
  }>;
};
```

Every Hybrid coverage array must cover the matching generated IDs exactly once. Primitive IDs must be unique, labels safe, materials registered, and complete rotated extents inside the room. The room polygon must be an origin-anchored rectangle; its planar bounds and `heightM` atomically replace the selected mode's authoring room controls.

Response success:

```json
{
  "ok": true,
  "scene": {},
  "spatial3d": {},
  "model": "gpt-5.6",
  "repairAttempted": false,
  "warnings": []
}
```

Response failure:

```json
{
  "ok": false,
  "error": {
    "code": "SCENE_VALIDATION_FAILED",
    "message": "The generated scene could not be validated."
  },
  "fallbackSceneId": "concrete-partition"
}
```

Every failure uses the public `CompileSceneResponse` failure union and includes the exact actionable server message plus `fallbackSceneId`. Its codes are `AI_REQUEST_FAILED`, `AI_REFUSED`, `AI_TIMEOUT`, `AI_UNAVAILABLE`, `INVALID_BASE_SCENE`, `INVALID_JSON`, `INVALID_REQUEST`, `PROMPT_TOO_LONG`, `RATE_LIMITED`, and `SCENE_VALIDATION_FAILED`. `RATE_LIMITED` additionally includes a finite `retryAfterMs` value.

Server validation sequence:

1. payload type and prompt length;
2. Structured Outputs schema validation;
3. known material/clip IDs;
4. object count limits;
5. finite coordinates and bounds;
6. minimum dimensions;
7. unique IDs;
8. portal-to-wall attachment tolerance;
9. polygon validity and self-intersection checks;
10. listener/source positions in valid world bounds.
11. Hybrid ID coverage, room alignment, vertical bounds, and host-Wall containment.

At most one repair request receives a compact list of validation errors.

## `POST /api/scene/explain`

Request:

```json
{
  "sceneName": "Concrete passage",
  "sourceName": "Radio",
  "snapshot": {
    "routeType": "portal",
    "effectiveDistanceM": 9.2,
    "dryGainDb": -13.4,
    "lowpassHz": 1800,
    "portalCount": 1,
    "rt60S": { "low": 1.8, "mid": 1.3, "high": 0.7 }
  }
}
```

Response success:

```json
{
  "ok": true,
  "model": "gpt-5.6",
  "explanation": {
    "summary": "The deterministic snapshot describes a portal route.",
    "factors": [
      {
        "label": "Route",
        "evidence": "The route type is portal."
      }
    ],
    "limitations": [
      "Portal routing is a geometric perceptual approximation."
    ]
  }
}
```

Explanation failures are `{ "ok": false, "error": { "code": "...", "message": "..." } }`. A response is associated with the selected source ID, the current scene revision, and a request nonce in the browser; mismatched or superseded responses are cleared/ignored.

## Model-call policy

Scene compilation:

- canonical model: `gpt-5.6` through the OpenAI Responses API;
- optional local test provider: fixed `openai/gpt-5.6-luna` through OpenRouter's Responses-compatible endpoint, selected only by server-side `AI_PROVIDER=openrouter` and `OPENROUTER_API_KEY`;
- never accept a browser-supplied provider, endpoint, model ID, or API key;
- Responses API;
- reasoning effort: medium;
- strict Structured Outputs;
- terse system/developer instructions;
- no tools;
- no browsing;
- fixed schema;
- bounded output.

Explanation:

- canonical model: `gpt-5.6`; optional OpenRouter local-test model: fixed `openai/gpt-5.6-luna`;
- low reasoning effort is usually sufficient;
- structured response;
- temperature/control settings only if supported by the selected API configuration;
- never infer values absent from the snapshot.
- use static developer policy only; untrusted scene/source labels and the deterministic snapshot are sent as user data, never as developer instructions;
- reject model URLs (including bare domains, protocol-relative links, and `mailto:`), markup, executable protocols, and the explicitly tested instruction patterns: prior-instruction overrides, system/developer messages or instructions, “Follow the system prompt”, and “Disregard safety rules”.

## Security

- OpenAI/OpenRouter keys server-side only;
- reject oversized or malformed bodies;
- basic per-IP/session rate limit;
- do not log raw API keys;
- avoid logging user audio;
- no arbitrary remote audio URLs;
- render model prose as text and reject unsafe model text server-side;
- never evaluate model output as code.
