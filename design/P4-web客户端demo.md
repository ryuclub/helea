# P4 Web 客户端 demo —— 端到端打通

> 状态：最小 demo 完成并经真实浏览器(Playwright)验证(2026-06-14)。

## 成果

浏览器打开 → 一键「连接并登录」→ 经网关登录**真实 DarkEden 服务端** → 选 Slayer 角色
→ 收到 LC_RECONNECT(gameserver 地址) → **角色站在等距地面上**，右侧实时日志显示完整协议链路。

Playwright 验证：`已进入游戏: true`，角色亮像素 724，日志含
`连网关→CL_LOGIN→LC_LOGIN_OK→LC_PC_LIST→CL_SELECT_PC→LC_RECONNECT(127.0.0.1:9998)`。
截图 `web/client/out/p4-client.png`。

## 架构(把 P2 协议 + P3 精灵拼起来)

```
浏览器(web/client) ──WS──> 网关(web/gateway :8080) ──TCP──> loginserver(9999)
   │  proto.js(DataView 协议编解码, 浏览器原生)
   │  spk.js(P3 精灵解码, 同构)
   └─ Canvas 2D 渲染: 等距佔位地面 + 角色动画
```

## 产物(web/client/)
- `src/proto.js` —— 浏览器原生协议层(DataView,无 Node Buffer)：Writer/Reader/Framer +
  CL_LOGIN/CL_GET_PC_LIST/CL_SELECT_PC 编码、LC_* 解码。
  (经 web/gateway/test/proto.browser.test.js 对真实服务端验证)
- `src/spk.js` —— P3 精灵解码器(复用)
- `public/index.html` —— 客户端页面(连接/登录流程 + Canvas 渲染 + 日志)
- `server.js` —— 静态服务器(:8095)

## 启动(需 docker 服务端 + 网关在跑)
```bash
# 1) docker 服务端(P1) + 2) 网关: cd web/gateway && node src/gateway.js
# 3) 客户端: cd web/client && node server.js  → 打开 http://127.0.0.1:8095/
```

## 渲染框架决策
- 当前: **Canvas 2D**(零依赖, 适合 demo)。
- 生产 1:1: 迁 **PixiJS**(WebGL 2D 批渲染, 专为大量精灵+视野裁剪的等距 2D MMO)。
  ❌ 不用 three.js(3D 引擎, 不适合 2D 精灵游戏)。

## 待办(P4 续 / P5)
1. 渲染层迁 PixiJS(正式渲染引擎)。
2. 真正连入 gameserver(用 LC_RECONNECT 的 key 走 CG 握手), 进世界收 GC 包(角色/怪物/地图同步)。
3. 真实地表贴图(P3 待办: 全局 spriteID→包 注册表)。
4. UI: 背包/技能/聊天; 玩法: 移动/攻击/技能。
