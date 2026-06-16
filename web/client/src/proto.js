// 天之炼狱 协议层 —— 浏览器原生(DataView/Uint8Array，无 Node Buffer 依赖)
// 同构: Node(用 ws 传入 socket) 与浏览器(原生 WebSocket) 皆可用。
//
// 包头 7 字节(小端): u16 PacketID, u32 PacketSize(=body长度), u8 Sequence。整包 = 7 + size。

export const HEADER = 7;

// 仅登录/选角链路需要的包 id(取自服务端 Core/Packet.h 枚举)
export const PACKET = {
  CL_LOGIN: 153,
  CL_GET_PC_LIST: 150,
  CL_SELECT_PC: 159,
  CL_CREATE_PC: 148,          // 角色创建
  CL_DELETE_PC: 149,          // 角色删除
  LC_CREATE_PC_OK: 441,
  LC_CREATE_PC_ERROR: 440,
  LC_DELETE_PC_OK: 443,
  LC_DELETE_PC_ERROR: 442,
  LC_LOGIN_OK: 445,
  LC_LOGIN_ERROR: 444,
  LC_PC_LIST: 446,
  LC_RECONNECT: 450,
  // gameserver 入口
  CG_CONNECT: 21,
  CG_READY: 70,
  GC_UPDATE_INFO: 410,
  GC_SET_POSITION: 341,   // 入世时服务器告知真实坐标(明文 x,y,dir)
  GC_DISCONNECT: 233,
  // 移动
  CG_MOVE: 53,
  GC_MOVE: 282,         // 他人移动(明文): ObjectID(4)+X+Y+Dir
  GC_MOVE_ERROR: 283,
  GC_MOVE_OK: 284,
  // 视野内生物增删(明文)
  GC_ADD_SLAYER: 192,   // PCSlayerInfo3 + (尾部 Effect/Pet/Nickname/Store 忽略)
  GC_ADD_VAMPIRE: 195,
  GC_ADD_OUSTERS: 190,
  GC_ADD_MONSTER: 183,
  GC_ADD_NPC: 189,
  GC_ADD_MONSTER_CORPSE: 184, // 怪物死亡→尸体(ObjectID 等), 我们仅据此移除活体
  GC_DELETE_OBJECT: 232, // ObjectID(4): 离开视野/消失
  // 战斗(普攻 SKILL_ATTACK_MELEE): 复刻开源服务端流程(CGAttackHandler→AttackMelee→setDamage)。
  // CG_ATTACK 加密(SHUFFLE_4)发出; 服务端回 3 种包: OK1(给攻击者确认+自身ModifyInfo), OK3(给旁观者播攻击动画),
  // GC_STATUS_CURRENT_HP(广播被击者新HP→血条/伤害飘字)。怪死再发 GC_ADD_MONSTER_CORPSE。
  CG_ATTACK: 15,                  // 客户端发: 目标ObjectID(u32)+我X(u8)+我Y(u8)+Dir(u8)
  GC_ATTACK_MELEE_OK_1: 208,      // 给攻击者: TargetObjectID(u32)+ModifyInfo(攻击者自身属性变化)
  GC_ATTACK_MELEE_OK_2: 209,      // 给被攻击的玩家(被怪打): 攻击者ObjectID(u32)+ModifyInfo(我方HP变化)
  GC_ATTACK_MELEE_OK_3: 210,      // 给旁观者: 攻击者ObjectID(u32)+TargetObjectID(u32) → 播攻击动画
  GC_SKILL_FAILED_1: 359,         // 技能失败(给施法者): 命中失败/距离/冷却。仅命名以静默, 不需动作
  GC_SKILL_FAILED_2: 360,         // 技能失败(广播旁观者)。仅命名以静默
  GC_STATUS_CURRENT_HP: 382,      // 广播被击者: ObjectID(u32)+CurrentHP(u16) → 更新血条, 据旧HP差值飘伤害
  // 聊天(明文): CG_SAY=u32 color+u8 len+msg; GC_SAY=u32 objectID+u32 color+u8 len+msg
  CG_SAY: 87,
  GC_SAY: 335,
  // 属性变化(HP/MP/STR…): ShortList{type u8,value u16}+LongList{type u8,value u32}; HP/MP type=12~15
  GC_MODIFY_INFORMATION: 275,
  // ── 物品/背包/装备 ──
  // GC(服务端→客户端, 明文; AddNewItemToZone 前5字段 SHUFFLE_5):
  GC_CREATE_ITEM: 224,            // 物品入背包: 字段≠PCItemInfo(无MainColor/sub) +InvenX,InvenY
  GC_DELETE_INVENTORY_ITEM: 231,  // 删背包格: ObjectID
  GC_ADD_GEAR_TO_INVENTORY: 177,  // 装备→背包(卸下确认): SlotID+InvenX+InvenY
  GC_ADD_ITEM_TO_ZONE: 182,       // 地面已有物品(入世下发): 同 187 结构
  GC_ADD_NEW_ITEM_TO_ZONE: 187,   // 地面新掉落: SHUFFLE_5(ObjID,X,Y,IClass,IType)+...
  GC_DELETE_AND_PICKUP_OK: 229,   // 拾取确认(给自己): ObjectID(移除地面物件)
  GC_CANNOT_ADD: 218,             // 操作失败: ObjectID(乐观更新回滚)
  // CG(客户端→服务端): ★4/7/8 明文不加密不shuffle; 3/10 加密无shuffle; 12 SHUFFLE_5; 13/137 SHUFFLE_3
  CG_ADD_GEAR_TO_MOUSE: 3,        // 卸装: ObjectID+SlotID (加密, ObjID^code)
  CG_ADD_INVENTORY_TO_MOUSE: 4,   // 背包→光标: ObjectID+InvenX+InvenY (明文)
  CG_ADD_MOUSE_TO_GEAR: 7,        // 穿装: ObjectID+SlotID (明文)
  CG_ADD_MOUSE_TO_INVENTORY: 8,   // 光标→背包: ObjectID+InvenX+InvenY (明文)
  CG_ADD_MOUSE_TO_ZONE: 10,       // 丢到地面: ObjectID (加密, ObjID^code)
  CG_ADD_ZONE_TO_INVENTORY: 12,   // 拾取→背包: ObjID+ZoneX+ZoneY+InvenX+InvenY (SHUFFLE_5)
  CG_ADD_ZONE_TO_MOUSE: 13,       // 拾取→光标: ObjID+ZoneX+ZoneY (SHUFFLE_3)
  // ── NPC 交互 ──
  CG_NPC_TALK: 55,                // 点NPC对话(明文 ObjectID u32)
  GC_NPC_SAY_DYNAMIC: 298,        // NPC动态文本(服务端直发GBK中文): ObjID u32+szMsg u8+Message
  GC_NPC_RESPONSE: 296,           // NPC响应: Code u16(+Param u32, 按包长判断); Code=10 QUIT关对话, 其余多为开界面
  GC_NPC_ASK: 292,                // NPC脚本菜单: ObjID u32+ScriptID u32+NPCID u16(脚本文本锁dpk)
  GC_NPC_SAY: 297,                // NPC静态文本(ScriptID, 文本锁dpk)
  // ── 商店(全部明文) ──
  CG_SHOP_REQUEST_LIST: 101,      // 请求商品列表: ObjID u32+RackType u8
  CG_SHOP_REQUEST_BUY: 100,       // 购买: ObjID+RackType+RackIndex+Num+X+Y (全 u8 + ObjID u32)
  CG_SHOP_REQUEST_SELL: 102,      // 出售: ObjID u32+ItemObjID u32+OpCode u8
  GC_SHOP_LIST: 345,              // 商品列表: ObjID+Version+RackType+件数+每件{idx,item,价格}+市价+ShopType
  GC_SHOP_BUY_OK: 344,            // 购买成功(物品入背包走 GCCreateItem, 金钱走 GC_MODIFY_INFORMATION)
  GC_SHOP_BUY_FAIL: 343,          // 购买失败
  GC_SHOP_SELL_OK: 349,           // 出售成功
  GC_SHOP_SELL_FAIL: 348,         // 出售失败
};
export const NAME = Object.fromEntries(Object.entries(PACKET).map(([k, v]) => [v, k]));

