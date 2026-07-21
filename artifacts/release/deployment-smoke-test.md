# Production deployment smoke test

Tested: 2026-07-21 19:45 Asia/Taipei

- Public alias: `https://echo-canva.vercel.app`
- Deployment: `dpl_GRX92gsHN6p51X52hsGgKajkR5WE`
- Git branch: `main`
- Git commit: `c8fe24700b67861e2f64fbb8950e9281c0e13a3c`
- Runtime: Vercel Node.js 22, Next.js 16.2.10
- State: `READY`
- Alias error: none

## Automated public checks

- `/` — HTTP 200
- `/classic` — HTTP 200
- `/lab` — HTTP 200
- `/icon.svg` — HTTP 200
- `POST /api/scene/compile` — success with `openai/gpt-5.6-luna`
- `POST /api/scene/explain` — success with `openai/gpt-5.6-luna`
- Vercel grouped runtime errors after smoke traffic — none

The API key remained server-side. No key value was printed, committed, returned by either API, or exposed through a `NEXT_PUBLIC_` variable.

## Owner confirmation still required

Open the public alias in an incognito desktop Chrome or Edge profile, wear headphones, and complete the final perceptual flow documented in `docs/ACCEPTANCE_TESTS.md`. Automated HTTP and API smoke tests do not substitute for headphone perception or the owner's Devpost submission consent.
