// 素材加载系统(从 main.js 抽出 → 朝 ECS/愿景④"自有素材封装"形状)。
// 职责: 把 race+sex+装备 / 怪物 spriteType → 渲染所需 {frames, anim, parts} + 生物高度表。带 inflight/结果缓存。
// 纯函数依赖全部 import; 唯一外部副作用 log 用 setAssetLog 注入(保持调用签名不变)。
// ★这是未来"自有多维素材封装(2D/2.5D/3D)"要替换/演进的那一层——现忠实复刻开源 cfpk/ispk 链路。
import { parseCFPK, getActionSeqs } from "../cfpk.js";
import { loadSpritesById, fetchBuf } from "../pack.js";
import { getItemInfo } from "../iteminfo.js";
import { RACE_SPRITE_PACK, raceActions, raceFrameID } from "../creature-anim.js";
import { monsterFrameID, spriteFrameID, loadMonsterMap, loadCreatureSprite } from "../creature-sprite.js";

let _log = () => {};
export function setAssetLog(fn) { _log = fn || (() => {}); }   // 注入 main.js 的 log(中间过程日志)

// ───── 角色(三族)素材 ─────
const _raceAssetCache = new Map(), _raceInflight = new Map();
// 装备外观绘制顺序(itemClass → order, 大=后画=更靠前)。身体=0。开源 ADDON 部位叠放近似。
const ADDON_DRAW_ORDER = { 13: 1, 12: 1, 11: 2, 18: 2, 16: 3, 19: 4, 14: 5, 15: 5, 17: 5, 20: 5, 21: 5, 22: 5, 23: 5, 24: 5, 25: 5 };  // 鞋/裤1 衣/手套2 盾3 盔4 武器5
// 收集角色多部位 FrameID(身体 + 各装备外观层, 按绘制顺序叠)。装备外观帧来自官方 Item.inf 的 AddonMale/FemaleFrameID。
function collectParts(sex, bodyFid, gearInfo) {
  const parts = [{ frameID: bodyFid, order: 0 }];                       // 身体
  for (const g of (gearInfo || [])) {
    const info = getItemInfo(g.itemClass, g.itemType); if (!info) continue;
    const fid = sex === 0 ? info.addonMale : info.addonFemale;
    if (fid == null || fid === 65535) continue;                        // 无外观帧
    parts.push({ frameID: fid, order: ADDON_DRAW_ORDER[g.itemClass] ?? 3 });
  }
  return parts.sort((a, b) => a.order - b.order);
}
export async function buildRaceAssets(race, sex, gearInfo = null) {
  const pack = (RACE_SPRITE_PACK[race] || RACE_SPRITE_PACK.slayer)[sex] ?? (RACE_SPRITE_PACK[race] || RACE_SPRITE_PACK.slayer)[0];
  const weaponClass = (() => { const w = (gearInfo || []).find((g) => g.slotID === 4); return w ? w.itemClass : null; })();  // 右手武器→攻击动作
  const gkey = (gearInfo || []).map((g) => g.itemClass + "-" + g.itemType).join(",");
  const key = pack + ":" + gkey;   // 装备变化→不同部位/动作集→分缓存
  if (_raceAssetCache.has(key)) return _raceAssetCache.get(key);
  if (_raceInflight.has(key)) return _raceInflight.get(key);   // ★进行中: 复用Promise, 避免换区涌入同族玩家时重复解码
  const p = (async () => {
    const acts = raceActions(race, weaponClass);   // slayer攻击随右手武器分流
    const bodyFid = raceFrameID(race);    // 身体所在 FrameID: slayer/vampire 0, ousters 1
    const cfpk = parseCFPK(await fetchBuf(`/public/assets/${pack}.cfpk`));
    const partDefs = collectParts(sex, bodyFid, gearInfo);             // 身体 + 装备多部位
    const parts = partDefs.map((pf) => ({ order: pf.order,
      anim: { stand: getActionSeqs(cfpk, pf.frameID, acts.stand), move: getActionSeqs(cfpk, pf.frameID, acts.move),
        attack: getActionSeqs(cfpk, pf.frameID, acts.attack), die: getActionSeqs(cfpk, pf.frameID, acts.die) } }));
    const ids = new Set();
    for (const part of parts) for (const k of ["stand", "move", "attack", "die"]) { const seqs = part.anim[k]; if (seqs) for (const dir of seqs) for (const fr of dir) ids.add(fr.s); }
    const frames = await loadSpritesById(`/public/assets/${pack}.ispk`, 64, [...ids]);
    const body = parts[0].anim;   // 身体 anim(供现有 e.anim/_h/血条逻辑)
    const ok = body.stand && body.stand.some((dir) => dir.some((fr) => frames[fr.s]));
    if (!ok) throw new Error(`角色精灵不完整: ${pack}`);
    _log(`角色资源就绪: ${pack} (${parts.length}部位 ${ids.size}精灵)`, "info");
    return { frames, anim: body, parts };   // parts: 多部位(身体+装备), 渲染叠加
  })();
  _raceInflight.set(key, p);
  try { const out = await p; _raceAssetCache.set(key, out); return out; }
  finally { _raceInflight.delete(key); }
}

