# Risk Register

| Risk | Probability | Impact | Trigger | Mitigation / fallback |
|---|---:|---:|---|---|
| Audio graph glitches during edits | Medium | High | clicks, bursts, silence | persistent node pools, smoothing, no per-frame node rebuild; disable late reverb before sacrificing direct/portal flow |
| GPT scene output invalid | Medium | Medium | schema/domain rejection | strict Structured Outputs, one repair, deterministic preset fallback |
| Portal route sounds unconvincing | Medium | High | direction does not move to doorway | debug route, first-portal virtual source, tune loss/filter; never add "true diffraction" under deadline |
| Reverb sounds metallic | Medium | Medium | ringing in impulses/music | randomized/stereo-offset delays, damping, conservative wet level; use curated presets |
| Geometry edge cases cause flicker | Medium | High | route toggles while dragging | epsilon policy, hysteresis/debounce, property tests, coalesced Worker updates |
| Browser autoplay blocks sound | High | Low | silent initial load | explicit Start Audio gate and clear state |
| Scope expansion | High | High | new native/custom HRTF/de-spatialization tasks | root AGENTS scope freeze; any addition requires deletion of an equal-or-larger item |
| Judge cannot test | Low | Critical | setup failure | deployed browser demo, local assets, preset fallback, README |
| API key exposure | Low | Critical | key in client bundle/network | server route only, production bundle inspection |
| Third-party audio/license issue | Medium | High | unclear attribution | use owned/CC0 assets, store license metadata, avoid copyrighted demo music |
| Time lost on advanced FDN | Medium | High | reverb refactor before MVP | Schroeder is default; FDN only after Gate D passes |
| Perceptual test ambiguity | Medium | Medium | user cannot hear subtle difference | exaggerate within documented perceptual tuning; show metrics and A/B button |
