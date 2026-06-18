// 抽取 SkillType → {图标精灵下标, 中文名, 英文名} 表 → public/assets/skillinfo.json。
// 忠实来源:
//   SkillType 数值 = 服务端权威枚举 research/server/.../skill/Skill.h `enum SkillTypes`(GC_SKILL_INFO 下发的就是这套值)。
//   图标下标(SkillIcon.spk)+中文名 = 客户端硬编码表 research/client/Client/MSkillInfoTable.cpp:
//     m_pTypeInfo[枚举名].Set(level, "英文名", x, y, spriteID, "GBK中文名")  —— 第5参=spriteID, 第6参=GBK中文名。
//   按【枚举名】join(两端枚举名一致的才输出) → key=服务端SkillType值。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const SKILL_H = path.join(ROOT, "research/server/src/server/gameserver/skill/Skill.h");
const TABLE = path.join(ROOT, "research/client/Client/MSkillInfoTable.cpp");
const OUT = path.join(import.meta.dirname, "..", "public", "assets", "skillinfo.json");

// 1) 解析服务端 enum SkillTypes → 枚举名→数值(C 枚举自增, 处理显式 = N, 去预处理/注释)。
function parseServerEnum(src) {
  const m = src.match(/enum\s+SkillTypes\s*\{([\s\S]*?)\}/);
  if (!m) throw new Error("找不到 enum SkillTypes");
  const body = m[1];
  const map = new Map(); let val = 0;
  for (let line of body.split("\n")) {
    line = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");   // 去注释
    if (/^\s*#/.test(line)) continue;                                       // 去预处理(无 #else, 直接含入)
    for (const tok of line.split(",")) {
      const t = tok.trim(); if (!t) continue;
      const mm = t.match(/^([A-Za-z_]\w*)\s*(?:=\s*(\w+))?$/);
      if (!mm) continue;
      if (mm[2] !== undefined) val = /^0x/i.test(mm[2]) ? parseInt(mm[2], 16) : parseInt(mm[2], 10);
      if (!map.has(mm[1])) map.set(mm[1], val);
      val++;
    }
  }
  return map;
}

// 2) 解析客户端 MSkillInfoTable.cpp(按 latin1 读以保留 GBK 原字节) → 枚举名→{sprite, gbk中文名字节, eng}。
const gbk = new TextDecoder("gbk");
function parseTable(src) {
  const out = new Map();
  // m_pTypeInfo[NAME].Set( a , "Eng", x, y, SPRITE, "中文" )
  const re = /m_pTypeInfo\[\s*([A-Za-z_]\w*)\s*\]\.Set\(\s*[^,]+,\s*"([^"]*)"\s*,\s*[^,]+,\s*[^,]+,\s*(\d+)\s*,\s*"([^"]*)"\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const name = m[1], eng = m[2], sprite = parseInt(m[3], 10), gbkRaw = m[4];
    if (name === "i") continue;                                  // 跳过循环占位
    const bytes = Uint8Array.from([...gbkRaw].map((c) => c.charCodeAt(0) & 0xff));
    out.set(name, { sprite, eng, name: gbk.decode(bytes), mp: 0 });
  }
  // MP 消耗: m_pTypeInfo[NAME].SetMP( N )
  const reMP = /m_pTypeInfo\[\s*([A-Za-z_]\w*)\s*\]\.SetMP\(\s*(\d+)\s*\)/g;
  while ((m = reMP.exec(src))) { const e = out.get(m[1]); if (e) e.mp = parseInt(m[2], 10); }
  return out;
}

// 注: 源文件是 UTF-8(原 GBK 字节被重编码为 UTF-8 的 U+00xx), 故读 utf8 后 charCodeAt&0xff 即还原 GBK 原字节。
const enumMap = parseServerEnum(fs.readFileSync(SKILL_H, "utf8"));
const table = parseTable(fs.readFileSync(TABLE, "utf8"));

// 客户端 ACTIONINFO 名与服务端 SkillTypes 名存在尾下划线等漂移 → 直配优先, 再用"去尾下划线"归一兜底(仅唯一时)。
const norm = (s) => s.replace(/_+$/, "");
const enumNorm = new Map();   // 归一名→[原名...]
for (const k of enumMap.keys()) { const n = norm(k); (enumNorm.get(n) || enumNorm.set(n, []).get(n)).push(k); }

const result = {};
let joined = 0, fuzzy = 0, onlyTable = 0;
for (const [name, info] of table) {
  let st = null;
  if (enumMap.has(name)) st = enumMap.get(name);
  else { const cand = enumNorm.get(norm(name)); if (cand && cand.length === 1) { st = enumMap.get(cand[0]); fuzzy++; } }
  if (st === null) { onlyTable++; continue; }
  if (!(st in result)) { result[st] = { s: info.sprite, n: info.name, e: info.eng, mp: info.mp || 0 }; joined++; }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`服务端枚举 ${enumMap.size} 项, 客户端图标表 ${table.size} 项, join ${joined} 项(其中尾下划线兜底 ${fuzzy}), 仅表无枚举 ${onlyTable} 项。`);
console.log("→", OUT, `(${fs.statSync(OUT).size} 字节)`);
// 抽样校验
for (const st of [5, 6, 7, 8, 9, 100]) if (result[st]) console.log(`  SkillType ${st}: 图标#${result[st].s} "${result[st].n}" (${result[st].e})`);
