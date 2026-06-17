import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
page.on("pageerror", (e) => errs.push("PAGEERR " + e.message));
await page.goto("http://127.0.0.1:8095/public/index.html");
await page.waitForTimeout(1500);
await page.click("#go");
await page.waitForFunction(() => window.__player, null, { timeout: 15000 }).catch(() => console.log("超时:未进入游戏"));
await page.waitForTimeout(700);
const pos = () => page.evaluate(() => ({ col: window.__player?.col, row: window.__player?.row, stepping: window.__player?.stepping, dir: window.__player?.dir }));

console.log("起点:", JSON.stringify(await pos()));
// 1) 按住方向键连续走 1.4s(平滑插值)
await page.keyboard.down("ArrowRight");
await page.waitForTimeout(700);
await page.screenshot({ path: "out/p4-walk-mid.png" }); // 走动中(应能抓到行走帧)
await page.waitForTimeout(700);
await page.keyboard.up("ArrowRight");
await page.waitForTimeout(400);
console.log("按住→走后:", JSON.stringify(await pos()));

// 2) 鼠标点击远处地面 → 走过去
const goal0 = await pos();
await page.mouse.click(250, 200); // 画面左上方地面
await page.waitForTimeout(2200);
const goalAfter = await pos();
console.log("点击目标后:", JSON.stringify(goalAfter), " (goal:", JSON.stringify(await page.evaluate(() => window.__renderer?.goal)), ")");
await page.screenshot({ path: "out/p4-walk-end.png" });

console.log("控制台错误:", errs.length ? errs.slice(0, 5) : "无");
await browser.close();
