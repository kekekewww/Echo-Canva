# 02 — 最終 Release Runbook

## 1. 時程

官方截止：台灣時間 **2026-07-22 08:00**。

建議內部控制點：

| 台灣時間 | 交付 |
|---|---|
| 2026-07-20 18:00 | 功能凍結；只允許 P0/P1 修復 |
| 2026-07-20 23:00 | Release Candidate 1；公開部署 |
| 2026-07-21 12:00 | 最終驗收完成；README 與 Devpost 文案完成 |
| 2026-07-21 18:00 | 影片鎖定並設為 Public |
| 2026-07-22 00:00 | Devpost 完整草稿、所有連結測試完成 |
| 2026-07-22 04:00 | 正式提交，不再等待硬截止 |
| 2026-07-22 04:00–08:00 | 只處理提交平台或部署事故 |

## 2. Git 與 Release 流程

```bash
git status --short
pnpm install --frozen-lockfile
pnpm verify
git diff --check
```

目前工作分支是 `codex/echo-canvas-mvp`。除非 owner 明確要求，不另建不符合 repository branch policy 的 `release/` branch。靜態候選完成後先記錄 commit；標籤、push 與部署屬於外部 gate。

最終 owner 驗收後可建立標籤：

```bash
git tag -a v1.0.0-build-week-rc1 -m "OpenAI Build Week release candidate"
```

最終通過後：

```bash
git tag -a v1.0.0-build-week -m "OpenAI Build Week submitted release"
git push origin codex/echo-canvas-mvp --tags
```

## 3. 發佈流程

1. 以 production environment 部署。
2. 確認 `OPENAI_API_KEY` 僅存在伺服器端。
3. 以無痕瀏覽器測試公開網址。
4. 關閉瀏覽器 extension，重新測試。
5. 使用另一台裝置或網路測試。
6. 驗證 GPT API 逾時時，preset 與手動模式仍可使用。
7. 保存 deployment ID、commit hash、時間與 URL。

## 4. Release Candidate 證據

每次 RC 產生：

```text
artifacts/release/
├── rc-metadata.json
├── verify-output.txt
├── e2e-output.txt
├── screenshots/
├── audio-check-notes.md
├── browser-console.png
└── deployment-smoke-test.md
```

`rc-metadata.json`：

```json
{
  "version": "v1.0.0-build-week",
  "commit": "<COMMIT_SHA>",
  "deploymentUrl": "<PUBLIC_URL>",
  "testedAt": "<ISO_TIMESTAMP>",
  "browsers": ["Chrome", "Edge"],
  "status": "candidate"
}
```

## 5. Stop-the-line 條件

出現下列任一情況，停止影片與提交工作，先修復：

- 公開部署無法開啟；
- Start Audio 後無聲；
- 重複播放或 AudioContext 洩漏；
- 遮蔽／Portal wow moment 無法重現；
- API key 出現在 client bundle、Network response 或原始碼；
- GPT 產生非法場景後破壞現有場景；
- `pnpm verify` 或關鍵 E2E 失敗；
- 公開影片使用未授權音樂或素材。
