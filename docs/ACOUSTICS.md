# Acoustic Model and Formula Reference

## Model status

This project is an interactive, perceptually tuned geometric-acoustics approximation. It is not an architectural-acoustics measurement or certification system.

Three frequency bands are used:

- low: representative center near 250 Hz;
- mid: representative center near 1 kHz;
- high: representative center near 4 kHz.

The implementation may label them Low/Mid/High rather than pretending to provide octave-band precision.

## Constants and units

- coordinates: meters;
- time: seconds;
- level/loss: decibels;
- speed of sound: `c = 343 m/s` at approximately 20 °C;
- numerical epsilon: centralize in one module, initially `1e-8`.

## 1. 2D segment intersection

Ray:

\[
p + t r
\]

Segment:

\[
q + u s
\]

For non-parallel vectors:

\[
t = \frac{(q-p)\times s}{r\times s}
\]

\[
u = \frac{(q-p)\times r}{r\times s}
\]

A ray/segment hit is valid when:

\[
t \ge 0,\qquad 0 \le u \le 1
\]

For finite segment-to-segment visibility, require both parameters in `[0,1]`.

Implementation requirements:

- use one robust cross-product utility;
- handle parallel/collinear cases explicitly;
- offset reflection origins by epsilon to avoid immediate self-intersection;
- test endpoint touching, near-parallel, overlapping, and zero-length cases.

## 2. Specular reflection direction

For incident unit direction \(d\) and unit surface normal \(n\):

\[
d' = d - 2(d\cdot n)n
\]

This is useful for debug ray visualization. Authoritative first-order paths should use the image-source construction below.

## 3. Polygon area, perimeter, and volume

For ordered polygon vertices \((x_i,y_i)\), shoelace area is:

\[
A_{2D} = \frac{1}{2}\left|
\sum_{i=0}^{N-1}
(x_i y_{i+1} - x_{i+1}y_i)
\right|
\]

with cyclic indexing.

Given room height \(h\):

\[
V=A_{2D}h
\]

Boundary areas:

\[
S_{floor}=A_{2D},\qquad S_{ceiling}=A_{2D}
\]

\[
S_{outerWalls}=P h
\]

where \(P\) is the polygon perimeter. Internal partitions should contribute both exposed faces when included in reverberation estimation.

## 4. Material energy bookkeeping

For band \(b\):

- absorption coefficient: \(\alpha_b\);
- transmission loss: \(TL_b\) dB.

Transmission energy coefficient:

\[
\tau_b = 10^{-TL_b/10}
\]

Reflection energy coefficient:

\[
\rho_b = \max(0, 1-\alpha_b-\tau_b)
\]

Amplitude reflection coefficient:

\[
r_b = \sqrt{\rho_b}
\]

General dB-to-amplitude conversion:

\[
g = 10^{-L_{dB}/20}
\]

Validation:

\[
0 \le \alpha_b \le 1,\qquad TL_b \ge 0,\qquad
\alpha_b+\tau_b \le 1+\epsilon
\]

If a preset violates the energy constraint, reject it during development rather than silently normalizing it.

## 5. Propagation delay

For path length \(L\):

\[
t = \frac{L}{c}
\]

For an early reflection relative to the direct path:

\[
\Delta t_k = \frac{L_k-L_{direct}}{c}
\]

When the direct path is blocked, use the selected effective route length as the reference for user-facing delay, but retain absolute path delays internally. Because a valid first-order reflected path can arrive before a longer Portal-aware direct route, the relative early-tap delay sent to Web Audio is clamped to `max(0, Δt)`; a negative transport value is rejected.

## 6. Distance attenuation

Use a deterministic manual formula so portal routes can use effective path length independently of panner coordinates.

An inverse-style model compatible in spirit with Web Audio:

\[
g_{dist}(d)=
\frac{d_{ref}}
{d_{ref}+f\max(d-d_{ref},0)}
\]

where:

- \(d_{ref}\): reference distance, initially 1 m;
- \(f\): rolloff factor;
- clamp \(d\) to a practical maximum.

Set `PannerNode.rolloffFactor = 0` when using manual gain, preventing double distance attenuation.

## 7. Direct-path occlusion heuristic

For each wall crossed by the source-listener segment:

1. compute incidence with unit propagation direction \(d\) and wall normal \(n\);
2. estimate an effective thickness:

\[
t_{eff}=
\frac{t_{wall}}
{\max(|d\cdot n|,\,0.25)}
\]

3. optionally adjust preset transmission loss relative to reference thickness \(t_{ref}\):

\[
TL_{eff,b}
=
TL_{preset,b}
+
6\log_2\left(
\frac{t_{eff}}{t_{ref}}
\right)
\]

This thickness adjustment is a perceptual heuristic, not a general wall-transmission law.

Accumulate crossed-wall loss:

\[
TL_{route,b} = \sum_j TL_{eff,b,j}
\]

Rendered direct amplitude:

\[
g_{occ}=10^{-\min(TL_{route,mid},L_{cap})/20}
\]

