"use strict";
const TOTAL=20, WPB=SRS.WPB, INTERVALS=SRS.INTERVALS;   // 純函式與常數集中在 srs.js（見下方 wrappers）
const LS={start:"toeic20_start", tasks:"toeic20_tasks", vocab:"toeic20_vocab", log:"toeic20_log", libs:"toeic20_libs", projects:"toeic20_projects", curproj:"toeic20_curproj"};
const LIB_DEFAULT="我的單字庫";

/* ---------- 間隔複習 / 階段：純函式在 srs.js，這裡只做「預設 days=目前專案天數」的薄包裝 ----------
   srs.js 必須在 app-core.js 之前載入（各 HTML 已如此排序）。 */
function phaseBounds(days){ return SRS.phaseBounds(days); }
function lastNewOf(days){ return SRS.lastNewOf(days); }
function phaseOf(d, days){ return SRS.phaseOf(d, days || curDays()); }
function tasksOf(d, days){ return SRS.tasksOf(d, days || curDays()); }
function recallBatches(d, days){ return SRS.recallBatches(d, days || curDays()); }

/* ---------- state ---------- */
let startDate = localStorage.getItem(LS.start) || "";
let done = {};
try{ done = JSON.parse(localStorage.getItem(LS.tasks)||"{}"); }catch(e){ done={}; }
let vocab={};
try{ vocab = JSON.parse(localStorage.getItem(LS.vocab)||"{}"); }catch(e){ vocab={}; }
let log={};   // 練習紀錄 { "YYYY-MM-DD": {c:對, x:錯} }
try{ log = JSON.parse(localStorage.getItem(LS.log)||"{}"); }catch(e){ log={}; }
// 舊格式（單一數字＝總次數）→ {c, x}，把舊總數記為已答對以保留總量
Object.keys(log).forEach(k=>{ if(typeof log[k]==="number") log[k]={c:log[k], x:0}; });
// 多單字庫（以 word.lib 標籤分庫；libs 保存庫名清單含空庫）
let libs=[];
try{ libs = JSON.parse(localStorage.getItem(LS.libs)||"[]"); }catch(e){ libs=[]; }
if(!Array.isArray(libs)) libs=[];
let curLib = localStorage.getItem("toeic20_curlib") || "";
let viewing = 1;
let editing = null;     // "day:idx" 正在編輯的單字，或 null
let libOpen = false;    // 單字庫卡片是否展開
let libMode = "list";   // "list" | "cards"
let libQuery = "";      // 單字庫搜尋字串
let lpQuery = "";       // 單字庫頁面的搜尋字串
let lpMode = "list";    // 全部單字檢視："list" | "cards"(翻卡)
let quiz = null;        // 測驗中的 session（null = 未測驗）
let quizDate = "";      // 測驗選的學習日期（""＝預設今天/最近）

/* ---------- 衝刺專案（可設定考試日/倒數天數，可切換） ---------- */
// localStorage: toeic20_projects = [{id,name,start,exam,days,tasks}]、toeic20_curproj = 目前專案 id
// 註：本區僅建立資料模型與 CRUD（計劃書任務 #1）。渲染接線於 #4、舊資料遷移於 #2。
let projects = [];
try{ projects = JSON.parse(localStorage.getItem(LS.projects)||"[]"); }catch(e){ projects=[]; }
if(!Array.isArray(projects)) projects=[];
let curProj = localStorage.getItem(LS.curproj) || "";

function saveProjects(){
  localStorage.setItem(LS.projects, JSON.stringify(projects));
  localStorage.setItem(LS.curproj, curProj);
  notifyChange();
}
function genProjId(){ return "p"+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

// 由開始日與考試日推算總天數（含頭尾）；缺考試日則回退 fallback，再退回 TOTAL
function computeDays(start, exam, fallback){
  if(start && exam){
    const s=new Date(start+"T00:00:00"), e=new Date(exam+"T00:00:00");
    const d=Math.floor((e-s)/86400000)+1;
    if(d>=1) return d;
  }
  return (fallback>=1)? fallback : TOTAL;
}

function getCurProject(){
  if(!projects.length) return null;
  let p=projects.find(x=>x.id===curProj);
  if(!p){ p=projects[0]; curProj=p.id; }   // 目前 id 失效時回退第一個
  return p;
}
function setCurProject(id){
  if(projects.some(x=>x.id===id)){ curProj=id; localStorage.setItem(LS.curproj, curProj); }
}
function createProject(name, start, exam, days){
  const st=start||"", ex=exam||"";
  const p={ id:genProjId(),
            name:(name||"新的衝刺").trim()||"新的衝刺",
            start:st, exam:ex, days:computeDays(st, ex, days), tasks:{} };
  projects.push(p); curProj=p.id; saveProjects();
  return p;
}
function renameProject(id, name){
  const p=projects.find(x=>x.id===id); if(!p) return;
  p.name=(name||"").trim()||p.name; saveProjects();
}
function updateProject(id, patch){
  const p=projects.find(x=>x.id===id); if(!p || !patch) return;
  if("start" in patch) p.start=patch.start||"";
  if("exam" in patch)  p.exam=patch.exam||"";
  if("name" in patch)  p.name=(patch.name||"").trim()||p.name;
  if("days" in patch && patch.days>=1) p.days=patch.days;
  if(p.start && p.exam) p.days=computeDays(p.start, p.exam, p.days); // 有起訖日則以考試日重算
  saveProjects();
}
// 刪除專案：只移除該專案設定與任務打勾，絕不動 vocab／學習進度（計劃書 §4.6、§8）
function deleteProject(id){
  const i=projects.findIndex(x=>x.id===id); if(i<0) return;
  projects.splice(i,1);
  if(curProj===id) curProj = projects.length? projects[0].id : "";
  saveProjects();
}

// 目前專案衍生值；無專案時回退舊常數，維持現有行為（渲染改接於任務 #4）
function curDays(){ const p=getCurProject(); return (p && p.days>=1)? p.days : TOTAL; }
function curLastNew(){ return lastNewOf(curDays()); }   // 收尾段不背新字；退化規則見 lastNewOf
function curStart(){ const p=getCurProject(); return p ? p.start : startDate; } // 目前專案開始日，無專案時回退舊全域值

// 一次性遷移（計劃書 §6）：舊的單一 start + tasks → 預設專案。
// 舊 key（toeic20_start / toeic20_tasks）保留讀取相容、不即刻刪除；vocab／libs／pr 一律不動。
// 直接寫 localStorage、不呼叫 notifyChange：載入期 sync 尚未接上，且此時 onChange 仍在 TDZ。
function migrateProjects(){
  if(projects.length) return;                              // 已有專案 → 不需遷移
  if(!startDate && Object.keys(done).length===0) return;   // 全新使用者 → 留待建立第一個專案
  const p={ id:genProjId(), name:"我的衝刺", start:startDate||"", exam:"", days:TOTAL, tasks:done };
  projects.push(p); curProj=p.id;
  localStorage.setItem(LS.projects, JSON.stringify(projects));
  localStorage.setItem(LS.curproj, curProj);
}
migrateProjects();

// 任務改為以「目前專案」為準（計劃書 §4.1）：把 done 綁定成目前專案的 tasks 物件，
// 讓打勾寫入直接落在專案上；save() 會一併持久化 projects。無專案時 done 維持舊全域值。
(function bindDoneToProject(){ const p=getCurProject(); if(p) done=p.tasks; })();

/* ---------- vocab library: migration + lookup ---------- */
// 舊資料 ex(字串) → exs(陣列)；保證每個字都有 exs
function migrateVocab(v){
  if(!v || typeof v!=="object") return {};
  Object.keys(v).forEach(day=>{
    const arr=v[day]; if(!Array.isArray(arr)) return;
    arr.forEach(w=>{
      if(!Array.isArray(w.exs)) w.exs = (w.ex && String(w.ex).trim()) ? [{e:String(w.ex).trim(), t:""}] : [];
      else w.exs = w.exs.map(x=> (x && typeof x==="object") ? {e:String(x.e||""), t:String(x.t||"")} : {e:String(x==null?"":x), t:""}).filter(x=>x.e);
      if("ex" in w) delete w.ex;
      // 加入日期 da：回填為最早已知日期（學習日 lo 與練習紀錄 pr 中最早者）
      if(!w.da){
        const cands=[];
        if(w.lo) cands.push(w.lo);
        if(w.pr) Object.keys(w.pr).forEach(k=>cands.push(k));
        if(cands.length){ cands.sort(); w.da=cands[0]; }
      }
    });
  });
  return v;
}
// 整個單字庫跨所有天找同一個字（trim + 不分大小寫）
function findWordGlobal(word){
  const key=String(word||"").trim().toLowerCase();
  if(!key) return null;
  for(const day of Object.keys(vocab)){
    const arr=vocab[day]; if(!Array.isArray(arr)) continue;
    for(let i=0;i<arr.length;i++){
      if(String(arr[i].w||"").trim().toLowerCase()===key) return {day, idx:i, word:arr[i]};
    }
  }
  return null;
}
migrateVocab(vocab);

/* ---------- 多單字庫：標籤、庫名清單、目前庫 ---------- */
function wlib(w){ return (w && w.lib) ? w.lib : LIB_DEFAULT; }
// 整理：替單字庫的字補上 lib 標籤，並把出現過的庫名併進 libs，確保有預設庫與有效的 curLib
function migrateLibs(){
  (vocab.lib||[]).forEach(w=>{ if(!w.lib) w.lib=LIB_DEFAULT; });
  const set=new Set(libs.filter(Boolean));
  (vocab.lib||[]).forEach(w=>set.add(wlib(w)));
  set.add(LIB_DEFAULT);
  libs=Array.from(set);
  if(!curLib || libs.indexOf(curLib)<0) curLib=libs[0];
}
migrateLibs();
function libNames(){ return libs.slice(); }
function saveLibs(){ localStorage.setItem(LS.libs, JSON.stringify(libs)); notifyChange(); }
function setCurLib(name){ curLib=name; localStorage.setItem("toeic20_curlib", name); }
// 目前庫的字（{day:"lib", idx:在 vocab.lib 的位置, word}）
function libWords(){
  const out=[]; (vocab.lib||[]).forEach((w,idx)=>{ if(wlib(w)===curLib) out.push({day:"lib", idx, word:w}); });
  return out;
}
// 在目前庫內找同名字（trim＋不分大小寫）
function findInCurLib(word){
  const k=String(word||"").trim().toLowerCase(); if(!k) return null;
  const arr=vocab.lib||[];
  for(let i=0;i<arr.length;i++){ if(wlib(arr[i])===curLib && String(arr[i].w||"").trim().toLowerCase()===k) return {day:"lib", idx:i, word:arr[i]}; }
  return null;
}

/* ---------- shared vocab word helpers (used by day list + library) ---------- */
function allWords(){
  const out=[];
  const keys=Object.keys(vocab);
  const nums=keys.filter(k=>/^\d+$/.test(k)).sort((a,b)=>(+a)-(+b));
  const rest=keys.filter(k=>!/^\d+$/.test(k));   // 非數字桶（單字庫專屬：lib）
  nums.concat(rest).forEach(day=>{
    if(Array.isArray(vocab[day])) vocab[day].forEach((w,idx)=>out.push({day, idx, word:w}));
  });
  return out;
}
// 顯示批次標籤：數字 = 第 N 批；lib = 單字庫
function groupLabel(key){ return String(key)==="lib" ? "單字庫" : ("第 "+key+" 批"); }
// 朗讀（Web Speech API）：英文 TTS，自動挑較好的英文聲音
let _voice=null;
function pickVoice(){
  if(!('speechSynthesis' in window)) return null;
  const vs=window.speechSynthesis.getVoices(); if(!vs.length) return null;
  const pool=vs.filter(v=>/^en(-|_|$)/i.test(v.lang)); const list=pool.length?pool:vs;
  const prefs=[/google.*us.*english/i,/natural/i,/online/i,/microsoft.*(aria|jenny|guy|ava)/i,/samantha/i,/^google/i];
  for(const re of prefs){ const m=list.find(v=>re.test(v.name)); if(m) return m; }
  return list.find(v=>/en[-_]?us/i.test(v.lang)) || list[0];
}
if('speechSynthesis' in window){ try{ window.speechSynthesis.onvoiceschanged=()=>{ _voice=pickVoice(); }; _voice=pickVoice(); }catch(e){} }
function speak(text){
  text=String(text||"").trim(); if(!text || !('speechSynthesis' in window)) return;
  try{
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text); u.lang="en-US"; u.rate=0.95;
    if(!_voice) _voice=pickVoice(); if(_voice) u.voice=_voice;
    window.speechSynthesis.speak(u);
  }catch(e){}
}
// 單字：先抓 Free Dictionary API 的真人發音，抓不到/失敗就退回 Web Speech
const _wordAudio={};   // word -> mp3 網址；""＝查過但沒有
function playAudio(url, fallback){ try{ const a=new Audio(url); const p=a.play(); if(p&&p.catch) p.catch(()=>speak(fallback)); }catch(e){ speak(fallback); } }
function sayWord(word){
  word=String(word||"").trim(); if(!word) return;
  const key=word.toLowerCase();
  if(_wordAudio[key]!==undefined){ if(_wordAudio[key]) playAudio(_wordAudio[key], word); else speak(word); return; }
  fetch("https://api.dictionaryapi.dev/api/v2/entries/en/"+encodeURIComponent(key))
    .then(r=> r.ok ? r.json() : Promise.reject())
    .then(data=>{
      let url="";
      (Array.isArray(data)?data:[]).some(en=> (en.phonetics||[]).some(p=>{ if(p&&p.audio){ url=p.audio; return true; } return false; }));
      if(url && url.indexOf("//")===0) url="https:"+url;
      _wordAudio[key]=url;
      if(url) playAudio(url, word); else speak(word);
    })
    .catch(()=>{ _wordAudio[key]=""; speak(word); });
}
function sayBtn(text, isWord){ const t=String(text||"").trim(); return t ? '<button class="say" data-say="'+esc(t)+'"'+(isWord?' data-word="1"':'')+' title="朗讀" aria-label="朗讀">🔊</button>' : ""; }
// 朗讀按鈕：用捕獲階段攔截，避免觸發翻卡/編輯等外層點擊
document.addEventListener("click", function(e){
  const b = e.target && e.target.closest ? e.target.closest("[data-say]") : null;
  if(!b) return;
  e.stopPropagation(); e.preventDefault();
  const t=b.getAttribute("data-say");
  if(b.getAttribute("data-word")) sayWord(t); else speak(t);
}, true);

