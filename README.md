# Helea

经典等距 2D 吸血鬼题材 MMORPG **《DarkEden》(天之炼狱)** 的开源 **Web(浏览器)** 重制。

> 名称取自游戏世界观中的核心区域 *Helea*。
> 浏览器端用 **Babylon.js** 渲染；通过 **WebSocket↔TCP 网关** 对接开源 **opendarkeden** 服务端。

---

## ⚠️ 版权与素材（公开前必读）

- 本仓库**只包含原创代码**（网关、协议编解码、资源解析器、Babylon 客户端）。
- 游戏的**美术 / 音乐 / 数据等素材版权归 SOFTON Entertainment 所有，本仓库不包含、不分发**。
- 运行需**自备**原版客户端资源（`.spk/.ispk/.map` 等），放入约定目录（见各模块说明）。
- 服务端基于开源 [opendarkeden](https://github.com/opendarkeden)（其许可见上游）。
- 本项目仅供学习与技术研究。

## 架构

```
浏览器(Babylon 客户端)
   │  proto.js  协议编解码(7字节包头, 503 包)
   │  spk.js    精灵/地图解析(.spk/.ispk/.map)
   │  render.js Babylon 引擎(正交等距, 实体/visual: 2D billboard 现用→3D mesh 后换)
   ▼ WebSocket(二进制)
网关(Node, WS↔TCP, 分帧)
   ▼ TCP
opendarkeden 服务端(C++) ── loginserver:9999 / gameserver:9998 ── MySQL
```

## 目录

| 路径 | 说明 |
|---|---|
| `web/client/` | **Web 客户端**(Babylon)：render.js 引擎 + proto.js 协议 + spk.js 资源 |
| `web/gateway/` | WebSocket↔TCP 网关 + C++→JS 封包代码生成器 + codec |
| `web/resource/` | 精灵/地图解析器 + 离线 PNG 预览 + 浏览器查看器 |
| `web/spike/` | Babylon 2D+3D 共存验证 |
| `design/` | 设计文档(总方案 + 各阶段报告 + 引擎决策) |
| `research/` | 开源参考(opendarkeden server/client、ODK-SpriteLib)——不入库，自行 clone |

## 状态

| 阶段 | 状态 |
|---|---|
| 后端运行(Docker: server+MySQL) | ✅ |
| 协议层(网关 + 代码生成器 + 登录/选角) | ✅ |
| 资源层(精灵 + 地图解析) | ✅ 核心 |
| Web 客户端(Babylon 引擎 + 真实登录→入世) | ✅ 端到端打通 |
| 真实地表贴图 / 多实体 / 玩法 / 3D 化 | 🔜 进行中 |

已实现端到端：浏览器经网关 **登录 → 选角 → 移交 → 连 gameserver → 收角色数据 → 场景中显示角色**。

## 快速开始

```bash
# 1. 后端(需 Docker)
cd research/server && docker compose -f docker/docker-compose.local.yml up -d
#    容器内编译 + 启动 loginserver/sharedserver/gameserver(见 design/P1-后端验证报告.md)

# 2. 网关
cd web/gateway && npm install && node src/gateway.js     # :8080

# 3. Web 客户端(自备资源放入 web/client/public/assets/)
cd web/client && node server.js                          # http://127.0.0.1:8095/
```

## 致谢

- [opendarkeden](https://github.com/opendarkeden) —— 开源服务端 / 客户端参考
- [cardoso/ODK-SpriteLib](https://github.com/cardoso/ODK-SpriteLib) —— 精灵格式参考
- [Babylon.js](https://www.babylonjs.com/) —— 渲染引擎
