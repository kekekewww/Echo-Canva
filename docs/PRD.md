# Product Requirements Document

## Working product definition

A browser-based spatial-audio prototyping tool for game developers, interactive-media designers, and sound designers.

A user can:

1. describe a scene in natural language or edit it on a 2D canvas;
2. position walls, portals, sound sources, and a listener;
3. hear deterministic approximations of distance, obstruction, portal routing, early reflections, late reverberation, and HRTF panning;
4. inspect why the sound changed;
5. export the scene as validated JSON.

## Core problem

Early-stage scene design usually lacks an immediate, lightweight way to preview how walls, openings, and materials may change perceived audio. Full middleware and engine integrations are costly to configure merely to test an idea.

## Primary user

An indie game or interactive-media developer who needs rapid acoustic previsualization before integrating production middleware.

## Value proposition

"Describe or draw a space, then hear and inspect a coherent spatial-audio approximation in the browser."

## Success criteria

The MVP is successful when a judge can open one URL, start audio, generate or load a scene, drag the listener behind a wall, open and close a portal, change material presets, and hear/see coherent changes without setup.

## Required user stories

### US-01 — Load a reliable demo

As a judge, I can open a preset scene and hear sound after one explicit `Start Audio` action.

Acceptance:

- no account or API key is required for presets, manual editing, or deterministic audio; optional GPT features request the visitor's own OpenRouter key in Settings;
- no console error occurs;
- the demo contains at least two local, licensed mono sources;
- Raw and Simulated modes can be switched instantly.

### US-02 — Edit scene geometry

As a creator, I can add, move, select, and delete wall segments and move the listener/sources.

Acceptance:

- positions snap optionally but remain editable;
- invalid geometry is rejected or clearly marked;
- all distances are displayed in meters;
- editing remains responsive with 100 walls.

### US-03 — Hear obstruction

As a creator, moving a source or listener behind a wall reduces the direct level and high-frequency content.

Acceptance:

- the obstructing wall is highlighted;
- `dryGainDb`, `lowpassHz`, and route type are visible in debug mode;
- transitions are smooth, with no click or burst.

### US-04 — Hear portal-aware routing

As a creator, when direct sight is blocked and a valid open portal path exists, the apparent direction moves toward the first portal.

Acceptance:

- opening and closing the portal changes route selection;
- total path distance, portal path, and virtual direction are visible;
- the UI calls this an approximation, not physical diffraction.

### US-05 — Hear room character

As a creator, room size and material changes alter early reflections and late reverberation.

Acceptance:

- estimated three-band RT60 is displayed;
- hard and soft presets produce clearly different tails;
- no audio graph rebuild or audible glitch occurs during normal editing.

### US-06 — Generate a scene with GPT-5.6

As a creator, I can type a bounded scene description and obtain a valid editable `SceneSpec`.

Acceptance:

- strict Structured Outputs are used;
- output passes JSON Schema and domain validation;
- one repair attempt is allowed;
- failure returns a safe preset and an actionable message;
- the model cannot invent material/audio IDs.

### US-07 — Explain the deterministic result

As a creator, I can ask for a concise explanation of why a source sounds obstructed or portal-routed.

Acceptance:

- the explanation receives only `AcousticSnapshot` values calculated by the engine;
- it distinguishes measured values, approximations, and model-generated prose;
- it never claims physical accuracy.

### US-08 — Export and test

As a judge, I can export/import scene JSON and follow README instructions without rebuilding a complicated native stack.

Acceptance:

- exported JSON includes a schema version;
- invalid imports are rejected without corrupting current state;
- a deployed demo is available;
- setup and supported-browser instructions are complete.

## Non-goals

- architectural certification;
- production-grade middleware replacement;
- inverse acoustic reconstruction;
- arbitrary uploaded binaural recordings;
- true edge diffraction;
- full-room impulse-response convolution;
- multi-user collaboration;
- mobile-native packaging.

## Track and judging alignment

Recommended track: Developer Tools.

Evidence to expose:

- Technological Implementation: deterministic geometry/DSP, Worker separation, tests, Codex session record.
- Design: coherent editor-to-listening workflow and a no-install demo.
- Potential Impact: rapid previsualization for a concrete creator audience.
- Quality of Idea: GPT-5.6 compiles intent; deterministic code computes acoustics.
