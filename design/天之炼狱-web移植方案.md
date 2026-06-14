# 《天之炼狱》(DarkEden) Web 1:1 高仿移植方案

> 状态：P0–P3 完成，P4 进行中（引擎已定 Babylon）
> 用途：本地内部研究
> 最后更新：2026-06-14

---

## 0. 一句话结论

《天之炼狱》= 韩国 SOFTON《DarkEden》(2000)，等距 2D 吸血鬼题材 MMORPG。已有成熟开源实现
（opendarkeden 组织），**服务端可编译可运行、数据 85–90% 齐全、资源格式无 DirectX 依赖**，
是极适合 Web 移植的老 MMO。采用**混合路线 B**：直接复用 C++ 服务端，前端自研 web 客户端
（渲染引擎 **Babylon.js**，为「2D 现用→3D 渐进替换」设计），按本文格式规范重写 `.spk` 资源解析与封包编解码。
目前已打通：后端运行 → 登录/选角 → 精灵+地图解析 → Babylon 客户端真实登录显示角色。

---

## 1. 游戏身份

| 项 | 值 |
|---|---|
| 原名 | DarkEden / 다크에덴 |
| 中文名 | 天之炼狱（台）、黑暗伊甸园（陆） |
| 开发商 | SOFTON Entertainment（原 Metrotech），韩国 |
| 首发 | 2000-06-15（韩国 Alpha） |
| 类型 | 等距(isometric / 3/4 俯视) 2D MMORPG，Windows 客户端 |
| 三族 | 斯雷亚 Slayer(人类/猎人) · 吸血鬼 Vampire(血族) · 奥斯特 Ousters(魔灵族) |
| 特色 | 强 PvP、少安全区、种族转化（被咬变吸血鬼）、三时段权力轮换 |

---

## 2. 资源来源清单