// 例句：相容字串或 {e:英文, t:中文}
function exE(x){ return (x && typeof x==="object") ? String(x.e||"") : String(x==null?"":x); }
function exT(x){ return (x && typeof x==="object") ? String(x.t||"") : ""; }
function exLineHTML(x, cls){ const e=exE(x), t=exT(x); if(!e && !t) return ""; return '<div class="'+cls+'">'+esc(e)+sayBtn(e)+(t?'<div class="ext">'+esc(t)+'</div>':'')+'</div>'; }
function exsHTML(exs, cls){ return (exs&&exs.length)?exs.map(x=>exLineHTML(x, cls)).join(''):''; }
function wordBodyHTML(w){
  return '<div class="vhead"><span class="vw">'+esc(w.w)+'</span>'+sayBtn(w.w, true)+'<span class="vm">'+esc(w.m||'')+'</span></div>'
    +exsHTML(w.exs, "vex")
    +(w.n?'<div class="vn">'+esc(w.n)+'</div>':'');
}
// 編輯表單裡的一組「例句英文＋中文翻譯」
function exPairHTML(e, t){
  return '<div class="we-expair">'
    +'<input class="we-exE" value="'+esc(e||'')+'" placeholder="例句（可留空）" autocomplete="off">'
    +'<input class="we-exT" value="'+esc(t||'')+'" placeholder="例句中文翻譯（可留空）" autocomplete="off"></div>';
}
function wordEditFormHTML(day, idx){
  const w=(vocab[day]||[])[idx]; if(!w) return "";
  const pairs=(w.exs||[]).map(x=>exPairHTML(exE(x), exT(x))).join('') + exPairHTML('', '');
  return '<div class="wedit" data-k="'+day+':'+idx+'">'
    +'<input class="we-w" value="'+esc(w.w||'')+'" placeholder="單字" autocomplete="off">'
    +'<input class="we-m" value="'+esc(w.m||'')+'" placeholder="中文意思" autocomplete="off">'
    +'<div class="we-exs">'+pairs+'</div>'
    +'<button type="button" class="we-exadd">＋ 再加一句例句</button>'
    +'<input class="we-n" value="'+esc(w.n||'')+'" placeholder="備註（可留空）" autocomplete="off">'
    +'<div class="we-row"><button class="we-save">儲存</button>'
    +'<button class="we-cancel">取消</button><span class="we-msg"></span></div></div>';
}
// 顯示模式的單字列（含編輯/刪除鈕）；showBatch 時附「第 N 批」
function wordRowHTML(day, idx, w, showBatch){
  const k=day+":"+idx;
  if(editing===k) return '<div class="vrow">'+wordEditFormHTML(day,idx)+'</div>';
  return '<div class="vrow"><div class="vbody">'+wordBodyHTML(w)
    +(showBatch?'<div class="vbatch">'+groupLabel(day)+'</div>':'')
    +'</div><div class="vacts">'
    +'<button class="vedit" data-edit="'+k+'" title="編輯">✏️</button>'
    +'<button class="vdel" data-del="'+k+'" title="刪除">✕</button></div></div>';
}
function deleteWord(day, idx){
  const arr=vocab[day]; if(!arr||!arr[idx]) return;
  if(!confirm("刪除單字「"+(arr[idx].w||"")+"」？")) return;
  arr.splice(idx,1);
  if(!arr.length) delete vocab[day];
  editing=null;
  saveVocab(); renderAll();
}
function saveWordEdit(form){
  const parts=form.dataset.k.split(":"); const day=parts[0], idx=+parts[1];
  const arr=vocab[day]; if(!arr||!arr[idx]) { editing=null; renderAll(); return; }
  const nw=form.querySelector(".we-w").value.trim();
  const nm=form.querySelector(".we-m").value.trim();
  const nn=form.querySelector(".we-n").value.trim();
  const msgEl=form.querySelector(".we-msg");
  if(!nw){ msgEl.textContent="單字不能空白"; return; }
  // 改名若撞到「別的」既有單字 → 擋下，避免破壞單字庫去重
  const hit=findWordGlobal(nw);
  if(hit && !(hit.day===day && hit.idx===idx)){
    msgEl.textContent="單字庫已有「"+nw+"」（在"+groupLabel(hit.day)+"）"; return;
  }
  // 例句：每組「英文＋中文」，去空、依英文去重（不分大小寫，保留順序）
  const seen=new Set(), exs=[];
  form.querySelectorAll(".we-expair").forEach(p=>{
    const e=p.querySelector(".we-exE").value.trim(); if(!e) return;
    const t=p.querySelector(".we-exT").value.trim();
    const lk=e.toLowerCase(); if(seen.has(lk)) return; seen.add(lk); exs.push({e, t});
  });
  // 保留 lo/ri 等其他欄位（單字庫學習進度），只更新可編輯欄位
  arr[idx]=Object.assign({}, arr[idx], {w:nw, m:nm, exs:exs, n:nn});
  editing=null;
  saveVocab(); renderAll();
}
// 按下編輯後，把出現的編輯表單捲動到畫面中央，並聚焦第一個欄位
function scrollToEditForm(k){
  if(!k) return;
  // renderAll 為同步，DOM 已更新；用 rAF 確保版面計算完成後再捲動
  requestAnimationFrame(()=>{
    const form=document.querySelector('.wedit[data-k="'+k+'"]');
    if(!form) return;
    form.scrollIntoView({behavior:"smooth", block:"center"});
    const first=form.querySelector(".we-w");
    if(first) first.focus({preventScroll:true});
  });
}
// 將編輯/刪除/翻卡的事件綁到指定容器
function wireWordControls(root){
  root.querySelectorAll("[data-edit]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); editing=el.getAttribute("data-edit"); renderAll(); scrollToEditForm(editing); };
  });
  root.querySelectorAll("[data-del]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); const p=el.getAttribute("data-del").split(":"); deleteWord(p[0],+p[1]); };
  });
  root.querySelectorAll(".wedit").forEach(form=>{
    form.querySelector(".we-save").onclick=()=>saveWordEdit(form);
    form.querySelector(".we-cancel").onclick=()=>{ editing=null; renderAll(); };
    const exadd=form.querySelector(".we-exadd");
    if(exadd) exadd.onclick=()=>{ const box=form.querySelector(".we-exs"); if(box){ box.insertAdjacentHTML("beforeend", exPairHTML("","")); const ins=box.querySelectorAll(".we-expair input.we-exE"); if(ins.length) ins[ins.length-1].focus(); } };
  });
  root.querySelectorAll(".flip").forEach(el=>{ el.onclick=()=>el.classList.toggle("shown"); });
}