// 服务端文本编码: 基础数据(怪物/NPC名 HName)是 EUC-KR 韩文(但实际发送多用英文 EName 不受影响),
// StringPool/系统消息/NPC对话/聊天是 GBK 中文(中文服汉化)。统一用 GBK 解码: 向后兼容 ASCII(英文名 OK),
// 中文正确。★发送中文(聊天)需 GBK 编码(见 gbkEncode)。
function gbkDecode(arr) { return new TextDecoder("gbk").decode(arr instanceof Uint8Array ? arr : Uint8Array.from(arr)); }
// GBK 编码(发送聊天等中文): JS 无内置 GBK TextEncoder, 首次用 TextDecoder 反向构建 char→GBK字节 表(缓存)。
let _gbkEncMap = null;
function gbkEncode(str) {
  if (!_gbkEncMap) {
    _gbkEncMap = new Map(); const dec = new TextDecoder("gbk");
    for (let hi = 0x81; hi <= 0xfe; hi++) for (let lo = 0x40; lo <= 0xfe; lo++) {
      if (lo === 0x7f) continue;
      const ch = dec.decode(Uint8Array.from([hi, lo]));
      if (ch.length === 1 && ch !== "�" && !_gbkEncMap.has(ch)) _gbkEncMap.set(ch, (hi << 8) | lo);
    }
  }
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 128) out.push(c);
    else { const v = _gbkEncMap.get(ch); if (v) out.push(v >> 8, v & 0xff); else out.push(0x3f); }   // 不可编码→'?'
  }
  return Uint8Array.from(out);
}

// ---- 写缓冲 ----
export class Writer {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 0xff); return this; }
  u16(v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  str(s) { for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff); return this; }
  raw(arr) { for (const b of arr) this.bytes.push(b & 0xff); return this; }
  build() { return Uint8Array.from(this.bytes); }
}

// ---- 读缓冲 ----
export class Reader {
  constructor(u8, off = 0) { this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = off; }
  u8() { return this.dv.getUint8(this.p++); }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; }
  skip(n) { this.p += n; return this; }
  str(n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(this.dv.getUint8(this.p++)); return s; }
}

// 组帧
export function frame(id, body, seq = 0) {
  const out = new Uint8Array(HEADER + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, id, true);
  dv.setUint32(2, body.length, true);
  dv.setUint8(6, seq & 0xff);
  out.set(body, HEADER);
  return out;
}

// gameserver 连接: 服务器校验每个 C→G 包序列号(GamePlayer::m_Sequence, BYTE, 从 0 起每包 +1),
// 不符即断连(SequenceError.txt)。登录链路(loginserver)不校验, 故 CL_* 仍用 seq=0。
// 每开一个 gameserver 连接前调 resetGameSeq()。
let _gseq = 0;
export function resetGameSeq() { _gseq = 0; }
function gframe(id, body) { return frame(id, body, _gseq++ & 0xff); }