Use a demo-safe cap such as \(L_{cap}=24\) dB so a blocked source remains inspectable.

Map high-band loss to low-pass cutoff:

\[
O=\operatorname{clamp}
\left(
\frac{TL_{route,high}}{36},
0,1
\right)
\]

\[
f_c=
f_{min}
\left(
\frac{f_{max}}{f_{min}}
\right)^{1-O}
\]

Initial values:

- \(f_{min}=700\) Hz;
- \(f_{max}=20{,}000\) Hz.

These constants must be centralized and exposed in debug information.

## 8. Portal-aware route approximation

Portals are explicit scene objects attached to walls. A portal is either open or closed.

Graph nodes:

- source;
- listener;
- centers of open portals.

Connect two nodes if the segment between them is visible, allowing the endpoint portal's own opening.

For an edge or complete candidate path, use a cost:

\[
C =
L
+
\lambda_{loss} L_{portal,dB}
+
\lambda_{turn}\sum_k \theta_k^2
\]

where:

- \(L\): geometric path length;
- \(L_{portal,dB}\): configurable portal loss;
- \(\theta_k\): change of direction at a portal.

Select the minimum-cost valid path using Dijkstra. For small graph sizes, a simple implementation is sufficient.

Rendering:

- virtual panner direction points from listener to the first portal on the route;
- manual distance gain uses the entire route length;
- add portal loss and a mild low-pass;
- closed portals are omitted from the graph.

This is "portal-aware sound propagation," not true diffraction.

## 9. First-order image-source reflections

For each reflective wall segment:

