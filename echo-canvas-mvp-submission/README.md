# EchoCanvas Build Week 提交交付包

## 目的

本資料包只處理 OpenAI Build Week 的最終凍結、驗證、公開部署、影片與證據整理。它已在 2026-07-20 對齊目前通過靜態驗證與人類階段驗收的 unified 2.5D / Hybrid 3D modelling workspace；它不是下一輪聲學研究規格。

**提交版原則：可理解性、可測試性、誠實的模型邊界與部署穩定性優先於新增功能。**

## 官方要求快照

資料於 2026-07-19 核對：

- 活動：OpenAI Build Week
- 截止：2026-07-21 17:00 Pacific Time，即台灣時間 2026-07-22 08:00
- 作品需使用 Codex 與 GPT-5.6
- 必須提交可運作專案、類別、專案說明、三分鐘內公開 YouTube 示範、程式碼儲存庫與主要 Codex 工作階段的 `/feedback` Session ID
- Developer Tools 類別還需提供安裝、支援平台與評審可直接測試的路徑
- 官方評分項目：Technological Implementation、Design、Potential Impact、Quality of the Idea

官方網站：https://openai.devpost.com/

## 建議使用順序

1. `01_RELEASE_SCOPE.md`：凍結目前 2.5D／Hybrid 3D 提交能力與限制。
2. `02_RELEASE_RUNBOOK.md`：依時間順序完成靜態候選、部署與提交。
3. `03_FINAL_ACCEPTANCE_MATRIX.md`：區分靜態、耳機與公開環境 Gate。
4. `04_DEMO_VIDEO_SCRIPT.md`：錄製三分鐘內影片。
5. `05_DEVPOST_SUBMISSION_COPY.md`：填寫 Devpost 英文文案。
6. `06_REPOSITORY_README_TEMPLATE.md`：核對根目錄 README，不覆寫真實規格。
7. `07_CODEX_AND_GPT_EVIDENCE.md`：整理 Codex、GPT-5.6 與提交期證據。
8. `08_LICENSE_ASSET_SECURITY_AUDIT.md`：完成授權、安全與相依套件稽核。
9. `09_RELEASE_RISKS_AND_ROLLBACK.md`：執行最終發佈與回退策略。

## 提交版產品敘事

> EchoCanvas is an AI-assisted spatial-audio prototyping workbench. A user can describe or author independent 2.5D and Hybrid 3D spaces, place sounds and listeners, and immediately hear deterministic approximations of occlusion, portal-aware propagation, first-order reflections, reverb, distance, and browser HRTF rendering.

最重要的示範是同一個設計意圖在可視、可聽、可編輯狀態間連續變化：

```text
Direct line of sight
→ hidden behind a concrete wall
→ rerouted through an open doorway
→ first-order wall / floor / ceiling paths inspected in 3D
→ Raw / Simulated A-B comparison
→ versioned project export
```

## 提交凍結後禁止事項

- 再重新設計核心資料模型、Worker protocol 或 Audio Graph；
- 加入 arbitrary mesh geometry、SOFA、自訂 HRTF、head tracking 或 Dolby Atmos；
- 將 second-order／directional late-field research foundations直接宣稱為已完成的 audible product path；
- 加入真正繞射、波動求解或建築聲學認證主張；
- 用未驗證第三方素材取代目前程序音訊；
- 為視覺效果破壞已驗證的鍵盤、直接操作、local cache 或 fallback。

提交前只允許修正 P0／P1 blocker、校正文案、補足證據與公開環境問題。
