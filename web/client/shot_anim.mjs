import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, args: ["--use-gl=swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1100, height: 680 } });
const errs = []; p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", e => errs.push("PAGEERR " + e.message));
await p.goto("http://127.0.0.1:8095/public/index.html");
await p.waitForTimeout(1500);
await p.click("#go");
await p.waitForFunction(() => window.__player, null, { timeout: 15000 }).catch(() => console.log("超时"));
await p.waitForTimeout(700);

const snap = () => p.evaluate(() => {
  const e = window.__player;
  return { col: e.col, row: e.row, dir: e.dir, sx: +e.plane.scaling.x.toFixed(0), sy: +e.plane.scaling.y.toFixed(0) };
});

// 各方向按一下, 校验朝向枚举(LEFT0 LEFTDOWN1 DOWN2 RIGHTDOWN3 RIGHT4 RIGHTUP5 UP6 LEFTUP7)
const checks = [["ArrowRight", 4, "RIGHT"], ["ArrowDown", 2, "DOWN"], ["ArrowLeft", 0, "LEFT"], ["ArrowUp", 6, "UP"]];
for (const [k, expect, name] of checks) {
  await p.keyboard.down(k); await p.waitForTimeout(140);
  const s = await snap(); await p.keyboard.up(k); await p.waitForTimeout(300);
  console.log(`${k}: dir=${s.dir} 期望=${expect}(${name}) ${s.dir === expect ? "✓" : "✗"} 帧尺寸=${s.sx}x${s.sy}`);
}

// 行走动画: 按住下行 0.6s, 连续采样帧尺寸看是否变化(动画在跑)
await p.keyboard.down("ArrowDown");
const sizes = new Set();
for (let i = 0; i < 8; i++) { await p.waitForTimeout(60); const s = await snap(); sizes.add(s.sx + "x" + s.sy); }
await p.screenshot({ path: "out/p4-anim-down.png" });
await p.keyboard.up("ArrowDown"); await p.waitForTimeout(300);
console.log("行走中出现的帧尺寸种类:", [...sizes].join(" , "), "(>1 说明动画在切帧)");

// 鼠标寻路: 点远处, 看是否生成路径并移动
const before = await snap();
await p.mouse.click(300, 220);
await p.waitForTimeout(300);
const pathLen = await p.evaluate(() => window.__renderer?.path?.length ?? null);
await p.waitForTimeout(2500);
const after = await snap();
console.log("寻路: 路径长度=", pathLen, " 起=", JSON.stringify(before), " 终=", JSON.stringify(after));
console.log("错误:", errs.length ? errs.slice(0, 5) : "无");
await b.close();
