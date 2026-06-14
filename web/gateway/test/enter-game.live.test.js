// 全流程: 登录(loginserver) → 选角 → LC_RECONNECT → 连 gameserver → CG_CONNECT → 期待 GC_UPDATE_INFO
import WebSocket from "ws";
import {
  encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, decode, Framer, NAME,
} from "../../client/src/proto.js";

const PC_NAME = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`);
  ws.binaryType = "arraybuffer";
  const inbox = [];
  const framer = new Framer((p) => inbox.push(decode(p)));
  ws.on("message", (d) => framer.push(new Uint8Array(d)));
  ws.inbox = inbox;
  return ws;
}
async function waitFor(ws, name, ms = 1500) {
  const t = Date.now();
  while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === name); if (x) return x; await sleep(30); }
  return null;
}
async function waitAny(ws, ms = 2000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (ws.inbox.length) return ws.inbox; await sleep(30); }
  return ws.inbox;
}

// 1. loginserver: 登录 → 选角 → LC_RECONNECT
const login = connect(9999);
await new Promise((r, j) => { login.on("open", r); login.on("error", j); });
login.send(encCLLogin({ id: "111111", password: "111111" }));
console.log("LC_LOGIN_OK:", !!(await waitFor(login, "LC_LOGIN_OK")));
login.send(encCLGetPCList());
await waitFor(login, "LC_PC_LIST");
login.send(encCLSelectPC({ pcName: PC_NAME, pcType: 0 }));
const rc = await waitFor(login, "LC_RECONNECT");
console.log("LC_RECONNECT:", rc ? `${rc.gameServerIP}:${rc.gameServerPort} key=${rc.key}` : "❌");
login.close();
if (!rc) process.exit(1);

await sleep(300);

// 2. gameserver: CG_CONNECT(key) → 期待 GC_UPDATE_INFO
const game = connect(rc.gameServerPort || 9998);
await new Promise((r, j) => { game.on("open", r); game.on("error", j); });
game.send(encCGConnect({ key: rc.key, pcName: PC_NAME, pcType: 0 }));
await waitAny(game, 2500);
const names = game.inbox.map((p) => p.name);
const upd = game.inbox.find((p) => p.name === "GC_UPDATE_INFO");
const dc = game.inbox.find((p) => p.name === "GC_DISCONNECT");
console.log("gameserver 回包:", names.slice(0, 12).join(", ") || "(无)");
console.log(upd ? "✅ GC_UPDATE_INFO —— 已进入游戏世界!" : dc ? "❌ GC_DISCONNECT(被拒)" : "⚠ 未收到判定包");
game.close();
process.exit(upd ? 0 : 1);
