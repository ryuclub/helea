// 验证商店窗渲染: 加载页面→喂假 GCShopList→截图商店窗(spk 背景/货架标签/格子布局)。
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1100, height: 1080 } });
const errs = [];
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await p.goto("http://127.0.0.1:8095/public/index.html");
await p.waitForTimeout(1500);
await p.waitForFunction(() => window.__dbg && window.__dbg.openShop, null, { timeout: 8000 }).catch(() => console.log("钩子超时"));
// 三货架各放几件假商品(index 0..19), itemClass/itemType 取常见值, 看图标命中
const items = [];
for (let i = 0; i < 12; i++) items.push({ index: i, itemClass: 11, itemType: i + 1, silver: (i + 1) * 100, enchant: i % 4 });
const ret = await p.evaluate(async (items) => {
  try { await window.__dbg.openShop({ objectID: 0xABCD, rackType: 1, items }); return "ok"; }
  catch (e) { return "THROW " + e.message; }
}, items);
console.log("openShop 返回:", ret);
// 登录屏 = #uiScreen, 隐藏它并显示 #game 以单独目视商店渲染
await p.evaluate(() => { const u = document.getElementById("uiScreen"); if (u) u.style.display = "none"; const g = document.getElementById("game"); if (g) g.style.display = "block"; });
await p.waitForTimeout(1500);
const box = await p.evaluate(() => {
  const cs = [...document.querySelectorAll("canvas")].map((c) => { const r = c.getBoundingClientRect(); return { z: c.style.zIndex, disp: c.style.display, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; });
  return cs;
});
console.log("全部 canvas:", JSON.stringify(box));
console.log("错误:", errs.length ? errs.slice(0, 5) : "无");
await p.screenshot({ path: "out_shop.png" });
await b.close();
