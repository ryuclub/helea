// 入世 → 探测 → 暴力定 in-world 加密码 → 证明服务器权威移动(GC_MOVE_OK)
import WebSocket from "ws";
import * as P from "../../client/src/proto.js";
const { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, encCGMove, decode, Framer } = P;
const PC = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer";
  ws.inbox = []; ws.rawById = {};
  const fr = new Framer((p) => { const d = decode(p); ws.inbox.push(d); ws.rawById[d.id] = p; });
  ws.on("message", (d) => fr.push(new Uint8Array(d))); return ws;
}
const wf = async (ws, n, ms = 2500) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(25); } return null; };

async function enter() {
  const l = conn(9999); await new Promise((r, j) => { l.on("open", r); l.on("error", j); });
  l.send(encCLLogin({ id: "111111", password: "111111" })); if (!await wf(l, "LC_LOGIN_OK")) { l.close(); return null; }
  l.send(encCLGetPCList()); await wf(l, "LC_PC_LIST");
  l.send(encCLSelectPC({ pcName: PC, pcType: 0 })); const rc = await wf(l, "LC_RECONNECT"); l.close();
  if (!rc) return null; await sleep(300);
  const g = conn(rc.gameServerPort || 9998); await new Promise((r, j) => { g.on("open", r); g.on("error", j); });
  g.send(encCGConnect({ key: rc.key, pcName: PC, pcType: 0 }));
  if (!await wf(g, "GC_UPDATE_INFO")) { g.close(); return null; }
  g.send(P.encCGReady()); // 转 GPS_NORMAL, 解锁移动
  await sleep(400);
  return g;
}

// 用 code 解 GC_MOVE_ERROR 的 2 字节原始 body → 坐标
function decErr(raw, code) {
  const b = Buffer.from(raw); const r0 = b[7], r1 = b[8];
  if (code === 0) return { x: r0, y: r1 };
  const m = code % 2; const X = m === 0 ? r0 : r1, Y = m === 0 ? r1 : r0;
  return { x: X ^ code, y: Y ^ code };
}

let g = null;
for (let i = 0; i < 6 && !g; i++) { g = await enter(); if (!g) await sleep(1000); }
if (!g) { console.log("❌ 入世失败"); process.exit(1); }
console.log("✅ 已入世");

// 探测: 发一个移动(任意 code), 服务端必回 GC_MOVE_ERROR(真实坐标, 用服务端码编码)
P.setEncryptCode(0); g.inbox.length = 0; delete g.rawById[P.PACKET.GC_MOVE_ERROR];
g.send(encCGMove({ dir: 0, x: 200, y: 200 }));
await wf(g, "GC_MOVE_ERROR", 1500);
const errRaw = g.rawById[P.PACKET.GC_MOVE_ERROR];
if (!errRaw) { console.log("❌ 探测无 GC_MOVE_ERROR"); g.close(); process.exit(1); }
console.log("探测拿到 GC_MOVE_ERROR 原始字节:", Buffer.from(errRaw).subarray(7, 9).toString("hex"));

// 候选码: 先算出的 28, 再全量 0..255
const calc = P.calcEncryptCode(12, 0);
const cands = [calc, ...Array.from({ length: 256 }, (_, i) => i)];
let found = null;
for (const code of cands) {
  const pos = decErr(errRaw, code);
  if (pos.x > 250 || pos.y > 250) continue; // 不合理坐标跳过
  P.setEncryptCode(code);
  g.inbox.length = 0; delete g.rawById[P.PACKET.GC_MOVE_OK];
  g.send(encCGMove({ dir: 2, x: pos.x + 1, y: pos.y })); // 东移一格
  await sleep(60);
  const ok = g.inbox.find((p) => p.name === "GC_MOVE_OK");
  if (ok && ok.x === pos.x + 1 && ok.y === pos.y) { found = { code, pos, ok }; break; }
}
g.close();
if (found) {
  console.log(`\n✅ in-world 加密码 = ${found.code} (算出值=${calc})`);
  console.log(`   起始坐标 (${found.pos.x},${found.pos.y}) → 东移 → GC_MOVE_OK (${found.ok.x},${found.ok.y})`);
  console.log("✅ 服务器权威移动验证成功 —— in-world 玩法链路打通!");
  process.exit(0);
} else { console.log("\n❌ 未找到有效码/移动未确认"); process.exit(1); }
