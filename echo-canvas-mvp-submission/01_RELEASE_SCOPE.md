# 01 — 提交版 Release Scope

## 1. 提交決策

- 建議類別：**Developer Tools**
- 主要使用者：indie game developers、sound designers、interactive-media creators
- 核心問題：在導入 Wwise、Steam Audio 或完整遊戲引擎前，團隊很難快速建立、聽見、解釋並分享空間聲學概念。
- 解法：以瀏覽器提供自然語言場景編譯、獨立快取的 2.5D／Hybrid 3D 聲學編輯、決定性幾何近似與即時雙耳預聽。

這份 scope 已依 2026-07-19 完成靜態驗證、並經使用者逐項驗收的 unified modelling workspace 更新。它不是早期 2D-only snapshot。

## 2. 必須存在的功能

| 能力 | 提交版最低標準 |
|---|---|
| 公開 Demo | 無需安裝、付款或特殊硬體即可開啟 |
| Audio enable | 必須由使用者手勢啟動，不得自動播放 |
| 2.5D / 3D projects | 兩種模式可切換，且各自從版本化本機快取還原 |
| Manual scene editing | 可新增、選取、移動、Disable／Enable 與刪除 Listener、音源、牆面與 Portal |
| Precision authoring | Transform 支援鍵入、方向鍵與 Blender-style 水平拖曳微調 |
| Multiple receivers | 最多八個 Listener；同一時間只有一個 enabled Listener 為 active receiver |
| Local sources | 最多四個 point sources，可使用內建或只留在瀏覽器的本機 WAV／MP3／Ogg |
| Occlusion | 牆後聲音較小、較暗，且數值與路徑可視化一致 |
| Portal propagation | 開門後路徑與感知方向移向門口 |
| Early reflections / reverb | 顯示 first-order wall／floor／ceiling 路徑；房間與材質可產生不同估計與聽感 |
| Browser HRTF | 耳機可辨識左右、距離與相對方向 |
| GPT-5.6 compiler | 自然語言可產生符合模式 Schema 的合法候選場景，套用前可檢視 |
| Explanation | 說明只引用決定性引擎結果，不假裝分析原始音訊 |
| Raw / Simulated | 一鍵 A/B，差異清楚 |
| Import / export | 版本化 authoring JSON 可還原；本機音檔 blob 不嵌入 JSON |
| Graceful fallback | GPT 失敗時仍可使用 presets 與手動編輯 |
| Diagnostics | 顯示 matched-revision direct、blocked、Portal 與 first-order reflection path，以及 Gain、Cutoff、RT60 等結果 |
| Viewport navigation | 中鍵或 Shift+左鍵平移、游標中心滾輪縮放、Home 與 Frame All |

## 3. 明確不包含

- Arbitrary mesh-based 3D geometry 或完整遊戲引擎場景格式
- Personalized HRTF / SOFA
- Head tracking
- Dolby Atmos output
- Arbitrary binaural de-spatialization
- Certified architectural-acoustics results
- Wave-based diffraction
- FDTD / FEM / BEM
- Simultaneous audio rendering for multiple listeners
- Unlimited audio upload 或將本機音訊上傳至 AI route
- Database、login、team collaboration

## 4. 提交版 Wow Moment

最短成功劇本：

1. 在 2.5D 載入 Concrete Partition preset 並播放收音機。
2. 將 active Listener 拖到混凝土隔間後：聲音變暗、變小，blocked path 與數值同步變更。
3. 開啟 Portal：路徑改由門口，感知方向移到門口。
4. 切換 Raw / Simulated，讓差異立即可聽。
5. 切至 3D；同一工作台中直接拖曳 X/Z，Shift+拖曳 Y，查看牆面、地板與天花板的 first-order path overlay。

評審應在 30 秒內理解產品，60 秒內聽見核心差異。

## 5. 產品主張邊界

可說：

- interactive acoustic approximation
- deterministic geometry-driven propagation
- portal-aware sound propagation
- first-order early reflections
- perceptually tuned material presets
- browser HRTF rendering
- AI-assisted scene authoring
- spatial-audio prototyping and previsualization

不可說：

- physically exact room simulation
- certified architectural-acoustics prediction
- true diffraction
- MIT/KEMAR HRTF（瀏覽器 API 無法保證資料集）
- dry-source recovery from arbitrary binaural recordings
- unrestricted 3D acoustic simulation
