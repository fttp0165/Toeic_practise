"use strict";
const TOTAL=20, LAST_NEW=18, WPB=15, INTERVALS=[1,3,7,14];
const LS={start:"toeic20_start", tasks:"toeic20_tasks", vocab:"toeic20_vocab", log:"toeic20_log", libs:"toeic20_libs"};
const LIB_DEFAULT="我的單字庫";

/* ---------- phases ---------- */
function phaseOf(d){
  if(d<=3)  return {name:"打地基",     desc:"模擬考抓底、熟記題型配分、開始滾單字"};
  if(d<=9)  return {name:"聽力＋文法主攻",desc:"CP 值最高，建立基礎聽力與文法直覺"};
  if(d<=14) return {name:"擴張 Part 3/4/6",desc:"先看題目再聽，抓關鍵資訊"};
  if(d<=18) return {name:"攻 Part 7＋時間",desc:"關鍵字定位、控制每篇時間"};
  return            {name:"全真模擬＋收尾",desc:"計時實戰、調節奏、複習錯題"};
}

/* ---------- daily tasks ---------- */
function tasksOf(d){
  const t=[];
  // morning recall (auto handled separately as recall box, but also a checkable task)
  t.push({id:"recall",title:"晨間主動回想複習",note:"蓋住中文，回想下方各批單字",time:"15 分"});

  if(d===1){
    t.push({id:"mock0",title:"完整模擬考 1 回（抓底）",note:"分數難看沒關係，目的是看清各 Part 弱點",time:"~2 hr"});
    t.push({id:"types",title:"熟記 7 大 Part 題型／題數／配分",note:"低分者最常跳過、但回報最大的一步",time:"30 分"});
  } else if(d<=3){
    t.push({id:"lis",title:"聽力 Part 1–2：20 題 + shadowing 5 句",note:"題型固定，先把套路與陷阱摸熟",time:"25 分"});
    t.push({id:"gram",title:"Part 5 文法 10 題 + 訂正",note:"錯題歸類：詞性／時態／介系詞／連接詞",time:"25 分"});
    t.push({id:"focus",title:"複習題型配分 + 加練 Part 1–2 約 10 題",note:"把地基踩穩",time:"25 分"});
  } else if(d<=9){
    t.push({id:"lis",title:"聽力 Part 1–2：25–30 題 + shadowing 8 句",note:"今天的主攻項，跟著音檔開口唸",time:"25 分"});
    t.push({id:"gram",title:"Part 5 文法 15 題 + 歸類訂正",note:"看到題目就知道在考哪個點",time:"25 分"});
    t.push({id:"focus",title:"加練 Part 1–2 約 15 題 + shadowing",note:"把「聽得懂的比例」拉上來",time:"25 分"});
  } else if(d<=14){
    t.push({id:"lis",title:"Part 3／4：3–4 篇（約 10–12 題）",note:"先看題再聽，開聽前掃過問題抓重點",time:"30 分"});
    t.push({id:"gram",title:"Part 5／6 文法 10–15 題 + 訂正",note:"Part 6 併進文法一起練",time:"25 分"});
    t.push({id:"focus",title:"聽力 Part 1–2：10 題維持手感",note:"別讓最穩的兩個 Part 生疏",time:"20 分"});
  } else if(d<=18){
    t.push({id:"read",title:"Part 7 單篇：2–3 篇（計時）",note:"關鍵字定位、不逐字讀，先寫單篇文章題",time:"30 分"});
    t.push({id:"lis",title:"Part 3／4：2 篇實戰",note:"先看題、抓關鍵，維持聽力手感",time:"25 分"});
    t.push({id:"gram",title:"Part 5／6 文法 10 題 + 訂正",note:"維持文法穩定分",time:"20 分"});
  } else {
    t.push({id:"mockF",title:"全真計時模擬 1 回（聽力＋閱讀）",note:"嚴格計時，把答題節奏調到位",time:"~2 hr"});
    t.push({id:"review",title:"複習錯題本 + 單字本",note:"收尾，把會的穩穩拿下",time:"30 分"});
  }

  // 睡前新單字（Day 1–18），列為可打勾任務
  if(d<=LAST_NEW){
    t.push({id:"newvocab",title:"睡前背新單字 "+WPB+" 個（第 "+d+" 批）",note:"當天最後一件事，明早起床先回想",time:"15 分"});
  }
  return t;
}

