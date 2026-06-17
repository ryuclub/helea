// 抽取 Action.inf → skillType(=ACTIONINFO 枚举值=记录序) → EFFECTSTATUS(技能命中播的状态特效)。
// 忠实开源 MActionInfo::LoadFromFile(MActionInfoTable.cpp:359) + CTypeTable::LoadFromFile(u32 count + 记录)。
// 表头: minResultActionInfo u32 + maxResultActionInfo u32 + count u32(CTypeTable), 然后 count 条 MActionInfo。
// 记录顺序逐字段(见源码), m_EffectStatus 是其中一个 u16; flag&0x2 时多读 5×u32(ActionStep); 末尾嵌套 CTypeTable<ACTION_INFO_NODE>(u32 count + 节点×14B)。
// EFFECTSTATUS_NULL=491(无效果); EffectStatus.inf 有效项 <490。输出仅含有效 es 的技能。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const INF = path.join(ROOT, "DARKEDEN/Data/Info/Action.inf");
const OUT = path.join(import.meta.dirname, "..", "public", "assets", "skilleffect.json");
const NODE_SIZE = 14;          // ACTION_INFO_NODE: EffGenID2+EffSprType2+Step2+Count2+LinkCount2+SoundID2+bDelay1+bResult1
const EFFECT_NULL = 491, EFFECT_MAX = 490;

const buf = fs.readFileSync(INF);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let p = 0;
const u8 = () => dv.getUint8(p++);
const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };

const minR = u32(), maxR = u32(), count = u32();      // 表头 12B
const map = {};
let parsed = 0, withEff = 0, bad = 0;
for (let id = 0; id < count; id++) {
  if (p + 4 > buf.length) { bad++; break; }
  const nlen = u32(); if (nlen > 256 || p + nlen > buf.length) { bad++; break; }
  p += nlen;                                          // name
  u8();                                               // m_Action
  u16(); u16();                                       // ActionEffectSpriteType, Female
  u8();                                               // bUseRepeatFrame
  p += 3 * 5 * 4;                                     // 3×{Start,CastStart,CastFrames,RepStart,RepEnd} u32
  u16();                                              // RepeatLimit
  u8(); u32(); u8();                                  // bCastingEffectToSelf, CastingActionInfo, bCastingAction
  u8(); u8(); u8(); u8(); u16(); u8(); u8();          // Range,fTarget,fStart,fUserType,fWeaponType(2),fCurrentWeapon,fOption
  u32();                                              // PlusActionInfo
  u8();                                               // PacketType
  u16(); u32();                                       // Delay, Value
  u16();                                              // SoundID
  u32();                                              // MainNode
  u16(); u32();                                       // ActionResultID, ActionResultValue
  const es = u16();                                   // ★m_EffectStatus
  u8(); u8();                                         // bAttack, fSelectCreature
  const flag = u8();
  if (flag & 0x2) p += 5 * 2;                         // ActionStep[5] TYPE_ACTIONINFO=u16(2)
  u16(); u8(); u8();                                  // Parent(TYPE_ACTIONINFO=u16), MasterySkillStep, bIgnoreFailDelay
  const nodeCount = u32(); p += nodeCount * NODE_SIZE; // 嵌套 ACTION_INFO_NODE 表
  if (p > buf.length) { bad++; break; }
  parsed++;
  if (es !== EFFECT_NULL && es > 0 && es < EFFECT_MAX) { map[id] = es; withEff++; }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(map));
console.log(`表头 min=${minR} max=${maxR} count=${count}; 解析 ${parsed} 条, 终点 p=${p}/${buf.length}${p === buf.length ? " (干净到EOF✓)" : " ⚠未到EOF"}, 异常=${bad}`);
console.log(`有效果技能 ${withEff} 个 → ${OUT}`);
// 抽样: 几个有特效的技能 skillType→es
const sample = Object.entries(map).slice(0, 10).map(([k, v]) => `${k}→es${v}`).join(" ");
console.log("抽样:", sample || "(无)");
console.log("melee(skill0) es:", map[0] ?? "NULL(无效果, 正确)");
