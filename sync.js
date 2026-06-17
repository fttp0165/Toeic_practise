const FB_VER = "12.15.0";   // 載入失敗(404)時，改成 Firebase 最新版本號

/* ===================== Firebase 設定（toeicpractise 專案） ===================== */
const firebaseConfig = {
  apiKey: "AIzaSyDg9dp5HfXCRsawK7mjSL6hXsjOL7OOPWU",
  authDomain: "toeicpractise.firebaseapp.com",
  databaseURL: "https://toeicpractise-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "toeicpractise",
  storageBucket: "toeicpractise.firebasestorage.app",
  messagingSenderId: "301134134263",
  appId: "1:301134134263:web:c93a81921da3f336d5ccf2",
  measurementId: "G-587L5RW9R6"
};
/* ============================================================================== */

const authBtn = document.getElementById("authBtn");
const statusEl = document.getElementById("syncStatus");
function setStatus(msg, cls){ statusEl.textContent = msg; statusEl.className = "syncstatus" + (cls ? " " + cls : ""); }

// 還沒貼 config → 維持純本機模式（不載入 Firebase，原功能完全不受影響）
if(firebaseConfig.apiKey.startsWith("PASTE")){
  setStatus("尚未設定 Firebase · 純本機模式");
  authBtn.style.display = "none";
} else {
  const base = "https://www.gstatic.com/firebasejs/" + FB_VER + "/";
  const { initializeApp } = await import(base + "firebase-app.js");
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = await import(base + "firebase-auth.js");
  const { getDatabase, ref: dbRef, get, set, onValue } = await import(base + "firebase-database.js");

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getDatabase(app);
  const provider = new GoogleAuthProvider();

  let unsub = null;       // RTDB 監聽取消函式
  let uid = null;         // 目前登入者
  let writeTimer = null;  // 寫入防抖
  let lastSent = null;    // 自己剛寫出去的內容（跳過 echo，避免覆蓋使用者正在打的字）

  // 穩定序列化（key 排序）：用來比對「雲端回傳的是不是自己剛寫的那份」
  function stable(x){
    if(Array.isArray(x)) return "["+x.map(stable).join(",")+"]";
    if(x && typeof x==="object") return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+stable(x[k])).join(",")+"}";
    return JSON.stringify(x===undefined?null:x);
  }
  function norm(d){ return { start:(d&&d.start)||"", tasks:(d&&d.tasks)||{}, vocab:(d&&d.vocab)||{} }; }

  authBtn.onclick = () => {
    if(auth.currentUser){
      signOut(auth);
    } else {
      signInWithPopup(auth, provider).catch(err =>
        setStatus("登入失敗：" + (err.code || err.message || err), "err"));
    }
  };

  // 本機任何變更 → 防抖後寫上雲端（登入時才送）
  window.TOEIC.setOnChange((data) => {
    if(!uid) return;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const payload = norm(data);
      lastSent = stable(payload);
      set(dbRef(db, "users/" + uid), { ...payload, updatedAt: Date.now() })
        .catch(err => setStatus("同步失敗：" + (err.code || err.message || err), "err"));
    }, 600);
  });

  onAuthStateChanged(auth, async (user) => {
    if(unsub){ unsub(); unsub = null; }

    if(!user){
      uid = null;
      authBtn.lastChild.textContent = " 用 Google 登入同步";
      setStatus("未登入 · 進度只存在本機");
      return;
    }

    uid = user.uid;
    authBtn.lastChild.textContent = " 登出（" + (user.email || "已登入") + "）";
    setStatus("已登入 · 同步中…");

    const userRef = dbRef(db, "users/" + uid);

    // 首次登入：雲端還沒資料，且本機有資料 → 把本機推上去
    try{
      const snap = await get(userRef);
      if(!snap.exists() && !window.TOEIC.isLocalEmpty()){
        const payload = norm(window.TOEIC.getLocal());
        lastSent = stable(payload);
        await set(userRef, { ...payload, updatedAt: Date.now() });
      }
    }catch(e){ /* 離線時略過，交給下面的即時監聽 */ }

    // 即時同步：雲端有變動就套用到畫面（跳過自己剛寫出去的，避免覆蓋輸入）
    unsub = onValue(userRef,
      (snap) => {
        if(!snap.exists()){ setStatus("已登入 · 雲端尚無資料", "ok"); return; }
        const val = snap.val();
        if(stable(norm(val)) === lastSent){ setStatus("已登入 · 已同步", "ok"); return; }
        window.TOEIC.applyRemote(val);
        setStatus("已登入 · 已同步", "ok");
      },
      (err) => setStatus("同步中斷：" + (err.code || err.message || err), "err"));
  });
}
