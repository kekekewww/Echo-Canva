# Gate D AI Scene Compiler and Explanation Design

## Goal

Add GPT-5.6 product capabilities without placing an LLM in the real-time audio path: compile a bounded natural-language request into a validated `SceneSpec`, then explain an already computed `AcousticFrame` in user-facing language.

## Approved scope and boundaries

The repository's existing PRD, API contracts, AGENTS instructions, and Build Checklist items 9-10 are the approved Gate D scope. The model is a control-plane dependency only. It may select built-in material and clip IDs and produce explanatory prose; it never calculates acoustics, controls `AudioParam`s, executes code, produces remote asset URLs, or mutates the editor until a candidate scene has passed all deterministic validation.

## Considered approaches

1. Browser-direct API call: rejected because it exposes credentials and makes the preset fallback unreliable.
2. Free-form JSON with best-effort parsing: rejected because a syntactically valid response can still violate scene limits, registries, or geometry invariants.
3. Server-side Responses API with strict JSON schema, then Zod/domain validation and a single bounded repair attempt: selected. It keeps keys server-side, turns model output into an untrusted candidate, and leaves the current editor scene untouched when the request fails.

## Architecture

```text
AI panel prompt
  -> POST /api/scene/compile
  -> request/length/rate-limit checks
  -> GPT-5.6 Responses API strict structured output
  -> Zod SceneSpec + deterministic validateScene
  -> one compact repair request only when validation fails
  -> validated scene or named preset fallback
  -> explicit UI apply action

Current SceneSpec + current matching AcousticFrame
  -> POST /api/scene/explain
  -> bounded snapshot projection
  -> GPT-5.6 strict explanation output
  -> evidence/limitations card
```

## Server contracts

`POST /api/scene/compile` accepts a prompt of at most 2,000 characters and an optional validated base scene. It returns either a validated candidate (with `repairAttempted`, `warnings`, and model metadata) or a typed error and a preset fallback ID. The route never requires the browser to supply an API key. If `OPENAI_API_KEY` is unavailable, it returns a typed unavailable result and the UI keeps manual editing available.

`POST /api/scene/explain` accepts only a selected-source, finite deterministic snapshot projection plus scene/source labels. It returns structured `summary`, `factors`, and fixed approximation `limitations`. Its prompt expressly forbids invented measurements and listening claims.

## Validation and abuse controls

- validate JSON bodies, method, prompt length, and finite input values;
- use strict Structured Outputs and no model tools;
- run `validateScene` after every candidate and at most one repair pass;
- enforce the existing material/audio registries, geometry and object limits;
- do not log raw prompts or keys;
- apply a small in-memory per-client/IP request window suitable for a demo;
- escape model prose through normal React rendering; never evaluate it;
- preserve the current scene on every failure and surface an actionable status.

## Client behavior

The workbench gets an AI panel with a prompt box, Generate Scene button, loading/error/fallback state, a candidate summary, and an explicit Apply button. It offers an Explain acoustics action only when a current matching acoustic frame and selected source exist. Applying replaces the editor scene through a reducer action, increments revision through existing state machinery, and reuses the Worker/audio lifecycle; no generated output bypasses that path.

## Verification

Unit/integration tests cover payload limits, missing credentials, strict candidate validation, one repair maximum, unknown IDs, adversarial instructions, safe fallback, and explanation evidence grounding. Browser tests use a controlled server adapter to cover loading, valid candidate apply, safe failure preservation, and explanation rendering without live credentials. A recorded fixture/evaluation suite contains ten canonical prompts; production use remains optional until the user provides `OPENAI_API_KEY` server-side.

## Explicit limitations

The compiler creates editable demo-scale scenes, not measured room models. Portal routing and all acoustic values remain the existing interactive approximation. The explanation describes engine outputs; it does not hear audio or certify physical accuracy.
