# Hybrid 3D P6-A: Six-band materials and atmospheric medium foundations

Status: **data-only foundation; no runtime audio path enabled**

P6-A introduces a Hybrid-only six-band projection without changing `SceneSpec v1`, the Classic
three-band registry, the Worker, or the Classic Web Audio graph.

## Material projection

The Hybrid bands are 125, 250, 500, 1,000, 2,000, and 4,000 Hz. Existing v1 Low/Mid/High values
anchor exactly at 250/1,000/4,000 Hz. Intermediate values use linear interpolation on
`log2(frequency)`; 125 Hz is clamped to the v1 Low value. The single v1 scattering coefficient is
copied across the six bands until a future authored six-band registry exists.

For each projected band:

\[
\tau = 10^{-TL/10},\qquad
\rho = 1 - \alpha - \tau
\]

\[
E_{specular}=\rho(1-s),\qquad E_{diffuse}=\rho s
\]

The validator requires `absorption + transmission + specular + diffuse = 1` within numerical
tolerance. It throws on invalid projected energy rather than silently normalizing a material.

## Atmospheric medium functions

The module provides data-only time-of-flight and attenuation helpers. It uses:

\[
c = 331.3 + 0.606T_C
\]

for the temperature-dependent speed approximation, and an ISO 9613-1-style molecular
absorption coefficient for 20 Hz–20 kHz. The supported experiment envelope is -20–50 C,
0–100% relative humidity, and 80–110 kPa. Segmented travel time is an explicit sum of each
segment's distance over its local speed.

The existing Classic engine continues to use its unchanged constant `343 m/s`; P6-A does not
turn on `sixBandMaterials` or `airAbsorption`, and it does not alter any direct, reflection, or
late-reverb parameter.

## Evidence and boundary

Unit tests prove exact v1 anchor projection, log-frequency midpoints, six-band energy balance,
hard-versus-treated high-band reflection distinction, 0 C and 20 C 100 m time-of-flight anchors,
segmented timing, bounded input rejection, and monotonic path/frequency air-loss behavior.

The Hybrid Lab exposes a bounded P6 preview control for temperature, relative humidity, and
pressure. It shows the calculated speed of sound, 100 m travel time, and 1/4 kHz loss over 100 m.
Those controls intentionally remain calculation-only: they do not alter the Lab's HRTF position,
direct delay, reflection taps, or audible sound while `airAbsorption` remains disabled.

This is not a claim of atmospheric measurement accuracy. It has no wind model, no six-band audio
renderer, no air-loss calibration against a laboratory measurement, and no change to the validated
Classic baseline.
