// 开源界面精灵包(C_SPRITE_PACK)加载与绘制 —— 忠实复刻 VS_UI 的 spk 绘制语义。
//
// 资源: 发行包 Data/Ui/spk/<name>.spk(+.spki 索引), 经服务器 /ui/spk/ 路由按原始文件服务。
// 格式: 与地砖/物件同为 CSprite(不透明/色键, 见 spk.js)。.spki = u16 count + count×i32 偏移。
// 绘制: 每个精灵预解码为离屏 canvas(透明像素 alpha=0), 用 drawImage 正确叠加到目标 ctx(对应
//   C_SPRITE_PACK::BltLocked)。BltLockedClip(开源血条等用)= 只画精灵的某个子矩形。
//
// 一个 UIPack 对应一个 C_SPRITE_PACK 实例: get/width/height/blit/blitClip 一一对应开源接口。

import { decodeCSprite, parseSpki } from "./spk.js";
import { fetchBuf } from "./pack.js";

const _packCache = new Map(); // name -> Promise<UIPack>

// 把解码出的 {width,height,rgba} 转成离屏 canvas(只在首次用到时), 供 drawImage 透明叠加。
function spriteToCanvas(s) {
  const cv = document.createElement("canvas");
  cv.width = s.width; cv.height = s.height;
  cv.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(s.rgba), s.width, s.height), 0, 0);
  return cv;
}

class UIPack {
  constructor(name, sprites) {
    this.name = name;
    this._sprites = sprites;        // [{width,height,rgba}]
    this._canvas = new Array(sprites.length); // 懒加载离屏 canvas
    this.count = sprites.length;
  }
  get(id = 0) { return this._sprites[id] || null; }
  width(id = 0) { const s = this._sprites[id]; return s ? s.width : 0; }   // 对应 GetWidth
  height(id = 0) { const s = this._sprites[id]; return s ? s.height : 0; } // 对应 GetHeight
  _cv(id) { if (!this._canvas[id]) { const s = this._sprites[id]; if (!s) return null; this._canvas[id] = spriteToCanvas(s); } return this._canvas[id]; }
  // 对应 BltLocked(x,y,sprite_id): 整图叠加。
  blit(ctx, x, y, id = 0) { const cv = this._cv(id); if (cv) ctx.drawImage(cv, x | 0, y | 0); }
  // 对应 BltLockedClip(x,y,rect,sprite_id): 只画精灵的 rect 子区(rx,ry,rw,rh)到目标 (x,y)。
  // 开源血条按值裁剪填充图: rect=(0,0, GetWidth*value/max, GetHeight)。
  blitClip(ctx, x, y, rx, ry, rw, rh, id = 0) {
    const cv = this._cv(id); if (!cv || rw <= 0 || rh <= 0) return;
    ctx.drawImage(cv, rx | 0, ry | 0, rw | 0, rh | 0, x | 0, y | 0, rw | 0, rh | 0);
  }
}

// 加载一个 UI 精灵包(带缓存)。base 默认开源发行包路径。
export function loadUIPack(name, base = "/ui/spk") {
  if (_packCache.has(name)) return _packCache.get(name);
  const pr = (async () => {
    const [spk, spki] = await Promise.all([fetchBuf(`${base}/${name}.spk`), fetchBuf(`${base}/${name}.spki`)]);
    const offsets = parseSpki(spki);
    const sprites = offsets.map((o) => { const s = decodeCSprite(spk, o); return { width: s.width, height: s.height, rgba: s.rgba }; });
    return new UIPack(name, sprites);
  })();
  _packCache.set(name, pr);
  return pr;
}
