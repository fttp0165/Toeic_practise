# 開發日誌（DEVLOG）

專案重大改動的時間軸紀錄。最新在最上面。

---

## 2026-07-12 — 「20 天衝刺」→ 可設定目標日的衝刺計畫（PR #22，已合併）

### 目標
把寫死的「20 天」衝刺，改造成**可開啟、可設定考試/目標日的衝刺計畫**：使用者選一個目標日（例如 12/20），系統自動從今天倒數，並把整份計畫（五階段、每日任務、間隔複習、日期條）縮放到那段天數。

### 決策紀錄
- **單字池永不清空**：`vocab` 跨所有專案共用、只增不清、持續累積。刪除專案／重置只動專案設定與任務打勾，**絕不碰單字與學習進度**（`lo`/`ri`/`pr`/`da`）。
- **主要輸入＝目標日**：以「選考試/目標日」為主，只選目標日時開始日自動預設為今天（規劃「現在→目標日」）；也可手動設開始日規劃任意區間。
- **回歸基準＝days=20 逐日等價**：任何縮放改動都必須讓 `days=20` 的行為與改造前完全一致，並用 CI 自動守門。
- **完整 CI/CD**：走 GitHub Actions、零 npm 依賴、不引入建置步驟。

### 這次交付（10 個任務）
| # | 內容 |
|---|---|
| 1 | 專案資料模型與 CRUD helpers（`toeic20_projects` / `toeic20_curproj`、`getCurProject`、`curDays`/`curLastNew`） |
| 2 | 舊資料一次性遷移為預設專案（舊 key 保留、`vocab` 不動） |
| 3 | 五階段與每日任務依天數自動縮放（`phaseBounds` 比例 15/30/25/20/10%、`lastNewOf`） |
| 4 | `todayDay`/`renderStrip`/`renderDay`/進度總覽改吃目前專案；`done` 綁定專案 `tasks` |
| 5 | 間隔複習 `recallBatches` 改用 `lastNewDay` 過濾；移除 `LAST_NEW` 常數 |
| 6 | 專案列 UI：考試日輸入 + 倒數顯示（距離考試還有 N 天） |
| 12 | 抽離純函式為 `srs.js`（UMD：瀏覽器 `window.SRS` / Node `module.exports`） |
| 13 | CI：`node --check` 語法檢查 + `node:test` 單元測試（12 項） |
| 15 | 去除寫死「20 天」文案：日期條「共 N 天」、五階段地圖動態 Day 範圍、標題/nav 改「衝刺計畫」；只選目標日自動從今天起算 |

### 架構重點
- **`srs.js`（純函式、無 DOM、無狀態）**：`phaseBounds` / `lastNewOf` / `phaseOf` / `tasksOf` / `recallBatches`，全部依傳入的 `days` 計算。`app-core.js` 只做「預設 `days=curDays()`」的薄包裝。同一份模組供瀏覽器與 CI 測試共用。
- **`done` 綁定目前專案的 `tasks`**：載入時 `done = getCurProject().tasks`，打勾寫入直接落在專案上，`save()` 一併持久化 `projects`，避免與 `project.tasks` 分岔。
- **HTML 載入順序**：三頁都在 `app-core.js` 之前載入 `srs.js`（`app-core` 載入期即讀取 `window.SRS`）；CI 有測試守住此順序。

### 驗證
- CI：GitHub Actions 兩步驟綠燈，單元測試 **12 pass / 0 fail**（含 `days=20` 逐日回歸：`phaseOf`／`tasksOf` id 序列／`recallBatches`）。
- 瀏覽器（Chromium）實測：
  - 7/1→7/21 → 倒數「還有 20 天」、Day「1 / 21」、日期條 21 格。
  - **只選 12/20** → 開始日自動今天、倒數 161 天、共 162 天、五階段地圖 `Day 1–27 / 28–80 / 81–124 / 125–160 / 161–162`、162 格。
  - 無非 Firebase 的 JS 錯誤（Firebase CDN 在沙盒被擋屬環境問題，未登入自動退回純本機模式）。

### 資料模型變更（新增 localStorage key）
- `toeic20_projects`：`[{ id, name, start, exam, days, tasks }]`（隨雲端同步——待 #9 接上）。
- `toeic20_curproj`：目前開啟的專案 id。
- 舊 `toeic20_start` / `toeic20_tasks` 保留讀取相容，僅遷移、不刪除。

### 尚未完成（後續於新分支／新 PR）
- **#7** 多專案切換 UI（新增／命名／刪除）
- **#8** 刪專案／重置與單字池解耦防呆
- **#9** 匯出／匯入與雲端同步帶上 `projects`（跨裝置備份專案）
- **#11** 更新 README / PROJECT_PLAN
- **#14** CD：GitHub Actions 部署 Pages（push 到 main 且 CI 綠燈才部署）

### 相關文件
- 規劃書：`Docs/COUNTDOWN_PROJECT_PLAN.md`
- 既有規格：`Docs/PROJECT_PLAN.md`
