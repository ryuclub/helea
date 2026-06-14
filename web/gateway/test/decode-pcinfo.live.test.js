// 入世后捕获 GC_UPDATE_INFO 原始字节，解码 PCSlayerInfo 头部(真实服务端角色数据)。
// 字段(GCUpdateInfo: pcType 后接 PCInfo): u8 szName, name, u8 slot, i32 alignment,
//   u16 STR,DEX,INT, u8 rank, u32 STRExp,DEXExp,INTExp, u16 HPc,HPm, u16 MPc,MPm, u32 Fame
import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, decode, Framer, PACKET } from "../../client/src/proto.js";

const PC_NAME = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer";
  ws.inbox = []; ws.raw = {};
  const fr = new Framer((p) => { const d = decode(p); ws.inbox.push(d); ws.raw[d.name] = p; });
  ws.on("message", (e) => fr.push(new Uint8Array(e.data))); return ws;
}
const waitFor = async (ws, n, ms = 1500) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(30); } return null; };

const login = conn(9999);
await new Promise((r, j) => { login.on("open", r); login.on("error", j); });
login.send(encCLLogin({ id: "111111", password: "111111" })); await waitFor(login, "LC_LOGIN_OK");
login.send(encCLGetPCList()); await waitFor(login, "LC_PC_LIST");
login.send(encCLSelectPC({ pcName: PC_NAME, pcType: 0 }));
const rc = await waitFor(login, "LC_RECONNECT"); login.close();
await sleep(300);

const game = conn(rc.gameServerPort || 9998);
await new Promise((r, j) => { game.on("open", r); game.on("error", j); });
game.send(encCGConnect({ key: rc.key, pcName: PC_NAME, pcType: 0 }));
await waitFor(game, "GC_UPDATE_INFO", 2500);
const raw = game.raw["GC_UPDATE_INFO"];
game.close();
if (!raw) { console.log("❌ 无 GC_UPDATE_INFO"); process.exit(1); }

const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
let p = 7; // 跳包头
const pcType = dv.getUint8(p); p += 1;
const szName = dv.getUint8(p); p += 1;
let nameHex = ""; for (let i = 0; i < szName; i++) nameHex += dv.getUint8(p + i).toString(16).padStart(2, "0"); p += szName;
const slot = dv.getUint8(p); p += 1;
const alignment = dv.getInt32(p, true); p += 4;
const STR = dv.getUint16(p, true); p += 2;
const DEX = dv.getUint16(p, true); p += 2;
const INT = dv.getUint16(p, true); p += 2;
const rank = dv.getUint8(p); p += 1;
const STRExp = dv.getUint32(p, true); p += 4;
const DEXExp = dv.getUint32(p, true); p += 4;
const INTExp = dv.getUint32(p, true); p += 4;
const HPc = dv.getUint16(p, true); p += 2; const HPm = dv.getUint16(p, true); p += 2;
const MPc = dv.getUint16(p, true); p += 2; const MPm = dv.getUint16(p, true); p += 2;
const Fame = dv.getUint32(p, true); p += 4;

console.log("pcType:", pcType, "(0=Slayer)");
console.log("name(hex):", nameHex, szName === 8 && nameHex === "b2bbd4d9d1dacace" ? "✅ 与选角名一致(锚定成功)" : "⚠ 不符");
console.log(`slot=${slot} alignment=${alignment} rank=${rank}`);
console.log(`STR=${STR} DEX=${DEX} INT=${INT}`);
console.log(`HP=${HPc}/${HPm}  MP=${MPc}/${MPm}  Fame=${Fame}`);
const sane = szName === 8 && nameHex === "b2bbd4d9d1dacace" && STR < 1000 && HPm > 0 && HPm < 50000;
console.log(sane ? "\n✅ PCInfo 头部解码正确(字段合理)" : "\n⚠ 字段异常, 类型/偏移需复核");
process.exit(sane ? 0 : 1);
