// 快捷栏两包编码端到端验证(无需腰带): 进游戏→发 CG_ADD_MOUSE_TO_QUICKSLOT(9)/CG_USE_POTION_FROM_QUICKSLOT(140)。
// 两包明文(无加密)。无腰带/无光标 server 会 GCCannotAdd/GCCannotUse 拒绝, 但 game.log Receive 明文验证字段解析正确。
import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, encCGReady, encCGAddMouseToQuickSlot, encCGUsePotionFromQuickSlot, decode, Framer } from "../../client/src/proto.js";
const PC = Uint8Array.from(Buffer.from("newman", "ascii"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) { const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer"; ws.inbox = []; const fr = new Framer((p) => ws.inbox.push(decode(p))); ws.on("message", (d) => fr.push(new Uint8Array(d))); return ws; }
const wf = async (ws, n, ms = 2500) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(30); } return null; };

const l = conn(9999); await new Promise((r, j) => { l.on("open", r); l.on("error", j); });
l.send(encCLLogin({ id: "111111", password: "111111" })); await wf(l, "LC_LOGIN_OK");
l.send(encCLGetPCList()); await wf(l, "LC_PC_LIST");
l.send(encCLSelectPC({ pcName: PC, pcType: 0 })); const rc = await wf(l, "LC_RECONNECT"); l.close(); await sleep(300);
const g = conn(rc.gameServerPort || 9998); await new Promise((r, j) => { g.on("open", r); g.on("error", j); });
g.send(encCGConnect({ key: rc.key, pcName: PC, pcType: 0 })); await wf(g, "GC_UPDATE_INFO"); g.send(encCGReady()); await sleep(1000);

g.inbox.length = 0;
g.send(encCGAddMouseToQuickSlot({ objectID: 12345, slotID: 2 }));      // 绑定(无光标→预期GCCannotAdd, 但Receive验证字段)
await sleep(600);
g.send(encCGUsePotionFromQuickSlot({ objectID: 23456, slotID: 5 }));   // 喝药(无腰带→预期GCCannotUse)
await sleep(1000);
console.log("收到包:", g.inbox.map((p) => p.name).join(", ") || "(无)");
try { g.close(); } catch {} process.exit(0);