/* sync hook: cloud layer registers a callback to push local edits upstream */
let onChange = null;
function notifyChange(){ if(onChange) onChange({start:startDate, tasks:done, vocab:vocab, log:log, libs:libs}); }

function save(){
  localStorage.setItem(LS.tasks, JSON.stringify(done));   // 舊 key 相容
  const p=getCurProject();
  if(p){ localStorage.setItem(LS.projects, JSON.stringify(projects)); localStorage.setItem(LS.curproj, curProj); } // done===p.tasks，一併持久化專案
  notifyChange();
}
function saveVocab(){ localStorage.setItem(LS.vocab, JSON.stringify(vocab)); notifyChange(); }
function saveLog(){ localStorage.setItem(LS.log, JSON.stringify(log)); notifyChange(); }
// 正規化一天的紀錄（相容舊的數字格式）→ {c:對, x:錯, n:總}
function dayTotal(e){ if(!e) return {c:0,x:0,n:0}; if(typeof e==="number") return {c:e,x:0,n:e}; const c=e.c||0,x=e.x||0; return {c,x,n:c+x}; }
// 練習一個單字（測驗答對/答錯、記得/忘了）→ 該字今天對或錯 +1（記在 word.pr）
function bumpPractice(correct, wordObj){
  if(!wordObj) return;
  const d=todayISO();
  if(!wordObj.pr) wordObj.pr={};
  const e=wordObj.pr[d]||{c:0,x:0};
  if(correct) e.c=(e.c||0)+1; else e.x=(e.x||0)+1;
  wordObj.pr[d]={c:e.c||0, x:e.x||0};
  // 持久化由呼叫端的 saveVocab 負責（pr 在 vocab 內）
}
// 每日總計（全部單字庫）：逐字 pr 加總 → { date: {c,x} }
function dailyAgg(){
  const agg={};
  const add=(date,c,x)=>{ const e=agg[date]||{c:0,x:0}; e.c+=c; e.x+=x; agg[date]=e; };
  allWords().forEach(o=>{ const pr=o.word.pr; if(!pr) return; Object.keys(pr).forEach(date=>{ const e=pr[date]; add(date,(e&&e.c)||0,(e&&e.x)||0); }); });
  return agg;
}
// 逐字練習紀錄（全部單字庫）：依日期分組（新→舊），每組列出該日練過的字
function practiceRecords(){
  const byDate={};
  allWords().forEach(o=>{
    const pr=o.word.pr; if(!pr) return;
    Object.keys(pr).forEach(date=>{
      const e=pr[date], c=(e&&e.c)||0, x=(e&&e.x)||0; if(!(c||x)) return;
      (byDate[date]=byDate[date]||[]).push({w:o.word.w, c, x, n:c+x});
    });
  });
  return Object.keys(byDate).sort().reverse().map(date=>({date, items:byDate[date].sort((a,b)=>b.n-a.n)}));
}
function key(d,id){ return "d"+d+":"+id; }

function todayDay(){
  const st=curStart();
  if(!st) return null;
  const s=new Date(st+"T00:00:00");
  const now=new Date(); now.setHours(0,0,0,0);
  const diff=Math.floor((now-s)/86400000)+1;
  if(diff<1) return 0;           // not started
  if(diff>curDays()) return 99;  // finished
  return diff;
}

/* ---------- per-day completion ---------- */
function dayStats(d){
  const list=tasksOf(d);
  let c=0; list.forEach(t=>{ if(done[key(d,t.id)]) c++; });
  return {done:c, total:list.length};
}

/* ---------- render ---------- */
const $=s=>document.querySelector(s);

function renderStrip(){
  const strip=$("#strip"); if(!strip) return;   // 僅衝刺頁
  const td=todayDay();
  strip.innerHTML="";
  for(let d=1;d<=curDays();d++){
    const st=dayStats(d);
    const pip=document.createElement("div");
    pip.className="pip";
    if(st.total && st.done===st.total) pip.classList.add("done");
    if(td===d) pip.classList.add("today");
    if(viewing===d) pip.classList.add("viewing");
    if(td && td!==0 && td!==99 && d>td) pip.classList.add("future");
    pip.innerHTML="<span>"+d+"</span><small>"+(st.done)+"/"+st.total+"</small>";
    pip.onclick=()=>{ viewing=d; renderAll(); };
    strip.appendChild(pip);
    if(td===d){ setTimeout(()=>pip.scrollIntoView({inline:"center",block:"nearest",behavior:"smooth"}),50); }
  }
}

function waveHTML(d){
  const live=recallBatches(d).map(o=>o.iv);
  const heights={1:22,3:30,7:38,14:46};
  return '<div class="wave">'+INTERVALS.map(iv=>{
    const on=live.includes(iv);
    return '<div class="seg'+(on?' live':'')+'">'
      +'<div class="bar" style="height:'+heights[iv]+'px"></div>'
      +'<span class="tag">+'+iv+'</span></div>';
  }).join("")+'</div>';
}

function flipCardsHTML(srcDay){
  const words = vocab[srcDay] || [];
  if(!words.length){
    return '<div class="bnote">（第 '+srcDay+' 批還沒輸入單字 — 到 Day '+srcDay+' 補上就會出現在這裡）</div>';
  }
  return words.map((w,i)=>
    '<div class="flip" data-flip="'+srcDay+'-'+i+'">'
    +'<div class="fw">'+esc(w.w)+sayBtn(w.w, true)+'</div>'
    +exsHTML(w.exs, "fex")
    +'<div class="fm">'+esc(w.m||'(未填意思)')+'</div>'
    +(w.n?'<div class="fn">'+esc(w.n)+'</div>':'')
    +'<div class="hintr">點按看意思</div></div>'
  ).join("");
}

function recallHTML(d){
  const b=recallBatches(d);
  if(!b.length){
    return '<div class="recall"><div class="lead">晨間回想</div>'
      +'<div class="none">今天還沒有到期的舊批次 — 全力背好今晚的第 '+d+' 批新字就好。</div></div>';
  }
  const blocks=b.map(o=>{
    const cnt=(vocab[o.src]||[]).length;
    return '<div class="bgroup"><div class="bhead">第 '+o.src+' 批 '
      +'<span class="biv">+'+o.iv+' 天</span>'
      +'<span class="bcnt">'+cnt+' 字</span></div>'
      +flipCardsHTML(o.src)+'</div>';
  }).join("");
  return '<div class="recall"><div class="lead">今天要主動回想這幾批（先想，再點按驗證）</div>'
    +blocks
    +'<div class="hint">看英文與例句先回想中文，想不出來再點開。這就是在告訴海馬迴「這很重要」。</div></div>';
}

function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function nightHTML(d){
  if(d>curLastNew()) return '<div class="night-pill"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="#6A747C" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/></svg>衝刺尾聲：不背新字，睡前複習錯題本與弱點單字，別熬夜。</div>';
  return '<div class="night-pill"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="#6A747C" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/></svg>記憶在睡眠中歸檔：新單字排最後、明早起床先回想，衝刺期別熬夜。</div>';
}

function checkSVG(){return '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';}