// ───── 怪物/NPC 素材 ─────
let _creatureCFPK = null; const _creatureCache = new Map(), _creatureInflight = new Map();
export async function loadCreatureAssets(id, isNPC = false) {
  const key = (isNPC ? "n" : "m") + id;                                 // NPC/怪物 spriteType 可能碰撞, 缓存分开
  if (_creatureCache.has(key)) return _creatureCache.get(key);          // 已完成
  if (_creatureInflight.has(key)) return _creatureInflight.get(key);    // ★进行中: 复用同一Promise, 避免换区涌入同类怪时重复fetch+解码(卡顿主因)
  const p = (async () => {
    if (!_creatureCFPK) _creatureCFPK = parseCFPK(await fetchBuf("/public/assets/creature.cfpk"));
    await Promise.all([loadMonsterMap(), loadCreatureSprite()]);        // 映射表(缓存)
    const frameID = isNPC ? spriteFrameID(id) : monsterFrameID(id);     // NPC: spriteType→FrameID; 怪物: MType→SType→FrameID
    const stand = getActionSeqs(_creatureCFPK, frameID, 0);
    if (!stand) return null;
    const move = getActionSeqs(_creatureCFPK, frameID, 1) || stand;
    const attack = getActionSeqs(_creatureCFPK, frameID, 2) || null;    // 动作2=攻击(个别怪可能无)
    const die = getActionSeqs(_creatureCFPK, frameID, 6) || null;       // 动作6=死亡(BASE_ACTION.DIE; 个别怪可能无)
    const ids = new Set();
    for (const seqs of [stand, move, attack, die]) if (seqs) for (const dir of seqs) for (const fr of dir) ids.add(fr.s);
    const frames = await loadSpritesById("/public/assets/creature.ispk", 64, [...ids]);
    return { frames, anim: { stand, move, attack, die } };
  })();
  _creatureInflight.set(key, p);
  try { const out = await p; _creatureCache.set(key, out); return out; }  // null 也缓存(避免反复试缺失精灵)
  finally { _creatureInflight.delete(key); }
}

// ───── 生物高度表(Creature.inf 抽取): 头顶血条/名字定位用 Height(忠实开源 GetHeight) ─────
let creatureInfo = null;
export async function ensureCreatureInfo() {
  if (creatureInfo) return creatureInfo;
  try { creatureInfo = await fetch("/public/assets/creatureinfo.json").then((r) => r.ok ? r.json() : null); } catch { creatureInfo = null; }
  return creatureInfo || (creatureInfo = { byName: {}, h: [] });
}
const PLAYER_CREATURE_NAME = { slayer: ["SlayerMale", "SlayerFemale"], vampire: ["VampireMale", "VampireFemale"], ousters: ["Ousters", "Ousters"] };
export function playerHeight(race, sex) { const nm = (PLAYER_CREATURE_NAME[race] || [])[sex ? 1 : 0]; const r = creatureInfo && creatureInfo.byName && creatureInfo.byName[nm]; return r ? r.h : 75; }
// 怪物头顶血条/名字定位高度: c.spriteType(=包里 MonsterType)直接索引 Creature.inf 的 h[]。
export function monsterHeight(monsterType) { return creatureInfo && creatureInfo.h && creatureInfo.h[monsterType]; }
