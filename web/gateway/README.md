# 天之炼狱 WebSocket↔TCP 网关

浏览器无法直连 TCP，本网关把浏览器的 WebSocket 桥接到 opendarkeden 服务端的 TCP 端口。

```
浏览器 ──WebSocket(二进制)──> 网关 ──TCP──> loginserver(9999) / gameserver(9998)
       <─────────────────────      <────────
```

## 设计要点

- **只做字节管道 + 分帧**，不做加解密（加密是 codec 层的事，网关透传）。
- 按 7 字节包头分帧：`u16 PacketID | u32 PacketSize | u8 Sequence`（小端），整包 = 7 + PacketSize。
  正确处理 TCP 粘包/拆包，每个完整封包 = 一条 WS 二进制消息。
- 后端目标由 WS URL 参数指定：`ws://host:8080/?host=127.0.0.1&port=9998`（默认 loginserver 9999）。

## 运行

```bash
npm install
npm start          # 启动网关，默认 :8080 → 127.0.0.1:9999
# 环境变量: GW_PORT / GW_TARGET_HOST / GW_TARGET_PORT / GW_LOG(0/1/2)
```

## 测试

```bash
npm test           # 回环集成测试：字节保真 + 粘包 + 拆包，9 项全过
```

## 已验证(对真实 loginserver 端到端)

WS 客户端经网关发 `CL_LOGIN(id=153)` → 收到 `LC_LOGIN_ERROR(id=444)`（账号不存在，符合预期）。
证明网关桥接、分帧、包 ID 映射全链路正确。`CL_LOGIN` 服务端 read() 不加密。

## 关键包 ID(从 src/Core/Packet.h 枚举推算)

| 包 | id |
|---|---|
| CL_LOGIN | 153 |
| CL_VERSION_CHECK | 162 |
| LC_LOGIN_ERROR | 444 |
| LC_LOGIN_OK | 445 |

## 文件

- `src/framing.js` —— 包头分帧器(PacketFramer) + 构造/解析工具
- `src/gateway.js` —— WS↔TCP 桥接主体
- `test/loopback.test.js` —— 回环集成测试