/* ---------- spaced repetition ---------- */
function recallBatches(d){
  return INTERVALS
    .map(iv=>({src:d-iv, iv}))
    .filter(o=>o.src>=1 && o.src<=LAST_NEW)
    .sort((a,b)=>a.src-b.src);
}

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
// 例句：相容字串或 {e:英文, t:中文}
function exE(x){ return (x && typeof x==="object") ? String(x.e||"") : String(x==null?"":x); }
function exT(x){ return (x && typeof x==="object") ? String(x.t||"") : ""; }
function exLineHTML(x, cls){ const e=exE(x), t=exT(x); if(!e && !t) return ""; return '<div class="'+cls+'">'+esc(e)+(t?'<div class="ext">'+esc(t)+'</div>':'')+'</div>'; }
function exsHTML(exs, cls){ return (exs&&exs.length)?exs.map(x=>exLineHTML(x, cls)).join(''):''; }
function wordBodyHTML(w){
  return '<div class="vhead"><span class="vw">'+esc(w.w)+'</span><span class="vm">'+esc(w.m||'')+'</span></div>'
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
// 將編輯/刪除/翻卡的事件綁到指定容器
function wireWordControls(root){
  root.querySelectorAll("[data-edit]").forEach(el=>{
    el.onclick=e=>{ e.stopPropagation(); editing=el.getAttribute("data-edit"); renderAll(); };
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

function save(){ localStorage.setItem(LS.tasks, JSON.stringify(done)); notifyChange(); }
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
  if(!startDate) return null;
  const s=new Date(startDate+"T00:00:00");
  const now=new Date(); now.setHours(0,0,0,0);
  const diff=Math.floor((now-s)/86400000)+1;
  if(diff<1) return 0;        // not started
  if(diff>TOTAL) return 99;   // finished
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
  for(let d=1;d<=TOTAL;d++){
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
    +'<div class="fw">'+esc(w.w)+'</div>'
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
  if(d>LAST_NEW) return '<div class="night-pill"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="#6A747C" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 109.8 9.8z"/></svg>衝刺尾聲：不背新字，睡前複習錯題本與弱點單字，別熬夜。</div>';
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
    +'<div class="daynum">'+d+'<span class="of"> / 20</span></div>'
    +'<div class="day-meta"><span class="phase-badge">'+ph.name+'</span>'
    +'<div class="phase-desc">'+ph.desc+(isToday?' · <b style="color:#1E2529">今天</b>':'')+'</div></div>'
    +'</div>'+waveHTML(d)+'</div>';

  // recall section
  html+='<div class="section"><div class="sec-head"><span class="dot amber"></span>間隔複習（海馬迴）</div>'+recallHTML(d)+'</div>';

  // tasks
  html+='<div class="section"><div class="sec-head"><span class="dot ink"></span>今日任務 · 完成 '+st.done+'/'+st.total+'</div>';
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
  html+='</div>'; // close tasks section

  // vocab entry (only for new-word days)
  if(d<=LAST_NEW){
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
          +'<div class="fw">'+esc(w.w)+'</div>'
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
  for(let d=1;d<=TOTAL;d++){ const s=dayStats(d); total+=s.total; dn+=s.done; }
  const pct= total? Math.round(dn/total*100):0;
  $("#progPct").textContent=pct+"%";
  $("#progCount").textContent="完成 "+dn+" / "+total+" 項";

  // streak: consecutive fully-done days up to today
  const td=todayDay();
  let streak=0;
  if(td && td!==0){
    const upto = (td===99)?TOTAL:td;
    for(let d=upto; d>=1; d--){
      const s=dayStats(d);
      if(s.total && s.done===s.total) streak++; else break;
    }
  }
  $("#streakLab").textContent="連續完成 "+streak+" 天";

  const grid=$("#grid"); grid.innerHTML="";
  for(let d=1;d<=TOTAL;d++){
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
    +'<div class="fw">'+esc(w.w)+'</div>'
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
    +'<div class="fw">'+esc(w.w)+'</div>'
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

  html+='<div class="lp-sec"><h3><span class="dot" style="background:var(--due)"></span>今天要複習 · '+due.length+' 字</h3>';
  if(due.length){
    html+='<div class="lib-cardnote">先回想中文，點開驗證，再選「記得／忘了」。</div><div class="lib-cards">';
    due.forEach(o=>{ html+=libReviewCardHTML(o.day, o.idx, o.word); });
    html+='</div>';
  } else { html+='<div class="lp-empty">今天沒有到期的字 🎉 想多背就到下方「今天新學」加字。</div>'; }
  html+='</div>';

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

function renderAll(){ renderStrip(); renderDay(); renderProgress(); renderLibrary(); renderLibPage(); renderDashboard(); }

/* ---------- init ---------- */
const startInput=$("#start");          // 只有 20 天衝刺頁(index.html)有這些元件
if(startInput){
  if(startDate) startInput.value=startDate;
  startInput.onchange=()=>{
    startDate=startInput.value;
    localStorage.setItem(LS.start,startDate);
    notifyChange();
    const td=todayDay();
    viewing = (td && td!==0 && td!==99)? td : 1;
    renderAll();
  };
}
const resetBtn=$("#resetBtn");
if(resetBtn){
  resetBtn.onclick=()=>{
    if(confirm("確定清除所有打勾進度與開始日？此動作無法復原。")){
      localStorage.removeItem(LS.tasks);
      localStorage.removeItem(LS.start);
      done={}; startDate=""; if(startInput) startInput.value=""; viewing=1;
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