function renderDay(){
  const area=$("#dayArea"); if(!area) return;   // 僅衝刺頁
  const td=todayDay();

  if(td===0){
    area.innerHTML='<div class="card"><div class="empty">設定上方的「開始日」後，這裡會顯示今天該做什麼。<br>把開始日設成你正式啟動的那一天。</div></div>';
    return;
  }

  const d=viewing;
  const ph=phaseOf(d);
  const list=tasksOf(d);
  const st=dayStats(d);
  const isToday = (td===d);

  let html='<div class="card">';
  html+='<div class="card-top"><div class="daynum-row">'
    +'<div class="daynum">'+d+'<span class="of"> / '+curDays()+'</span></div>'
    +'<div class="day-meta"><span class="phase-badge">'+ph.name+'</span>'
    +'<div class="phase-desc">'+ph.desc+(isToday?' · <b style="color:#1E2529">今天</b>':'')+'</div></div>'
    +'</div>'+waveHTML(d)+'</div>';

  // recall section（可收摺；summary 顯示今天到期批次數，預設收起）
  const rb=recallBatches(d);
  html+='<details class="fold-sec"'+(rb.length?'':' open')+'>'
    +'<summary class="sec-head"><span class="dot amber"></span>間隔複習（海馬迴）'
    +(rb.length?'<span class="sec-count">'+rb.length+' 批到期</span>':'')
    +'<span class="chev">▾</span></summary>'
    +recallHTML(d)+'</details>';

  // tasks（可收摺；summary 顯示完成進度，未全部完成時預設展開）
  html+='<details class="fold-sec"'+(st.done>=st.total?'':' open')+'>'
    +'<summary class="sec-head"><span class="dot ink"></span>今日任務'
    +'<span class="sec-count">完成 '+st.done+'/'+st.total+'</span>'
    +'<span class="chev">▾</span></summary>';
  list.forEach(t=>{
    const k=key(d,t.id);
    const ck=!!done[k];
    html+='<div class="task'+(ck?' checked':'')+'" data-k="'+k+'">'
      +'<div class="box">'+checkSVG()+'</div>'
      +'<div class="t-body"><div class="t-title">'+t.title+'</div>'
      +(t.note?'<div class="t-note">'+t.note+'</div>':'')+'</div>'
      +'<span class="t-time">'+t.time+'</span></div>';
  });
  html+=nightHTML(d);
  if(d>1 && d<19){
    html+='<div class="busy">⏱ 只有 1 小時？保留<b>單字＋聽力＋文法</b>三項核心、量打八折（文法 10 題、聽力 15 題、新字仍 15），砍掉其餘。間隔複習絕不能斷。</div>';
  }
  html+='</details>'; // close tasks section

  // vocab entry (only for new-word days)
  if(d<=curLastNew()){
    const words = vocab[d] || [];
    html+='<div class="section"><div class="sec-head"><span class="dot green"></span>第 '+d+' 批單字 · 已輸入 '+words.length+'/'+WPB+'</div>';
    html+='<div class="ventry">'
      +'<input id="vw" placeholder="單字 (例 compliance)" autocomplete="off">'
      +'<input id="vm" placeholder="中文意思 (例 合規 / 法規遵循)" autocomplete="off">'
      +'<input id="vex" placeholder="例句（可留空）" autocomplete="off">'
      +'<input id="vext" placeholder="例句中文翻譯（可留空）" autocomplete="off">'
      +'<input id="vn" placeholder="備註（可留空，例 工作常用 / 易混淆）" autocomplete="off">'
      +'<button class="vaddbtn" id="vadd">加入這個字</button>'
      +'<div class="vmsg" id="vmsg"></div></div>';
    if(words.length){
      html+='<div class="vlist">';
      words.forEach((w,i)=>{ html+=wordRowHTML(d, i, w, false); });
      html+='</div>';
    } else {
      html+='<div class="vempty">還沒輸入單字。每天目標 '+WPB+' 個，輸入後會自動排進 +1／+3／+7／+14 天的回想。</div>';
    }
    html+='</div>';
  }

  html+='</div>'; // close card

  area.innerHTML=html;

  area.querySelectorAll(".task").forEach(el=>{
    el.onclick=()=>{
      const k=el.dataset.k;
      done[k]=!done[k];
      if(!done[k]) delete done[k];
      save(); renderAll();
    };
  });

  // flip cards (recall) + 單字列的編輯/刪除
  wireWordControls(area);

  // vocab add
  const addBtn=area.querySelector("#vadd");
  if(addBtn){
    const commit=()=>{
      const wEl=area.querySelector("#vw"), mEl=area.querySelector("#vm"), exEl=area.querySelector("#vex"), extEl=area.querySelector("#vext"), nEl=area.querySelector("#vn");
      const w=wEl.value.trim(), m=mEl.value.trim(), ex=exEl.value.trim(), ext=extEl.value.trim(), n=nEl.value.trim();
      if(!w){ wEl.focus(); return; }
      let msg="";
      const hit=findWordGlobal(w);
      if(hit){
        // 已在單字庫 → 不重複建立；不同例句就補進同一個字
        const wd=hit.word;
        const dup = ex && (wd.exs||[]).some(x=>exE(x).trim().toLowerCase()===ex.toLowerCase());
        let added=false;
        if(ex && !dup){ (wd.exs=wd.exs||[]).push({e:ex, t:ext}); added=true; }
        if(m && !wd.m) wd.m=m;          // 補上原本沒填的意思
        if(n && !wd.n) wd.n=n;          // 補上原本沒填的備註
        msg="「"+w+"」已在"+groupLabel(hit.day)+(added?"，已新增例句":"（未重複建立）");
      } else {
        if(!vocab[d]) vocab[d]=[];
        vocab[d].push({w, m, exs: ex?[{e:ex, t:ext}]:[], n});
      }
      saveVocab(); renderAll();
      // 顯示提示 + 重新聚焦單字欄，方便連續輸入
      const msgEl=document.querySelector("#vmsg"); if(msgEl) msgEl.textContent=msg;
      const nw=document.querySelector("#vw"); if(nw) nw.focus();
    };
    addBtn.onclick=commit;
    const nEl=area.querySelector("#vn");
    if(nEl) nEl.addEventListener("keydown",e=>{ if(e.key==="Enter") commit(); });
  }
}

