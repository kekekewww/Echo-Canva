# Hybrid 3D P7-A: Directional late-field histogram

Status: **deterministic data model only; no late-field audio renderer**

P7-A transforms the diffuse receiver connections established by P5 into a deterministic
direction × delay energy histogram. It does not replace the Classic Schroeder reverb, alter the
P3 specular reflection taps, or enable `directionalLateReverb`.

## Contract

Each P5 connection already has a listener-relative arrival direction, delay, and mid-band gain.
P7-A maps the arrival direction to the nearest one of 12 or 24 fixed Fibonacci virtual-source
directions. It maps delay into a fixed-width cell over a half-open interval:

\[
[t_{min}, t_{max})
\]

and accumulates linear mid-band energy:

\[
E = 10^{gain_{dB}/10}
\]

The output preserves source counts, retained/discarded counts, input and retained energy, the
sorted non-empty cells, and an energy-weighted directional centroid. Out-of-range connections are
reported as discarded rather than assigned to a fabricated last cell.

## Evidence and boundary

Unit tests establish order-independent deterministic bins, energy accounting, direction and
time-cell assignment, delay filtering, finite empty output, and option validation.

This is a routing-ready data layer, not audible late reverberation. It has no multi-band decay,
moving-listener smoothing, virtual source allocation, directional FDN, Ambisonics, headphone
continuity claim, or replacement for the validated Classic late reverb.
