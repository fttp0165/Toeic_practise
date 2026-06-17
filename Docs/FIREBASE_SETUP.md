# Firebase 雲端同步 — 設定步驟（Realtime Database 版）

用 **Firebase Realtime Database（RTDB）+ Google 登入**。RTDB 留在免費的 Spark 方案、
**不需要綁信用卡**（Firestore 會要求開啟帳單，所以改用 RTDB）。
換手機/電腦登入同一個 Google 帳號就會自動同步。

專案：`toeicpractise`

---

## 已完成
- ✅ 建立 Firebase 專案、註冊 Web app、config 已貼進 `index.html`
- ✅ 啟用 Google 登入（Authentication → Sign-in method → Google）

## 待完成

### 1. 建立 Realtime Database
1. 左側 **Build → Realtime Database → 建立資料庫**。
2. **位置**：選 **Singapore（`asia-southeast1`）** — 離台灣最近的免費區
   （RTDB 沒有台灣機房；us-central / europe 也行但較遠）。
3. 安全規則：先選 **「以鎖定模式啟動（Locked mode）」**（之後第 2 步換成自己的規則）。
4. 建好後上方會顯示資料庫網址，像：
   `https://toeicpractise-default-rtdb.asia-southeast1.firebasedatabase.app`
   **把這整段網址複製起來**（第 3 步要用）。

### 2. 設定安全規則
1. RTDB 頁面切到 **「規則(Rules)」** 分頁。
2. 整段換成下面這段，再 **發布(Publish)**：

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

意思：**每個人只能讀寫自己 uid 底下的資料**，別人看不到也改不了你的。

### 3. 把資料庫網址填進 index.html
打開 `index.html` 最底部 `firebaseConfig`，把：
```
databaseURL: "PASTE_DATABASE_URL",
```
換成第 1 步複製的網址，例如：
```
databaseURL: "https://toeicpractise-default-rtdb.asia-southeast1.firebasedatabase.app",
```

### 4. 允許你的網址登入（Authorized domains）
Authentication → **Settings → Authorized domains**，確認有：
- `localhost`（本機測試，通常已內建）
- `fttp0165.github.io`（GitHub Pages 線上網址，**手動加上**）

沒加的話線上版按登入會跳 `auth/unauthorized-domain`。

### 5. 測試
- 本機用 `http://localhost` 開（**別用 `file://`**，Google 登入彈窗會失敗）：
  ```
  python -m http.server 8000
  ```
  然後開 `http://localhost:8000`。
- 按右上「用 Google 登入同步」→ 選帳號 → 狀態列應顯示「已登入 · 已同步」。
- 打個勾或加個單字，RTDB Console 的 `users/{你的uid}` 應即時出現 `tasks` / `vocab`。
- 換另一台裝置登入同一個 Google 帳號，資料會自動帶過去。

---

## 運作邏輯（供日後維護）
- **未登入** = 純本機 `localStorage`，跟原本一模一樣（按鈕會隱藏）。
- **登入後**：
  - 首次登入若雲端還沒資料 → 把本機現有資料推上去（不會遺失）。
  - 之後 **雲端為準**：任一裝置改動，其他裝置即時 `onValue` 收到並覆蓋本機。
  - 本機改動防抖 600ms 後 `set` 上雲端；用穩定序列化比對跳過自己剛寫的那份，
    避免正在打字時被 echo 覆蓋。
- 資料位置：RTDB `users/{uid}`，值 `{ start, tasks, vocab, updatedAt }`，對應三個 localStorage key。

## 常見問題
- **CDN 版本載入失敗(404)**：`index.html` 模組頂部 `FB_VER` 改成 Firebase 最新版本號（目前 `12.15.0`）。
- **`databaseURL` 沒填**：登入後會同步失敗，務必完成第 3 步。
- **手機登入彈窗被擋**：popup 在部分手機瀏覽器會被擋，可改用 `signInWithRedirect`（需要時再說）。
- **`apiKey` 公開安全嗎？** Firebase 的 web apiKey 是公開識別碼不是密碼，真正的防護是上面的安全規則（只能讀寫自己 uid）。repo 維持 public 沒問題。
- **要徹底鎖到只有你本人能用？** 規則裡再加一條把 `$uid` 限定成你的 uid（登入一次後從 Authentication → Users 複製）：
  `".write": "auth.uid === $uid && auth.uid === '你的UID'"`。
