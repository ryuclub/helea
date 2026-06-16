// 地砖包(tile.spk 目录分块)解析 —— 同构
//
// tile.spk/ = 502 个块, 每块 = u16 count(128) + 128 个顺序 CSprite, 命名 {chunk*128 5位}.spk
// tile.spki = u16 count(63939) + i32(全块拼接的全局偏移, 非均匀)
// 取 tile: tileID → 块 floor(id/128)*128, 块内顺序解码取第 (id%128) 个(无需 spki, 最稳)。

import { decodeCSprite } from "./spk.js";

const pad5 = (n) => String(n).padStart(5, "0");
export function chunkNameFor(tileID, chunkSize = 128) { return pad5(Math.floor(tileID / chunkSize) * chunkSize) + ".spk"; }

// loadChunk: (chunkName) => Uint8Array | null   (调用方提供, 便于 Node/浏览器各自实现 + 缓存)
// chunkSize: 每块精灵数(tile.spk=128, imageobject.spk=16)
export class TileSet {
  constructor(loadChunk, chunkSize = 128) { this.loadChunk = loadChunk; this.chunkSize = chunkSize; this._chunkCache = new Map(); this._tileCache = new Map(); }
  _chunk(tileID) {
    const name = chunkNameFor(tileID, this.chunkSize);
    let c = this._chunkCache.get(name);
    if (c === undefined) { c = this.loadChunk(name); this._chunkCache.set(name, c); }
    return c;
  }
  // 取 tileID 的精灵 {width,height,rgba} (带缓存)
  get(tileID) {
    if (this._tileCache.has(tileID)) return this._tileCache.get(tileID);
    const buf = this._chunk(tileID);
    if (!buf) { this._tileCache.set(tileID, null); return null; }
    const within = tileID % this.chunkSize;
    let off = 2, s = null;
    for (let i = 0; i <= within; i++) { s = decodeCSprite(buf, off); off = s.end; }
    this._tileCache.set(tileID, s);
    return s;
  }
}