/* ---------- vocab library (overview + flip-card review) ---------- */
function renderLibrary(){
  const root=$("#libArea"); if(!root) return;
  const all=allWords();
  const total=all.length;

  let html='<div class="lib-card">';
  html+='<div class="lib-head" id="libToggle"><div class="lib-title">單字庫 '
    +'<span class="lib-count">'+total+' 字</span></div>'
    +'<span class="chev">'+(libOpen?'▴':'▾')+'</span></div>';

  if(libOpen){
    html+='<div class="lib-body">';
    html+='<div class="lib-ctrl"><input id="libSearch" placeholder="搜尋 單字／中文／例句／備註" value="'+esc(libQuery)+'" autocomplete="off">'
      +'<div class="lib-modes">'
      +'<button class="lib-mode'+(libMode==="list"?" on":"")+'" data-mode="list">列表</button>'
      +'<button class="lib-mode'+(libMode==="cards"?" on":"")+'" data-mode="cards">翻卡</button></div></div>';

    const q=libQuery.trim().toLowerCase();
    const matches=o=>{
      const w=o.word;
      return String(w.w||'').toLowerCase().includes(q)
        || String(w.m||'').toLowerCase().includes(q)
        || (w.exs||[]).some(x=>exE(x).toLowerCase().includes(q)||exT(x).toLowerCase().includes(q))
        || String(w.n||'').toLowerCase().includes(q);
    };
    const filtered = q ? all.filter(matches) : all;

    if(!total){
      html+='<div class="vempty">單字庫還是空的。到每天的「第 N 批單字」輸入後，會自動收進這裡。</div>';
    } else if(!filtered.length){
      html+='<div class="vempty">找不到符合「'+esc(libQuery)+'」的單字。</div>';
    } else if(libMode==="cards"){
      html+='<div class="lib-cardnote">先回想中文，再點卡片翻開驗證。共 '+filtered.length+' 張。</div>';
      html+='<div class="lib-cards">';
      filtered.forEach(o=>{
        const w=o.word;
        html+='<div class="flip">'
          +'<div class="fw">'+esc(w.w)+sayBtn(w.w, true)+'</div>'
          +exsHTML(w.exs, "fex")
          +'<div class="fm">'+esc(w.m||'(未填意思)')+'</div>'
          +(w.n?'<div class="fn">'+esc(w.n)+'</div>':'')
          +'<div class="hintr">點按看意思</div>'
          +'<span class="flip-batch">第 '+o.day+' 批</span></div>';
      });
      html+='</div>';
    } else {
      html+='<div class="lib-list">';
      filtered.forEach(o=>{ html+=wordRowHTML(o.day, o.idx, o.word, true); });
      html+='</div>';
    }
    html+='</div>'; // lib-body
  }
  html+='</div>'; // lib-card
  root.innerHTML=html;

  // wiring（單字庫內部互動只重繪自己，保住搜尋焦點）
  root.querySelector("#libToggle").onclick=()=>{ libOpen=!libOpen; renderLibrary(); };
  if(libOpen){
    const s=root.querySelector("#libSearch");
    if(s) s.oninput=()=>{
      libQuery=s.value; renderLibrary();
      const s2=document.querySelector("#libSearch");
      if(s2){ s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
    };
    root.querySelectorAll(".lib-mode").forEach(b=>{ b.onclick=()=>{ libMode=b.dataset.mode; renderLibrary(); }; });
    wireWordControls(root);
  }
}

function renderProgress(){
  if(!$("#progPct")) return;   // 僅衝刺頁
  let total=0, dn=0;
  for(let d=1;d<=curDays();d++){ const s=dayStats(d); total+=s.total; dn+=s.done; }
  const pct= total? Math.round(dn/total*100):0;
  $("#progPct").textContent=pct+"%";
  $("#progCount").textContent="完成 "+dn+" / "+total+" 項";

  // streak: consecutive fully-done days up to today
  const td=todayDay();
  let streak=0;
  if(td && td!==0){
    const upto = (td===99)?curDays():td;
    for(let d=upto; d>=1; d--){
      const s=dayStats(d);
      if(s.total && s.done===s.total) streak++; else break;
    }
  }
  $("#streakLab").textContent="連續完成 "+streak+" 天";

  const grid=$("#grid"); grid.innerHTML="";
  for(let d=1;d<=curDays();d++){
    const s=dayStats(d);
    const c=document.createElement("div");
    c.className="cell";
    if(s.total && s.done===s.total) c.classList.add("full");
    else if(s.done>0) c.classList.add("partial");
    if(td===d) c.classList.add("today");
    c.title="Day "+d+"："+s.done+"/"+s.total;
    grid.appendChild(c);
  }
}

/* ---------- 海馬迴單字庫頁面（獨立真實日期 SRS，共用單字池） ---------- */
function todayMid(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function todayISO(){ const d=todayMid(); const m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0"); return d.getFullYear()+"-"+m+"-"+day; }
function isoMid(iso){ const d=new Date(iso+"T00:00:00"); d.setHours(0,0,0,0); return d; }
function daysSinceISO(iso){ return Math.floor((todayMid()-isoMid(iso))/86400000); }

// 單字庫 SRS 狀態：lo=開始學習日(YYYY-MM-DD)，ri=已完成的間隔階段(0..4)
function libStatus(w){
  if(!w.lo) return {key:"new", label:"未學"};
  const ri=w.ri||0;
  if(ri>=INTERVALS.length) return {key:"done", label:"已熟記"};
  const ds=daysSinceISO(w.lo), need=INTERVALS[ri];
  if(ds>=need) return {key:"due", label:"待複習"};
  return {key:"learn", label:(need-ds)+" 天後複習"};
}
function libDue(){ return libWords().filter(o=>libStatus(o.word).key==="due"); }
function libCounts(){
  let learning=0, due=0, done=0;
  libWords().forEach(o=>{
    const w=o.word; if(!w.lo) return;
    const s=libStatus(w).key;
    if(s==="done") done++; else { learning++; if(s==="due") due++; }
  });
  return {learning, due, done};
}
function startLearning(day, idx){ const w=(vocab[day]||[])[idx]; if(!w) return; w.lo=todayISO(); w.ri=0; saveVocab(); renderAll(); }
function reviewYes(day, idx){ const w=(vocab[day]||[])[idx]; if(!w) return; w.ri=(w.ri||0)+1; bumpPractice(true, w);  saveVocab(); renderAll(); }
function reviewNo(day, idx){ const w=(vocab[day]||[])[idx]; if(!w) return; w.lo=todayISO(); w.ri=0; bumpPractice(false, w); saveVocab(); renderAll(); }
// 新增單字進 lib 桶並立即開始學習；已存在則設為今天新學＋補例句
function addLibWord(wv, mv, exv, ext, nv, learn){
  const hit=findInCurLib(wv);   // 同庫內去重
  if(hit){
    const wd=hit.word;
    const dup = exv && (wd.exs||[]).some(x=>exE(x).trim().toLowerCase()===exv.toLowerCase());
    let added=false;
    if(exv && !dup){ (wd.exs=wd.exs||[]).push({e:exv, t:ext||""}); added=true; }
    if(mv && !wd.m) wd.m=mv;
    if(nv && !wd.n) wd.n=nv;
    if(learn){ wd.lo=todayISO(); wd.ri=0; }
    saveVocab(); renderAll();
    return "「"+wv+"」已在「"+curLib+"」"+(learn?"，已設為今天新學":"")+(added?"，已新增例句":"");
  }
  if(!Array.isArray(vocab.lib)) vocab.lib=[];
  const obj={w:wv, m:mv, exs: exv?[{e:exv, t:ext||""}]:[], n:nv, lib:curLib, da:todayISO()};
  if(learn){ obj.lo=todayISO(); obj.ri=0; }
  vocab.lib.push(obj);
  saveVocab(); renderAll();
  return "";
}
function libReviewCardHTML(day, idx, w){
  const k=day+":"+idx, ri=w.ri||0;
  return '<div class="flip librev">'
    +'<div class="fw">'+esc(w.w)+sayBtn(w.w, true)+'</div>'
    +exsHTML(w.exs, "fex")
    +'<div class="fm">'+esc(w.m||'(未填意思)')+'</div>'
    +(w.n?'<div class="fn">'+esc(w.n)+'</div>':'')
    +'<div class="hintr">點按看意思</div>'
    +'<div class="rev-acts"><button class="rev-yes" data-revyes="'+k+'">記得 ✓</button>'
    +'<button class="rev-no" data-revno="'+k+'">忘了 ✕</button></div>'
    +'<span class="flip-batch">第 '+(ri+1)+' 次複習</span></div>';
}
function libRowHTML(day, idx, w){
  const k=day+":"+idx;
  if(editing===k) return '<div class="vrow">'+wordEditFormHTML(day,idx)+'</div>';
  const st=libStatus(w);
  return '<div class="vrow"><div class="vbody">'+wordBodyHTML(w)
    +'<div class="lib-rowfoot"><span class="st st-'+st.key+'">'+st.label+'</span>'
    +'<span class="vbatch">'+groupLabel(day)+'</span></div>'
    +'</div><div class="vacts">'
    +(st.key==='new' ? '<button class="vlearn" data-learn="'+k+'" title="設為今天新學">今天新學</button>' : '')
    +'<button class="vedit" data-edit="'+k+'" title="編輯">✏️</button>'
    +'<button class="vdel" data-del="'+k+'" title="刪除">✕</button></div></div>';
}
// 自由練習用的翻卡（無記得/忘了按鈕，只翻開看意思）
function libFlipCardHTML(day, w){
  return '<div class="flip">'
    +'<div class="fw">'+esc(w.w)+sayBtn(w.w, true)+'</div>'
    +exsHTML(w.exs, "fex")
    +'<div class="fm">'+esc(w.m||'(未填意思)')+'</div>'
    +(w.n?'<div class="fn">'+esc(w.n)+'</div>':'')
    +'<div class="hintr">點按看意思</div>'
    +'<span class="flip-batch">'+groupLabel(day)+'</span></div>';
}
/* ---------- 測驗模式（考單字庫「今天要複習」的到期字，混合出題） ---------- */
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
// 有學習日期(lo)且 w/m 皆填的字，依日期分組計數（新到舊）
function learnDates(){
  const map={};
  libWords().forEach(o=>{ const w=o.word; if(w.da && String(w.w||'').trim() && String(w.m||'').trim()) map[w.da]=(map[w.da]||0)+1; });
  return Object.keys(map).sort().reverse().map(d=>({date:d, count:map[d]}));
}
function quizPool(date){
  return libWords().map(o=>o.word).filter(w=>w.da===date && String(w.w||'').trim() && String(w.m||'').trim());
}
// 預設測驗日期：選過就用選的；否則今天(若今天有學)否則最近一天
function quizDefaultDate(){
  const dates=learnDates(); if(!dates.length) return "";
  if(quizDate && dates.some(d=>d.date===quizDate)) return quizDate;
  const today=todayISO();
  return dates.some(d=>d.date===today) ? today : dates[0].date;
}
function startQuiz(date){
  const pool = quizPool(date);
  if(!pool.length) return;
  const meanings = Array.from(new Set(libWords().map(o=>String(o.word.m||'').trim()).filter(Boolean)));
  const items = shuffle(pool).map(w=>{
    let type = Math.random()<0.5 ? 'type' : 'choice';
    let options=null;
    if(type==='choice'){
      const distract = shuffle(meanings.filter(m=>m!==String(w.m).trim())).slice(0,3);
      options = shuffle([String(w.m)].concat(distract));
      if(options.length<2) type='type';   // 沒有干擾項 → 改成打字
    }
    return { w:String(w.w), m:String(w.m), type, options: type==='choice'?options:null };
  });
  quiz = { date, items, i:0, correct:0, answered:false, lastCorrect:null, chosen:null };
  renderLibPage();
}
function quizHTML(){
  const total=quiz.items.length;
  if(quiz.i>=total){
    const pct = total?Math.round(quiz.correct/total*100):0;
    return '<div class="lp-sec quiz"><div class="quiz-top"><span>測驗完成</span>'
      +'<button class="quiz-exit" data-quiz="exit">離開</button></div>'
      +'<div class="quiz-result">答對 '+quiz.correct+' / '+total+'（'+pct+'%）</div>'
      +'<div class="quiz-acts"><button class="vaddbtn" data-quiz="again">再考一次</button>'
      +'<button class="quiz-exit" data-quiz="exit">回單字庫</button></div></div>';
  }
  const it=quiz.items[quiz.i];
  let body='<div class="quiz-top"><span>第 '+(quiz.i+1)+' / '+total+' 題</span>'
    +'<span>答對 '+quiz.correct+'</span>'
    +'<button class="quiz-exit" data-quiz="exit">離開</button></div>';
  if(it.type==='type'){
    body+='<div class="quiz-prompt">看中文 · 輸入英文</div><div class="quiz-q">'+esc(it.m)+'</div>';
    if(!quiz.answered){
      body+='<input id="quizInput" class="quiz-input" placeholder="輸入英文單字" autocomplete="off" autocapitalize="off" spellcheck="false">'
        +'<button class="vaddbtn" data-quiz="submit">作答</button>';
    }
  } else {
    body+='<div class="quiz-prompt">看英文 · 選出正確中文</div><div class="quiz-q">'+esc(it.w)+'</div>';
    body+='<div class="quiz-opts">'+it.options.map(opt=>{
      let cls='quiz-opt';
      if(quiz.answered){ if(opt===it.m) cls+=' right'; else if(opt===quiz.chosen) cls+=' wrong'; }
      return '<button class="'+cls+'" data-quiz="opt" data-opt="'+esc(opt)+'"'+(quiz.answered?' disabled':'')+'>'+esc(opt)+'</button>';
    }).join('')+'</div>';
  }
  if(quiz.answered){
    body+='<div class="quiz-fb '+(quiz.lastCorrect?'ok':'no')+'">'+(quiz.lastCorrect?'✓ 答對了':'✕ 答錯了')+'</div>'
      +'<div class="quiz-ans">'+esc(it.w)+' — '+esc(it.m)+'</div>'
      +'<button class="vaddbtn" data-quiz="next">'+((quiz.i+1>=total)?'看結果':'下一題')+'</button>';
  }
  return '<div class="lp-sec quiz">'+body+'</div>';
}
function wireQuiz(root){
  root.querySelectorAll("[data-quiz]").forEach(el=>{
    el.onclick=()=>{
      const a=el.getAttribute("data-quiz");
      if(a==="exit"){ quiz=null; renderLibPage(); return; }
      if(a==="again"){ startQuiz(quiz.date); return; }
      if(a==="next"){ quiz.i++; quiz.answered=false; quiz.chosen=null; renderLibPage(); return; }
      const it=quiz.items[quiz.i];
      if(a==="submit"){
        const inp=root.querySelector("#quizInput");
        const val=(inp?inp.value:'').trim();
        quiz.lastCorrect = val.toLowerCase()===String(it.w).trim().toLowerCase();
        if(quiz.lastCorrect) quiz.correct++;
        const h1=findWordGlobal(it.w); if(h1) bumpPractice(quiz.lastCorrect, h1.word);
        quiz.answered=true; saveVocab(); renderLibPage(); return;
      }
      if(a==="opt"){
        if(quiz.answered) return;
        quiz.chosen=el.getAttribute("data-opt");
        quiz.lastCorrect = quiz.chosen===it.m;
        if(quiz.lastCorrect) quiz.correct++;
        const h2=findWordGlobal(it.w); if(h2) bumpPractice(quiz.lastCorrect, h2.word);
        quiz.answered=true; saveVocab(); renderLibPage(); return;
      }
    };
  });
  const inp=root.querySelector("#quizInput");
  if(inp){ inp.focus(); inp.addEventListener("keydown",e=>{ if(e.key==="Enter"){ const b=root.querySelector('[data-quiz="submit"]'); if(b) b.click(); } }); }
}

// 近 N 天的練習紀錄（含今天，舊→新），數據來自每日總計 agg
function recentLog(days, agg){
  const out=[];
  for(let i=days-1;i>=0;i--){
    const d=todayMid(); d.setDate(d.getDate()-i);
    const m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0");
    const iso=d.getFullYear()+"-"+m+"-"+dd;
    const e=agg[iso]||{c:0,x:0}, cc=e.c||0, xx=e.x||0;
    out.push({iso, md:(+m)+"/"+(+dd), c:cc, x:xx, n:cc+xx, isToday:i===0});
  }
  return out;
}

/* ---------- 單字庫管理：新增/刪除 ---------- */
function createLib(name){
  name=String(name||"").trim(); if(!name) return false;
  if(libs.indexOf(name)<0) libs.push(name);
  setCurLib(name); saveLibs(); renderAll(); return true;
}
function deleteLib(name){
  if(Array.isArray(vocab.lib)) vocab.lib = vocab.lib.filter(w=>wlib(w)!==name);
  libs = libs.filter(n=>n!==name);
  if(!libs.length) libs=[LIB_DEFAULT];
  setCurLib(libs[0]);
  saveLibs(); saveVocab(); renderAll();
}
function showNewLibForm(root){
  const row=root.querySelector(".lib-pickrow"); if(!row) return;
  row.innerHTML='<input id="libNewName" placeholder="新單字庫名稱" autocomplete="off"><button class="lib-tbtn" id="libCreate">建立</button><button class="lib-tbtn" id="libCancel">取消</button>';
  const inp=root.querySelector("#libNewName"); inp.focus();
  const create=()=>{ const v=inp.value.trim(); if(!v){ inp.focus(); return; } if(libNames().indexOf(v)>=0){ setCurLib(v); renderAll(); return; } createLib(v); };
  root.querySelector("#libCreate").onclick=create;
  inp.addEventListener("keydown",e=>{ if(e.key==="Enter") create(); });
  root.querySelector("#libCancel").onclick=()=>renderLibPage();
}

/* ---------- 匯入 / 匯出 ---------- */
function csvEsc(s){ s=String(s==null?"":s); return /[",\n\r]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }
function buildCSV(words){
  const rows=[["word","meaning","example","example_zh","note"]];
  (words||[]).forEach(w=>rows.push([w.w||"", w.m||"", (w.exs||[]).map(exE).join(" | "), (w.exs||[]).map(exT).join(" | "), w.n||""]));
  return rows.map(r=>r.map(csvEsc).join(",")).join("\r\n");
}
function parseCSV(text){
  const rows=[]; let row=[], field="", i=0, inq=false; text=String(text).replace(/\r\n?/g,"\n");
  while(i<text.length){
    const ch=text[i];
    if(inq){
      if(ch==='"'){ if(text[i+1]==='"'){ field+='"'; i+=2; continue; } inq=false; i++; continue; }
      field+=ch; i++; continue;
    }
    if(ch==='"'){ inq=true; i++; continue; }
    if(ch===','){ row.push(field); field=""; i++; continue; }
    if(ch==='\n'){ row.push(field); rows.push(row); row=[]; field=""; i++; continue; }
    field+=ch; i++;
  }
  row.push(field); rows.push(row);
  return rows;
}
function applyCSV(text){
  const rows=parseCSV(text).filter(r=>r.some(c=>String(c).trim()!==""));
  if(!rows.length) return {added:0, dup:0};
  const h=rows[0].map(c=>String(c).trim().toLowerCase());
  const hasHeader = (h[0]==="word"||h[0]==="單字"||h.indexOf("meaning")>=0||h.indexOf("中文")>=0||h.indexOf("example")>=0||h.indexOf("例句")>=0);
  // 欄位對應（相容舊 4 欄：word,meaning,example,note）
  const ci={w:0,m:1,ex:2,exzh:-1,n:3};
  if(hasHeader){
    const z=h.findIndex(x=>/example_zh|例句中文|例句翻譯|翻譯/.test(x)); if(z>=0) ci.exzh=z;
    const ni=h.findIndex(x=>x==="note"||/備註/.test(x)); if(ni>=0) ci.n=ni; else if(ci.exzh>=0) ci.n=4;
  }
  const start = hasHeader ? 1 : 0;
  let added=0, dup=0;
  for(let i=start;i<rows.length;i++){
    const r=rows[i], wv=String(r[ci.w]||"").trim(); if(!wv) continue;
    const mv=String(r[ci.m]||"").trim(), nv=String(r[ci.n]||"").trim();
    const eArr=String(r[ci.ex]||"").split("|").map(s=>s.trim());
    const tArr=ci.exzh>=0 ? String(r[ci.exzh]||"").split("|").map(s=>s.trim()) : [];
    const exs=[]; eArr.forEach((e,k)=>{ if(e) exs.push({e, t:(tArr[k]||"")}); });
    const hit=findInCurLib(wv);
    if(hit){ dup++; const wd=hit.word; exs.forEach(nx=>{ if(!(wd.exs||[]).some(x=>exE(x).trim().toLowerCase()===nx.e.toLowerCase())) (wd.exs=wd.exs||[]).push(nx); }); if(mv&&!wd.m)wd.m=mv; if(nv&&!wd.n)wd.n=nv; continue; }
    if(!Array.isArray(vocab.lib)) vocab.lib=[];
    vocab.lib.push({w:wv, m:mv, exs, n:nv, lib:curLib, da:todayISO()});
    added++;
  }
  saveVocab(); renderAll();
  return {added, dup};
}
function buildBackupJSON(){
  return JSON.stringify({ _app:"toeic20", _v:1, start:startDate, tasks:done, vocab:vocab, log:log, libs:libs }, null, 2);
}
function applyBackupJSON(text){
  let obj; try{ obj=JSON.parse(text); }catch(e){ return {ok:false, err:"JSON 格式錯誤"}; }
  if(!obj || typeof obj!=="object" || (obj._app && obj._app!=="toeic20")) return {ok:false, err:"不是有效的備份檔"};
  startDate=obj.start||""; done=obj.tasks||{}; vocab=obj.vocab||{}; log=obj.log||{}; libs=Array.isArray(obj.libs)?obj.libs:[];
  Object.keys(log).forEach(k=>{ if(typeof log[k]==="number") log[k]={c:log[k],x:0}; });
  migrateVocab(vocab); migrateLibs();
  localStorage.setItem(LS.start,startDate);
  localStorage.setItem(LS.tasks,JSON.stringify(done));
  localStorage.setItem(LS.vocab,JSON.stringify(vocab));
  localStorage.setItem(LS.log,JSON.stringify(log));
  localStorage.setItem(LS.libs,JSON.stringify(libs));
  if(startInput) startInput.value=startDate;
  notifyChange(); renderAll();
  return {ok:true};
}
function downloadFile(filename, text, mime){
  const blob=new Blob([text], {type:mime||"text/plain"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ if(a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

function renderLibPage(){
  const root=$("#libPageArea"); if(!root) return;
  if(quiz){ root.innerHTML=quizHTML(); wireQuiz(root); return; }   // 測驗中：全頁顯示測驗
  const all=libWords(), c=libCounts(), due=libDue();

  let html='<div class="lp-intro"><div class="kicker">海馬迴間隔複習</div>'
    +'<h2>單字庫</h2><div class="sub">分主題的長期單字庫 · 依真實日期排 +1／+3／+7／+14 複習</div></div>';

  // 單字庫工具列：選庫／新增／刪除／匯入／匯出
  const names=libNames();
  html+='<div class="lib-toolbar"><div class="lib-pickrow">'
    +'<select id="libSel">'+names.map(n=>'<option value="'+esc(n)+'"'+(n===curLib?' selected':'')+'>'+esc(n)+'</option>').join('')+'</select>'
    +'<button class="lib-tbtn" id="libNew" title="新增單字庫">＋ 新增</button>'
    +'<button class="lib-tbtn" id="libDel" title="刪除目前單字庫">刪除</button>'
    +'</div><div class="lib-iorow">'
    +'<button class="lib-tbtn" id="libExpCsv">匯出 CSV</button>'
    +'<button class="lib-tbtn" id="libExpJson">匯出 JSON</button>'
    +'<label class="lib-tbtn" for="libImpFile">匯入 CSV／JSON</label>'
    +'<input type="file" id="libImpFile" accept=".csv,.json,text/csv,application/json" hidden>'
    +'</div><div class="vmsg" id="libIoMsg"></div></div>';

  html+='<div class="lp-stats">'
    +'<div class="lp-stat due"><div class="num">'+c.due+'</div><div class="lab">今天要複習</div></div>'
    +'<div class="lp-stat"><div class="num">'+c.learning+'</div><div class="lab">學習中</div></div>'
    +'<div class="lp-stat done"><div class="num">'+c.done+'</div><div class="lab">已熟記</div></div>'
    +'<div class="lp-stat"><div class="num">'+all.length+'</div><div class="lab">單字總數</div></div></div>';

  html+='<details class="lp-sec lp-fold"'+(due.length?'':' open')+'>'
    +'<summary><h3><span class="dot" style="background:var(--due)"></span>今天要複習 · '+due.length+' 字</h3><span class="chev">▾</span></summary>';
  if(due.length){
    html+='<div class="lib-cardnote">先回想中文，點開驗證，再選「記得／忘了」。</div><div class="lib-cards">';
    due.forEach(o=>{ html+=libReviewCardHTML(o.day, o.idx, o.word); });
    html+='</div>';
  } else { html+='<div class="lp-empty">今天沒有到期的字 🎉 想多背就到下方「今天新學」加字。</div>'; }
  html+='</details>';

  // 測驗（可選學習日期）
  const qdates=learnDates();
  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--due)"></span>單字測驗</h3>';
  if(qdates.length){
    const today=todayISO(), sel=quizDefaultDate();
    const selCount=(qdates.find(d=>d.date===sel)||{}).count||0;
    html+='<div class="quiz-pick"><label for="quizDate">加入日期</label><select id="quizDate">';
    qdates.forEach(d=>{
      html+='<option value="'+d.date+'"'+(d.date===sel?' selected':'')+'>'+d.date+(d.date===today?'（今天）':'')+' · '+d.count+' 字</option>';
    });
    html+='</select><button class="vaddbtn" data-quiz-start="1">📝 開始測驗（'+selCount+' 字）</button></div>';
    html+='<div class="lib-cardnote">選一天，考那天加入的單字：隨機出「看中文打英文」或「看英文選中文」。</div>';
  } else {
    html+='<div class="lp-empty">還沒有開始學習的單字。把字選為「今天新學」或新增單字（勾「今天開始學習」）後就能測驗。</div>';
  }
  html+='</div>';

  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--lock)"></span>新增單字進單字庫</h3>'
    +'<div class="ventry">'
    +'<input id="lvw" placeholder="單字" autocomplete="off">'
    +'<input id="lvm" placeholder="中文意思" autocomplete="off">'
    +'<input id="lvex" placeholder="例句（可留空）" autocomplete="off">'
    +'<input id="lvext" placeholder="例句中文翻譯（可留空）" autocomplete="off">'
    +'<input id="lvn" placeholder="備註（可留空）" autocomplete="off">'
    +'<label class="lv-learn"><input type="checkbox" id="lvLearn" checked> 今天開始學習（排進 +1／+3／+7／+14 複習）</label>'
    +'<button class="vaddbtn" id="lvadd">加入單字庫</button>'
    +'<div class="vmsg" id="lvmsg"></div></div></div>';

  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--ink)"></span>全部單字 · '+all.length+'</h3>'
    +'<div class="lib-ctrl"><input id="lpSearch" placeholder="搜尋 單字／中文／例句／備註" value="'+esc(lpQuery)+'" autocomplete="off">'
    +'<div class="lib-modes">'
    +'<button class="lib-mode'+(lpMode==="list"?" on":"")+'" data-lpmode="list">列表</button>'
    +'<button class="lib-mode'+(lpMode==="cards"?" on":"")+'" data-lpmode="cards">翻卡</button></div></div>';
  const q=lpQuery.trim().toLowerCase();
  const filtered = q ? all.filter(o=>{
    const w=o.word;
    return String(w.w||'').toLowerCase().includes(q) || String(w.m||'').toLowerCase().includes(q)
      || (w.exs||[]).some(x=>exE(x).toLowerCase().includes(q)||exT(x).toLowerCase().includes(q)) || String(w.n||'').toLowerCase().includes(q);
  }) : all;
  if(!all.length){ html+='<div class="lp-empty">單字庫還是空的。用上面的「新增單字」開始，或在 20 天衝刺裡輸入的字也會出現在這。</div>'; }
  else if(!filtered.length){ html+='<div class="lp-empty">找不到符合「'+esc(lpQuery)+'」的單字。</div>'; }
  else if(lpMode==="cards"){
    html+='<div class="lib-cardnote">先回想中文，再點卡片翻開驗證。共 '+filtered.length+' 張。</div>';
    html+='<div class="lib-cards">'; filtered.forEach(o=>{ html+=libFlipCardHTML(o.day, o.word); }); html+='</div>';
  }
  else { html+='<div class="lib-list">'; filtered.forEach(o=>{ html+=libRowHTML(o.day, o.idx, o.word); }); html+='</div>'; }
  html+='</div>';

  root.innerHTML=html;

  wireWordControls(root);
  root.querySelectorAll("[data-revyes]").forEach(el=>{ el.onclick=e=>{ e.stopPropagation(); const p=el.getAttribute("data-revyes").split(":"); reviewYes(p[0],+p[1]); }; });
  root.querySelectorAll("[data-revno]").forEach(el=>{ el.onclick=e=>{ e.stopPropagation(); const p=el.getAttribute("data-revno").split(":"); reviewNo(p[0],+p[1]); }; });
  root.querySelectorAll("[data-learn]").forEach(el=>{ el.onclick=e=>{ e.stopPropagation(); const p=el.getAttribute("data-learn").split(":"); startLearning(p[0],+p[1]); }; });
  // 單字庫工具列
  const lsel=root.querySelector("#libSel"); if(lsel) lsel.onchange=()=>{ setCurLib(lsel.value); quizDate=""; lpQuery=""; renderAll(); };
  const lnew=root.querySelector("#libNew"); if(lnew) lnew.onclick=()=>showNewLibForm(root);
  const ldel=root.querySelector("#libDel"); if(ldel) ldel.onclick=()=>{ if(confirm('刪除單字庫「'+curLib+'」與其所有單字？此動作無法復原。')) deleteLib(curLib); };
  const lec=root.querySelector("#libExpCsv"); if(lec) lec.onclick=()=>downloadFile(curLib+".csv", "﻿"+buildCSV(libWords().map(o=>o.word)), "text/csv;charset=utf-8");
  const lej=root.querySelector("#libExpJson"); if(lej) lej.onclick=()=>downloadFile("toeic-backup.json", buildBackupJSON(), "application/json");
  const limp=root.querySelector("#libImpFile"); if(limp) limp.onchange=()=>{
    const f=limp.files&&limp.files[0]; if(!f) return;
    const isJson=/\.json$/i.test(f.name);
    f.text().then(t=>{
      let msg;
      if(isJson){ const r=applyBackupJSON(t); msg=r.ok?"已從 JSON 還原備份":("匯入失敗："+r.err); }
      else { const r=applyCSV(t); msg="CSV 匯入「"+curLib+"」：新增 "+r.added+" 字"+(r.dup?("，更新 "+r.dup+" 字"):""); }
      const m=document.querySelector("#libIoMsg"); if(m) m.textContent=msg;
    });
  };
  const qd=root.querySelector("#quizDate"); if(qd) qd.onchange=()=>{ quizDate=qd.value; renderLibPage(); };
  const qs=root.querySelector("[data-quiz-start]"); if(qs) qs.onclick=()=>{ const d=root.querySelector("#quizDate"); startQuiz(d?d.value:quizDefaultDate()); };
  root.querySelectorAll("[data-lpmode]").forEach(b=>{ b.onclick=()=>{ lpMode=b.getAttribute("data-lpmode"); renderLibPage(); }; });
  const s=root.querySelector("#lpSearch");
  if(s) s.oninput=()=>{ lpQuery=s.value; renderLibPage();
    const s2=document.querySelector("#lpSearch"); if(s2){ s2.focus(); s2.setSelectionRange(s2.value.length,s2.value.length); } };
  const addBtn=root.querySelector("#lvadd");
  if(addBtn){
    const commit=()=>{
      const wEl=root.querySelector("#lvw"), mEl=root.querySelector("#lvm"), exEl=root.querySelector("#lvex"), extEl=root.querySelector("#lvext"), nEl=root.querySelector("#lvn");
      const wv=wEl.value.trim(), mv=mEl.value.trim(), exv=exEl.value.trim(), ext=extEl.value.trim(), nv=nEl.value.trim();
      if(!wv){ wEl.focus(); return; }
      const lc=root.querySelector("#lvLearn"); const learn=lc?lc.checked:true;
      const msg=addLibWord(wv,mv,exv,ext,nv,learn);
      const m2=document.querySelector("#lvmsg"); if(m2) m2.textContent=msg;
      const nw=document.querySelector("#lvw"); if(nw) nw.focus();
    };
    addBtn.onclick=commit;
    const nEl=root.querySelector("#lvn");
    if(nEl) nEl.addEventListener("keydown",e=>{ if(e.key==="Enter") commit(); });
  }
}

/* ---------- 練習紀錄頁（Dashboard，全部單字庫合計） ---------- */
function renderDashboard(){
  const root=$("#dashArea"); if(!root) return;
  const agg=dailyAgg();
  const recent=recentLog(14, agg);
  let totC=0, totX=0; Object.keys(agg).forEach(k=>{ totC+=agg[k].c||0; totX+=agg[k].x||0; });
  const totN=totC+totX, acc = totN ? Math.round(totC/totN*100) : 0;
  const tAgg=agg[todayISO()]||{c:0,x:0}; const t={c:tAgg.c||0, x:tAgg.x||0, n:(tAgg.c||0)+(tAgg.x||0)};
  const maxN=Math.max(1,...recent.map(d=>d.n));

  let html='<div class="lp-intro"><div class="kicker">海馬迴間隔複習</div>'
    +'<h2>練習紀錄</h2><div class="sub">所有單字庫合計 · 每日對錯與逐字明細</div></div>';

  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--lock)"></span>每日練習</h3>';
  html+='<div class="rec-top">'
    +'<div><span class="rec-big">'+t.n+'</span><span class="rec-lab">今天練習</span><div class="rec-sub">對 '+t.c+' · 錯 '+t.x+'</div></div>'
    +'<div><span class="rec-big">'+totN+'</span><span class="rec-lab">累計</span><div class="rec-sub">對 '+totC+' · 錯 '+totX+'</div></div>'
    +'<div><span class="rec-big">'+acc+'%</span><span class="rec-lab">正確率</span></div></div>';
  html+='<div class="rec-chart">'+recent.map(d=>{
    const totH = d.n ? Math.max(8, Math.round(d.n/maxN*100)) : 0;
    const cls = d.isToday?' today':'';
    let bar;
    if(d.n){
      bar='<div class="rec-bar-stack'+cls+'" style="height:'+totH+'%" title="'+d.iso+'：對 '+d.c+'，錯 '+d.x+'">'
        +(d.x?'<div class="rec-seg wrong" style="flex:'+d.x+'"></div>':'')
        +(d.c?'<div class="rec-seg right" style="flex:'+d.c+'"></div>':'')+'</div>';
    } else { bar='<div class="rec-bar empty" title="'+d.iso+'：0"></div>'; }
    return '<div class="rec-col"><div class="rec-bararea">'+bar+'</div><div class="rec-x'+cls+'">'+d.md+'</div></div>';
  }).join('')+'</div>';
  html+='<div class="rec-legend"><span class="lg right"></span>答對 <span class="lg wrong"></span>答錯 · 測驗作答與「記得／忘了」都計入</div>';
  html+='</div>';

  const recs=practiceRecords();
  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--ink)"></span>逐字練習紀錄</h3>';
  if(!recs.length){
    html+='<div class="lp-empty">還沒有逐字紀錄。做測驗、或按「記得／忘了」後，每個字的對錯會記在這裡。</div>';
  } else {
    recs.slice(0,30).forEach(g=>{
      const p=g.date.split("-");
      html+='<div class="pr-group"><div class="pr-date">'+(+p[1])+'/'+(+p[2])+'</div>';
      g.items.forEach(it=>{
        html+='<div class="pr-row"><span class="pr-w">'+esc(it.w)+'</span>'
          +'<span class="pr-stat">練習 '+it.n+' · <b class="ok">對 '+it.c+'</b> · <b class="no">錯 '+it.x+'</b></span></div>';
      });
      html+='</div>';
    });
    if(recs.length>30) html+='<div class="lib-cardnote">只顯示最近 30 天。</div>';
  }
  html+='</div>';

  root.innerHTML=html;
}

/* ---------- 專案列（考試日 / 倒數） ---------- */
function countdownHTML(p){
  if(!p || !p.start) return '<span class="cd-muted">設定開始日與考試日，開始倒數</span>';
  if(!p.exam){
    const td=todayDay();
    if(td===0)  return '<span class="cd-muted">尚未開始（Day 1 = '+esc(p.start)+'）</span>';
    if(td===99) return '<span class="cd-done">衝刺已完成 🎉</span>';
    return '<span class="cd-muted">第 '+td+' / '+curDays()+' 天</span>';
  }
  const now=new Date(); now.setHours(0,0,0,0);
  const e=new Date(p.exam+"T00:00:00");
  const diff=Math.round((e-now)/86400000);
  if(diff>0)   return '距離考試還有 <b>'+diff+'</b> 天';
  if(diff===0) return '<b>今天就是考試日！</b>加油 💪';
  return '<span class="cd-muted">考試已於 '+Math.abs(diff)+' 天前結束</span>';
}
function renderProjectBar(){
  const bar=$("#projectBar"); if(!bar) return;   // 僅衝刺頁
  const p=getCurProject();
  const nameEl=$("#projName"), cd=$("#countdown"), si=$("#start"), ei=$("#exam");
  if(nameEl) nameEl.textContent = p ? p.name : "尚未建立專案";
  if(si) si.value = p ? (p.start||"") : (startDate||"");
  if(ei) ei.value = p ? (p.exam||"") : "";
  if(cd) cd.innerHTML = countdownHTML(p);
}

function renderAll(){ renderProjectBar(); renderStrip(); renderDay(); renderProgress(); renderLibrary(); renderLibPage(); renderDashboard(); }

/* ---------- init ---------- */
const startInput=$("#start");          // 只有 20 天衝刺頁(index.html)有這些元件
if(startInput){
  if(curStart()) startInput.value=curStart();
  startInput.onchange=()=>{
    const v=startInput.value;
    startDate=v; localStorage.setItem(LS.start,v);   // 舊 key 相容
    const p=getCurProject();
    if(p) updateProject(p.id,{start:v});             // 同步目前專案（內含 notifyChange）
    else { const np=createProject("我的衝刺", v, ($("#exam")&&$("#exam").value)||""); done=np.tasks; } // 首次設定 → 建立專案
    const td=todayDay();
    viewing = (td && td!==0 && td!==99)? td : 1;
    renderAll();
  };
}
const examInput=$("#exam");
if(examInput){
  examInput.onchange=()=>{
    const v=examInput.value;
    let p=getCurProject();
    if(p) updateProject(p.id,{exam:v});              // 更新考試日 → 內部重算天數
    else { p=createProject("我的衝刺", ($("#start")&&$("#start").value)||"", v); done=p.tasks; }
    const td=todayDay();
    viewing = (td && td!==0 && td!==99)? td : (viewing||1);
    renderAll();
  };
}
const resetBtn=$("#resetBtn");
if(resetBtn){
  resetBtn.onclick=()=>{
    // 只清目前專案的打勾與日期，單字與學習進度一律保留（計劃書 §4.6、§8）
    if(confirm("確定清除目前專案的打勾進度與開始日？單字不會被刪除。此動作無法復原。")){
      const p=getCurProject();
      if(p){ p.start=""; p.exam=""; p.days=TOTAL; p.tasks={}; done=p.tasks; saveProjects(); }
      else { done={}; }
      localStorage.setItem(LS.tasks, JSON.stringify(done));
      startDate=""; localStorage.setItem(LS.start,"");
      if(startInput) startInput.value=""; viewing=1;
      notifyChange();
      renderAll();
    }
  };
}

/* ---------- bridge for the cloud sync layer (sync.js) ---------- */
window.TOEIC = {
  getLocal(){ return {start:startDate, tasks:done, vocab:vocab, log:log, libs:libs}; },
  isLocalEmpty(){
    return !startDate && Object.keys(done).length===0 && Object.keys(vocab).length===0 && Object.keys(log).length===0;
  },
  setOnChange(fn){ onChange = fn; },
  applyRemote(data){
    startDate = (data && data.start) ? data.start : "";
    done      = (data && data.tasks) ? data.tasks : {};
    vocab     = (data && data.vocab) ? data.vocab : {};
    log       = (data && data.log) ? data.log : {};
    libs      = (data && Array.isArray(data.libs)) ? data.libs : [];
    migrateVocab(vocab);
    migrateLibs();
    localStorage.setItem(LS.start, startDate);
    localStorage.setItem(LS.tasks, JSON.stringify(done));
    localStorage.setItem(LS.vocab, JSON.stringify(vocab));
    localStorage.setItem(LS.log, JSON.stringify(log));
    localStorage.setItem(LS.libs, JSON.stringify(libs));
    if(startInput) startInput.value = startDate;
    const td = todayDay();
    viewing = (td && td!==0 && td!==99) ? td : (viewing || 1);
    renderAll();
  },
  // 匯入/匯出（也供 UI 與測試使用）
  exportJSON(){ return buildBackupJSON(); },
  importJSON(text){ return applyBackupJSON(text); },
  exportCSV(){ return buildCSV(libWords().map(o=>o.word)); },
  importCSV(text){ return applyCSV(text); }
};

// 初始：依目前頁面實際存在的容器渲染（缺的容器自動略過）
(function(){
  const td=todayDay();
  viewing = (td && td!==0 && td!==99)? td : 1;
  renderAll();
})();
