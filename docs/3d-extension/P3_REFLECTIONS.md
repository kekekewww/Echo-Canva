# Hybrid 3D P3-A — Deterministic First-Order Reflection Geometry

Status: **implemented; listening verification pending**

P3 extends the Hybrid Worker output with deterministic first-order Image Source paths and maps the
validated results into the Lab's persistent early-reflection HRTF tap bank. It does not change the
Classic first-order reflection bank or Classic late reverb.

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

## P3-B audible tap adapter

Each finite Worker path carries the reflecting patch's built-in material ID. The main thread derives
a perceptually tuned tap from the existing three-band material registry:

```text
tau_mid = 10 ^ (-TL_mid / 10)
r_mid   = sqrt(max(0, 1 - absorption_mid - tau_mid))
gain    = r_mid * distanceAttenuation(pathLength)
```

The high-to-mid reflection-amplitude ratio sets the tap low-pass cutoff. This gives treatment a
shorter, darker early-reflection contribution than hard concrete while retaining the established
three-band presets. It is deliberately not a six-band or air-absorption model.

The existing six-tap pool is never reconstructed. A path updates delay, gain, filter, and Browser
HRTF X/Y/Z coordinates with the normal 80 ms parameter smoothing; an absent path is smoothly muted.
The Lab shows the number of **Audible first-order 3D taps** for each source. It continues to use the
P2 direct component, while the late field remains the unchanged Classic fallback until P7. The Lab's
**Disable/Enable 3D first-order reflections** control supplies the headphone A/B comparison; it
mutes only these Hybrid tap gains and leaves the direct component unchanged.
