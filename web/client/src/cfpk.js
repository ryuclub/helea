// 天之炼狱(DarkEden) 角色帧包(.cfpk = CCreatureFramePack)解析器 —— 同构(DataView)
//
// 来源(客户端 framelib): m_CreatureFPK[FrameID][action][direction][frame] → CFrame{SpriteID,cX,cY}
// 类型链:
//   CFrame                 = u16 SpriteID + i16 cX + i16 cY            (6B, cX/cY=脚底锚点偏移)
//   FRAME_ARRAY            = TArray<CFrame, u16>   → u16 n + n*CFrame
//   DIRECTION_FRAME_ARRAY  = TArray<FRAME_ARRAY, u8>  → u8 nDir + nDir*FRAME_ARRAY
//   ACTION_FRAME_ARRAY     = TArray<DIRECTION_FRAME_ARRAY, u8> → u8 nAct + nAct*DIRECTION_FRAME_ARRAY
//   CCreatureFramePack     = TArray<ACTION_FRAME_ARRAY, u16> → u16 nFrameID + nFrameID*ACTION_FRAME_ARRAY
// TArray 序列化: 先写 size(SizeType 字节), 再写各元素; size=0 时只写 size。
// 动作索引即 ACTION_ 枚举: STAND=0, MOVE=1, ATTACK=2, …; 方向 0-7: LEFT,LEFTDOWN,DOWN,RIGHTDOWN,RIGHT,RIGHTUP,UP,LEFTUP。

function asView(buf) {
  if (buf instanceof DataView) return buf;
  if (buf instanceof ArrayBuffer) return new DataView(buf);
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

// 解析整个 .cfpk → frameIDs[f][action][dir] = [{s,cx,cy}, ...]
export function parseCFPK(buf) {
  const dv = asView(buf);
  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const i16 = () => { const v = dv.getInt16(p, true); p += 2; return v; };

  const nFrameID = u16();
  const frameIDs = [];
  for (let f = 0; f < nFrameID; f++) {
    const nAct = u8(); const actions = [];
    for (let a = 0; a < nAct; a++) {
      const nDir = u8(); const dirs = [];
      for (let d = 0; d < nDir; d++) {
        const nFr = u16(); const frames = [];
        for (let i = 0; i < nFr; i++) frames.push({ s: u16(), cx: i16(), cy: i16() });
        dirs.push(frames);
      }
      actions.push(dirs);
    }
    frameIDs.push(actions);
  }
  return { frameIDs, end: p };
}

// 解析 .efpk(=CEffectFramePack 特效帧包) → frameIDs[FrameID][dir] = [{s,cx,cy,back}, ...]。
// 结构 3 维(无 action 维, 区别 cfpk): u16 nFrameID + 每[u8 nDir + 每[u16 nFrame + nFrame×CEffectFrame(7B)]]。
// CEffectFrame = CFrame(s u16 + cx i16 + cy i16) + light u8(高位bit=背景层 m_bBackground)。
export function parseEFPK(buf) {
  const dv = asView(buf); let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const i16 = () => { const v = dv.getInt16(p, true); p += 2; return v; };
  const nFrameID = u16(); const frameIDs = [];
  for (let f = 0; f < nFrameID; f++) {
    const nDir = u8(); const dirs = [];
    for (let d = 0; d < nDir; d++) {
      const nFr = u16(); const frames = [];
      for (let i = 0; i < nFr; i++) { const s = u16(), cx = i16(), cy = i16(), lt = u8(); frames.push({ s, cx, cy, back: !!(lt & 0x80) }); }
      dirs.push(frames);
    }
    frameIDs.push(dirs);
  }
  return { frameIDs, end: p };
}

// 取某 FrameID 的某动作 → 8 个方向的帧序列(每帧 {s,cx,cy})。无该动作返回 null。
export function getActionSeqs(cfpk, frameID, action) {
  const fid = cfpk.frameIDs[frameID];
  if (!fid || !fid[action]) return null;
  const dirs = fid[action];
  if (!dirs.length || !dirs.some((d) => d.length)) return null;
  return dirs; // dirs[dir] = [{s,cx,cy}...]
}
