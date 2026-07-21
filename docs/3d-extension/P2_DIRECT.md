# Hybrid 3D P2 — Direct Propagation Beta

Status: **implemented and verified in the isolated Lab**

P2 adds a genuine 3D direct-path solver without modifying the Classic runtime. The root and `/classic` still use the validated 2.5D Worker and audio graph; `/lab` is the only route that runs the Hybrid direct beta.

## Coordinate contract

Hybrid uses a right-handed metric coordinate system:

```text
X = plan X (right)
Y = elevation (up)
Z = plan Y (forward)
```

For a source `s` and listener `l`:

```text
d = ||s - l||
delayMs = 1000 * d / 343
directionToSource = normalize(s - l)
azimuth = atan2(direction.x, direction.z)
elevation = asin(direction.y)
```

The Browser HRTF adapter receives the relative position as `X = dx`, `Y = dy`, `Z = -dz`, preserving the existing Web Audio forward convention. Parameter updates use the existing 80 ms smoothing; no AudioNodes are recreated while elevation changes.

## Geometry and direct visibility

The v1 room is deterministically extruded into:

- one finite floor polygon;
- one finite ceiling polygon;
- front and rear finite wall faces at each wall's declared thickness;
- floor-anchored rectangular portal openings on hosted walls.

Segment/patch intersection uses a plane hit followed by finite-polygon containment. A point inside an open portal rectangle is explicitly excluded from its wall face, so a direct ray through the doorway remains direct. Closed portals retain both wall faces and block the ray. The solver returns ordered hit data and unique occluding wall IDs.

## BVH and Worker

Static floor/ceiling/wall patches are compiled into a deterministic AABB BVH. The Hybrid Worker caches that BVH by Classic projection hash:

- listener/source elevation changes bind new poses to the cached structure;
- a wall/portal/base-scene change has a new projection hash and recompiles the static geometry;
- a Worker failure falls back to the same deterministic Lab computation and reports the fallback.

The Lab now exposes an interactive orthographic 3D viewport as its primary pose control. It renders
the finite room shell, partition/portal, listener head, source markers, a camera-relative XYZ gizmo,
and a compass that explicitly defines North as `+Z`. Dragging an object changes its X/Z pose; holding
Shift while dragging changes Y elevation. Dragging empty space orbits only the visual camera, and
the mouse wheel zooms it. Retained numeric fine-position/elevation sliders plus collapsed X/Z and Y
reference maps provide precise and keyboard-accessible alternatives. These controls deliberately
move only the three poses: they do not become a second wall editor or alter the frozen Classic scene.
Its Direct diagnostics show route, distance, delay, azimuth, elevation, and occluding wall IDs.
**Start 3D Audio** sends the solved positions to the persistent Browser HRTF panners in Simulated mode.

## Evidence

- G001 free-field 3-4-5: `5.000000 m`, `14.577259 ms`, zero elevation.
- Non-zero elevation: vertical separation changes 3D distance and elevation independently of plan distance.
- v1 extrusion: open partition portal permits the Radio direct ray; closing it produces a blocked path attributed to `partition_center`.
- Finite-patch rejection: an infinite-plane-only intersection is rejected.
- BVH output agrees with deterministic per-patch brute-force intersections for representative segments.
- Pose-only rebinding retains the exact same BVH identity.
- The Hybrid Worker test confirms cache reuse and terminal disposal behavior.
- Audio unit coverage confirms a Hybrid pose writes relative X/Y/Z (`6`, `2`, `0`) to a persistent HRTF panner without creating another source graph.
- Production browser coverage moves Radio through the plan map with both keyboard and pointer
  input, verifies the X/Z sliders remain synchronized, and retains direct visibility through the
  open doorway when the pointer target is placed on the portal center line.

## Current boundary

P2 solves direct paths only. It does not yet supply 3D portal routing, floor/ceiling/wall image-source reflections, second-order reflection, directional late energy, 6-band materials, air absorption, diffraction, or a wave model. Classic first-order reflections and late reverb deliberately remain separate until the next release gates validate their Hybrid replacements.
