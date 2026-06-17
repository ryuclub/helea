// 特效系统(复刻开源 EFFECTSTATUS) —— 角色身上的效果精灵动画(升级光柱等)。全官方资源, 不锁dpk。
// 链路: EffectStatus.inf[status].EffectSpriteType → EffectSpriteType.inf[type].FrameID
//       → Effect.efpk[FrameID][dir] 帧序列 → Effect.aspk(alpha 精灵, 服务端解码) 取像素。
//   验证(slayer升级): status127→EffectSpriteType2101→FrameID144→efpk[144]=8方向×26帧, 首帧 s=16095。
import { parseEFPK } from "./cfpk.js";
import { fetchBuf } from "./pack.js";

// 从服务端 /api/aspk 取已解码的 alpha 特效精灵 → { [id]: {rgba,width,height} }。
// 返回二进制: [u16 count] + 每精灵[u32 id][u16 W][u16 H][W*H*4 RGBA]。
async function loadAspkSprites(name, ids) {
  const out = {};
  if (!ids.length) return out;
  const res = await fetch(`/api/aspk?name=${encodeURIComponent(name)}&ids=${ids.join(",")}`);
  if (!res.ok) return out;
  const u8 = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(u8.buffer); let p = 0;
  const count = dv.getUint16(p, true); p += 2;
  for (let i = 0; i < count; i++) {
    const id = dv.getUint32(p, true); p += 4;
    const w = dv.getUint16(p, true); p += 2;
    const h = dv.getUint16(p, true); p += 2;
    const n = w * h * 4;
    if (w && h) out[id] = { rgba: u8.slice(p, p + n), width: w, height: h };
    p += n;
  }
  return out;
}

const LEVELUP_STATUS = { slayer: 127, vampire: 128, ousters: 246 };   // EFFECTSTATUS_LEVELUP_xxx(MEffectStatusDef.h)
let _efpk = null, _statusDV = null, _typeDV = null;
const _cache = {};
const dvOf = (u8) => new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

// EffectStatus.inf: u32 count + count×15B record(EFFECTSTATUS_NODE: bUse1+bAttach1+EffectSpriteType2@+2+EffectColor2+part1+ActionInfo2+OrigActionInfo2+SoundID4)。
async function effectSpriteTypeOf(status) {
  if (!_statusDV) _statusDV = dvOf(await fetchBuf("/info/EffectStatus.inf"));
  const count = _statusDV.getUint32(0, true);
  if (status < 0 || status >= count) return 65535;
  if (!_statusDV.getUint8(4 + status * 15)) return 65535;             // bUseEffectSprite=0 → 无效果精灵
  return _statusDV.getUint16(4 + status * 15 + 2, true);              // EffectSpriteType
}
// EffectSpriteType.inf: u32 count + count×变长record(bt1+FrameID2+flag1+ActionEffectFrameID2+FemaleEffectSpriteType2+numPair1+numPair×2)。顺序解析到 type。
async function frameIDOf(type) {
  if (!_typeDV) _typeDV = dvOf(await fetchBuf("/info/EffectSpriteType.inf"));
  const dv = _typeDV; let p = 4; const count = dv.getUint32(0, true);
  for (let i = 0; i < count; i++) {
    p += 1; const FrameID = dv.getUint16(p, true); p += 2 + 1 + 2 + 2; // bt + FrameID + flag + actEff + female
    const numPair = dv.getUint8(p); p += 1 + numPair * 2;
    if (i === type) return FrameID;
  }
  return 65535;
}

// 任意 EFFECTSTATUS → 特效帧数据: {frames(s→{rgba,width,height}), anim(dir→[{s,cx,cy,back}])}。无则 null。
// 通用链路(升级/中毒/护盾/技能命中等共用): status → EffectStatus.inf → EffectSpriteType → FrameID → Effect.efpk → aspk。
const _statusCache = {};
export async function loadEffectByStatus(status) {
  if (status in _statusCache) return _statusCache[status];
  let out = null;
  try {
    const type = await effectSpriteTypeOf(status);
    if (type !== 65535) {
      const fid = await frameIDOf(type);
      if (fid !== 65535) {
        if (!_efpk) _efpk = parseEFPK(await fetchBuf("/public/assets/Effect.efpk"));
        const dirs = _efpk.frameIDs[fid];
        if (dirs && dirs.some((d) => d.length)) {
          const ids = new Set(); for (const d of dirs) for (const fr of d) ids.add(fr.s);
          const frames = await loadAspkSprites("Effect", [...ids]);
          out = { frames, anim: dirs };
        }
      }
    }
  } catch { out = null; }
  _statusCache[status] = out;
  return out;
}

// 升级特效(按种族选 EFFECTSTATUS_LEVELUP_xxx)。薄封装 loadEffectByStatus。
export async function loadLevelUpEffect(race) {
  if (race in _cache) return _cache[race];
  const out = await loadEffectByStatus(LEVELUP_STATUS[race] ?? 127);
  _cache[race] = out;
  return out;
}
