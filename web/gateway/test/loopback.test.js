// 网关回环集成测试
//
// 拓扑:  WS客户端 ──WS──> 网关 ──TCP──> mock TCP服务端
// 验证:
//   1. C→S: WS 客户端发的封包，mock 服务端原样收到(字节保真)
//   2. S→C: mock 服务端把多个包"粘"成一次写出 + 拆成碎片写出，
//           网关都能正确分帧，WS 客户端按包收到(粘包/拆包处理)
//
// 不依赖真实服务端，纯本地自检。

import net from "node:net";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { buildPacket, PacketFramer } from "../src/framing.js";
import { setTimeout as sleep } from "node:timers/promises";

const GW_PORT = 18080;
const MOCK_PORT = 19999;

let failures = 0;
function check(cond, msg) {
  console.log(`${cond ? "✅" : "❌"} ${msg}`);
  if (!cond) failures++;
}
function eq(a, b) {
  return Buffer.compare(a, b) === 0;
}

// ---- mock TCP 服务端 ----
const received = []; // 收到的完整封包(分帧后)
let mockConn = null;
const mockServer = net.createServer((sock) => {
  mockConn = sock;
  const framer = new PacketFramer((pkt) => received.push(pkt));
  sock.on("data", (c) => framer.push(c));
});

async function main() {
  await new Promise((r) => mockServer.listen(MOCK_PORT, r));

  // ---- 启动网关子进程，指向 mock ----
  const gw = spawn("node", ["src/gateway.js"], {
    env: {
      ...process.env,
      GW_PORT: String(GW_PORT),
      GW_TARGET_HOST: "127.0.0.1",
      GW_TARGET_PORT: String(MOCK_PORT),
      GW_LOG: "0",
    },
    stdio: "inherit",
  });
  await sleep(600); // 等网关起来

  // ---- WS 客户端连入网关 ----
  const wsRecv = []; // WS 客户端收到的消息(每条应为一个完整包)
  const ws = new WebSocket(`ws://127.0.0.1:${GW_PORT}/?host=127.0.0.1&port=${MOCK_PORT}`);
  ws.binaryType = "nodebuffer";
  ws.on("message", (m) => wsRecv.push(Buffer.isBuffer(m) ? m : Buffer.from(m)));
  await new Promise((r, j) => {
    ws.on("open", r);
    ws.on("error", j);
  });
  await sleep(200); // 等网关连上 mock

  // ===== 用例1: C→S 字节保真 =====
  const p1 = buildPacket(101, Buffer.from("hello-login", "utf8"), 0); // 如 CL_LOGIN
  const p2 = buildPacket(7, Buffer.from([0xde, 0xad, 0xbe, 0xef, 0x05]), 1);
  ws.send(p1);
  ws.send(p2);
  await sleep(300);
  check(received.length === 2, `C→S: mock 收到 2 个包(实际 ${received.length})`);
  check(received[0] && eq(received[0], p1), "C→S: 包1 字节完全一致");
  check(received[1] && eq(received[1], p2), "C→S: 包2 字节完全一致");

  // ===== 用例2: S→C 粘包(多个包一次写出) =====
  const s1 = buildPacket(201, Buffer.from("AAAA"), 0);
  const s2 = buildPacket(202, Buffer.from("BBBBBB"), 1);
  const s3 = buildPacket(203, Buffer.alloc(0), 2); // 空包体
  mockConn.write(Buffer.concat([s1, s2, s3])); // 粘成一坨
  await sleep(300);
  check(wsRecv.length === 3, `S→C 粘包: WS 收到 3 个独立包(实际 ${wsRecv.length})`);
  check(wsRecv[0] && eq(wsRecv[0], s1), "S→C: 粘包拆出 包1 正确");
  check(wsRecv[1] && eq(wsRecv[1], s2), "S→C: 粘包拆出 包2 正确");
  check(wsRecv[2] && eq(wsRecv[2], s3), "S→C: 粘包拆出 空体包 正确");

  // ===== 用例3: S→C 拆包(一个包分多次碎片写出) =====
  const big = buildPacket(250, Buffer.from("X".repeat(1000)), 9);
  for (let i = 0; i < big.length; i += 7) {
    mockConn.write(big.subarray(i, Math.min(i + 7, big.length)));
  }
  await sleep(400);
  check(wsRecv.length === 4, `S→C 拆包: 碎片重组为 1 个包(累计 ${wsRecv.length})`);
  check(wsRecv[3] && eq(wsRecv[3], big), "S→C: 碎片重组后字节一致(1007B)");

  // ---- 收尾 ----
  ws.close();
  gw.kill();
  mockServer.close();
  await sleep(100);

  console.log(`\n结果: ${failures === 0 ? "全部通过 ✅" : failures + " 项失败 ❌"}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("测试异常:", e);
  process.exit(1);
});
