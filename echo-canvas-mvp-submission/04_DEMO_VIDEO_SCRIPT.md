# 04 — 三分鐘 Demo 影片腳本

## 影片規格

- 目標長度：2:50–2:57，絕不可超過 3:00。
- 平台：公開 YouTube。
- 語言：英文旁白，或完整英文翻譯與字幕。
- 前五秒顯示 headphones recommended；聲音與畫面 route label 必須同步。

## Shot List 與英文旁白

### 0:00–0:13 — Problem

畫面：unified workbench、耳機提示。

> Spatial audio is powerful, but testing occlusion, doorways, reflections, and room materials usually starts too late inside a full engine and middleware stack. EchoCanvas makes that first acoustic prototype available directly in the browser.

### 0:13–0:36 — GPT-5.6 Scene Compiler

畫面：在 2.5D 輸入 partition/doorway 描述，顯示 candidate，再按 Apply。

> I describe the space in natural language. GPT-5.6 converts intent into a mode-aware, schema-constrained candidate. Deterministic validators reject invalid geometry, unknown materials, unsafe labels, remote assets, and over-limit scenes before anything is applied.

### 0:36–1:04 — Occlusion

畫面：播放 direct，再把 active Listener 拖到混凝土牆後；顯示 red blocked path、gain、cutoff。

> The acoustic worker checks the exact direct path. Behind this concrete partition, the signal becomes quieter and darker, and the diagnostic view shows the wall, gain, and low-pass values responsible for the change.

### 1:04–1:29 — Portal Wow Moment

畫面：開門、關門，cyan route 指向 Portal；快速 Raw／Simulated。

> Opening the doorway enables a portal-aware propagation route. The perceived direction shifts toward the opening and the effective distance updates. Closing it removes that route. Raw and Simulated provide an immediate A-B comparison without restarting the source.

### 1:29–1:52 — 3D Authoring

畫面：切換 3D；Outliner 點選 source／Listener；拖 X/Z、Shift+拖 Y；Inspector 微調；Frame All。

> The 3D project is independent but uses the same modelling workflow. I can drag sources and listeners in the plan, adjust elevation directly or numerically, edit finite wall and portal bounds, and frame the whole scene without losing the 2.5D project.

### 1:52–2:13 — First-order paths and room character

畫面：顯示 direct、floor、ceiling、wall reflection overlays；比較 hard/treated material；Disable/Enable wall。

> Matched-revision overlays show direct, blocked, portal, and first-order wall, floor, and ceiling paths. Perceptually tuned materials and estimated three-band room decay drive a stable persistent audio graph. These are interactive approximations, not architectural measurements.

### 2:13–2:34 — Workflow and transfer

畫面：multiple Listener 切換、local source picker、2.5D/3D 往返、export JSON。

> Designers can switch the active listener, use built-in or device-local mono sources, undo edits, disable geometry reversibly, and export versioned authoring JSON. Local audio stays in the browser, and both project caches survive mode switches.

### 2:34–2:50 — Architecture and Codex

畫面：簡短架構圖、tests-passing 截圖、commit timeline。

> Codex built the typed workbench, deterministic solvers, Web Audio integration, AI boundaries, regression suite, and release evidence. GPT-5.6 remains the authoring and explanation control plane; it never replaces the acoustic calculations.

### 2:50–2:57 — Impact

畫面：公開 Demo URL、最後產品全景。

> EchoCanvas turns an acoustic idea into something editable, audible, explainable, and shareable before a game scene is committed.

## 剪輯原則

- 預先輸入 prompt 或加速輸入段，移除 API 等待與重複動作。
- 字幕只保留 `Direct`、`Blocked`、`Portal`、`Raw`、`Simulated`、`First-order` 等必要詞。
- 不滾動大量程式碼；用一張架構圖、測試 PASS 畫面與 commit timeline 證明實作。
- 只使用專案自製程序音訊，或另有明確商用／重新散布授權的媒體。
- 錄製後實測影片長度，並在無痕視窗逐一開啟公開 Demo、repository 與 YouTube URL。
