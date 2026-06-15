# GC_UPDATE_INFO 解码发现

> 状态：入世链路打通，real 数据确认；字节级完整解码受「二进制 vs 源码字段差异」阻挡，列为专门 RE。

## 已确认（real 服务端数据）
CG_CONNECT 入世后，gameserver 下发 `GC_UPDATE_INFO`(id=410, ~614B)，实测携带真实角色数据：
- 角色名 `b2bbd4d9d1dacace`（与选角/DB 一致）
- Alignment 7500、STR 9 / DEX 11 / INT 10（与 DB Slayer 完全一致）

## 实测 body 头布局（本 build，body 从 7 字节包头后算）
```
[0]    u8   pcType 'S'/'V'/'O'(0x53/56/4F)
[1-4]  u32  ObjectID(运行时分配)        ← 源码 PCSlayerInfo::write 未直接体现，实际存在
[5]    u8   szName
[6..]  name (szName 字节, DB 原始编码)
[..]   appearance/base 块(若干字节, 含 build 专属字段)
[21]   i32  Alignment(=7500)            ← body 偏移 21
[25]   u16  STR(=9)  ──┐
[31]   u16  DEX(=11)   ├ 每个属性在本 build 写了 3 个 WORD(basic/?/?), 故间隔 6 字节
[37]   u16  INT(=10) ──┘
[43..] DWORD×: STRExp/DEXExp/INTExp, HP[cur/max], MP[cur/max], Fame, ...
```

## 关键阻碍
**运行的 gameserver 二进制的序列化 ≠ 我读的 opendarkeden 源码**：
- 源码 `PCSlayerInfo::write` 显示 STR/DEX/INT 各写 1 次、slot 后紧接 alignment；
- 实际字节里 STR/DEX/INT 各 3 个 WORD、slot 与 alignment 间多 6 字节。
- 说明 build 启用了源码里 `#ifdef` 的额外属性字段。

## 后续（专门 RE 任务）
1. 确定该 build 的编译开关(grep `#ifdef` in PCInfo/CreatureInfo 相关 + CMake 定义)，使源码与字节对齐。
2. 或纯经验逆向：用多个已知 DB 值的角色采样、比对字节，反推完整结构。
3. 完整解出后：角色坐标(ZoneID/X/Y, 在 GC_UPDATE_INFO 末尾, 嵌套块之后) → 角色站到服务端真实位置。
4. 现阶段客户端可先用「选角已知信息 + 占位坐标」，不阻塞渲染主线。
