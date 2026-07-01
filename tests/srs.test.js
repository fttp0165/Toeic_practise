"use strict";
/* srs.js 單元測試（Node 內建 node:test，零依賴）。
   守住兩件事：
   (1) days=20 時與改造前「寫死 20 天」的行為逐日等價（回歸基準）。
   (2) 任意天數的縮放/退化規則符合規格。 */
const test = require("node:test");
const assert = require("node:assert");
const SRS = require("../srs.js");

/* ---------- 改造前的參考實作（寫死 20 天，作為回歸基準） ---------- */
function oldPhaseName(d){
  if(d<=3)  return "打地基";
  if(d<=9)  return "聽力＋文法主攻";
  if(d<=14) return "擴張 Part 3/4/6";
  if(d<=18) return "攻 Part 7＋時間";
  return "全真模擬＋收尾";
}
function oldTaskIds(d){
  const t=["recall"];
  if(d===1) t.push("mock0","types");
  else if(d<=3)  t.push("lis","gram","focus");
  else if(d<=9)  t.push("lis","gram","focus");
  else if(d<=14) t.push("lis","gram","focus");
  else if(d<=18) t.push("read","lis","gram");
  else           t.push("mockF","review");
  if(d<=18) t.push("newvocab");
  return t;
}
function oldRecall(d){
  return [1,3,7,14]
    .map(iv=>({src:d-iv, iv}))
    .filter(o=>o.src>=1 && o.src<=18)
    .sort((a,b)=>a.src-b.src);
}

/* ---------- (1) days=20 逐日回歸 ---------- */
test("days=20：phaseOf 逐日與改造前等價", () => {
  for(let d=1; d<=20; d++){
    assert.strictEqual(SRS.phaseOf(d,20).name, oldPhaseName(d), "d="+d);
  }
});
test("days=20：tasksOf 的任務 id 序列逐日等價", () => {
  for(let d=1; d<=20; d++){
    assert.deepStrictEqual(SRS.tasksOf(d,20).map(t=>t.id), oldTaskIds(d), "d="+d);
  }
});
test("days=20：recallBatches 逐日等價", () => {
  for(let d=1; d<=20; d++){
    assert.deepStrictEqual(SRS.recallBatches(d,20), oldRecall(d), "d="+d);
  }
});
test("newvocab 標題含當日批次；收尾兩天不背新字", () => {
  assert.match(SRS.tasksOf(5,20).find(t=>t.id==="newvocab").title, /第 5 批/);
  assert.ok(!SRS.tasksOf(19,20).some(t=>t.id==="newvocab"));
  assert.ok(!SRS.tasksOf(20,20).some(t=>t.id==="newvocab"));
});

/* ---------- (2) 縮放 ---------- */
test("phaseBounds 依天數縮放", () => {
  assert.deepStrictEqual(SRS.phaseBounds(20), [3,9,14,18]);
  assert.deepStrictEqual(SRS.phaseBounds(12), [2,5,8,10]);
  assert.deepStrictEqual(SRS.phaseBounds(30), [5,14,22,28]);
  assert.deepStrictEqual(SRS.phaseBounds(7),  [1,3,4,5]);
});
test("lastNewOf = days-2（極短退化）", () => {
  assert.strictEqual(SRS.lastNewOf(20), 18);
  assert.strictEqual(SRS.lastNewOf(12), 10);
  assert.strictEqual(SRS.lastNewOf(7),  5);
  assert.strictEqual(SRS.lastNewOf(3),  1);
  assert.strictEqual(SRS.lastNewOf(2),  1);
  assert.strictEqual(SRS.lastNewOf(1),  1);
});
test("phase4 結束日 = lastNewDay（收尾＝最後兩天）", () => {
  for(const days of [7,12,20,30]){
    assert.strictEqual(SRS.phaseBounds(days)[3], SRS.lastNewOf(days), "days="+days);
  }
});
test("recallBatches 依縮放後的 lastNewDay 過濾", () => {
  assert.deepStrictEqual(SRS.recallBatches(6,7),  [{src:3,iv:3},{src:5,iv:1}]);
  assert.deepStrictEqual(SRS.recallBatches(8,7),  [{src:1,iv:7},{src:5,iv:3}]); // src>5 被排除
  assert.ok(SRS.recallBatches(29,30).some(o=>o.iv===14 && o.src===15));         // 長計畫 +14 命中
});

/* ---------- (3) 退化與不變量 ---------- */
test("任意天數：階段邊界單調、每天都有階段、不崩", () => {
  for(let days=1; days<=45; days++){
    const b=SRS.phaseBounds(days);
    for(let i=1;i<b.length;i++) assert.ok(b[i]>=b[i-1], "非單調 days="+days);
    for(let d=1; d<=days; d++){
      const name=SRS.phaseOf(d,days).name;
      assert.ok(typeof name==="string" && name.length>0, "缺階段 days="+days+" d="+d);
    }
    assert.ok(SRS.lastNewOf(days)>=1);
  }
});
