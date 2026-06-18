// 喝药端到端: 进游戏→读入世背包→找药水(itemClass=1)→发 CGUsePotionFromInventory→观察 HP/MP 回包。
// 验证 P0 喝药链路(proto 编码 139 + SHUFFLE_3 + 字段)是否被服务端正确接受。
import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, encCGReady, encCGUsePotionFromInventory, resetGameSeq, setEncryptCode, calcEncryptCode, decode, Framer } from "../../client/src/proto.js";
const PC = Uint8Array.from(Buffer.from("newman", "ascii"));  // slayer, slot 2
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) { const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer"; ws.inbox = []; const fr = new Framer((p) => ws.inbox.push(decode(p))); ws.on("message", (d) => fr.push(new Uint8Array(d))); return ws; }
const wf = async (ws, n, ms = 2500) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(30); } return null; };

const l = conn(9999); await new Promise((r, j) => { l.on("open", r); l.on("error", j); });
l.send(encCLLogin({ id: "111111", password: "111111" })); await wf(l, "LC_LOGIN_OK");
l.send(encCLGetPCList()); await wf(l, "LC_PC_LIST");
l.send(encCLSelectPC({ pcName: PC, pcType: 0 })); const rc = await wf(l, "LC_RECONNECT"); l.close(); await sleep(300);
resetGameSeq();
const g = conn(rc.gameServerPort || 9998); await new Promise((r, j) => { g.on("open", r); g.on("error", j); });
g.send(encCGConnect({ key: rc.key, pcName: PC, pcType: 0 }));
const upd = await wf(g, "GC_UPDATE_INFO"); g.send(encCGReady()); await sleep(1000);

console.log("入世: zone", upd.zoneID, "坐标", upd.zoneX, upd.zoneY, "HP", upd.curHP, "/", upd.maxHP, "MP", upd.curMP, "/", upd.maxMP);
const inv = upd.inventory || [];
console.log("背包", inv.length, "件:", inv.map((it) => `[${it.itemClass}-${it.itemType}@${it.invenX},${it.invenY}#${it.objectID}]`).join(" "));
const potion = inv.find((it) => it.itemClass === 1);
if (!potion) { console.log("⚠ 背包无药水(itemClass=1), 无法验证回血。链路编码已就绪, 需先给角色一瓶药。"); try { g.close(); } catch {} process.exit(0); }

setEncryptCode(calcEncryptCode(upd.zoneID, 0));
console.log(`找到药水 #${potion.objectID} @(${potion.invenX},${potion.invenY}), zone=${upd.zoneID} 喝它:`);
g.inbox.length = 0;
g.send(encCGUsePotionFromInventory({ objectID: potion.objectID, invenX: potion.invenX, invenY: potion.invenY }));
await sleep(1500);
const got = g.inbox.map((p) => p.name);
console.log("喝药后收到包:", got.join(", ") || "(无)");
const mod = g.inbox.find((p) => p.name === "GC_MODIFY_INFORMATION");
if (mod) console.log("✓ GC_MODIFY_INFORMATION:", JSON.stringify(mod).slice(0, 200));
const rec = g.inbox.find((p) => /RECOVERY/.test(p.name || ""));
if (rec) console.log("✓ 回血/蓝包:", rec.name);
try { g.close(); } catch {} process.exit(0);
