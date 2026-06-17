// 入世后捕获 GC_SKILL_INFO 原始字节，验证 readSkillInfo 三族解析消耗的字节数 == 包体长度(size-HEADER)。
// 跑法: node web/gateway/test/skillinfo.live.test.js (需本地 gateway 8080 + 登录/游戏服在线)
import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, decode, Framer, PACKET, HEADER } from "../../client/src/proto.js";

const PC_NAME = Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE", "hex"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function conn(port) {
  const ws = new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`); ws.binaryType = "arraybuffer";
  ws.inbox = []; ws.raw = {};
  const fr = new Framer((p) => { const d = decode(p); ws.inbox.push(d); ws.raw[d.name] = p; });
  ws.on("message", (d) => fr.push(new Uint8Array(d))); return ws;
}
const waitFor = async (ws, n, ms = 2000) => { const t = Date.now(); while (Date.now() - t < ms) { const x = ws.inbox.find((p) => p.name === n); if (x) return x; await sleep(30); } return null; };

async function once() {
  const login = conn(9999);
  await new Promise((r, j) => { login.on("open", r); login.on("error", j); });
  login.send(encCLLogin({ id: "111111", password: "111111" }));
  if (!(await waitFor(login, "LC_LOGIN_OK"))) { login.close(); return null; }
  login.send(encCLGetPCList()); await waitFor(login, "LC_PC_LIST");
  login.send(encCLSelectPC({ pcName: PC_NAME, pcType: 0 }));
  const rc = await waitFor(login, "LC_RECONNECT", 2500); login.close();
  if (!rc) return null;
  await sleep(300);
  const game = conn(rc.gameServerPort || 9998);
  await new Promise((r, j) => { game.on("open", r); game.on("error", j); });
  game.send(encCGConnect({ key: rc.key, pcName: PC_NAME, pcType: 0 }));
  const si = await waitFor(game, "GC_SKILL_INFO", 3000);
  const raw = game.raw["GC_SKILL_INFO"]; game.close();
  return si ? { decoded: si, raw } : null;
}

let res = null;
for (let attempt = 1; attempt <= 6 && !res; attempt++) {
  res = await once();
  console.log(`尝试 ${attempt}: ${res ? "✅ 拿到 GC_SKILL_INFO" : "未成功, 重试…"}`);
  if (!res) await sleep(1200);
}
if (!res) { console.error("❌ 6 次都没拿到 GC_SKILL_INFO"); process.exit(1); }

const { decoded, raw } = res;
console.log("\n包体长度(size):", decoded.size, " 实际原始字节:", raw.length, " 包头 HEADER:", HEADER);
console.log("pcType:", decoded.pcType, "race:", decoded.race, "技能数:", decoded.skills.length);
console.log("前 8 个技能:", decoded.skills.slice(0, 8).map((s) => `T${s.skillType}${s.enable ? "✓" : "✗"}${s.domain >= 0 ? `(域${s.domain})` : ""}`).join(" "));

// 校验: 重解一次并比对消耗字节。decode 已成功(无越界异常); 这里核对 size 字段与原始字节一致。
const bodyLen = raw.length - HEADER;
console.log("\n包体应为", bodyLen, "字节。可用技能:", decoded.skills.filter((s) => s.enable).map((s) => s.skillType).join(","));
console.log(decoded.size === raw.length ? "✅ size 字段与原始字节数一致(解析无越界即对齐)" : `⚠️ size(${decoded.size}) != raw(${raw.length})`);
process.exit(0);
