# Gate D AI Compiler and Explanation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let GPT-5.6 compile a bounded natural-language request into a validated editable scene and explain a deterministic acoustic snapshot, while preserving manual use and safe fallback when OpenAI is unavailable.

**Architecture:** Server-only route handlers call the Responses API through small injectable adapters. Every model result is untrusted: strict structured output is parsed, passed to the existing `validateScene`, and optionally repaired once. The React workbench calls typed same-origin endpoints, displays candidate/error state, and applies only validated results through a new reducer action; no model result can write audio parameters or execute code.

**Tech Stack:** Next.js App Router route handlers, official `openai` JavaScript SDK, Responses API Structured Outputs, TypeScript strict, Zod, existing scene validator, Vitest, Playwright, pnpm.

## Global Constraints

- Use `gpt-5.6` through the Responses API with `reasoning.effort: "medium"` for compilation and `"low"` for explanation; no model tools, browsing, or user-supplied URLs.
- Keep `OPENAI_API_KEY` server-only; browser code must never receive or request it. The missing-key path remains a preset/manual-mode fallback.
- Accept prompts of at most 2,000 characters; permit at most one repair request; enforce the existing maximum 100 walls, 8 portals, 4 sources, 6 reflections, 50 m room, registry IDs, and `validateScene` invariants.
- The model must only select built-in material/clip IDs and must never calculate RT60, select paths, set Web Audio parameters, execute code, or claim it heard output.
- Use product language: "interactive acoustic approximation", "portal-aware sound propagation", "first-order early reflections", "perceptually tuned material presets", and "browser HRTF rendering". Do not claim architectural accuracy, physical diffraction, custom KEMAR, or dry-source reconstruction.
- Preserve the current editor scene on every API error/rejection. Render all prose as text, never HTML.
- Follow TDD. After every task run `pnpm lint`, `pnpm typecheck`, and `pnpm test`; at Gate D also run `pnpm e2e` and `pnpm build`.

---

### Task 1: AI server contracts, compiler, and compile route

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`, `.env.example`
- Create: `src/ai/contracts.ts`, `src/ai/scene-compiler.ts`, `src/ai/rate-limit.ts`, `src/app/api/scene/compile/route.ts`
- Create: `tests/unit/ai-contracts.test.ts`, `tests/unit/scene-compiler.test.ts`, `tests/unit/scene-compile-route.test.ts`

**Interfaces:**
- `compileScene(request: CompileSceneRequest, dependencies: CompileDependencies): Promise<CompileSceneResponse>` accepts `{ prompt: string; baseScene?: unknown }` and returns either `{ ok: true; scene: SceneSpec; repairAttempted: boolean; warnings: string[]; model: string }` or `{ ok: false; error: { code; message }; fallbackSceneId: PresetId }`.
- `CompileDependencies.generateScene(schemaPrompt, repairErrors?): Promise<unknown>` is the injectable server adapter; production uses the official SDK, tests use deterministic candidates.
- `createSlidingWindowLimiter(limit, windowMs).check(key, now)` returns an allow/retry result without persisting prompts or keys.

- [ ] **Step 1: Write failing compiler contract tests**

```ts
it("rejects a 2,001-character prompt before the model adapter", async () => {
  const generateScene = vi.fn();
  const result = await compileScene({ prompt: "x".repeat(2001) }, { generateScene });
  expect(result).toMatchObject({ ok: false, error: { code: "PROMPT_TOO_LONG" } });
  expect(generateScene).not.toHaveBeenCalled();
});

