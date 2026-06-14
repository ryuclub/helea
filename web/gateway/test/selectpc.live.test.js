// 登录后选角链路：CL_LOGIN→LC_LOGIN_OK→CL_GET_PC_LIST→LC_PC_LIST
//                  →CL_SELECT_PC→LC_RECONNECT(取 gameserver 地址)
// 前置：loginserver 9999、网关 :8080。账号 111111 自带 Slayer 角色。

import { WebSocket } from "ws";
import { encodePacket, decodePacket } from "../src/protocol.js";
import { setTimeout as sleep } from "node:timers/promises";

const GW = "ws://127.0.0.1:8080/?host=127.0.0.1&port=9999";
// 账号111111 Slayer SLOT1 角色名(DB 原始字节)
const PC_NAME = Buffer.from("B2BBD4D9D1DACACE", "hex");
const PC_TYPE = 0; // PC_SLAYER

let fail = 0;
const check = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

async function main() {
  const ws = new WebSocket(GW);
  ws.binaryType = "nodebuffer";
  const inbox = [];
  ws.on("message", (m) => inbox.push(decodePacket(Buffer.isBuffer(m) ? m : Buffer.from(m))));
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });

  const wait = async (name, ms = 800) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const p = inbox.find((x) => x.name === name);
      if (p) return p;
      await sleep(30);
    }
    return null;
  };

  // 1. 登录
  ws.send(encodePacket("CL_LOGIN", { id: "111111", password: "111111", mac: Buffer.alloc(6), loginMode: 0 }));
  const ok = await wait("LC_LOGIN_OK");
  check(!!ok, "1) LC_LOGIN_OK");

  // 2. 请求角色列表
  ws.send(encodePacket("CL_GET_PC_LIST", {}));
  const list = await wait("LC_PC_LIST");
  check(!!list, `2) LC_PC_LIST(size=${list?.size})`);

  // 3. 选角
  ws.send(encodePacket("CL_SELECT_PC", { pcName: PC_NAME, pcType: PC_TYPE }));
  const rc = await wait("LC_RECONNECT", 1500);
  const err = inbox.find((x) => x.name === "LC_SELECT_PC_ERROR");
  if (rc) {
    check(true, "3) LC_RECONNECT ✅");
    console.log(`   gameserver = ${rc.gameServerIP}:${rc.gameServerPort}  key=${rc.key}`);
  } else {
    check(false, `3) 未收到 LC_RECONNECT(收到: ${inbox.map((x) => x.name).join(",")})`);
    if (err) console.log("   收到 LC_SELECT_PC_ERROR, raw:", err._raw?.toString("hex"));
  }

  ws.close();
  console.log(`\n结果: ${fail === 0 ? "全部通过 ✅" : fail + " 项失败 ❌"}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
