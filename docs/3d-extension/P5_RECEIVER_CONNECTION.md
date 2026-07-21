# Hybrid 3D P5-A — Fibonacci Receiver Connections

Status: **deterministic estimator and progressive accumulator implemented; not yet rendered**

P5-A establishes repeatable sampling data for a future Hybrid late field. It is deliberately
separate from P3's finite, specular Image Source paths and from the current Classic Schroeder late
reverb.

## Sampling contract

`fibonacciSphereDirections(count, rotation)` produces normalized, deterministic unit vectors.
`fibonacciProgressiveDirections(count, frameIndex)` advances the set by a golden-angle rotation so
subsequent stationary frames do not repeat exactly.

For each direction, the estimator finds the nearest finite BVH patch hit and then performs a
receiver connection from that point to the listener. The connection is accepted only when the
finite hit exists and the link to the listener is visible. Its estimated mid-band amplitude uses
the existing material reflection amplitude, scattering weight, and full source-to-hit-to-listener
distance attenuation.

These are diffuse/late-energy samples, not exact second-order specular paths and not a diffraction
model.

## Progressive state

`ProgressiveReceiverAccumulator` accumulates sampled-direction count, connection count, and
linear mid-band energy. A scene signature change atomically resets all totals, preventing energy
from a previous geometry leaking into a new scene.

## Evidence

- Fibonacci vectors are deterministic and unit length;
- finite floor hit connects to the listener with the correct metric path length;
- a blocking finite wall rejects the connection;
- ray max distance remains correct for non-unit directions;
- same-signature frames accumulate, while a new signature resets atomically.

## P5-B stationary benchmark

`benchmarkReceiverConnectionStationary` repeats progressive Fibonacci sets for a fixed source,
listener, and geometry. It reports each frame's connection count and **mid energy per emitted
direction**, then exposes:

- total sample and connection counts;
- connection rate;
- mean normalized mid energy;
- frame-energy coefficient of variation (CV);
- p95 absolute frame-to-frame energy delta in dB.

Normalizing by emitted directions is deliberate: missed rays remain part of the convergence
signal, rather than disappearing when only accepted connections are averaged. The helper can also
run the plan's fixed sample budgets of 128, 512, 2,048, and 8,192 with identical geometry.

The current unit fixture proves deterministic output, finite metrics, empty-scene behavior, and
budget accounting. It **does not** claim the plan's broader CV, EDC, CPU, random/Sobol, narrow
portal, or moving-listener thresholds. Those require reference-energy and trajectory experiments
before any late-field runtime feature can be enabled.

## Boundary

P5 has no user-visible control and does not feed audio. It is the deterministic data foundation
for later convergence comparisons and a possible directional late-field renderer. Random sampling,
Sobol comparisons, receiver-radius heuristics, moving-listener trajectories, and any late-field
audio remain out of scope for this slice.
