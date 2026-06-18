# In-world 封包加密(已逆向，可实现)

> 登录/选角/入世链路是明文(加密码=0)；但**入世后**(CG_CONNECT 触发 `setEncryptCode()`)，
> 世界内 CG/GC 封包启用非 0 加密码。GC_UPDATE_INFO 是明文例外。

## 机制(全部来自 opendarkeden 源码分析)
1. **加密码**(单字节)：入世后由所在 Zone 决定
   `code = EncryptCode(ZoneID, serverID)`，主公式 `(uchar)(((ZoneID>>8) ^ ZoneID) ^ ((serverID+1)<<4))`
   - 注意：源码有 6 个 `#define EncryptCode` 变体(不同 build)，需确认本 build 用哪个；
     也可直接**暴力试 256 个码**，哪个让服务端正常响应即正确(单字节，可行)。
2. **逐字段 XOR**：`convert(byte) = byte ^ ucharCode`(ucharCode 由 setCode(code) 导出)。
3. **语句顺序混淆** `SHUFFLE_STATEMENT_N(code, ...)`：按 `code % N` 重排 N 个字段的读写顺序。

## 实现配方(客户端)
- 需要 **ZoneID**(角色所在区, DB 中 Slayer 111111 SLOT1 = 12) + **serverID**(0 或 1)。
- 发 CG 包(如 CG_MOVE)：按 `code%N` 顺序，每字段 XOR ucharCode 后写。
- 收 GC 包(如 GC_MOVE_OK)：对称解。
- CG_MOVE(明文序 Dir,X,Y)；GC_MOVE_OK(X,Y,Dir)；GC_MOVE_ERROR(X,Y, 返回当前真实坐标)。

## 状态(已实现, 移动差最后一步握手)
- ✅ 机制完全实现：`setCode→ucharCode=code`；`convert(byte)=byte^code`；
  `SHUFFLE_2`(code%2: 0→AB,1→BA)、`SHUFFLE_3`(code%3: 0→ABC,1→BCA,2→CAB)。
  proto.js 已加 `setEncryptCode/calcEncryptCode/encCGMove/encCGReady` + GC_MOVE_OK/ERROR 解码。
- ✅ 算出码：zoneID=12, serverID=0, 默认公式 → **code=28**。
- ✅ 入世后需发 **CG_READY**(id=70, 空体, 不加密) → `CGReadyHandler` 置 GPS_NORMAL 解锁移动。
- ✅ 验证包头是**明文**(GC_UPDATE_INFO id=410/size=614 明文读出)，加密仅作用于**包体**。
- ⚠️ **当前卡点**：CG_READY(id=70) 经网关确认已转发到 gameserver(C→S id=70)，但 gameserver
  未处理 CG_READY/CG_MOVE(日志无 Receive)、探测移动无 GC_MOVE_ERROR。
  待查方向(下一步)：
  1. 入世处理是否完成(日志停在 item load "여기는 되나요7", 玩家可能尚未完全置入 Zone);
  2. 包序列号(每包 seq, 我固定 0)是否在 gameserver 端被校验;
  3. CGConnectHandler 之后是否还有别的就绪/确认包(非仅 CG_READY)。

## ★ 2026-06 复测定位(推翻旧猜测): 卡点在 CG_READY 的「读包/解析」层, 即 in-world 加密握手
用 `web/gateway/test/ready.repro.mjs` + 服务端打点(CGReadyHandler/IPM-OUT/ZPM/addPC 的 EntryTrace.txt)逐层验证:
- **不发 CG_READY → 连接稳定 4s+**; 一发 CG_READY → 立刻断。→ 确认是 CG_READY **本身**触发断连, 非超时回收。
- **CGReadyHandler ENTER 打点从未触发** → CG_READY 在被派发到处理器**之前**就导致断连(读包/解析层)。
- IPM-OUT / ZPM→addPC / addPC ENTER 打点也全空 → 与 zone 交接、addPC、quest 崩溃**无关**。
- 之前"收到 GC_PET_INFO 后才断"是**改动前旧状态/竞态**的误导; addPC 里 GQuest 崩溃是真实存在的次要 bug(已加真 try/catch 防御), 但**不是本卡点**。
- **真因**: CGConnect 处理后服务器对该连接后续 CG 包启用 **in-world 解密**; 客户端/harness 发的 CG_READY 未按服务器解密预期编码 → 读包 desync → 断连。
- **下一步(关键路径)**: 读服务端 CGConnect 之后的收包解密路径(SocketInputStream / readPacket / setEncryptCode 在**读**侧的作用; 判断是"仅包体异或"还是"整流/含包头"), 让客户端 CG_READY 及后续 CG 包按服务器解密方式编码。打通后 CG_MOVE/打怪等世界内包随之可用。
- 注: 已在 Zone.cpp/IncomingPlayerManager.cpp/ZonePlayerManager.cpp/CGReadyHandler.cpp 留了 EntryTrace 调试打点(临时, 后续清理); Zone::addPC 的 try/catch 防御保留。

## (旧)精确卡点(已被上文推翻): CG_READY 后 gameserver 关 TCP
网关日志: 入世后 `C→S id=70(CG_READY)` → 紧接 `TCP 关闭`(服务端主动断), CG_MOVE 未及发出。
- 加密已实现(code=28=EncryptCode(12,0)); 序列号无校验(已查); CGReadyHandler 也无报错, gameserver 进程存活。
- 根因: **DarkEden 的 incoming→zone 连接交接模型**。CGReadyHandler 做
  `IncomingPlayerManager::deletePlayer(socket) + pushOutPlayer + setPlayerStatus(GPS_NORMAL)`,
  把玩家从"接入管理器"转到 zone。但 zone 未接管该 socket → 连接被关。
  疑与: 被禁用的内容/zone 未完整初始化, 或多线程 ZoneGroupThread 接管时序(本 build)。
- 这是**服务端连接模型/zone 接管**的深层问题, 服务器权威移动暂卡于此。
- 现阶段方案: **客户端本地移动 + 相机跟随**(可走可探图), 服务器权威移动待修交接。
