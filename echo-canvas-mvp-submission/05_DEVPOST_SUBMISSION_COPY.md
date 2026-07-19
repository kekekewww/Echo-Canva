# 05 — Devpost 英文提交文案

以下文字已對齊目前 unified 2.5D / Hybrid 3D release candidate。提交前仍須填入真實網址、最終測試數字與 Session ID。

## Title

> EchoCanvas — Hear the Space Before You Build It

## Tagline

> An AI-assisted browser workbench for authoring, hearing, and explaining interactive spatial acoustics before committing to a game-engine audio pipeline.

## One-paragraph Summary

> EchoCanvas lets game developers and sound designers describe or author an acoustic scene, place sound sources and listeners, and immediately preview geometry-driven spatial-audio effects in a browser. Its independent 2.5D and Hybrid 3D projects share a modelling-style workflow while preserving their own local state. GPT-5.6 compiles natural-language intent into a validated candidate scene, while deterministic workers compute direct visibility, material occlusion, portal-aware propagation, first-order reflections, room metrics, and parameters for browser HRTF rendering. The result is an editable, audible, explainable prototype that can be shared without installing a game engine or audio middleware.

## Inspiration

> Spatial audio is usually evaluated late, after a scene has already been built in a game engine and connected to middleware. That makes early conversations between level designers, sound designers, developers, and clients slow and abstract. We wanted the acoustic equivalent of a visual wireframe: fast enough to explore, concrete enough to hear, and structured enough to export.

## What it does

> Users can switch between independent 2.5D and Hybrid 3D projects, create scenes manually or describe them in natural language, and edit room dimensions, listeners, point sources, finite walls, portals, materials, and vertical bounds. The workbench supports direct viewport manipulation plus precise numeric typing and scrubbing. Exactly one enabled listener is the active receiver, while additional listeners can be selected instantly. Local audio stays in the browser.
>
> EchoCanvas constrains GPT-5.6 output to mode-aware schemas and validates geometry, IDs, counts, vertical data, materials, and asset references before the user applies a candidate. Deterministic workers evaluate direct-path obstruction, material attenuation, portal-aware routing, first-order wall/floor/ceiling paths, distance, and estimated room-reverb parameters. A persistent Web Audio graph renders the result through browser HRTF. Raw and Simulated modes provide immediate A-B comparison, diagnostics explain why the sound changed, and versioned authoring JSON supports transfer without embedding local audio blobs.

## How we built it

> The project uses Next.js, React, and strict TypeScript for the workbench and server routes; SVG-based orthographic viewports for direct manipulation and path diagnostics; Web Workers for deterministic acoustic calculations; and Web Audio for filtering, delay, Schroeder reverberation, and browser HRTF rendering. GPT-5.6 is called through a server-only Responses-compatible API with strict structured output. Schema and domain validators prevent AI-generated scenes from introducing unsupported materials, assets, geometry, executable content, or arbitrary URLs. Codex was used throughout the core implementation, regression tests, architectural refactoring, release verification, and documentation.

## Challenges

> The largest challenge was separating acoustic events that should be deterministic from those that can be approximated perceptually. Direct obstruction and portal routing must remain stable while users drag objects, and first-order 3D paths must stay synchronized with the same accepted worker revision that drives audio. Room reverb must update smoothly without rebuilding the audio graph. We also had to keep GPT-5.6 outside the real-time audio path, preserve usable fallbacks when an AI provider is unavailable, and make audible decisions visible enough to understand in a short demo.

## Accomplishments

> We built a complete modelling-style browser workflow rather than a disconnected DSP experiment: independent cached 2.5D and Hybrid 3D projects, multiple switchable listeners, built-in and device-local point sources, reversible disable semantics, deterministic acoustic diagnostics, stable real-time audio, Raw/Simulated comparison, import/export, AI-assisted authoring, automated tests, and a deployment-ready application. The core portal moment is especially effective: a blocked source can perceptually shift toward an opened doorway while the route and parameters update on screen.

## What we learned

> More rays do not automatically produce a better product. Important direct and first-order paths require deterministic geometry, while diffuse late energy needs a bounded perceptual model. We also learned that AI is most reliable as a constrained authoring and explanation layer, not as a replacement for geometry or real-time DSP, and that 3D diagnostics must share the same revision contract as audible output.

## What's next

> The post-hackathon roadmap focuses on engine interchange and deeper validation: game-engine scene export, arbitrary room meshes, calibrated material data, SOFA-based binaural rendering, optional head tracking, measurement comparison, and a bounded directional late-field renderer. True wave diffraction and architectural-acoustics certification remain separate research problems rather than release claims.

## Testing Instructions

> 1. Open [PUBLIC_DEMO_URL] in a current desktop Chrome or Edge browser and wear headphones.
> 2. Click Play, load the Concrete Partition preset, and move the active listener behind the wall.
> 3. Compare Raw with Simulated, then open the portal and inspect the perceived direction and route overlay.
> 4. Switch to 3D, drag a source or listener in X/Z and use Shift-drag for Y; inspect wall, floor, and ceiling first-order paths.
> 5. Switch back to 2.5D to confirm that each mode kept its own project.
> 6. Try the AI scene compiler, or continue with presets and manual editing if the AI service is unavailable.

## Repository

> https://github.com/kekekewww/Echo-Canva

## Demo video

> [YOUTUBE_URL — pending owner upload]

## Codex Session

> [FEEDBACK_SESSION_ID — pending principal-session /feedback]
