# Decision Log

## D-001 — Browser-first delivery

Decision: Use a deployed Web Audio application instead of Godot/OpenAL for the hackathon MVP.

Reason: A browser demo minimizes judge setup and submission risk while preserving the core spatial-audio experience.

## D-002 — Deterministic acoustics, AI control plane

Decision: GPT-5.6 compiles intent and explains results; deterministic code computes acoustic parameters.

Reason: Testability, credibility, reproducibility, and clear judging evidence.

## D-003 — Exclude arbitrary binaural de-spatialization

Decision: Accept curated mono point-source assets.

Reason: The inverse problem is underdetermined without strong assumptions and is not a responsible hackathon promise.

## D-004 — Portal routing, not diffraction

Decision: Use explicit opening nodes and a visibility graph.

Reason: True edge diffraction is out of scope and much more complex than ray redirection.

## D-005 — Hybrid reverb

Decision: First-order image-source early reflections plus algorithmic late reverberation.

Reason: Better stability and plausibility than estimating an entire late field from a few per-frame rays.

## D-006 — Schroeder before FDN

Decision: Native-node Schroeder reverb is the MVP; FDN is conditional.

Reason: Lower implementation risk and easier browser compatibility.
