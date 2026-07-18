# Hybrid 3D P4 — Second-Order Reflection Branch Experiment

Status: **reference and pruned-ISM candidate implemented; runtime flag remains off**

P4 deliberately keeps second-order reflections out of the audible Lab path. Its purpose is to
compare a deterministic candidate against a small, exhaustive Image Source Method (ISM) oracle
before any path reaches the fixed audio tap bank.

## Reference oracle

`findExhaustiveSecondOrderReflections3D` enumerates ordered physical-surface pairs for at most
32 representative patches. For a path `source → A → B → listener`, it mirrors the source through
`A`, then `B`, intersects the listener line with `B`, resolves the preceding point on `A`, and
requires finite-patch containment plus visibility on all three legs.

The reference is test/benchmark-only and is not imported by the Lab renderer.

## Candidate A: pruned ISM

`findPrunedSecondOrderReflections3D` applies these deterministic prefilters before the finite
polygon and three-leg visibility work:

- reject repeated physical surfaces;
- reject an image-path lower bound beyond `maxPathLengthM`;
- reject a three-band mid-energy estimate beneath `minEstimatedGainDb`;
- sort valid paths deterministically and retain `top-K` candidates.

Its result includes path IDs, ordered surfaces, reflection points, delay, arrival direction,
mid-band energy estimate, and search statistics. The candidate evaluator reports path recall,
precision, delay RMSE, and retained mid-band energy against the exhaustive oracle.

## Current evidence

- two-surface floor/ceiling oracle: ordered paths, points, length `sqrt(45)`, and delay agree
  analytically;
- unpruned candidate: recall `1`, precision `1`, delay RMSE `0 ms`, retained mid-band energy `1`;
- 32-patch fixture: candidate retains all relevant oracle paths while reducing expensive evaluated
  surface pairs by at least `3×` through deterministic path-length pruning.

The last item is a deterministic work-reduction proxy, not a device-dependent wall-clock benchmark.
No CPU p50/p95 or Beam Tracing winner is claimed yet.

## Boundary and next step

`secondOrderReflections` remains default-off and P3's six audible first-order taps remain unchanged.
The next P4 step, if pursued, is a broader benchmark matrix with measured CPU p50/p95 and a separate
Beam candidate; P5 sampling, P6 materials, and P7 late-field work must not treat this experiment as
a production second-order renderer.
