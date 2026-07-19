# 09 — Release Risks and Rollback

## 1. 風險優先序

| 風險 | 等級 | 應對 |
|---|---:|---|
| 公開部署中斷 | P0 | 保留上一個穩定 deployment alias；manual/preset 不依賴 AI |
| Audio 無聲／重複播放 | P0 | 回退最近 AudioEngine commit，保留固定 graph 與 explicit Play/Retry |
| API key 洩漏 | P0 | 立即撤銷 key、清除公開 history、重新部署 |
| Portal wow moment 失效 | P1 | 回退 solver 或 mapping，不加入未驗證的 diffraction |
| GPT 產生非法／錯模式場景 | P1 | 關閉 AI，保留 preset/manual；不得跳過 validator |
| 2.5D／3D cache 互相覆寫 | P1 | 回退 workspace persistence 變更並保留 recovery export |
| 3D overlay 與聲音 revision 不一致 | P1 | 隱藏 stale overlay，僅接受與目前 project revision 相符的 frame |
| 本機音訊被上傳或嵌入 JSON | P1 | 關閉 local source feature，保留 built-in fixtures |
| 影片超過 3 分鐘 | P1 | 剪除載入、輸入與重複畫面 |
| README 不可重現 | P1 | 以乾淨 clone 測試並修正 |
| 次要動畫或文字錯誤 | P3 | 不阻擋提交 |

## 2. 回退策略

必須保留：

- 上一個穩定 commit／tag；
- 上一個穩定部署；
- AI provider unavailable fallback；
- diagnostics failure containment；
- 可不依賴 AI 的 preset demo；
- 2.5D／3D authoring recovery export。

發生問題時依序降級：

1. 關閉 Explanation。
2. 關閉 AI scene compilation，保留 presets 與 manual editing。
3. 隱藏有問題的非必要 diagnostic presentation，不改寫 acoustic result。
4. 暫停 local-audio import，保留 built-in procedural assets。
5. 固定使用已驗證的 demo scene。
6. 回退至上一個完整通過 `pnpm verify` 的 commit。

不得以刪除測試、關閉 validator、合併兩種模式的 cache、暴露 API key 或誇大聲學精度換取短期可用。

## 3. 提交後凍結

正式提交後才執行：

- 建立 `submitted` tag；
- 保存 Devpost 提交截圖與 timestamp；
- 不修改影片 URL 或 demo domain；
- Judging period 內維持免費可用；
- 若修復部署事故，記錄變更但不得實質改變提交內容。

靜態候選版完成時不自動 tag、push、deploy 或 submit；這些需要 owner 明確確認公開目標與帳號操作。