// ---- 编码(C→S) ----
export function encCLLogin({ id, password, mac = new Uint8Array(6), loginMode = 0 }) {
  const w = new Writer();
  w.u8(id.length).str(id).u8(password.length).str(password).raw(mac).u8(loginMode);
  return frame(PACKET.CL_LOGIN, w.build());
}
export function encCLGetPCList() { return frame(PACKET.CL_GET_PC_LIST, new Uint8Array(0)); }
// 入世就绪(空体)：CGReadyHandler 据此置 GPS_NORMAL, 解锁移动等 in-world 玩法
export function encCGReady() { return gframe(PACKET.CG_READY, new Uint8Array(0)); }
export function encCLSelectPC({ pcName, pcType = 0 }) {
  // pcName: Uint8Array(原始字节) 或 string
  const name = pcName instanceof Uint8Array ? pcName : Uint8Array.from([...pcName].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u8(name.length).raw(name).u8(pcType);
  return frame(PACKET.CL_SELECT_PC, w.build());
}
// 角色创建 CL_CREATE_PC(148, 走 loginserver, 明文 seq=0)。线格式(CLCreatePC::read):
//   u8 szName + name; u8 slot; u8 flags(bit0=sex 1男, bit1~2=发型);
//   6× u16 colors(CLCreatePC 自己的 SLAYER_COLOR_MAX=6: HAIR,SKIN,SHIRT,SHIRT2,JEANS,JEANS2);
//   u16 STR; u16 DEX; u16 INT; u8 race(0=Slayer 1=Vampire 2=Ousters)。
//   ⚠ 注意: 此处颜色数=6, 与 PCSlayerInfo3 的 9 不同(各自独立枚举)!
//   服务端校验: 名字唯一/槽位空; STR/DEX/INT 各 5~20 且总和 ≤30。
const CREATE_PC_COLOR_MAX = 6;
export function encCLCreatePC({ name, slot = 0, sex = 0, hairStyle = 0, hairColor = 0, skinColor = 0, colors = null, str = 10, dex = 10, int: intel = 10, race = 0 }) {
  const nb = name instanceof Uint8Array ? name : Uint8Array.from([...name].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u8(nb.length).raw(nb);
  w.u8(slot);
  const flags = ((sex === 0 ? 1 : 0) & 1) | ((hairStyle & 3) << 1); // SLAYER_BIT_SEX=0: 1=MALE
  w.u8(flags);
  const cols = colors || (() => { const a = new Array(CREATE_PC_COLOR_MAX).fill(0); a[0] = hairColor; a[1] = skinColor; return a; })();
  for (let i = 0; i < CREATE_PC_COLOR_MAX; i++) w.u16(cols[i] | 0);
  w.u16(str).u16(dex).u16(intel);
  w.u8(race);
  return frame(PACKET.CL_CREATE_PC, w.build());
}
// 角色删除 CL_DELETE_PC(149, loginserver)。线格式(CLDeletePC::read): u8 szName+name, u8 slot, u8 szSSN+SSN。
// 服务端: 校验角色属本账号(Slayer 主表 PlayerID), SSN 段当前未校验(handler 已注释), 但格式要求 szSSN≥1 → 发非空占位。
export function encCLDeletePC({ name, slot = 0, ssn = "0" }) {
  const nb = name instanceof Uint8Array ? name : Uint8Array.from([...name].map((c) => c.charCodeAt(0) & 0xff));
  const sb = Uint8Array.from([...String(ssn || "0")].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u8(nb.length).raw(nb).u8(slot).u8(sb.length).raw(sb);
  return frame(PACKET.CL_DELETE_PC, w.build());
}

// gameserver 入口: CGConnect::read = DWORD key, u8 pcType, u8 szName, name, mac[6]
export function encCGConnect({ key, pcName, pcType = 0, mac = new Uint8Array(6) }) {
  const name = pcName instanceof Uint8Array ? pcName : Uint8Array.from([...pcName].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u32(key).u8(pcType).u8(name.length).raw(name).raw(mac);
  return gframe(PACKET.CG_CONNECT, w.build());
}
// ───── in-world 加密(入世后启用) ─────
// code = EncryptCode(ZoneID, serverID) = (((a>>8)^a) ^ ((b+1)<<4)) & 0xff
// convert(byte)=byte^code; SHUFFLE_STATEMENT_N 按 code%N 重排字段读写顺序。
let _code = 0;
export function setEncryptCode(c) { _code = c & 0xff; }
export function getEncryptCode() { return _code; }
export function calcEncryptCode(zoneID, serverID) {
  return ((((zoneID >> 8) ^ zoneID) ^ (((serverID + 1) << 4))) & 0xff);
}
// SHUFFLE_3 发送序: code%3==0→[A,B,C] 1→[B,C,A] 2→[C,A,B]
function shuffle3(code, a, b, c) { const m = code % 3; return m === 0 ? [a, b, c] : m === 1 ? [b, c, a] : [c, a, b]; }
// 逆: 收到的字节按发送序还原 base [A,B,C]
function unshuffle3(code, r0, r1, r2) { const m = code % 3; const o = [0, 0, 0]; if (m === 0) { o[0] = r0; o[1] = r1; o[2] = r2; } else if (m === 1) { o[1] = r0; o[2] = r1; o[0] = r2; } else { o[2] = r0; o[0] = r1; o[1] = r2; } return o; }
function shuffle2(code, a, b) { return (code % 2) === 0 ? [a, b] : [b, a]; }
function unshuffle2(code, r0, r1) { const o = [0, 0]; if ((code % 2) === 0) { o[0] = r0; o[1] = r1; } else { o[1] = r0; o[0] = r1; } return o; }

// 移动。code==0: 明文 Dir,X,Y。code!=0: SHUFFLE_3 of base[X,Y,Dir], 每字节 ^code。
export function encCGMove({ dir, x, y }) {
  const w = new Writer();
  if (_code === 0) { w.u8(dir).u8(x).u8(y); }
  else {
    const [b0, b1, b2] = shuffle3(_code, x ^ _code, y ^ _code, dir ^ _code); // base 序 X,Y,Dir
    w.u8(b0).u8(b1).u8(b2);
  }
  return gframe(PACKET.CG_MOVE, w.build());
}

// 普攻 CG_ATTACK(15)。code==0: 明文 ObjectID(u32),X,Y,Dir。code!=0: 每值 ^code + SHUFFLE_4 字段序。
// ⚠ 服务端 Encrypter::convert 对多字节值是「整值 ^ code」(m_uintCode=(uint)code, 只低字节受影响),
//   不是逐字节异或!u8 字段(X/Y/Dir)恰好等价, 但 u32 ObjectID 必须只异或低字节(targetID ^ code)。
// SHUFFLE_4(A=ObjID,B=X,C=Y,D=Dir): 0=ABCD 1=BCDA 2=CDAB 3=DACB(复刻 SHUFFLE_STATEMENT_4)。
export function encCGAttack({ targetID, x, y, dir }) {
  const w = new Writer();
  if (_code === 0) { w.u32(targetID >>> 0).u8(x).u8(y).u8(dir); }
  else {
    const c = _code;
    const oid = (targetID ^ c) >>> 0, X = x ^ c, Y = y ^ c, D = dir ^ c;
    const A = () => w.u32(oid), B = () => w.u8(X), C = () => w.u8(Y), D2 = () => w.u8(D);
    const m = c % 4;
    if (m === 0) { A(); B(); C(); D2(); }
    else if (m === 1) { B(); C(); D2(); A(); }
    else if (m === 2) { C(); D2(); A(); B(); }
    else { D2(); A(); C(); B(); }
  }
  return gframe(PACKET.CG_ATTACK, w.build());
}

// ───── 物品/背包/装备 操作(CG) ─────
// ★加密注意(已逐包核对服务端 read): CG 4/7/8 服务端按明文读(无加密分支)→ 即使 in-world code≠0 也必须明文发;
//   3/10 加密(整值^code 仅低字节, 无 shuffle); 12 SHUFFLE_5; 13 SHUFFLE_3。每字段按其宽度异或低字节。

// 拾取地面→背包格 CGAddZoneToInventory(12)。SHUFFLE_5(A=ObjID u32,B=ZoneX,C=ZoneY,D=InvenX,E=InvenY)。
export function encCGAddZoneToInventory({ objectID, zoneX, zoneY, invenX, invenY }) {
  const w = new Writer();
  if (_code === 0) { w.u32(objectID >>> 0).u8(zoneX).u8(zoneY).u8(invenX).u8(invenY); }
  else {
    const c = _code;
    const A = () => w.u32((objectID ^ c) >>> 0), B = () => w.u8(zoneX ^ c), C = () => w.u8(zoneY ^ c), D = () => w.u8(invenX ^ c), E = () => w.u8(invenY ^ c);
    const m = c % 5;
    if (m === 0) { A(); B(); C(); D(); E(); }
    else if (m === 1) { B(); C(); D(); E(); A(); }
    else if (m === 2) { C(); D(); E(); A(); B(); }
    else if (m === 3) { D(); E(); B(); A(); C(); }
    else { E(); C(); D(); A(); B(); }
  }
  return gframe(PACKET.CG_ADD_ZONE_TO_INVENTORY, w.build());
}
// 拾取地面→光标 CGAddZoneToMouse(13)。SHUFFLE_3(A=ObjID,B=ZoneX,C=ZoneY)。
export function encCGAddZoneToMouse({ objectID, zoneX, zoneY }) {
  const w = new Writer();
  if (_code === 0) { w.u32(objectID >>> 0).u8(zoneX).u8(zoneY); }
  else {
    const c = _code;
    const A = () => w.u32((objectID ^ c) >>> 0), B = () => w.u8(zoneX ^ c), C = () => w.u8(zoneY ^ c);
    const m = c % 3;
    if (m === 0) { A(); B(); C(); } else if (m === 1) { B(); C(); A(); } else { C(); A(); B(); }
  }
  return gframe(PACKET.CG_ADD_ZONE_TO_MOUSE, w.build());
}
// 背包格→光标 CGAddInventoryToMouse(4) / 光标→背包格 CGAddMouseToInventory(8)。★服务端明文读, 永远明文发。
export function encCGAddInventoryToMouse({ objectID, invenX, invenY }) {
  return gframe(PACKET.CG_ADD_INVENTORY_TO_MOUSE, new Writer().u32(objectID >>> 0).u8(invenX).u8(invenY).build());
}
export function encCGAddMouseToInventory({ objectID, invenX, invenY }) {
  return gframe(PACKET.CG_ADD_MOUSE_TO_INVENTORY, new Writer().u32(objectID >>> 0).u8(invenX).u8(invenY).build());
}
// 光标→装备槽(穿) CGAddMouseToGear(7)。★服务端明文读, 永远明文发。
export function encCGAddMouseToGear({ objectID, slotID }) {
  return gframe(PACKET.CG_ADD_MOUSE_TO_GEAR, new Writer().u32(objectID >>> 0).u8(slotID).build());
}
// 装备槽→光标(卸) CGAddGearToMouse(3)。加密(整值^code 仅低字节, 无 shuffle)。
export function encCGAddGearToMouse({ objectID, slotID }) {
  const w = new Writer();
  if (_code === 0) w.u32(objectID >>> 0).u8(slotID);
  else w.u32((objectID ^ _code) >>> 0).u8(slotID ^ _code);
  return gframe(PACKET.CG_ADD_GEAR_TO_MOUSE, w.build());
}
// 光标→地面(丢) CGAddMouseToZone(10)。加密(ObjID^code, 无 shuffle)。
export function encCGAddMouseToZone({ objectID }) {
  const w = new Writer();
  if (_code === 0) w.u32(objectID >>> 0); else w.u32((objectID ^ _code) >>> 0);
  return gframe(PACKET.CG_ADD_MOUSE_TO_ZONE, w.build());
}

// 点 NPC 对话 CGNPCTalk(55)。★服务端明文读(无加密分支)→ 明文发 ObjectID u32。
export function encCGNPCTalk(objectID) {
  return gframe(PACKET.CG_NPC_TALK, new Writer().u32(objectID >>> 0).build());
}
// 商店(全部明文)。请求商品列表 CGShopRequestList(101): ObjID u32+RackType u8。
export function encCGShopRequestList({ objectID, rackType = 0 }) {
  return gframe(PACKET.CG_SHOP_REQUEST_LIST, new Writer().u32(objectID >>> 0).u8(rackType).build());
}
// 购买 CGShopRequestBuy(100): ObjID u32+RackType u8+RackIndex u8+Num u8+X u8+Y u8(放入背包格)。
export function encCGShopRequestBuy({ objectID, rackType = 0, rackIndex, num = 1, x, y }) {
  return gframe(PACKET.CG_SHOP_REQUEST_BUY, new Writer().u32(objectID >>> 0).u8(rackType).u8(rackIndex).u8(num).u8(x).u8(y).build());
}
// 出售 CGShopRequestSell(102): ObjID u32+ItemObjID u32+OpCode u8(0=正常出售)。
export function encCGShopRequestSell({ objectID, itemObjectID, opCode = 0 }) {
  return gframe(PACKET.CG_SHOP_REQUEST_SELL, new Writer().u32(objectID >>> 0).u32(itemObjectID >>> 0).u8(opCode).build());
}

// 聊天(明文 UTF-8; 服务器只转发字节, 网页端之间中文可通)。消息字节 ≤128(服务器限制)。
export function encCGSay(message, color = 0) {
  let bytes = gbkEncode(message);                              // GBK 编码(与服务端/原版客户端一致, 中文不乱)
  if (bytes.length > 128) bytes = bytes.slice(0, 128);
  const w = new Writer();
  w.u32(color).u8(bytes.length).raw(bytes);
  return gframe(PACKET.CG_SAY, w.build());
}

// PCSlayerInfo3::read 的精确线格式(明文)。只解到 AdvancementLevel(渲染所需),
// 尾部 EffectInfo/PetInfo/NicknameInfo/StoreOutlook 由分帧 size 兜底, 忽略。
// 类型: ObjectID=u32, Coord/Dir=u8, Color=u16(×9), HP=u16, Alignment=i32(有符号),
// MasterEffectColor/AttackSpeed/Competence/Rank/AdvancementLevel=u8, GuildID=u16, UnionID=u32。
function readSlayerInfo(r) {
  const o = {};
  o.objectID = r.u32();
  const n = r.u8(); const nb = []; for (let i = 0; i < n; i++) nb.push(r.u8());
  o.name = gbkDecode(Uint8Array.from(nb));
  o.x = r.u8(); o.y = r.u8(); o.dir = r.u8();
  o.outlook = r.u32();
  o.sex = (o.outlook & 1) ? 0 : 1;        // SLAYER_BIT_SEX=0: 1=MALE(男) → sex=0 男 / 1 女
  o.colors = []; for (let i = 0; i < 9; i++) o.colors.push(r.u16()); // SLAYER_COLOR_MAX=9
  o.masterEffectColor = r.u8();
  o.curHP = r.u16(); o.maxHP = r.u16();
  o.attackSpeed = r.u8();
  o.alignment = r.i32();
  o.competence = r.u8();
  o.guildID = r.u16();
  o.unionID = r.u32();
  o.rank = r.u8();
  o.advancementLevel = r.u8();
  o.race = "slayer";
  return o;
}

// PCVampireInfo3 / PCOustersInfo3 前缀(明文): objectID(u32), name, x,y,dir(u8), sex(u8 显式字节)。
// 与 Slayer 不同(Slayer sex 在 outlook 位)。渲染只需这些; 后续字段(coat/colors/HP...)忽略, 由分帧 size 兜底。
function readVampOustInfo(r, race) {
  const o = { race };
  o.objectID = r.u32();
  const n = r.u8(); const nb = []; for (let i = 0; i < n; i++) nb.push(r.u8());
  o.name = gbkDecode(Uint8Array.from(nb));
  o.x = r.u8(); o.y = r.u8(); o.dir = r.u8();
  o.sex = (r.u8() & 1) ? 0 : 1;   // ★服务端 Sex2String={FEMALE,MALE} → MALE=1; 我们 sex=0 男 → 须反转
  return o;
}

// GC_ADD_MONSTER(183, 明文): ObjectID u32, MonsterType u16(=精灵类型), nameLen u8+name, MainColor u16, SubColor u16,
//   X u8, Y u8, Dir u8, EffectInfo(ListNum u8 + ListNum*2 个 u16), CurHP u16, MaxHP u16, FromFlag u8。
function readMonster(r) {
  const o = { kind: "monster" };
  o.objectID = r.u32();
  o.spriteType = r.u16();
  const n = r.u8(); const nb = []; for (let i = 0; i < n; i++) nb.push(r.u8());
  o.name = gbkDecode(Uint8Array.from(nb));
  o.mainColor = r.u16(); o.subColor = r.u16();
  o.x = r.u8(); o.y = r.u8(); o.dir = r.u8();
  const ln = r.u8(); for (let i = 0; i < ln * 2; i++) r.u16();   // EffectInfo: ListNum + ListNum*2 个 WORD, 跳过
  o.curHP = r.u16(); o.maxHP = r.u16(); r.u8();                  // FromFlag 忽略
  return o;
}
// GC_ADD_NPC(189, 明文): ObjectID u32, nameLen u8+name, NPCID u16, SpriteType u16, MainColor u16, SubColor u16,
//   X u8, Y u8, Dir u8。
function readNPC(r) {
  const o = { kind: "npc" };
  o.objectID = r.u32();
  const n = r.u8(); const nb = []; for (let i = 0; i < n; i++) nb.push(r.u8());
  o.name = gbkDecode(Uint8Array.from(nb));
  o.npcID = r.u16(); o.spriteType = r.u16();
  o.mainColor = r.u16(); o.subColor = r.u16();
  o.x = r.u8(); o.y = r.u8(); o.dir = r.u8();
  return o;
}

// 跳过一个 PCItemInfo(GC_UPDATE_INFO 背包/装备项): ObjectID u32, IClass u8, ItemType u16,
// optSize u8 + opt*u8, Durability u32, Silver u16, Grade i32, Ench i8, ItemNum u8, MainColor u16,
// subCount u8 + sub*(ObjID u32+IClass u8+ItemType u16+ItemNum u8+SlotID u8 =9)。
// PCItemInfo::read 精确字段序(背包/装备/extra/摩托 共用本体; 尾部坐标各异由调用方读)。
// 核对 research/server/src/Core/PCItemInfo.cpp: ObjectID u32, IClass u8, ItemType u16,
//   optSize u8+opt*u8, Durability u32, Silver u16, Grade i32, Ench i8, ItemNum u8, MainColor u16,
//   subCount u8 + sub*{ObjID u32,IClass u8,ItemType u16,ItemNum u8,SlotID u8}(9字节)。
function readPCItem(r) {
  const it = { objectID: r.u32(), itemClass: r.u8(), itemType: r.u16() };
  const opt = r.u8(); it.options = []; for (let i = 0; i < opt; i++) it.options.push(r.u8());
  it.durability = r.u32(); it.silver = r.u16(); it.grade = r.i32();
  it.enchant = (r.u8() << 24 >> 24); it.num = r.u8(); it.mainColor = r.u16();   // enchant 有符号 i8
  const sub = r.u8(); it.sub = []; for (let i = 0; i < sub; i++) it.sub.push({ objectID: r.u32(), itemClass: r.u8(), itemType: r.u16(), num: r.u8(), slotID: r.u8() });
  return it;
}
function skipPCItem(r) { readPCItem(r); }   // 不需结构的位置(extra/摩托)仍丢弃
// 完整推进 PCSlayerInfo2(GC_UPDATE_INFO 用的玩家完整信息, 非 GC_ADD 的 Info3)。
// 已对真实包逐字段核对: objID,name, sex,hairStyle, hairColor/skinColor(u16), masterEffectColor(u8),
// alignment(i32), STR/DEX/INT 各[3]u16, rank(u8),rankExp(u32), STR/DEX/INTExp(u32×3),
// HP[2]u16,MP[2]u16, fame(u32),gold(u32), 6×{domainLevel(u8)+domainExp(u32)}, sight(u8), hotkey[4]u16,
// competence(u8), guildID(u16), guildName(u8+), guildMemberRank(u8), unionID(u32), advLevel(u8), advGoalExp(u32), attrBonus(u16)。
function readSlayerInfo2(r) {
  r.u32(); const n = r.u8(); for (let i = 0; i < n; i++) r.u8();
  r.u8(); r.u8(); r.u16(); r.u16(); r.u8(); const alignment = r.i32();
  // STR/DEX/INT 各[BASIC,CURRENT,MAX]; 取 CURRENT(下标1) 作显示值, MAX(下标2) 作上限
  const sB = r.u16(), sC = r.u16(), sM = r.u16(), dB = r.u16(), dC = r.u16(), dM = r.u16(), iB = r.u16(), iC = r.u16(), iM = r.u16();
  r.u8(); r.u32(); const strExp = r.u32(), dexExp = r.u32(), intExp = r.u32();    // rank,rankExp, STR/DEX/INTExp
  const curHP = r.u16(), maxHP = r.u16(), curMP = r.u16(), maxMP = r.u16(); // HP[2],MP[2]
  const fame = r.u32(), gold = r.u32();          // fame,gold
  let level = 0; for (let i = 0; i < 6; i++) { const dl = r.u8(); r.u32(); if (dl > level) level = dl; } // Slayer 等级=六技能域最高级
  r.u8();                                         // sight
  for (let i = 0; i < 4; i++) r.u16();           // hotkey[4]
  r.u8(); r.u16();                               // competence,guildID
  const g = r.u8(); for (let i = 0; i < g; i++) r.u8(); // guildName
  r.u8(); r.u32(); r.u8(); r.u32(); r.u16();     // guildMemberRank,unionID,advLevel,advGoalExp,attrBonus
  // Slayer 无单一经验, 经验=分属性经验(strExp/dexExp/intExp 为到下一级所需)
  return { curHP, maxHP, curMP, maxMP, level, str: sC, dex: dC, int: iC, strMax: sM, dexMax: dM, intMax: iM, strExp, dexExp, intExp, fame, gold, alignment, race: "slayer" };
}
// 完整推进 PCVampireInfo2(GC_UPDATE_INFO 吸血鬼): objID,name, level(u8),sex(u8), batColor(u16),skinColor(u16),
// masterEffectColor(u8), alignment(i32), STR/DEX/INT 各[3]u16, HP[2]u16(无 MP), rank(u8),rankExp(u32),
// exp(u32),gold(u32),fame(u32), sight(u8), bonus(u16), hotkey[8]u16, silverDamage(u16), competence(u8),
// guildID(u16), guildName(u8+), guildMemberRank(u8), unionID(u32), advLevel(u8), advGoalExp(u32)。
function readVampireInfo2(r) {
  r.u32(); const n = r.u8(); for (let i = 0; i < n; i++) r.u8();
  const level = r.u8(); r.u8(); r.u16(); r.u16(); r.u8(); const alignment = r.i32(); // level,sex,batColor,skinColor,masterEffectColor,alignment
  const sB = r.u16(), sC = r.u16(), sM = r.u16(), dB = r.u16(), dC = r.u16(), dM = r.u16(), iB = r.u16(), iC = r.u16(), iM = r.u16();
  const curHP = r.u16(), maxHP = r.u16();         // HP[2] (吸血鬼无 MP)
  r.u8(); r.u32(); const exp = r.u32(), gold = r.u32(), fame = r.u32(); // rank,rankExp,exp,gold,fame
  r.u8(); const bonus = r.u16();                  // sight,bonus(自由加点)
  for (let i = 0; i < 8; i++) r.u16();            // hotkey[8]
  r.u16(); r.u8(); r.u16();                       // silverDamage,competence,guildID
  const g = r.u8(); for (let i = 0; i < g; i++) r.u8();
  r.u8(); r.u32(); r.u8(); r.u32();               // guildMemberRank,unionID,advLevel,advGoalExp
  // 吸血鬼: 单一 level + exp(到下一级所需 GoalExp) + bonus 自由加点
  return { curHP, maxHP, curMP: 0, maxMP: 0, level, str: sC, dex: dC, int: iC, strMax: sM, dexMax: dM, intMax: iM, exp, bonus, fame, gold, alignment, race: "vampire" };
}
// PCOustersInfo2: 单 hairColor(u16), HP[2]+MP[2], bonus+skillBonus, 无 hotkey。
function readOustersInfo2(r) {
  r.u32(); const n = r.u8(); for (let i = 0; i < n; i++) r.u8();
  const level = r.u8(); r.u8(); r.u16(); r.u8(); const alignment = r.i32(); // level,sex,hairColor,masterEffectColor,alignment
  const sB = r.u16(), sC = r.u16(), sM = r.u16(), dB = r.u16(), dC = r.u16(), dM = r.u16(), iB = r.u16(), iC = r.u16(), iM = r.u16();
  const curHP = r.u16(), maxHP = r.u16(), curMP = r.u16(), maxMP = r.u16(); // HP[2],MP[2]
  r.u8(); r.u32(); const exp = r.u32(), gold = r.u32(), fame = r.u32();     // rank,rankExp,exp,gold,fame
  r.u8(); const bonus = r.u16(), skillBonus = r.u16();                      // sight,bonus,skillBonus
  r.u16(); r.u8(); r.u16();                       // silverDamage,competence,guildID
  const g = r.u8(); for (let i = 0; i < g; i++) r.u8();
  r.u8(); r.u32(); r.u8(); r.u32();
  // 异界者: 单一 level + exp(GoalExp) + bonus + skillBonus
  return { curHP, maxHP, curMP, maxMP, level, str: sC, dex: dC, int: iC, strMax: sM, dexMax: dM, intMax: iM, exp, bonus, skillBonus, fame, gold, alignment, race: "ousters" };
}
// ModifyInfo 通用解析(GC_MODIFY_INFORMATION / GCAttackMeleeOK1·2 共用)。
// short 项{type,value u16}, long 项{type,value u32,wide}。★经验全在 long 项, 旧实现误丢弃。
// type 含义(服务端 ModifyInfo.h): 1/5/9=力/敏/智当前, 2/6/10=力/敏/智上限, 3/7/11=力/敏/智经验,
//   12~15=curHP/maxHP/curMP/maxMP, 22=名望, 23=金钱, 43=等级(吸/异), 47=加点, 50=吸血鬼经验,
//   53=善恶, 59=异界者经验, 60=异界者技能点, 24/27/30/33/36/39=Slayer 六技能域等级。
function readMods(r) {
  const mods = [];
  const sc = r.u8(); for (let i = 0; i < sc; i++) mods.push({ type: r.u8(), value: r.u16() });
  const lc = r.u8(); for (let i = 0; i < lc; i++) mods.push({ type: r.u8(), value: r.u32(), wide: true });
  return mods;
}

// 从 GC_UPDATE_INFO 解析玩家所在 ZoneID(开源在此包重载 zone)。pcType='S'/'V'/'O'(char)。三族完整解析(均对真实包核对)。
// 崩溃安全: 任何异常返回 null, 上层保持当前 zone, 绝不送错加密 code。
function readUpdateInfoZone(r) {
  const pcType = r.u8();
  let info;
  if (pcType === 83) info = readSlayerInfo2(r);          // 'S'
  else if (pcType === 86) info = readVampireInfo2(r);    // 'V'
  else if (pcType === 79) info = readOustersInfo2(r);    // 'O'
  else return null;
  const inventory = []; const inv = r.u8(); for (let i = 0; i < inv; i++) { const it = readPCItem(r); it.invenX = r.u8(); it.invenY = r.u8(); inventory.push(it); }
  const gear = []; const gn = r.u8(); for (let i = 0; i < gn; i++) { const it = readPCItem(r); it.slotID = r.u8(); gear.push(it); }
  const extra = r.u8(); for (let i = 0; i < extra; i++) skipPCItem(r);
  const eff = r.u8(); for (let i = 0; i < eff; i++) { r.u16(); r.u16(); } // EffectInfo 每项 2 个 WORD(对真实包核对)
  // m_hasMotorcycle(BYTE); 非 0 时跟 RideMotorcycleInfo —— 必须按开源线格式正确跳过, 不能放弃整包,
  // 否则有摩托的老角色换区拿不到新 ZoneID → 沿用旧区加密 code/地图 → 落到"墙外黑块"。
  // RideMotorcycleInfo::read = ObjectID(4)+ItemType(2)+optSize(1)+opt*1 + ListNum(1)+ListNum*(PCItemInfo + InvenX(1)+InvenY(1))。
  const moto = r.u8();
  if (moto) {
    r.u32(); r.u16();
    const opt = r.u8(); for (let i = 0; i < opt; i++) r.u8();
    const ln = r.u8(); for (let i = 0; i < ln; i++) { skipPCItem(r); r.u8(); r.u8(); }   // RideMotorcycleSlotInfo = PCItemInfo + InvenX + InvenY
  }
  // 开源 GCUpdateInfo::read 顺序: ZoneID(u16) → ZoneX(u8) → ZoneY(u8)。zoneX/zoneY = 换区临时落点(MoveZone 用)。
  return { zoneID: r.u16(), zoneX: r.u8(), zoneY: r.u8(), inventory, gear, ...info }; // ZoneID + 临时坐标 + 背包/装备 + HP/MP/等级…
}

// ───── LC_PC_LIST 各槽位的 base PCInfo 线格式(开源 PCSlayerInfo/PCVampireInfo/PCOustersInfo::read) ─────
// 逐字段对 C++ read() 核对(类型宽度查 types/CreatureTypes.h: Color/Attr/HP/MP/Bonus=WORD,
// Exp/Fame/Alignment=4字节, Rank/Level/Slot/Sex=BYTE)。返回选角所需 {slot,race,nameBytes,name,sex}。
function readName(r) { const n = r.u8(); const nb = []; for (let i = 0; i < n; i++) nb.push(r.u8()); return Uint8Array.from(nb); }
// Slayer: name,slot,alignment(4),STR/DEX/INT(2×3),Rank(1),3×Exp(4×3),HP/MP(2×4),Fame(4),
//   DomainLevels[6](1×6),outlook(4),Colors[7](2×7),AdvLevel(1)。sex 在 outlook 位0。
function readPCListSlayer(r) {
  const nb = readName(r); const slot = r.u8();
  r.i32(); r.u16(); r.u16(); r.u16(); r.u8(); r.u32(); r.u32(); r.u32();
  r.u16(); r.u16(); r.u16(); r.u16(); r.u32();
  for (let i = 0; i < 6; i++) r.u8();
  const outlook = r.u32();
  for (let i = 0; i < 7; i++) r.u16();
  r.u8();
  return { slot, race: "slayer", nameBytes: nb, name: gbkDecode(nb), sex: (outlook & 1) ? 0 : 1 };
}
// Vampire: name,slot,alignment(4),sex(1),BatColor(2),SkinColor(2),coatType(1),CoatColor(2),
//   STR/DEX/INT(2×3),HP(2×2),Level(1),Rank(1),Exp(4),Fame(4),Bonus(2),AdvLevel(1)。
function readPCListVampire(r) {
  const nb = readName(r); const slot = r.u8();
  r.i32(); const sex = (r.u8() & 1) ? 0 : 1;   // ★服务端 MALE=1 → 反转为我们 sex=0 男
  r.u16(); r.u16(); r.u8(); r.u16();
  r.u16(); r.u16(); r.u16(); r.u16(); r.u16();
  r.u8(); r.u8(); r.u32(); r.u32(); r.u16(); r.u8();
  return { slot, race: "vampire", nameBytes: nb, name: gbkDecode(nb), sex };
}
// Ousters: name,slot,alignment(4),sex(1),CoatColor/HairColor/ArmColor/BootsColor(2×4),shapeType(1),
//   STR/DEX/INT(2×3),HP(2×2),MP(2×2),Level(1),Rank(1),Exp(4),Fame(4),Bonus(2),SkillBonus(2),AdvLevel(1)。
function readPCListOusters(r) {
  const nb = readName(r); const slot = r.u8();
  r.i32(); const sex = (r.u8() & 1) ? 0 : 1;   // ★服务端 MALE=1 → 反转为我们 sex=0 男(魔灵虽单贴图, 仍保持一致)
  r.u16(); r.u16(); r.u16(); r.u16(); r.u8();
  r.u16(); r.u16(); r.u16(); r.u16(); r.u16(); r.u16(); r.u16();
  r.u8(); r.u8(); r.u32(); r.u32(); r.u16(); r.u16(); r.u8();
  return { slot, race: "ousters", nameBytes: nb, name: gbkDecode(nb), sex };
}

// ---- 解码(S→C) ----
export function decode(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const id = dv.getUint16(0, true);
  const size = dv.getUint32(2, true);
  const seq = dv.getUint8(6);
  const out = { id, name: NAME[id] || `UNKNOWN_${id}`, size, seq };
  const r = new Reader(u8, HEADER);
  try {
    if (id === PACKET.GC_SET_POSITION) { out.x = r.u8(); out.y = r.u8(); out.dir = r.u8(); } // 明文
    else if (id === PACKET.GC_SAY) { out.objectID = r.u32(); out.color = r.u32(); const n = r.u8(); const mb = []; for (let i = 0; i < n; i++) mb.push(r.u8()); out.message = gbkDecode(Uint8Array.from(mb)); }
    else if (id === PACKET.LC_LOGIN_OK) { out.isAdult = r.u8(); out.bFamily = r.u8(); out.stat = r.u8(); out.lastDays = r.u16(); }
    else if (id === PACKET.LC_LOGIN_ERROR) { out.errorID = r.u8(); }
    else if (id === PACKET.LC_CREATE_PC_ERROR) { out.errorID = r.u8(); }
    else if (id === PACKET.LC_CREATE_PC_OK) { out.ok = true; } // 成功; 角色已建, 随后重拉 PC 列表
    else if (id === PACKET.LC_DELETE_PC_OK) { out.ok = true; }  // 删除成功(空体), 随后重拉 PC 列表
    else if (id === PACKET.LC_DELETE_PC_ERROR) { out.errorID = r.u8(); }
    else if (id === PACKET.LC_RECONNECT) { const n = r.u8(); out.gameServerIP = r.str(n); out.gameServerPort = r.u32(); out.key = r.u32(); }
    // 角色列表(开源 LCPCList): SLOT_MAX(3) 个种族标记字节 'S'/'V'/'O'/'0', 随后按顺序跟各占用槽的
    // 完整 PCInfo(base)。忠实解析出每个角色的 {slot,race,name,sex} → 客户端用服务端数据选角(不再依赖本地缓存)。
    else if (id === PACKET.LC_PC_LIST) {
      const types = []; for (let i = 0; i < 3; i++) types.push(String.fromCharCode(r.u8()));
      out.slots = types; out.chars = [];
      for (const t of types) {
        if (t === "S") out.chars.push(readPCListSlayer(r));
        else if (t === "V") out.chars.push(readPCListVampire(r));
        else if (t === "O") out.chars.push(readPCListOusters(r));
      }
      out.hasChar = out.chars.length > 0;
    }
    else if (id === PACKET.GC_MOVE_OK) {
      if (_code === 0) { out.x = r.u8(); out.y = r.u8(); out.dir = r.u8(); }
      else { const [X, Y, D] = unshuffle3(_code, r.u8(), r.u8(), r.u8()); out.x = X ^ _code; out.y = Y ^ _code; out.dir = D ^ _code; }
    } else if (id === PACKET.GC_MOVE_ERROR) {
      if (_code === 0) { out.x = r.u8(); out.y = r.u8(); }
      else { const [X, Y] = unshuffle2(_code, r.u8(), r.u8()); out.x = X ^ _code; out.y = Y ^ _code; }
    }
    // 他人移动(明文): ObjectID(4)+X+Y+Dir
    else if (id === PACKET.GC_MOVE) { out.objectID = r.u32(); out.x = r.u8(); out.y = r.u8(); out.dir = r.u8(); }
    // 他人离开视野(明文): ObjectID(4)
    else if (id === PACKET.GC_DELETE_OBJECT) { out.objectID = r.u32(); }
    // 视野内出现其他玩家(明文)。三族各自信息结构, 取渲染所需前缀。
    else if (id === PACKET.GC_ADD_SLAYER) { out.creature = readSlayerInfo(r); }
    else if (id === PACKET.GC_ADD_VAMPIRE) { out.creature = readVampOustInfo(r, "vampire"); }
    else if (id === PACKET.GC_ADD_OUSTERS) { out.creature = readVampOustInfo(r, "ousters"); }
    else if (id === PACKET.GC_ADD_MONSTER) { out.creature = readMonster(r); }
    else if (id === PACKET.GC_ADD_NPC) { out.creature = readNPC(r); }
    // 近战命中确认(给攻击者): TargetObjectID + ModifyInfo(攻击者自身属性变化, short{type,value u16}+long{type,value u32})
    else if (id === PACKET.GC_ATTACK_MELEE_OK_1) { out.objectID = r.u32(); out.mods = readMods(r); }   // 命中确认 + 自身属性/经验变化
    // 被怪攻击(给被击玩家): 攻击者ObjectID + ModifyInfo(我方HP变化)。结构同 OK1。
    else if (id === PACKET.GC_ATTACK_MELEE_OK_2) { out.objectID = r.u32(); out.mods = readMods(r); }
    else if (id === PACKET.GC_ATTACK_MELEE_OK_3) { out.objectID = r.u32(); out.targetID = r.u32(); }                 // 旁观者: 攻击者→目标, 播攻击动画
    else if (id === PACKET.GC_STATUS_CURRENT_HP) { out.objectID = r.u32(); out.curHP = r.u16(); }                    // 被击者新HP→血条+伤害飘字
    else if (id === PACKET.GC_ADD_MONSTER_CORPSE) { out.objectID = r.u32(); }                                        // 怪死→移除活体
    // 入世/换区信息: 解析所在 ZoneID + 自身 HP/MP(三族)。失败 zoneID=null → 上层回退, 不送错 code。明文。
    else if (id === PACKET.GC_UPDATE_INFO) {
      try { const u = readUpdateInfoZone(r); if (u) Object.assign(out, u); else out.zoneID = null; }   // u 含 zone+HP/MP+level/exp/STR/DEX/INT
      catch { out.zoneID = null; }
    }
    // 属性变化(HP/MP/经验/等级/属性…): short+long 全收集(经验在 long), 上层按 type 分发。
    else if (id === PACKET.GC_MODIFY_INFORMATION) { out.mods = readMods(r); }
    // ── 物品/背包/装备 ──
    // GCCreateItem(224): 物品入背包格。字段≠PCItemInfo(无 MainColor/sub), 尾随 InvenX,InvenY。
    else if (id === PACKET.GC_CREATE_ITEM) {
      const it = { objectID: r.u32(), itemClass: r.u8(), itemType: r.u16() };
      const opt = r.u8(); it.options = []; for (let i = 0; i < opt; i++) it.options.push(r.u8());
      it.durability = r.u32(); it.silver = r.u16(); it.grade = r.i32(); it.enchant = (r.u8() << 24 >> 24); it.num = r.u8();
      it.invenX = r.u8(); it.invenY = r.u8(); out.item = it;
    }
    else if (id === PACKET.GC_DELETE_INVENTORY_ITEM) { out.objectID = r.u32(); }                          // 删背包格物品
    else if (id === PACKET.GC_ADD_GEAR_TO_INVENTORY) { out.slotID = r.u8(); out.invenX = r.u8(); out.invenY = r.u8(); } // 卸装: 槽SlotID→背包(X,Y)
    else if (id === PACKET.GC_DELETE_AND_PICKUP_OK) { out.objectID = r.u32(); }                            // 拾取确认: 移除地面物件
    else if (id === PACKET.GC_CANNOT_ADD) { out.objectID = r.u32(); }                                      // 操作失败: 回滚
    // 地面新掉落 GCAddNewItemToZone(187): 前5字段 SHUFFLE_5(ObjID u32,X u8,Y u8,IClass u8,IType u16, 各^code),
    //   其余明文: optSize+opt, Silver u16, Grade i32, Durability u32, Ench i8, ItemNum u8, subCount+sub(9B)。
    //   ★字段序 Silver,Grade,Durability(≠PCItemInfo), 无 MainColor。
    else if (id === PACKET.GC_ADD_NEW_ITEM_TO_ZONE || id === PACKET.GC_ADD_ITEM_TO_ZONE) {
      const c = _code;
      const rU32 = () => (c ? ((r.u32() ^ c) >>> 0) : r.u32());
      const rU16 = () => (c ? ((r.u16() ^ c) & 0xffff) : r.u16());
      const rU8 = () => (c ? ((r.u8() ^ c) & 0xff) : r.u8());
      let A, B, C, D, E;   // A=ObjID,B=X,C=Y,D=IClass,E=IType
      const rA = () => (A = rU32()), rB = () => (B = rU8()), rC = () => (C = rU8()), rD = () => (D = rU8()), rE = () => (E = rU16());
      const m = c % 5;
      if (m === 0) { rA(); rB(); rC(); rD(); rE(); }
      else if (m === 1) { rB(); rC(); rD(); rE(); rA(); }
      else if (m === 2) { rC(); rD(); rE(); rA(); rB(); }
      else if (m === 3) { rD(); rE(); rB(); rA(); rC(); }
      else { rE(); rC(); rD(); rA(); rB(); }
      out.objectID = A; out.x = B; out.y = C; out.itemClass = D; out.itemType = E;
      const opt = r.u8(); out.options = []; for (let i = 0; i < opt; i++) out.options.push(r.u8());
      out.silver = r.u16(); out.grade = r.i32(); out.durability = r.u32(); out.enchant = (r.u8() << 24 >> 24); out.num = r.u8();
      const sub = r.u8(); out.sub = []; for (let i = 0; i < sub; i++) out.sub.push({ objectID: r.u32(), itemClass: r.u8(), itemType: r.u16(), num: r.u8(), slotID: r.u8() });
    }
    // ── NPC 交互 ──
    // NPC 动态对话(服务端直发 GBK 中文): ObjectID + szMsg + Message。这是 M3 对话的主体, 不依赖 dpk。
    else if (id === PACKET.GC_NPC_SAY_DYNAMIC) {
      out.objectID = r.u32(); const n = r.u8(); const mb = []; for (let i = 0; i < n; i++) mb.push(r.u8()); out.message = gbkDecode(mb);
    }
    // NPC 响应码: Code u16 (+Parameter u32, 按包长判断——某些 Code 才带)。Code=10 关对话框。
    else if (id === PACKET.GC_NPC_RESPONSE) { out.code = r.u16(); if (size >= 6) out.parameter = r.u32(); }
    // NPC 脚本菜单/静态文本: 文本按 ScriptID 查客户端 NPCScript.inf(锁 dpk) → 仅解析结构, 文本暂缺。
    else if (id === PACKET.GC_NPC_ASK) { out.objectID = r.u32(); out.scriptID = r.u32(); out.npcID = r.u16(); }
    else if (id === PACKET.GC_NPC_SAY) { out.objectID = r.u32(); out.scriptID = r.u32(); out.subjectID = r.u8(); }
    // ── 商店 ──
    // 商品列表: ObjID u32+Version i32+RackType u8+件数 u8 + 每件{idx u8, item, 价格 silver} + 市价 i16×2 + ShopType u8。
    else if (id === PACKET.GC_SHOP_LIST) {
      out.objectID = r.u32(); out.version = r.i32(); out.rackType = r.u8();
      const n = r.u8(); out.items = [];
      for (let i = 0; i < n; i++) {
        const it = { index: r.u8(), objectID: r.u32(), itemClass: r.u8(), itemType: r.u16() };
        const opt = r.u8(); it.options = []; for (let j = 0; j < opt; j++) it.options.push(r.u8());
        it.durability = r.u32(); it.silver = r.u16(); it.grade = r.i32(); it.enchant = (r.u8() << 24 >> 24);
        out.items.push(it);
      }
      out.marketCondBuy = (r.u16() << 16 >> 16); out.marketCondSell = (r.u16() << 16 >> 16); out.shopType = r.u8(); // MarketCond i16
    }
    else if (id === PACKET.GC_SHOP_BUY_OK || id === PACKET.GC_SHOP_SELL_OK) { out.ok = true; }                  // 成功(物品/金钱走 GCCreateItem/GC_MODIFY)
    else if (id === PACKET.GC_SHOP_BUY_FAIL) { out.objectID = r.u32(); out.code = r.u8(); out.amount = r.u32(); out.ok = false; } // code: 0金钱不足/1空间不足/4物品不存在
    else if (id === PACKET.GC_SHOP_SELL_FAIL) { out.ok = false; }
  } catch (e) { out._err = e.message; }
  return out;
}

// 流式分帧(处理 TCP 粘包/拆包 over WS)
export class Framer {
  constructor(onPacket) { this.buf = new Uint8Array(0); this.on = onPacket; }
  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf); merged.set(chunk, this.buf.length);
    this.buf = merged;
    for (;;) {
      if (this.buf.length < HEADER) return;
      const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
      const size = dv.getUint32(2, true);
      const total = HEADER + size;
      if (this.buf.length < total) return;
      const pkt = this.buf.slice(0, total);
      this.buf = this.buf.slice(total);
      this.on(pkt);
    }
  }
}
