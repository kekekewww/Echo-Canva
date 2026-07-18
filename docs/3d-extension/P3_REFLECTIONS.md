# Hybrid 3D P3-A — Deterministic First-Order Reflection Geometry

Status: **geometric solver complete; 3D audible-tap adapter remains pending**

P3-A extends the Hybrid Worker output with deterministic first-order Image Source paths. It does not change the Classic first-order reflection bank or Classic late reverb.

For each physical surface patch `P` with point `p` and unit normal `n`:

```text
imageSource = source - 2 * dot(source - p, n) * n
reflectionPoint = line(imageSource, listener) ∩ plane(P)
```

A candidate is retained only when:

1. the plane hit lies inside the finite polygon;
2. source-to-reflection and reflection-to-listener legs have no intervening patch hit;
3. a paired front/rear wall face is deduplicated to one physical wall surface.

The returned path includes a stable `first:<surfaceId>` ID, finite reflection point, total path length, absolute delay, excess delay over the direct path, and listener-facing arrival direction.

Analytic evidence:

- G002 floor: `(2, 0, 0)`, path `sqrt(20)`, `13.038297 ms`;
- G003 ceiling: `(2, 3, 0)`, path `sqrt(32)`, `16.492286 ms`;
- G004 vertical wall: `(0, 1.5, 0)`, path `5 m`, `14.577259 ms`;
- finite-patch and occluded-leg candidates are rejected.

The Lab now displays the count of Worker-computed first-order 3D candidates per source. The next P3-B slice will map those finite 3D points, delays, and gains onto the persistent early-reflection HRTF tap bank with crossfade/hysteresis. Until then, the Lab's audible path remains the P2 3D direct component plus the unchanged Classic late field.
