// 天之炼狱(DarkEden) WebSocket <-> TCP 网关
//
// 浏览器  ──WebSocket(二进制)──>  本网关  ──TCP──>  opendarkeden 服务端
//        <─────────────────────         <────────
//
// 职责：
//   1. 接受浏览器 WS 连接，按 URL 参数连到指定服务端 host:port(默认 loginserver)
//   2. 双向转发，并按 7 字节包头分帧(处理 TCP 粘包/拆包)，每个完整封包=一条 WS 消息
//   3. 不做加解密——加密是 codec 层(浏览器端)的事，网关只透传字节
//
// 用法：
//   node src/gateway.js
//   浏览器: new WebSocket("ws://127.0.0.1:8080/?host=127.0.0.1&port=9999")
//
// 环境变量：
//   GW_PORT        网关监听端口          默认 8080
//   GW_TARGET_HOST 默认后端 host         默认 127.0.0.1
//   GW_TARGET_PORT 默认后端端口          默认 9999 (loginserver)
//   GW_LOG         日志级别 0/1/2        默认 1

import { WebSocketServer } from "ws";
import net from "node:net";
import { PacketFramer, readHeader, HEADER_SIZE } from "./framing.js";

const GW_PORT = Number(process.env.GW_PORT || 8080);
const DEF_HOST = process.env.GW_TARGET_HOST || "127.0.0.1";
const DEF_PORT = Number(process.env.GW_TARGET_PORT || 9999);
const LOG = Number(process.env.GW_LOG ?? 1);

let connSeq = 0;

function log(level, id, ...args) {
  if (LOG >= level) console.log(`[gw#${id}]`, ...args);
}

function resolveTarget(reqUrl) {
  // reqUrl 形如 /?host=127.0.0.1&port=9998
  let host = DEF_HOST;
  let port = DEF_PORT;
  try {
    const u = new URL(reqUrl, "http://x");
    if (u.searchParams.get("host")) host = u.searchParams.get("host");
    if (u.searchParams.get("port")) port = Number(u.searchParams.get("port"));
  } catch {
    /* 用默认值 */
  }
  return { host, port };
}

const wss = new WebSocketServer({ port: GW_PORT });

wss.on("listening", () => {
  console.log(
    `[gateway] WS 监听 ws://0.0.0.0:${GW_PORT}  默认后端 ${DEF_HOST}:${DEF_PORT}`,
  );
});

wss.on("connection", (ws, req) => {
  const id = ++connSeq;
  const { host, port } = resolveTarget(req.url);
  log(1, id, `WS 连入 ${req.socket.remoteAddress} → 后端 ${host}:${port}`);

  // 连接后端 TCP
  const tcp = net.connect({ host, port });
  let tcpReady = false;
  const preconnectQueue = []; // WS 在 TCP 就绪前发来的数据先缓存

  // ---- TCP -> WS (分帧：每个完整封包发一条二进制 WS 消息) ----
  const framer = new PacketFramer((packet, header) => {
    log(2, id, `S→C 包 id=${header.id} size=${header.size}`);
    if (ws.readyState === ws.OPEN) ws.send(packet);
  });

  tcp.on("connect", () => {
    tcpReady = true;
    log(1, id, `TCP 已连后端 ${host}:${port}`);
    for (const buf of preconnectQueue) tcp.write(buf);
    preconnectQueue.length = 0;
  });

  tcp.on("data", (chunk) => {
    try {
      framer.push(chunk);
    } catch (e) {
      log(1, id, "分帧错误(S→C):", e.message);
      ws.close();
      tcp.destroy();
    }
  });

  tcp.on("error", (e) => {
    log(1, id, "TCP 错误:", e.message);
    if (ws.readyState === ws.OPEN) ws.close();
  });

  tcp.on("close", () => {
    log(1, id, "TCP 关闭");
    if (ws.readyState === ws.OPEN) ws.close();
  });

  // ---- WS -> TCP (透传；记录包 id 便于调试) ----
  ws.on("message", (data, isBinary) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (LOG >= 2 && buf.length >= HEADER_SIZE) {
      const h = readHeader(buf);
      log(2, id, `C→S 包 id=${h.id} size=${h.size} (本帧 ${buf.length}B)`);
    }
    if (tcpReady) tcp.write(buf);
    else preconnectQueue.push(buf);
  });

  ws.on("close", () => {
    log(1, id, "WS 关闭");
    tcp.destroy();
  });

  ws.on("error", (e) => {
    log(1, id, "WS 错误:", e.message);
    tcp.destroy();
  });
});

wss.on("error", (e) => {
  console.error("[gateway] 服务器错误:", e.message);
  process.exit(1);
});
