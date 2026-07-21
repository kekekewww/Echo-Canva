# 07 — Codex 與 GPT-5.6 證據包

## 1. 已建立的靜態證據

```text
artifacts/evidence/
├── CODEX_USAGE.md
├── GPT_RUNTIME_USAGE.md
├── DECISION_LOG.md
└── commit-timeline.csv

artifacts/release/
├── security-license-audit.md
├── submission-metadata.json
├── release-acceptance-report.md       # 完整驗證後建立
├── rc-metadata.json                   # 完整驗證後建立
├── static-verification-summary.md     # 完整驗證後建立
├── verify-output.txt                  # 完整驗證後建立
└── e2e-output.txt                     # 完整驗證後建立
```

## 2. Principal Codex Session

官方要求提供主要核心功能所在工作階段的 `/feedback` Session ID。這個欄位仍是 external owner gate：

- 在主要 Codex Session 執行 `/feedback`。
- 保存 Session ID 到提交記錄。
- 不要誤用只處理 README 或小修補的 Session。
- 不在靜態證據中編造、猜測或公開 credential-like identifier。

## 3. Codex 證據範圍

`artifacts/evidence/CODEX_USAGE.md` 已連結下列實作與代表 commit：

- 專案 scaffold、型別系統與 scene contract；
- 幾何、Worker、direct occlusion 與 Portal routing；
- Web Audio graph、參數平滑、reflection taps 與 Schroeder reverb；
- GPT route、Schema、validator 與 fallback；
- Hybrid 3D、unified workspace、camera/navigation；
- Unit／integration／production Chromium tests；
- release scope、security/license audit 與 verification。

## 4. GPT-5.6 Runtime 證據

`artifacts/evidence/GPT_RUNTIME_USAGE.md` 已記錄：

- server-only provider 與 Responses-compatible contract；
- Classic / Hybrid mode-aware strict schema；
- prompt、rate、timeout、tool、repair、content 與 domain limits；
- canonical/adversarial fixtures；
- arbitrary URL、markup、over-limit geometry rejection；
- preset/manual no-key fallback；
- Explanation 僅引用 finite deterministic snapshot 的驗證。

## 5. 尚待 owner 補齊的媒體證據

- `screenshots/codex-core-session.png`
- `screenshots/tests-passing.png`
- `screenshots/structured-output-schema.png`
- 三分鐘內的公開 YouTube demo
- 公開部署 clean-profile smoke 記錄
- `/feedback` Session ID

這些檔案必須來自實際畫面與公開環境，不得用靜態測試結果推定完成。

## 6. 提交期與原創性

- `artifacts/evidence/commit-timeline.csv` 保存 dated milestone commits。
- 第三方相依套件由 `pnpm-lock.yaml` 鎖定；應用程式與程序音訊授權分別由 `LICENSE` 與 `public/audio/LICENSE.md` 說明。
- 未將 Wwise、Steam Audio、OpenAL、SOFA 或第三方研究實作描述為本專案現有能力。
