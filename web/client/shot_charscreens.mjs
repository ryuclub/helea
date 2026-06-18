// 截图选角/建角界面用于量立绘与数字像素尺寸(为像素微调换算偏移)。
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1100, height: 850 } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await p.goto("http://127.0.0.1:8095/public/index.html");
await p.waitForTimeout(1800);
await p.waitForFunction(() => window.__dbg && window.__dbg.ccScreen && window.__dbg.ccScreen(), null, { timeout: 9000 }).catch(() => console.log("钩子超时"));

// 建角屏(自包含): 隐藏登录屏, show建角
await p.evaluate(() => { const l = window.__dbg; const ls = document.querySelector("#loginWrap"); if (ls) ls.style.display = "none"; l.ccScreen().show(0); });
await p.waitForTimeout(1500);
await p.screenshot({ path: "out_charcreate.png" });
console.log("建角屏已截图");

// 选角屏: 喂3个假角色(三族各一)
await p.evaluate(() => {
  const chars = [
    { slot: 0, race: "slayer", name: "slayerA", sex: 0, nameBytes: [1] },
    { slot: 1, race: "vampire", name: "vampB", sex: 0, nameBytes: [1] },
    { slot: 2, race: "ousters", name: "oustC", sex: 1, nameBytes: [1] },
  ];
  window.__dbg.ccScreen().hide();
  window.__dbg.showCharSelect(chars);
});
await p.waitForTimeout(1500);
await p.screenshot({ path: "out_charselect.png" });
console.log("选角屏已截图");
console.log("错误:", errs.length ? errs.slice(0, 4) : "无");
await b.close();