| 类别 | 来源 | 状态 |
|---|---|---|
| 开源服务端 | `github.com/opendarkeden/server` (C++) | 已 clone → `research/server` |
| 开源客户端 | `github.com/opendarkeden/client` (C++ / DX9，有 SDL 迁移文档) | 已 clone → `research/client` |
| 精灵格式库 | `github.com/cardoso/ODK-SpriteLib` (C# 参考实现) | 已 clone → `research/ODK-SpriteLib` |
| 格式规范文档 | `research/client/tools/engine/sprite/include/zone.h` | 已读，地图格式 C 结构定义 |
| 原始美术/音效 | 私服一键端（天之炼狱 V7.01 / 221 / 241）的客户端 `DARKEDEN/` 资源目录 | **待获取**（唯一外部依赖） |

---

## 3. 资源格式规范（已逆向确认）

### 3.1 精灵四类

| 类型 | 扩展 | 用途 | 像素格式 |
|---|---|---|---|
| CSprite | .sp | 不透明主体（玩家/怪物） | RGB 5:6:5（掩码 R=0xF800 G=0x7E0 B=0x1F） |
| CAlphaSprite | .asp | 半透明（阴影/特效） | RGA 5:6:5（掩码 R=0xF800 G=0x3E0 A=0x1F，5位 alpha） |
| CIndexSprite | .isp | 色键透明（双层渲染） | RGB565 + 色键（`B>0 && R==0 && G∈{0,32,64}`） |
| CShadowSprite | .ssp | 阴影/遮挡掩码（无颜色数据） | 仅结构 |

> ⚠️ 注意 CAlphaSprite 的 G 通道是 5 位（0x3E0），与 CSprite 的 6 位（0x7E0）不同，解析器要分别处理。

**CSprite 字节布局**（小端）：
```
Header:  u16 Width | u16 Height
每扫描行(Height 次):
  u16 LineLength | u16 SegmentCount
  Segment[SegmentCount]:
    u16 Offset(行内偏移) | u16 PixCount | u16[PixCount] Pixels(RGB565)
```
压缩本质：用 Offset 跳过透明像素的线性 RLE。CAlphaSprite 用 1 字节存 SegmentCount/Offset/PixCount
（限 255 像素/行），并在尾部存 LineLengths 表。CShadowSprite 的 Offset 是 u32。

参考：`research/ODK-SpriteLib/CSprite/CSprite.cs:76-131`、`CAlphaSprite/CAlphaSpriteHelper.cs:53-59`、
`CIndexSprite/CIndexSpriteHelper.cs:47-50`。

### 3.2 打包 `.spk` + 索引 `.spki`

```
.spk:  u16 SpriteCount | [精灵二进制 ×N 顺序堆放]
.spki: u16 SpriteCount | i32 FileOffset ×N（相对 spk 头）
```
变体：`.aspk/.ispk/.sspk` 结构相同，内含对应精灵类型。**支持按 ID 查 spki → seek spk 流式加载**，
天然适合 Web 按需加载。参考：`research/client/Client/SpriteLib/CFileIndexTable.cpp:69-89`。

### 3.3 地图 `.map`（服务端用 `.smp/.ssi`）

```
Header: char[16] Version("=MAP_2000_05_10=") | u16 ZoneID | u16 ZoneGroupID
        char[256] ZoneName | u8 ZoneType(0-7) | u8 ZoneLevel(1-10) | char[1024] Desc
Pointers: i32 fpTile | i32 fpImageObject
Tile: u16 Width | u16 Height | Sector[H*W]{ u16 SpriteID | u8 Property | u8 Light }
ImageObject: i32 Count | Object[Count]{ u8 Type(3-7) | 类型专属数据 | 位置列表 }
```

Sector Property 位标志：
```
0x01 地下不可通过  0x02 地面不可通过  0x04 飞行不可通过  0x08 有物品
0x10 地下生物      0x20 地面生物      0x40 飞行生物      0x80 传送点
```
参考：`research/client/Client/MZone.cpp:909-1120`、`MSector.h:82-90`、
`research/client/tools/engine/sprite/include/zone.h`（现成 C 规范）。

### 3.4 Web 解析器工作量

JS 重写：CSprite ~200 行 / CAlpha ~250 / CIndex ~300 / CShadow ~150 / spki 加载 ~250 / 地图 ~750
+ Canvas/WebGL 渲染层 ~1000。核心约 **2300–3200 行 JS/WASM**。热点（RLE 展开）可走 WASM。

---

## 4. 网络协议规范（已逆向确认）

### 4.1 封包

```
包头(固定 7 字节，小端):  u16 PacketID | u32 PacketSize | u8 Sequence
包体:  混合定长/变长
```

| 方向 | 数量 | 说明 |
|---|---|---|
| CG (Client→Game) | 147 | 客户端游戏指令 |
| GC (Game→Client) | 250 | 服务器游戏事件 |
| CL/LC | 33 | 登录流程 |
| 服务器间 GG/GL/LG/GS/SG | ~40 | 内部通信 |
| **合计** | **~500 opcode** | 最高 ID 500 |

每包一个类、手写 `read/write`、PacketFactory 按 ID 分发 → **可写 C++→JS 代码生成器批量转**。
参考：`research/client/Client/Packet/Packet.h:22-43,69-577`、`PacketFactoryManager.h`。

样例字段：
- `CL_LOGIN`: u8 szID | char[szID] | u8 szPwd | char[szPwd] | u8 Mac[6] | u8 loginMode
- `CG_MOVE`: u8 X | u8 Y | u8 Dir(0-7)
- `CG_ATTACK`: u32 ObjectID | u8 X | u8 Y | u8 Dir
- `CG_GLOBAL_CHAT`: u32 Color(ARGB) | u8 szMsg | char[szMsg]

### 4.2 加密（弱）

- 单字节 XOR（`Encrypter::setCode`）+ `SHUFFLE_STATEMENT_2/3/4/5` 语句顺序混淆（防静态逆向，非真加密）
- 无 CRC / 无强校验；`#ifdef __USE_ENCRYPTER__` 可整体关闭
- **待确认风险**：加密码是否在握手时动态协商 → 先用「加密码=0」模式跑通网关再上加密
- 参考：`research/client/Client/Packet/Encrypter.h`、`EncryptUtility.h:10-42`

### 4.3 架构与连接流程

```
Client ──TCP──> GameServer(CG/GC)   ← 客户端唯一长连接
                    │
   ┌────────────────┼────────────────┐
   ▼(GL/LG)         ▼(GS/SG)
LoginServer       SharedServer
(CL/LC 一次性验证)  (公会/跨服，不直连客户端)
```
流程：连 Login → CL_LOGIN → LC_PC_LIST → 选角 → Login 转 GameServer → 之后只与 GameServer 通信。

---

## 5. 服务端可运行性 & 内容完整度

- **构建**：CMake 3.16+ / libmysqlclient 5.7 / Lua 5.1 / Xerces-C 3.2.3 / Ubuntu 20.04；产出 `loginserver`/`sharedserver`/`gameserver`；有 `docker/docker-compose.yml`。
- **数据库**：MySQL5.7/8，双库 `DARKEDEN`(374 表) + `USERINFO`(7 表)；`initdb/DARKEDEN.sql` 12026 行含全部种子数据。
- **内容**：物品(数千) / 怪物(500+) / 技能(200+) / NPC(142) / 地图文件 284 个(.smp/.ssi) / 任务(XML + Lua)。
- **完整度**：~85–90%（数据侧）。缺口主要是美术资源（不在仓库）+ 个别交易/战争种子数据需校验。
- 参考：`research/server/README.md`、`initdb/DARKEDEN.sql`、`conf/gameserver.conf`、`data/lua/`。

---

## 6. 路线决策

| 路线 | 做法 | 保真 | 工作量 | 采纳 |
|---|---|---|---|---|
| A 原汁 WASM | client C++ 整体 Emscripten，DX9→WebGL | 最高 | 极大（DX9 移植硬骨头） | 否 |
| **B 混合（采纳）** | 后端用 opendarkeden/server；前端自研 web 客户端 + 本文格式规范重写资源/协议 | 高 | 大 | ✅ |
| C 干净重制 | 只参考数值，从头做 | 中 | 中（美术自理） | 否 |

### 渲染引擎：Babylon.js（已定，spike 验证）

> 详见 [渲染引擎决策-Babylon.md](./渲染引擎决策-Babylon.md)。

- **决定性理由**：长期目标是「2D 现用 → 逐步引入并替换 3D 素材」，需从一开始就用 3D 引擎，
  避免将来换引擎重写。Pixi/Phaser 是 2D 原生、上 3D 要重写；three 不如 Babylon 电池全。
- **架构**：一个正交等距场景(相机固定)；每个实体的 visual 可替换——现在 2D billboard
  (`.spk` 解码→`RawTexture`)，将来 3D mesh，位置/逻辑/相机不变，2D 与 3D 同场景共存。
- spike 已验证：2D billboard + 3D mesh 同场景、遮挡正确、资源直接可用。

---

## 7. 实施路线图与进度

| 阶段 | 状态 | 产出 / 文档 |
|---|---|---|
| **P0 摸底** | ✅ | 身份(=DarkEden)、三库 clone、格式/协议/内容三大未知数确认 |
| **P1 后端验证** | ✅ | Docker 跑通 server+MySQL8，三服监听 9998/9999。[P1-后端验证报告.md](./P1-后端验证报告.md) |
| **P2 协议层** | ✅ | 网关 WS↔TCP+分帧；方向感知代码生成器(503包id+138 codec)；**登录→选角→gameserver移交实测打通**。[P2-登录到游戏链路.md](./P2-登录到游戏链路.md) |
| **P3 资源层** | ✅ 核心 | 同构精灵解析(CSprite/CIndexSprite,真实角色渲染)+地图.map解析(adam_c 热力图)。[P3-资源格式.md](./P3-资源格式.md) |
| **P4 客户端** | 🔄 进行中 | Babylon 正式引擎底座(实体/visual 架构)+真实登录流→角色进场。[P4-web客户端demo.md](./P4-web客户端demo.md)、[渲染引擎决策-Babylon.md](./渲染引擎决策-Babylon.md) |
| **P5 联调优化** | 待 | 兼容性/模糊测试/性能(thin instance/裁剪/流式加载) |

### P4 续 / 后续主线（未完）
1. **真正连进 gameserver**：用 `LC_RECONNECT` 的 key 连 9998 走 CG 握手，收 GC 同步包(自己/他人/怪物/移动)。
2. **真实地表贴图**：逆向全局 spriteID→(包,帧) 注册表，替换占位地面。
3. **多实体 + 8 向方向帧**；CAlphaSprite 特效 / .cfpk 解压。
4. **UI + 玩法**：背包/技能/聊天 + 移动/攻击/技能/种族转化。
5. 渲染层 3D 化：逐个把 billboard 换成 3D mesh。

### 产物目录
- `web/gateway/` 网关 + 协议代码生成器 + codec
- `web/resource/` 精灵/地图解析器 + 离线 PNG 预览 + 浏览器查看器
- `web/client/` **正式 web 客户端(Babylon)**：render.js 引擎 + proto.js 协议 + spk.js 资源
- `web/spike/` Babylon 2D+3D 共存验证
- `research/server`、`research/client`、`research/ODK-SpriteLib` 开源参考(已 clone)

---

## 8. 风险与已解决项

已解决（P1–P4 过程中）：
- ✅ 登录/选角链路打通：CL_LOGIN 不加密；变长包 size 经 `writePacket` 回填真实长度根治分帧错位。
- ✅ MySQL8 排序规则冲突 → `--skip-character-set-client-handshake --character-set-server=latin1`。
- ✅ 服务端配置/账号 ServerGroupID 对齐；docker 构建时钟偏差需 touch 后重编。
- ✅ 原始 `.spk` 资源已取得(7.6G 客户端)；精灵/地图格式均验证。
- ✅ 渲染引擎选型(Babylon) + 2D/3D 共存验证。

待确认：
1. **进入 gameserver 的 CG 握手**：`LC_RECONNECT` 的 key 如何用、CG 连接序列(下一步)。
2. **全局 spriteID→(包,帧) 注册表**：地表/物件贴图渲染前需逆向(藏在压缩 FileList.inf/加载逻辑)。
3. 大量精灵性能：Babylon thin instance/合批 + 视野裁剪；大地图分块加载。
4. 角色 8 向方向帧选择逻辑(billboard 期)；CAlphaSprite/.cfpk 等其余资源格式。
5. 运行时加密(XOR/SHUFFLE)：登录链路用 0 码已通，游戏内部分 CG 包加密待补。

---

## 9. 关键源码索引

| 主题 | 文件 |
|---|---|
| CSprite 格式 | `research/ODK-SpriteLib/CSprite/CSprite.cs:76-131` |
| CAlpha 掩码 | `research/ODK-SpriteLib/CAlphaSprite/CAlphaSpriteHelper.cs:53-59` |
| spki 加载 | `research/client/Client/SpriteLib/CFileIndexTable.cpp:69-89` |
| 地图加载 | `research/client/Client/MZone.cpp:909-1120` |
| Sector 标志 | `research/client/Client/MSector.h:82-90` |
| 地图 C 规范 | `research/client/tools/engine/sprite/include/zone.h` |
| 封包定义/包头 | `research/client/Client/Packet/Packet.h:22-43,69-577` |
| 加密混淆 | `research/client/Client/Packet/EncryptUtility.h:10-42` |
| 种子数据 | `research/server/initdb/DARKEDEN.sql` |
| 服务端配置 | `research/server/conf/gameserver.conf` |
| Docker | `research/server/docker/docker-compose.yml` |