1. reflect the source position \(s\) across the infinite wall line to obtain image source \(s'\);
2. connect \(s'\) to listener \(l\);
3. intersect that line with the wall at \(q\);
4. accept only when \(q\) lies on the segment;
5. verify visibility of \(s\to q\) and \(q\to l\), excluding the reflecting segment at the endpoint.

Path length:

\[
L_k = \|s-q\|+\|q-l\|
\]

Relative delay:

\[
\Delta t_k = \frac{L_k-L_{reference}}{c}
\]

Approximate band gain:

\[
g_{k,b} =
r_b
\cdot
g_{dist}(L_k)
\cdot
g_{visibility}
\]

Use the mid-band coefficient for the tap's base amplitude. Map low/high differences to a lightweight filter if time permits.

Rank candidates by estimated energy and keep at most six taps per source. Reject taps with negligible gain or delay above the configured early-reflection window.

The reflection panner direction should point from listener to reflection point \(q\).

## 9.1 Bounded basic-shape obstacles

Authoring supports at most eight Box, Cylinder, or Sphere obstacles. In Classic 2.5D, every
enabled shape becomes a full-height closed footprint made from four or twelve synthetic wall
segments. Direct occlusion, portal visibility, and first-order footprint reflections therefore
reuse the deterministic planar engine.

Hybrid uses finite surface patches in the existing BVH: six for a Box, fourteen for a twelve-side
Cylinder including caps, and thirty-two for an 8-by-4 faceted Sphere. Direct-path hits retain the
primitive surface ID, registered material, local thickness estimate, and incidence. First-order
reflection candidates use the same finite patches and remain subject to the existing per-source
six-tap ranking cap. Cylinder and Sphere behavior is explicitly a faceted acoustic approximation,
not analytic curved-surface or wave-acoustic simulation.

Disabled shapes contribute neither visible geometry nor acoustic surfaces. Shape volume is not
subtracted from the Eyring room volume in this bounded version; materials affect intercepted
direct paths and ranked early-reflection surfaces only.

## 10. RT60 estimation

For band \(b\), equivalent absorption area:

\[
A_b=\sum_i S_i \alpha_{i,b}
\]

Total surface area:

\[
S=\sum_i S_i
\]

Mean absorption:

\[
\bar{\alpha}_b=\frac{A_b}{S}
\]

Sabine estimate:

\[
RT_{60,b}^{Sabine}
=
0.161\frac{V}{A_b}
\]

Eyring estimate:

\[
RT_{60,b}^{Eyring}
=
0.161
\frac{V}
{-S\ln(1-\bar{\alpha}_b)}
\]

Use Eyring as the default because the small editable rooms may contain substantial absorption. Handle the limits numerically:

- near \(\bar{\alpha}=0\): cap to maximum RT60;
- near \(\bar{\alpha}=1\): approach minimum RT60;
- initial UI clamp: 0.12–4.0 s.

Treat an open portal's area as near-total absorption for the room energy estimate. Report that this is an approximation.

Suggested pre-delay:

\[
t_{pre}=
\operatorname{clamp}
\left(
\frac{d_{characteristic}}{c},
0.005,
0.08
\right)
\]

where \(d_{characteristic}\) can be a source-listener or room-scale distance chosen consistently.

## 11. Early-reflection synthesis

A sparse early-reflection signal is:

\[
y_{ER}[n]=
\sum_{k=1}^{K}
a_k
x[n-\operatorname{round}(f_s\Delta t_k)]
\]

Implementation:

- fixed `DelayNode` + `GainNode` + `PannerNode` tap pool;
- inactive taps ramp to zero;
- changed delay/gain values are smoothed;
- avoid reallocating tap nodes.

## 12. Schroeder late reverberation

Feedback comb:

\[
y[n]=x[n]+g\,y[n-M]
\]

For a target 60 dB decay time:

\[
g=
10^{-3M/(f_s RT_{60})}
\]

because 60 dB amplitude decay corresponds to a factor of \(10^{-3}\).

MVP topology:

- four parallel feedback comb filters;
- two serial all-pass diffusers;
- separate left/right delay offsets;
- low-pass damping inside or around the feedback path;
- wet/dry and pre-delay controls;
- master safety gain.

Useful starting comb delays around 48 kHz:

- 29.7 ms;
- 37.1 ms;
- 41.1 ms;
- 43.7 ms.

Useful all-pass delays:

- approximately 5.0 ms;
- approximately 1.7 ms.

Do not treat these as sacred constants. Avoid identical left/right delay sets.

Frequency-dependent decay approximation:

- use `RT60_mid` to set feedback;
- derive damping cutoff from `RT60_high / RT60_mid`;
- use `RT60_low / RT60_mid` to adjust low-frequency damping or document it as display-only for MVP.

## 13. Optional FDN extension

Only implement after all MVP gates pass.

General transfer form:

\[
H(z)
=
c^T
\left[
D(z^{-1})-A
\right]^{-1}
b+d
\]

Use:

- 4 or 8 delay lines;
- mutually prime-ish delay lengths;
- orthogonal/Hadamard feedback matrix;
- per-line attenuation filters;
- `AudioWorkletProcessor` on the audio rendering thread.

The FDN must replace, not coexist chaotically with, the Schroeder implementation.

## 14. HRTF rendering

For source \(x_i\), conceptually:

\[
y_L = \sum_i x_i * h_L(\theta_i,\phi_i)
\]

\[
y_R = \sum_i x_i * h_R(\theta_i,\phi_i)
\]

The browser's Web Audio `PannerNode` with `panningModel = "HRTF"` performs the implementation-specific measured-HRIR convolution.

Do not claim a specific HRTF database. The Web Audio interface does not expose which measured dataset the browser uses.

For a top-down editor:

- map world X/Z to `PannerNode.positionX/positionZ`;
- keep vertical Y fixed or use a small constant;
- set listener forward/up orientation consistently;
- provide an explicit Headphones recommended label.

## 15. Parameter smoothing

Equivalent one-pole target smoothing:

\[
p[n]
=
a p[n-1]+(1-a)p_{target}
\]

\[
a=e^{-1/(f_s\tau)}
\]

In Web Audio, prefer:

```ts
param.setTargetAtTime(target, audioContext.currentTime, tau);
```

Initial \(\tau\):

- gain/filter/send: 0.06–0.10 s;
- panner coordinate updates: tune for perceptual stability;
- mode crossfade: approximately 0.05 s.

## 16. Binaural de-spatialization decision

An arbitrary binaural recording can be represented approximately as:

\[
L=s*h_L+a_L,\qquad R=s*h_R+a_R
\]

Unknown source \(s\), unknown transfer functions \(h_L,h_R\), and unknown ambient components make the inverse problem underdetermined without strong assumptions or learned priors.

MVP policy:

- accept curated mono point-source assets;
- stereo import, if added, may use a clearly labeled mono fold-down;
- never call this process deconvolution, dereverberation, or dry-source recovery.

## 17. Worker algorithm sketch

```ts
function computeFrame(scene: SceneSpec): AcousticFrame {
  const room = estimateRoomAcoustics(scene);
  const portalGraph = buildPortalVisibilityGraph(scene);

  const sources = scene.sources.map((source) => {
    const direct = traceDirectPath(source.position, scene.listener.position, scene);

    const route =
      direct.visible
        ? makeDirectRoute(direct)
        : findBestPortalRoute(source, scene.listener, portalGraph, scene);

    const occlusion = estimateOcclusion(route, direct, scene);
    const earlyReflections = findFirstOrderReflections(
      source,
      scene.listener,
      scene,
      6
    );

    return mapSourceFrame({
      source,
      route,
      occlusion,
      earlyReflections,
      room,
    });
  });

  return { revision: scene.revision, room, sources };
}
```

## 18. Audio application sketch

```ts
function applyFrame(frame: AcousticFrame, now: number): void {
  updateLateReverb(frame.room, now);

  for (const sourceFrame of frame.sources) {
    const graph = sourceGraphs.get(sourceFrame.sourceId);
    if (!graph) continue;

    smoothDb(graph.directGain.gain, sourceFrame.dryGainDb, now);
    smoothHz(graph.lowpass.frequency, sourceFrame.lowpassHz, now);
    smoothPosition(graph.panner, sourceFrame.virtualPosition, now);
    smoothDb(graph.reverbSend.gain, sourceFrame.reverbSendDb, now);

    graph.earlyReflectionBank.apply(
      sourceFrame.earlyReflections,
      now
    );
  }
}
```
