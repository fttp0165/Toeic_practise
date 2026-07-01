"use strict";
/* HTML 基本驗證：每個頁面都必須在 app-core.js 之前載入 srs.js
   （app-core.js 於載入期就讀取 window.SRS，順序錯了會整頁壞掉）。 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const PAGES = ["index.html", "library.html", "dashboard.html"];

for(const page of PAGES){
  test(page + "：srs.js 在 app-core.js 之前載入", () => {
    const html = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    const srs = html.indexOf("srs.js");
    const core = html.indexOf("app-core.js");
    assert.ok(srs !== -1, page + " 未載入 srs.js");
    assert.ok(core !== -1, page + " 未載入 app-core.js");
    assert.ok(srs < core, page + " 的 srs.js 必須在 app-core.js 之前");
  });
}
