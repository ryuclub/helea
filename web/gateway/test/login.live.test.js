// 协议层对真实服务端的端到端验证
// 用 encodePacket/decodePacket 高层 API 走完 登录 一来一回。
// 前置：gameserver 容器在跑(loginserver 9999 已映射到宿主机)，网关已启动在 :8080。

import { WebSocket } from "ws";
import { encodePacket, decodePacket } from "../src/protocol.js";
import { setTimeout as sleep } from "node:timers/promises";

const GW = process.env.GW_URL || "ws://127.0.0.1:8080/?host=127.0.0.1&port=9999";

async function login(id, password) {
  const ws = new WebSocket(GW);
  ws.binaryType = "nodebuffer";
  const got = [];
  ws.on("message", (m) => got.push(decodePacket(Buffer.isBuffer(m) ? m : Buffer.from(m))));
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  ws.send(encodePacket("CL_LOGIN", { id, password, mac: Buffer.alloc(6), loginMode: 0 }));
  await sleep(800);
  ws.close();
  return got;
}

let fail = 0;
const check = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fail++; };

async function main() {
  // 用例1: 有效账号 -> LC_LOGIN_OK
  const ok = await login("111111", "111111");
  check(ok.length >= 1, `有效账号收到响应(${ok.length})`);
  check(ok[0]?.name === "LC_LOGIN_OK", `响应为 LC_LOGIN_OK(实际 ${ok[0]?.name})`);
  if (ok[0]?.name === "LC_LOGIN_OK")
    console.log(`   解码字段: isAdult=${ok[0].isAdult} bFamily=${ok[0].bFamily} stat=${ok[0].stat} lastDays=${ok[0].lastDays}`);

  // 用例2: 无效账号 -> LC_LOGIN_ERROR
  const err = await login("nosuchacct", "wrongpw");
  check(err[0]?.name === "LC_LOGIN_ERROR", `无效账号为 LC_LOGIN_ERROR(实际 ${err[0]?.name})`);
  if (err[0]?.name === "LC_LOGIN_ERROR") console.log(`   错误码 errorID=${err[0].errorID}`);

  console.log(`\n结果: ${fail === 0 ? "全部通过 ✅" : fail + " 项失败 ❌"}`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error("异常:", e); process.exit(1); });
