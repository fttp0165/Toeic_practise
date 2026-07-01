"use strict";
/* ============================================================
   srs.js — 間隔複習與衝刺階段的「純函式」（無 DOM、無狀態）。
   全部依總天數 days 計算，供 app-core.js（瀏覽器）與 CI 單元測試（Node）共用。
   這裡不讀取任何專案／localStorage：呼叫端負責把 days 算好傳進來。
   ============================================================ */
(function(root, factory){
  const api = factory();
  if(typeof module==="object" && module.exports) module.exports = api;  // Node / CI 測試
  if(root) root.SRS = api;                                              // 瀏覽器：window.SRS
})(typeof self!=="undefined" ? self : (typeof globalThis!=="undefined" ? globalThis : this), function(){
  const WPB=15, INTERVALS=[1,3,7,14];

  // 五階段邊界依總天數自動縮放（比例 15/30/25/20/10%）。收尾段固定佔最後 2 天
  // （days<=3 退化）；其餘 4 段按比例分配收尾前的 study span。
  // days=20 時回傳 [3,9,14,18]，與改造前 d<=3/9/14/18 完全一致。
  function phaseBounds(days){
    const S=Math.max(1, days-2);      // study span（收尾前的天數）
    const cum=[15,45,70,90];          // phases 1..4 的累積比例（分母 90）
    const ends=[]; let prev=0;
    for(let i=0;i<4;i++){
      let e=Math.round(cum[i]/90*S);
      if(e<prev+1) e=prev+1;          // 每段至少 1 天、單調遞增
      if(e>S) e=S;                    // 不超過 study span
      ends.push(e); prev=e;
    }
    return ends;
  }

  // 最後背新字日 = 總天數−2（收尾段不背新字）；極短計畫退化為 days−1、至少 1
  function lastNewOf(days){ return (days>=3)? days-2 : Math.max(1, days-1); }

  function phaseOf(d, days){
    const b=phaseBounds(days);
    if(d<=b[0]) return {name:"打地基",     desc:"模擬考抓底、熟記題型配分、開始滾單字"};
    if(d<=b[1]) return {name:"聽力＋文法主攻",desc:"CP 值最高，建立基礎聽力與文法直覺"};
    if(d<=b[2]) return {name:"擴張 Part 3/4/6",desc:"先看題目再聽，抓關鍵資訊"};
    if(d<=b[3]) return {name:"攻 Part 7＋時間",desc:"關鍵字定位、控制每篇時間"};
    return            {name:"全真模擬＋收尾",desc:"計時實戰、調節奏、複習錯題"};
  }

  function tasksOf(d, days){
    const b=phaseBounds(days);       // 依天數縮放的階段邊界，取代寫死的 d<=3/9/14/18
    const t=[];
    // morning recall (auto handled separately as recall box, but also a checkable task)
    t.push({id:"recall",title:"晨間主動回想複習",note:"蓋住中文，回想下方各批單字",time:"15 分"});

    if(d===1){
      t.push({id:"mock0",title:"完整模擬考 1 回（抓底）",note:"分數難看沒關係，目的是看清各 Part 弱點",time:"~2 hr"});
      t.push({id:"types",title:"熟記 7 大 Part 題型／題數／配分",note:"低分者最常跳過、但回報最大的一步",time:"30 分"});
    } else if(d<=b[0]){
      t.push({id:"lis",title:"聽力 Part 1–2：20 題 + shadowing 5 句",note:"題型固定，先把套路與陷阱摸熟",time:"25 分"});
      t.push({id:"gram",title:"Part 5 文法 10 題 + 訂正",note:"錯題歸類：詞性／時態／介系詞／連接詞",time:"25 分"});
      t.push({id:"focus",title:"複習題型配分 + 加練 Part 1–2 約 10 題",note:"把地基踩穩",time:"25 分"});
    } else if(d<=b[1]){
      t.push({id:"lis",title:"聽力 Part 1–2：25–30 題 + shadowing 8 句",note:"今天的主攻項，跟著音檔開口唸",time:"25 分"});
      t.push({id:"gram",title:"Part 5 文法 15 題 + 歸類訂正",note:"看到題目就知道在考哪個點",time:"25 分"});
      t.push({id:"focus",title:"加練 Part 1–2 約 15 題 + shadowing",note:"把「聽得懂的比例」拉上來",time:"25 分"});
    } else if(d<=b[2]){
      t.push({id:"lis",title:"Part 3／4：3–4 篇（約 10–12 題）",note:"先看題再聽，開聽前掃過問題抓重點",time:"30 分"});
      t.push({id:"gram",title:"Part 5／6 文法 10–15 題 + 訂正",note:"Part 6 併進文法一起練",time:"25 分"});
      t.push({id:"focus",title:"聽力 Part 1–2：10 題維持手感",note:"別讓最穩的兩個 Part 生疏",time:"20 分"});
    } else if(d<=b[3]){
      t.push({id:"read",title:"Part 7 單篇：2–3 篇（計時）",note:"關鍵字定位、不逐字讀，先寫單篇文章題",time:"30 分"});
      t.push({id:"lis",title:"Part 3／4：2 篇實戰",note:"先看題、抓關鍵，維持聽力手感",time:"25 分"});
      t.push({id:"gram",title:"Part 5／6 文法 10 題 + 訂正",note:"維持文法穩定分",time:"20 分"});
    } else {
      t.push({id:"mockF",title:"全真計時模擬 1 回（聽力＋閱讀）",note:"嚴格計時，把答題節奏調到位",time:"~2 hr"});
      t.push({id:"review",title:"複習錯題本 + 單字本",note:"收尾，把會的穩穩拿下",time:"30 分"});
    }

    // 睡前新單字（Day 1 ~ lastNew），列為可打勾任務
    if(d<=lastNewOf(days)){
      t.push({id:"newvocab",title:"睡前背新單字 "+WPB+" 個（第 "+d+" 批）",note:"當天最後一件事，明早起床先回想",time:"15 分"});
    }
    return t;
  }

  // 到期回想批次：來源天 src = d - iv，須落在 1..lastNewDay（收尾段不背新字、不列入來源）。
  // days=20 時 lastNew=18，與改造前一致。短計畫 +14 自然不命中。
  function recallBatches(d, days){
    const lastNew = lastNewOf(days);
    return INTERVALS
      .map(iv=>({src:d-iv, iv}))
      .filter(o=>o.src>=1 && o.src<=lastNew)
      .sort((a,b)=>a.src-b.src);
  }

  return { WPB, INTERVALS, phaseBounds, lastNewOf, phaseOf, tasksOf, recallBatches };
});
