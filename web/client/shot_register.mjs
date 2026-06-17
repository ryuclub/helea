// 验证账号注册登录屏可见反馈: 填登录屏输入框→点 Register(NEW)按钮→截图看 toast。
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await p.goto("http://127.0.0.1:8095/public/index.html");
await p.waitForTimeout(1800);
// 等登录屏输入框就绪
await p.waitForSelector("#loginWrap input", { timeout: 8000 }).catch(() => console.log("登录屏超时"));
const uid = "reg" + String(Date.now()).slice(-6);
await p.fill("#loginWrap input[type=text]", uid);
await p.fill("#loginWrap input[type=password]", "test123");
// 点 Register(NEW) 按钮: 登录框逻辑坐标 BOX(289,153)+rel(118,123), 取按钮内一点(415,283) of 800x600
const cv = await p.$("#loginWrap canvas");
const r = await cv.boundingBox();
const clickX = r.x + 415 / 800 * r.width, clickY = r.y + 283 / 600 * r.height;
await p.mouse.click(clickX, clickY);
await p.waitForTimeout(1500);
const toast = await p.evaluate(() => { const t = document.querySelector("#loginWrap div"); return t ? { text: t.textContent, opacity: t.style.opacity, bg: t.style.background } : null; });
console.log("注册账号:", uid, "→ toast:", JSON.stringify(toast));
console.log("错误:", errs.length ? errs.slice(0, 4) : "无");
await p.screenshot({ path: "out_register.png" });
await b.close();
