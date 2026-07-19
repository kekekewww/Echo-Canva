# Security, License, Asset, and Dependency Audit

Date: 2026-07-20

Scope: tracked repository content and release-candidate source. No local `.env.local` value was read or printed.

## Result

**PASS for static release preparation, with one accepted moderate transitive dependency advisory.** No critical or high vulnerability, tracked credential, client-side provider key read, arbitrary model URL path, or unlicensed bundled audio asset was found.

## Credential boundary

| Check | Result | Evidence |
|---|---|---|
| Tracked environment files | PASS | `git ls-files '.env*'` returns only `.env.example` |
| Current tracked credential-shaped values | PASS | no `sk-proj-` or `sk-or-` value with a credential-length suffix |
| Reachable history credential-shaped values | PASS | count `0` for credential-length `sk-proj-` / `sk-or-` history search |
| Client environment reads | PASS | no `process.env` or `NEXT_PUBLIC` read outside the server-side provider/route boundary |
| Server credential selection | PASS | `src/ai/provider.ts` resolves `OPENAI_API_KEY` or explicitly selected `OPENROUTER_API_KEY` only on the server |
| Prompt logging | PASS | compile and explain routes do not log request bodies or model payloads |
| Built client static bundle scan | PASS | no provider-key symbol or credential-shaped value in `.next/static` after the final production build |

The README contains only the intentionally incomplete example `sk-or-v1-...`; it is not a usable credential.

## AI request controls

| Control | Implementation |
|---|---|
| Prompt bound | `MAX_SCENE_PROMPT_CHARS = 2_000` |
| Rate limit | 10 requests / 60 seconds per hashed forwarded-address + user-agent key; limiter retains at most 1,000 keys |
| Timeout | 30 seconds by default |
| Tool execution | `tools: []` |
| Structured output | mode-specific strict JSON Schema |
| Domain validation | Classic SceneSpec plus Hybrid ID coverage/vertical bounds and safe-label policy |
| Repair limit | one additional candidate request after validation failure |
| Failure containment | typed unavailable/timeout/refusal/request errors; current scene remains unchanged |
| Explanation grounding | finite snapshot contract plus numeric-evidence and prohibited-claim validation |

Regression coverage includes provider selection, unavailable fallback, route rate limiting, schema/domain validation, canonical prompt fixtures, adversarial over-limit/remote-asset fixtures, content policy, and explanation grounding.

## Local audio boundary

- Built-in audio URLs are restricted to local `/audio/` paths and cannot contain a remote protocol.
- Device-local files accept WAV, MP3, or Ogg, must decode as mono, are capped at 25 MB each and 100 MB total, and remain in IndexedDB or a declared in-memory fallback.
- Authoring transfer serializes metadata only; blobs are not embedded or sent to model routes.
- All bundled WAV files are original deterministic procedural fixtures. Provenance is in `public/audio/LICENSE.md`; format/provenance are enforced by `tests/unit/audio-assets.test.ts`.

## Dependency audit

`pnpm audit --audit-level critical` result:

- critical: 0
- high: 0
- moderate: 1
- low: 0

The moderate advisory is PostCSS XSS during CSS stringify for `postcss <8.5.10`. The affected installed path is `next@16.2.10 -> postcss@8.4.31`; Vitest separately uses patched `postcss@8.5.19`. Echo Canvas does not accept, generate, or stringify untrusted user CSS. Because dependencies are frozen after the integration gate and the release requirement blocks unhandled critical vulnerabilities, this moderate transitive advisory is documented and accepted for the candidate. Re-evaluate a supported Next.js upgrade after submission.

## Claims and limitations

Release-facing text uses `interactive acoustic approximation`, `portal-aware sound propagation`, `first-order early reflections`, `perceptually tuned material presets`, and `browser HRTF rendering`. It does not claim certified acoustics, true wave diffraction, a named HRTF dataset, binaural source recovery, or unrestricted mesh-based 3D simulation.

## External follow-up

- Re-run the audit against the exact deployed commit.
- Inspect the production browser Network/Sources view for accidental environment exposure.
- Audit the recorded video's music, fonts, images, and overlays before upload.
- Revoke and rotate any provider key if it was ever pasted outside the server-side environment UI.
