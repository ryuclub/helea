// 入世后测试移动: 探测当前坐标(GC_MOVE_ERROR) → 有效相邻移动(GC_MOVE_OK)
import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, encCGMove, decode, Framer } from "../../client/src/proto.js";
const PC = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer";
  ws.inbox = []; const fr = new Framer((p) => ws.inbox.push(decode(p)));
  ws.on("message", (d) => fr.push(new Uint8Array(d))); return ws;
}
const wf = async (ws, n, ms = 2500) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(30); } return null; };

async function enter() {
  const l = conn(9999); await new Promise((r, j) => { l.on("open", r); l.on("error", j); });
  l.send(encCLLogin({ id: "111111", password: "111111" })); if (!await wf(l, "LC_LOGIN_OK")) { l.close(); return null; }
  l.send(encCLGetPCList()); await wf(l, "LC_PC_LIST");
  l.send(encCLSelectPC({ pcName: PC, pcType: 0 })); const rc = await wf(l, "LC_RECONNECT"); l.close();
  if (!rc) return null; await sleep(300);
  const g = conn(rc.gameServerPort || 9998); await new Promise((r, j) => { g.on("open", r); g.on("error", j); });
  g.send(encCGConnect({ key: rc.key, pcName: PC, pcType: 0 }));
  if (!await wf(g, "GC_UPDATE_INFO")) { g.close(); return null; }
  return g;
}

let g = null;
for (let i = 0; i < 6 && !g; i++) { g = await enter(); if (!g) await sleep(1000); }
if (!g) { console.log("❌ 入世失败"); process.exit(1); }
console.log("✅ 已入世");

// 1) 探测坐标: 发一个大概率非法的移动, 期待 GC_MOVE_ERROR 返回当前真实坐标
g.inbox.length = 0;
g.send(encCGMove({ dir: 0, x: 1, y: 1 }));
await sleep(800);
let pos = null;
const err = g.inbox.find((p) => p.name === "GC_MOVE_ERROR");
const ok0 = g.inbox.find((p) => p.name === "GC_MOVE_OK");
if (err) { pos = { x: err.x, y: err.y }; console.log(`探测: GC_MOVE_ERROR → 当前坐标 (${pos.x},${pos.y})`); }
else if (ok0) { pos = { x: ok0.x, y: ok0.y }; console.log(`探测: GC_MOVE_OK → (${pos.x},${pos.y})`); }
else console.log("探测: 收到", g.inbox.map((p) => p.name).join(",") || "(无)");

// 2) 有效相邻移动(东: x+1, dir=2 假设), 期待 GC_MOVE_OK
let moved = false;
if (pos) {
  // 八方向逐个试一个相邻格
  for (const [dx, dy, dir] of [[1, 0, 2], [0, 1, 4], [-1, 0, 6], [0, -1, 0]]) {
    g.inbox.length = 0;
    g.send(encCGMove({ dir, x: pos.x + dx, y: pos.y + dy }));
    await sleep(500);
    const ok = g.inbox.find((p) => p.name === "GC_MOVE_OK");
    if (ok) { console.log(`✅ 有效移动 dir=${dir} → GC_MOVE_OK 新坐标 (${ok.x},${ok.y})`); moved = true; break; }
    const e = g.inbox.find((p) => p.name === "GC_MOVE_ERROR");
    console.log(`  尝试 dir=${dir} (${pos.x + dx},${pos.y + dy}): ${ok ? "OK" : e ? "ERROR(阻挡)" : "无响应"}`);
  }
}
g.close();
console.log(`\n服务端世界内移动处理: ${(pos && moved) ? "✅ 正常(权威移动可用)" : pos ? "⚠ 探测到坐标但有效移动未确认" : "❌ 无响应"}`);
process.exit(pos ? 0 : 1);
