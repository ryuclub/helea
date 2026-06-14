// 天之炼狱(DarkEden) 精灵资源解析器 —— 同构(Node + 浏览器)
//
// 用 DataView 解析，输入可为 ArrayBuffer / Uint8Array / Node Buffer。
//
// 容器:
//   .spk/.ispk = u16 count, 然后 count 个精灵数据顺序拼接
//   .spki/.ispki = u16 count, 然后 count 个 i32 偏移(指向包内各精灵起始字节)
//   经真实文件验证(originmark.spki offsets[0]=2 正好在 u16 count 之后)。
//
// CSprite(不透明/色键, .spk): u16 W,H; 每行 u16 lineLen,u16 segCount;
//   段: u16 offset,u16 pixCount,u16[pixCount] RGB565。x=0;每段 x+=offset;逐像素 x++。
// CIndexSprite(色键双层, .ispk —— 角色/物品): u16 W,H; 每行 u16 lineLen,u16 segCount;
//   段: u16 offset,u16 ckPixCount,u16[ck] ck像素,u16 pixCount,u16[pix] 像素。
//   x=0;每段 x+=offset;先放 ck 像素(各 x++)再放普通像素(各 x++)。
// offset 为累加间隔(依据 ODK-SpriteLib: sco += offset / sco++)；未覆盖处透明。

function asView(buf) {
  if (buf instanceof DataView) return buf;
  if (buf instanceof ArrayBuffer) return new DataView(buf);
  // Uint8Array / Node Buffer
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function rgb565(v) {
  const r = (v >> 11) & 0x1f;
  const g = (v >> 5) & 0x3f;
  const b = v & 0x1f;
  return [(r * 255 / 31) | 0, (g * 255 / 63) | 0, (b * 255 / 31) | 0];
}

export function parseSpki(buf) {
  const dv = asView(buf);
  const count = dv.getUint16(0, true);
  const offsets = [];
  for (let i = 0; i < count; i++) offsets.push(dv.getInt32(2 + i * 4, true));
  return offsets;
}

export function spkCount(buf) {
  return asView(buf).getUint16(0, true);
}

// 解码一个 CSprite -> {width,height,rgba(Uint8Array w*h*4),end}
export function decodeCSprite(buf, offset = 2) {
  const dv = asView(buf);
  let p = offset;
  const width = dv.getUint16(p, true); p += 2;
  const height = dv.getUint16(p, true); p += 2;
  const rgba = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    p += 2; // lineLen
    const segCount = dv.getUint16(p, true); p += 2;
    let x = 0;
    for (let s = 0; s < segCount; s++) {
      const off = dv.getUint16(p, true); p += 2;
      const pix = dv.getUint16(p, true); p += 2;
      x += off;
      for (let i = 0; i < pix; i++) {
        const v = dv.getUint16(p, true); p += 2;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          const [r, g, b] = rgb565(v);
          const idx = (y * width + x) * 4;
          rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
        }
        x++;
      }
    }
  }
  return { width, height, rgba, end: p };
}

// 解码一个 CIndexSprite -> {width,height,rgba,end}
export function decodeCIndexSprite(buf, offset = 2) {
  const dv = asView(buf);
  let p = offset;
  const width = dv.getUint16(p, true); p += 2;
  const height = dv.getUint16(p, true); p += 2;
  const rgba = new Uint8Array(width * height * 4);

  const put = (x, y, v) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const [r, g, b] = rgb565(v);
    const idx = (y * width + x) * 4;
    rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
  };

  for (let y = 0; y < height; y++) {
    p += 2; // lineLen
    const segCount = dv.getUint16(p, true); p += 2;
    let x = 0;
    for (let s = 0; s < segCount; s++) {
      const off = dv.getUint16(p, true); p += 2; x += off;
      const ckCount = dv.getUint16(p, true); p += 2;
      for (let i = 0; i < ckCount; i++) { put(x, y, dv.getUint16(p, true)); p += 2; x++; }
      const pixCount = dv.getUint16(p, true); p += 2;
      for (let i = 0; i < pixCount; i++) { put(x, y, dv.getUint16(p, true)); p += 2; x++; }
    }
  }
  return { width, height, rgba, end: p };
}

// 解码整个包(顺序，无需 spki)。decoder 默认按是否 index 选择由调用方决定。
export function decodePack(buf, decoder, limit = 0) {
  const n = limit > 0 ? Math.min(limit, spkCount(buf)) : spkCount(buf);
  const out = [];
  let off = 2;
  for (let i = 0; i < n; i++) { const s = decoder(buf, off); out.push(s); off = s.end; }
  return out;
}

export function decodeAllCSprites(spkBuf, spkiBuf) {
  return parseSpki(spkiBuf).map((o) => decodeCSprite(spkBuf, o));
}
export function decodeAllCIndexSprites(spkBuf, spkiBuf) {
  return parseSpki(spkiBuf).map((o) => decodeCIndexSprite(spkBuf, o));
}