it("repairs an invalid candidate exactly once then returns a validated scene", async () => {
  const generateScene = vi.fn().mockResolvedValueOnce(invalidScene).mockResolvedValueOnce(validScene);
  await expect(compileScene({ prompt: "small treated room" }, { generateScene }))
    .resolves.toMatchObject({ ok: true, repairAttempted: true, scene: validScene });
  expect(generateScene).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `pnpm test -- scene-compiler`

Expected: FAIL because `compileScene` and the AI contract module do not exist.

- [ ] **Step 3: Add minimal contracts, strict model prompt, validation, and rate limiter**

```ts
export async function compileScene(
  { prompt, baseScene }: CompileSceneRequest,
  deps: CompileDependencies,
): Promise<CompileSceneResponse> {
  if (prompt.length > 2000) return failure("PROMPT_TOO_LONG", "Describe the scene in 2,000 characters or fewer.");
  const first = await deps.generateScene(buildCompilePrompt(prompt, baseScene));
  const firstResult = validateScene(first);
  if (firstResult.ok) return success(firstResult.scene, false);
  const repaired = await deps.generateScene(buildCompilePrompt(prompt, baseScene, firstResult.errors));
  const repairedResult = validateScene(repaired);
  return repairedResult.ok ? success(repairedResult.scene, true) : failure("SCENE_VALIDATION_FAILED", "The generated scene could not be validated.");
}
```

Use a JSON Schema matching `SceneSpec`, `strict: true`, allowed registry IDs in the instructions, model `gpt-5.6`, and no tools. Add `.env.example` keys `OPENAI_SCENE_MODEL=gpt-5.6`, `OPENAI_EXPLAIN_MODEL=gpt-5.6`, `OPENAI_REASONING_EFFORT=medium`, `AI_REQUEST_TIMEOUT_MS=30000`, and `MAX_SCENE_PROMPT_CHARS=2000`.

- [ ] **Step 4: Add route tests before route implementation**

```ts
it("returns an unavailable fallback without OPENAI_API_KEY", async () => {
  const response = await handleCompileRequest(new Request("http://test/api/scene/compile", { method: "POST", body: JSON.stringify({ prompt: "room" }) }), unavailableDependencies);
  await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code: "AI_UNAVAILABLE" }, fallbackSceneId: "concrete-partition" });
});
```

- [ ] **Step 5: Implement the route and rerun focused checks**

Implement `POST` only; reject malformed JSON, non-string prompt, invalid base scenes, rate-limit excess, missing key, model refusal/timeout, and unvalidated output with typed JSON errors. Use only a client key derived from request headers and never log raw prompts. Run:

```bash
pnpm test -- ai-contracts scene-compiler scene-compile-route
pnpm lint
pnpm typecheck
pnpm test
```

Expected: all pass. Commit: `feat(ai): add validated GPT-5.6 scene compiler`.

### Task 2: Compiler client, candidate UI, and editable apply flow

**Files:**
- Create: `src/ai/client.ts`, `src/components/workbench/AiScenePanel.tsx`, `tests/unit/ai-client.test.ts`, `tests/e2e/scene-compiler.spec.ts`
- Modify: `src/domain/editor/reducer.ts`, `src/components/workbench/EchoWorkbench.tsx`, `src/app/globals.css`

**Interfaces:**
- `requestSceneCompilation(prompt, baseScene, fetcher = fetch): Promise<CompileSceneResponse>` throws no untyped errors and parses only the compile contract.
- `EditorAction` gains `{ type: "REPLACE_SCENE"; scene: SceneSpec }`; reducer validates it, assigns `revision = state.scene.revision + 1`, resets selection through `selectionForScene`, and rejects invalid scenes without overwriting state.
- `AiScenePanel` receives current scene, compiler state, `onApplyScene`, and `onExplain`; it never mutates the scene directly.

- [ ] **Step 1: Write failing reducer/client tests**

```ts
it("applies only a valid generated scene and increments the local revision", () => {
  const next = editorReducer(initialState, { type: "REPLACE_SCENE", scene: validScene });
  expect(next.scene).toMatchObject({ name: validScene.name, revision: initialState.scene.revision + 1 });
});

it("keeps the existing scene when the compiler returns a typed fallback", async () => {
  await expect(requestSceneCompilation("room", scene, failingFetcher)).resolves.toMatchObject({ ok: false, fallbackSceneId: "concrete-partition" });
});
```

- [ ] **Step 2: Run focused unit tests and observe RED**

Run: `pnpm test -- ai-client editor-reducer`

Expected: FAIL because `REPLACE_SCENE`, the typed client, and panel state do not exist.

- [ ] **Step 3: Implement minimal client/reducer/panel flow**

```tsx
<form onSubmit={(event) => { event.preventDefault(); void onGenerate(prompt); }}>
  <label htmlFor="scene-prompt">Describe a scene</label>
  <textarea id="scene-prompt" maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
  <button disabled={status === "loading" || prompt.trim().length === 0} type="submit">Generate scene</button>
</form>
{candidate ? <button onClick={() => onApplyScene(candidate)}>Apply generated scene</button> : null}
{error ? <p role="status">{error}</p> : null}
```

Show the model name/repair warning only after a successful candidate. On typed failure, render fallback/manual-mode guidance but leave current scene unchanged. Use React text rendering only.

- [ ] **Step 4: Write production E2E before final UI polish**

```ts
await page.route("**/api/scene/compile", route => route.fulfill({ json: successfulCompileResponse }));
await page.getByLabel("Describe a scene").fill("A narrow treated room with one voice source.");
await page.getByRole("button", { name: "Generate scene" }).click();
await page.getByRole("button", { name: "Apply generated scene" }).click();
await expect(page.getByRole("heading", { name: successfulCompileResponse.scene.name })).toBeVisible();
```

Add an adversarial/failure interception asserting the prior scene remains visible and no script/remote URL becomes a DOM asset. Run `pnpm e2e --grep "scene compiler"` RED before wiring the UI, then GREEN after implementation.

- [ ] **Step 5: Verify and commit**

Run:

```bash
pnpm test -- ai-client editor-reducer
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e --grep "scene compiler"
```

Expected: all pass. Commit: `feat(ui): add safe AI scene generation flow`.

### Task 3: Acoustic explanation, eval fixtures, Gate D handoff

**Files:**
- Create: `src/ai/acoustic-explainer.ts`, `src/app/api/scene/explain/route.ts`, `tests/unit/acoustic-explainer.test.ts`, `tests/unit/scene-explain-route.test.ts`, `tests/fixtures/ai-scene-prompts.ts`
- Modify: `src/ai/contracts.ts`, `src/ai/client.ts`, `src/components/workbench/AiScenePanel.tsx`, `src/components/workbench/EchoWorkbench.tsx`, `docs/STATUS.md`, `docs/BUILD_CHECKLIST.md`, `docs/ACCEPTANCE_TESTS.md`, `README.md`, `docs/DECISION_LOG.md`
- Modify: `tests/e2e/scene-compiler.spec.ts`

**Interfaces:**
- `explainAcoustics(request, dependencies): Promise<AcousticExplanationResponse>` accepts a selected source label, scene name, and a finite projection of matching `AcousticFrame`; successful output has `summary`, `factors: readonly { label; evidence }[]`, and `limitations: readonly string[]`.
- Explanation candidates are rejected unless all displayed numeric evidence comes from the input snapshot or fixed limitation text. The UI calls it only with `acousticFrame.revision === scene.revision`.

- [ ] **Step 1: Write failing explanation grounding tests**

```ts
it("rejects an explanation that introduces an absent numeric measurement", async () => {
  const result = await explainAcoustics(validRequest, { generateExplanation: async () => inventedMeasurement });
  expect(result).toMatchObject({ ok: false, error: { code: "EXPLANATION_VALIDATION_FAILED" } });
});

it("uses the deterministic route, gain, filter, and RT60 snapshot in the prompt", async () => {
  await explainAcoustics(validRequest, dependencies);
  expect(dependencies.generateExplanation).toHaveBeenCalledWith(expect.stringContaining("-13.4"));
});
```

- [ ] **Step 2: Run the focused explanation tests and observe RED**

Run: `pnpm test -- acoustic-explainer scene-explain-route`

Expected: FAIL because the explanation service and route do not exist.

- [ ] **Step 3: Implement structured explanation and UI**

Use a strict JSON response schema, model `gpt-5.6` and low reasoning effort. Project only route type, effective distance, dry gain, low-pass, portal count, and three-band RT60 into its prompt. Always append the fixed limitation `Portal routing is a geometric perceptual approximation.`; reject non-finite input and unavailable keys with typed errors. In the panel, add `Explain selected acoustics`, evidence rows, loading/error state, and no hearing/accuracy claim.

- [ ] **Step 4: Add fixtures/evaluation and production E2E**

Create ten bounded canonical prompt fixtures and five adversarial fixtures matching `ACCEPTANCE_TESTS.md`. Unit tests invoke the compiler with deterministic adapter responses to prove all canonical fixtures validate directly or after one repair, while adversarial candidates never reach state. Extend Playwright route interception to render an evidence-grounded explanation and assert current snapshot values/limitation copy; assert unavailable API leaves manual mode and generated candidate state intact.

- [ ] **Step 5: Document, verify, review, and hand off Gate D**

Record no-key fallback and evaluation evidence in `STATUS.md`; mark checklist items 9/10 implemented only after actual verification; add exact five human Gate D steps for canonical prompt, adversarial prompt, fallback preservation, snapshot explanation consistency, and no-key behavior. Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm e2e
pnpm build
```

Expected: all pass. Obtain independent task and whole-Gate-D reviews, fix all Critical/Important findings, rerun the same commands, commit `feat(ai): add grounded acoustic explanations`, start production server, then request Human Gate D `PASS` or `FAIL`.

## Plan self-review

- Spec coverage: Tasks 1-3 cover Build Checklist 9, the AI portions of 10, all Gate D acceptance scripts, explicit fallback, one repair, registry/domain validation, and explanation grounding.
- No-placeholder scan: no task uses TBD/TODO or vague validation/test steps; every code change has an interface, failing test, command, and expected result.
- Consistency: all server success candidates pass `validateScene`; client application uses one reducer `REPLACE_SCENE` action; explanation receives only matching deterministic frames.
- Scope: deployment, broad visual polish, and submission artifacts remain later Build Checklist work. No real-time audio or geometry formulas are altered.
