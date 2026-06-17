// 抽取 Creature.inf → 每生物的 Height(头顶血条/名字定位用, 忠实开源 GetHeight) + HPBarWidth + DeadHeight。
// 忠实开源 CREATURETABLE_INFO::LoadFromFile (research/client/Client/MCreatureTable.cpp:314)。
// 记录格式(顺序):
//   Name: MString = u32 len + len 字节(GBK)
//   stcount u32 + stcount×u32 (SpriteTypes)  —— vampire 用 SpriteTypes[0]==204 判定动作数
//   bMale u8, tribe u8, MoveTimes u8, MoveRatio u8, MoveTimesMotor u8
//   Height i32, DeadHeight i32, DeadActionInfo u16, ColorSet i32, bFlyingCreature u8,
//   FlyingHeight i32, bHeadCut i32, HPBarWidth i32, ChangeColorSet u16, ShadowCount u16
//   actionMax×u16 (ActionSound) + actionMax×i32 (ActionCount)   —— actionMax 由 tribe 决定
//   bExistItemWearInfo u8; 若 true → ITEM_WEARINFO 23 字节(8×u16 + 7×u8)
// tribe: 0=SLAYER 1=VAMPIRE 2=NPC 3=SLAYER_NPC 4=OUSTERS 5=OUSTERS_NPC
// actionMax: SLAYER/SLAYER_NPC=35, OUSTERS/OUSTERS_NPC=18, NPC=11, VAMPIRE=(SpriteTypes[0]==204?18:11)
// 文件头: offset 0 起 4 字节(表项数), 记录从 offset 4 开始。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const INF = path.join(ROOT, "DARKEDEN/Data/Info/Creature.inf");
const OUT = path.join(import.meta.dirname, "..", "public", "assets", "creatureinfo.json");

const A_SLAYER = 35, A_VAMPIRE = 11, A_OUSTERS = 18;
const gbk = new TextDecoder("gbk");

const buf = fs.readFileSync(INF);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let p = 0;
const head = dv.getUint32(0, true); p = 4;          // 表头(项数, 仅记录; 解析到 EOF 为准)

const u8 = () => dv.getUint8(p++);
const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };

function actionMax(tribe, sprite0) {
  if (tribe === 0 || tribe === 3) return A_SLAYER;
  if (tribe === 4 || tribe === 5) return A_OUSTERS;
  if (tribe === 2) return A_VAMPIRE;
  if (tribe === 1) return sprite0 === 204 ? A_OUSTERS : A_VAMPIRE;
  return 0;
}

const byName = {}, byIndex = [];
let idx = 0, bad = 0;
while (p < buf.length) {
  const nlen = u32(); if (nlen < 0 || nlen > 256 || p + nlen > buf.length) { bad++; break; }
  const name = gbk.decode(buf.subarray(p, p + nlen)); p += nlen;
  const stc = u32(); if (stc > 64 || p + stc * 4 > buf.length) { bad++; break; }
  const sp = []; for (let i = 0; i < stc; i++) sp.push(u32());
  u8(); const tribe = u8(); u8(); u8(); u8();          // bMale,tribe,MoveTimes,MoveRatio,MoveTimesMotor
  const Height = i32(), DeadHeight = i32();
  u16();                                              // DeadActionInfo
  i32();                                              // ColorSet
  u8();                                              // bFlyingCreature
  i32();                                              // FlyingHeight
  i32();                                              // bHeadCut
  const HPBarWidth = i32();
  u16(); u16();                                       // ChangeColorSet, ShadowCount
  const am = actionMax(tribe, sp[0]);
  if (am === 0 && tribe > 5) { bad++; break; }
  p += am * 2;                                        // ActionSound
  p += am * 4;                                        // ActionCount
  const wear = u8();                                  // bExistItemWearInfo
  if (wear) p += 23;                                  // ITEM_WEARINFO
  if (Height < 0 || Height > 4096 || p > buf.length) { bad++; break; }
  byName[name] = { h: Height, dh: DeadHeight, bw: HPBarWidth };
  byIndex.push({ i: idx, name, tribe, h: Height, bw: HPBarWidth });
  idx++;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ byName }));
console.log(`表头项数=${head}, 解析记录 ${idx}, 终点 p=${p}/${buf.length}${p === buf.length ? " (干净到EOF✓)" : " ⚠未到EOF"}, 异常截断=${bad}`);
console.log("→", OUT);
for (const nm of ["SlayerMale", "SlayerFemale", "VampireMale1", "Ousters"]) if (byName[nm]) console.log(`  ${nm}: Height=${byName[nm].h} DeadHeight=${byName[nm].dh} HPBarWidth=${byName[nm].bw}`);
console.log("  前6条:", byIndex.slice(0, 6).map((r) => `${r.name}(t${r.tribe} h${r.h})`).join(" "));
console.log("  Height 范围:", Math.min(...byIndex.map((r) => r.h)), "~", Math.max(...byIndex.map((r) => r.h)));
