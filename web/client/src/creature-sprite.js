// 怪物精灵映射(忠实开源链路) —— 修正"spriteType 直接当 cfpk FrameID"的错误凑合。
// 正确链路: 服务端 MType(MonsterType) → DB MonsterInfo.SType(spriteType) → CreatureSprite.inf[SType].FrameID → Creature.cfpk[FrameID]。
//   · MType→SType: 服务端 DB MonsterInfo(server.js /api/monstermap 导出, 与开源 Creature.inf 的 SpriteTypes 等价但更易取)。
//   · SType→FrameID: 官方 CreatureSprite.inf(定长 19B/条: FrameID u16 + 文件位置/SpriteID范围/CreatureType)。
let _cs = null, _mm = null;

// CreatureSprite.inf: count(u32) + count 条 ×19B; 每条首 2B = FrameID。返回 [spriteType]=FrameID。
export function parseCreatureSprite(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const count = dv.getUint32(0, true);
  const frameIDs = new Uint16Array(count);
  let p = 4;
  for (let i = 0; i < count && p + 19 <= buf.byteLength; i++) { frameIDs[i] = dv.getUint16(p, true); p += 19; }
  return frameIDs;
}
export async function loadCreatureSprite(url = "/info/CreatureSprite.inf") {
  if (_cs) return _cs;
  const ab = await (await fetch(url)).arrayBuffer();
  _cs = parseCreatureSprite(new Uint8Array(ab));
  return _cs;
}
export async function loadMonsterMap(url = "/api/monstermap") {
  if (_mm) return _mm;
  _mm = await (await fetch(url)).json();
  return _mm;
}
// MType → 最终 cfpk FrameID(缺映射则回退原值, 保证不崩)。
export function monsterFrameID(mType) {
  const sType = _mm && _mm[mType] !== undefined ? _mm[mType] : mType;
  return _cs && _cs[sType] !== undefined ? _cs[sType] : sType;
}
// NPC: GC_ADD_NPC 给的 SpriteType 已是精灵类型(不经 MType→SType 那层), 直接 CreatureSprite.inf[spriteType].FrameID。
// (NPC 不在 MonsterInfo 表, 误走 monsterFrameID 会因 spriteType 碰撞某怪 MType 而显示成怪物。)
export function spriteFrameID(spriteType) {
  return _cs && _cs[spriteType] !== undefined ? _cs[spriteType] : spriteType;
}
