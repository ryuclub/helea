// 用浏览器原生 proto.js(DataView) 经网关 WS 验证登录→选角(与浏览器同路径)
import WebSocket from "ws";
import {
  encCLLogin, encCLGetPCList, encCLSelectPC, decode, Framer,
} from "../../client/src/proto.js";

const PC_NAME = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));

const ws = new WebSocket("ws://127.0.0.1:8080/?host=127.0.0.1&port=9999");
ws.binaryType = "arraybuffer";
const inbox = [];
const framer = new Framer((p) => inbox.push(decode(p)));
ws.on("message", (d) => framer.push(new Uint8Array(d)));
const wait = async (name, ms = 1200) => {
  const t = Date.now();
  while (Date.now() - t < ms) { const x = inbox.find((p) => p.name === name); if (x) return x; await new Promise((r) => setTimeout(r, 30)); }
  return null;
};

await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
ws.send(encCLLogin({ id: "111111", password: "111111" }));
const ok = await wait("LC_LOGIN_OK");
console.log("LC_LOGIN_OK:", ok ? `✅ lastDays=${ok.lastDays}` : "❌");
ws.send(encCLGetPCList());
console.log("LC_PC_LIST:", (await wait("LC_PC_LIST")) ? "✅" : "❌");
ws.send(encCLSelectPC({ pcName: PC_NAME, pcType: 0 }));
const rc = await wait("LC_RECONNECT");
console.log("LC_RECONNECT:", rc ? `✅ ${rc.gameServerIP}:${rc.gameServerPort} key=${rc.key}` : "❌");
ws.close();
process.exit(rc && ok ? 0 : 1);
