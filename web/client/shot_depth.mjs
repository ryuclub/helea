import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1100, height: 680 } });
page.on("console", (m) => console.log("[browser]", m.text()));
await page.goto("http://127.0.0.1:8095/public/index.html");
await page.waitForTimeout(1500);
await page.click("#go");
// 等进入游戏(角色站入)
await page.waitForFunction(() => window.__player, null, { timeout: 15000 }).catch(() => console.log("超时:未进入游戏"));
await page.waitForTimeout(800);
const before = await page.evaluate(() => ({ col: window.__player?.col, row: window.__player?.row }));
// 向上走(北), 让角色靠近/穿到立柱后面验证遮挡
for (let i = 0; i < 8; i++) { await page.keyboard.press("ArrowUp"); await page.waitForTimeout(120); }
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({ col: window.__player?.col, row: window.__player?.row }));
console.log("移动前:", JSON.stringify(before), " 移动后:", JSON.stringify(after));
console.log("建筑网格数:", await page.evaluate(() => window.__renderer?._buildingMeshes?.length));
await page.screenshot({ path: "out/p4-depth.png" });
await browser.close();
