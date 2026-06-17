# TOEIC 20 天衝刺 · 海馬迴單字庫

個人用的 TOEIC 衝刺工具，核心是**海馬迴間隔複習單字法**。目標分數 **300 → 500**，重點在「撿回該拿沒拿的分」。

純靜態網頁（原生 HTML/CSS/JS，無框架、無建置流程），可直接用瀏覽器開啟，部署在 GitHub Pages。

🔗 **線上版**：<https://fttp0165.github.io/Toeic_practise/>

---

## 兩個頁面

| 頁面 | 網址 | 用途 |
|---|---|---|
| **20 天衝刺** | `index.html`（首頁） | 20 天計時衝刺：每日任務清單、晨間到期單字複習、每日單字輸入、進度總覽 |
| **海馬迴單字庫** | `library.html` | 不限天數的長期單字庫：依**真實日期**排間隔複習、隨時新增與翻卡練習 |

兩頁頂部導覽列互相連結，**共用同一池單字**（同一份 `localStorage`，登入後同步同一份雲端資料），但複習排程各自獨立。

---

## 核心方法：海馬迴間隔複習

1. **輸出 > 輸入**：蓋住中文、考自己，想不出來才翻開（主動回想本身就是記憶訊號）。
2. **間隔複習**：每批單字在 **+1 / +3 / +7 / +14 天**被重新喚起。
3. **睡眠固化**：新字排睡前、起床先回想，別熬夜。
4. **連結 + 情緒**：把新字連到已知的事物。

> ⚠️ 「先回想、再翻開驗證」是整個工具的靈魂，所有翻卡都遵循此設計，不可改成被動瀏覽。

---

## 功能總覽

### 20 天衝刺頁
- **開始日設定**：設定 Day 1，自動換算今天是第幾天。
- **日期選擇條**：1–20 天，顯示每天完成度、今天標示，可點選查看任一天。
- **間隔複習區（核心）**：自動列出今天到期的舊批次，攤成翻卡（英文＋例句先顯示、中文模糊）。
- **每日任務清單**：依五階段帶具體練習量，可打勾、狀態持久化。
- **每日單字輸入**：單字 / 中文 / 例句 / 備註；同一字跨全表去重，重複輸入只補例句。
- **進度總覽**：完成率、連續天數、20 格完成度方格圖。

### 海馬迴單字庫頁
- **共用單字池**：20 天輸入的字（標「第 N 批」）與單字庫新增的字（標「單字庫」）同在一處。
- **依真實日期的個人 SRS**：把字選為「今天新學」後，依 +1/+3/+7/+14 真實天數自動排複習。
- **今天要複習**：到期單字以翻卡呈現，翻開後選「記得 ✓（進下一階）/ 忘了 ✕（重排）」。
- **新增單字**：直接加進單字庫並開始學習。
- **全部單字**：可搜尋（單字／中文／例句／備註）、編輯、刪除，每筆顯示學習狀態徽章。

### 共用
- **編輯 / 刪除單字**：兩頁皆可就地編輯（含多例句，一行一句）。
- **雲端同步（選用）**：用 Google 一鍵登入後，進度與單字自動同步到 Firebase，換裝置不怕。未登入時資料只存在本機瀏覽器。

---

## 使用方式

### 線上
直接開 <https://fttp0165.github.io/Toeic_practise/>，設定開始日即可使用。要跨裝置同步就按右上「用 Google 登入同步」。

### 本機
因為用到 ES module 與 Google 登入彈窗，**請用本機伺服器開啟，不要直接用 `file://`**：

```bash
# 在專案資料夾
python -m http.server 8000
# 然後瀏覽器開 http://localhost:8000
```

---

## 專案結構

```
Toeic_practise/
├── index.html          # 20 天衝刺頁（GitHub Pages 首頁）
├── library.html        # 海馬迴單字庫頁
├── styles.css          # 共用樣式
├── app-core.js         # 共用主邏輯：狀態 / 間隔複習引擎 / 單字 helpers / 各區渲染
├── sync.js             # 共用 Firebase 同步層（ES module）
└── Docs/
    ├── PROJECT_PLAN.md   # 完整規劃書（邏輯規格、資料模型、藍圖）
    └── FIREBASE_SETUP.md # Firebase 雲端同步設定步驟
```

設計重點：
- **一份 `app-core.js` 服務兩頁**——每個渲染函式只在對應容器存在時動作，所以同一支腳本能同時跑兩個頁面、無重複。
- **`window.TOEIC` 橋接**——`app-core.js` 暴露 `getLocal / applyRemote / isLocalEmpty / setOnChange`，`sync.js` 只依賴這個介面；將來換後端只需改 `sync.js`。

---

## 資料儲存

未登入時存在瀏覽器 `localStorage`：

| key | 內容 |
|---|---|
| `toeic20_start` | 開始日 `YYYY-MM-DD` |
| `toeic20_tasks` | 已完成任務 |
| `toeic20_vocab` | 單字：`{ "{批次}": [ { w, m, exs[], n, lo?, ri? } ] }`。`lo`/`ri` 為單字庫的學習日期與複習階段；非數字鍵 `lib` 為單字庫專屬桶 |

登入後同步到 **Firebase Realtime Database**（`users/{uid}`，免費 Spark 方案、不綁卡）。設定步驟見 [Docs/FIREBASE_SETUP.md](Docs/FIREBASE_SETUP.md)。

---

## 部署（GitHub Pages）

更新檔案後：

```bash
git add .
git commit -m "..."
git push origin main
```

GitHub → repo → **Settings → Pages** → Source：`Deploy from a branch`、Branch `main` / `/(root)`。Pages 會自動更新。

---

## 技術

純前端、無依賴、無建置：原生 HTML / CSS / JavaScript ＋（選用）Firebase JS SDK（CDN，ES module）。手機優先、可離線（未登入時）。

詳細規格與開發藍圖見 [Docs/PROJECT_PLAN.md](Docs/PROJECT_PLAN.md)。
