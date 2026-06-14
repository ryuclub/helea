# 封包代码生成器 (C++ → JS)

从 opendarkeden 服务端源码自动产出浏览器端封包编解码。

## 运行

```bash
node codegen/generate.js     # 读 research/server/src/Core，输出到 src/generated/
```

输出：
- `src/generated/packetIds.js` —— **全 503 个包的 id↔name**（可靠，核心产物）
- `src/generated/codecs.js` —— 可自动生成的「线性包」编解码
- `src/generated/report.json` —— 覆盖率报告

## 当前覆盖率(方向感知版)

| 类别 | 数量 | 说明 |
|---|---|---|
| 枚举包总数 | 503 | 全部 id↔name 已生成 |
| 自动生成 codec | **138** | encode(C→S) 77 + decode(S→C) 61 |
| 需手工/待增强 | 296 | 见下 |
| 跳过(服务器间 GL/LG/GS/SG/GG) | 35 | 浏览器不用 |
| 无源文件 | 34 | 仅枚举无独立类 |

## 方向规则(关键)

- **C→S 包(CL/CG/CR/CU)**：浏览器 **encode**，字段顺序对应服务端 `read()`
- **S→C 包(LC/GC/RC/UC)**：浏览器 **decode**，字段顺序对应服务端 `write()`
- 服务器间包(GL/LG/GS/SG/GG)：浏览器不用，跳过

> 已实现方向感知 + 逐行成员解析(修掉 `private:` 跨行污染，单项救回 ~80 包)。

## 需手工的原因分布(report.json)

- `no-read-method` 135 —— S→C 包(应从 write 生成，见上)
- `conditional` 107 —— 含校验/分支 `if`（如 CL_LOGIN 的 szID==0 校验）
- `loop` 38 / `nested-object` 32 —— 列表、嵌套对象(物品/技能等)
- `encrypted` 16 —— 含 `#ifdef __USE_ENCRYPTER__`，需补 XOR/SHUFFLE
- `unresolved-type:*` —— 成员声明解析遗漏(多成员同行等)，可增强 parseMembers

## 手工 codec

`src/codecs.manual.js` —— 自动生成器无法干净处理时手写，且对真实服务端验证。
当前含登录流：`CL_LOGIN`(encode) / `LC_LOGIN_OK` / `LC_LOGIN_ERROR`(decode)，
经 `test/login.live.test.js` 对真实 loginserver 验证通过。

## 协议层 API

`src/protocol.js`：
- `encodePacket(name, obj, seq?)` → 完整封包 Buffer(含 7 字节包头)
- `decodePacket(buf)` → `{ id, name, seq, size, ...fields }`

优先用手工 codec，其余返回 `_raw`。
