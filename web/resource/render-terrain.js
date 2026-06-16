// 渲染 .map 的一块区域为等距地形 PNG。
// 用法: node render-terrain.js <map> <centerCol> <centerRow> <halfSpan> [out.png]
import fs from "node:fs";
import path from "node:path";
import { parseMap, parseImageObjects } from "./src/map.js";
import { TileSet } from "./src/tile.js";
import { encodePNG } from "./src/png.js";

const DATA = "/Users/carlos/work/ryuclub/tzly/DarkEden Legend New Version April 2026/Data";
const mapPath = process.argv[2] || `${DATA}/Map/adam_c.map`;
const cc = Number(process.argv[3] || 128), cr = Number(process.argv[4] || 128);
const half = Number(process.argv[5] || 24);
const outPath = process.argv[6] || "out/terrain.png";

const m = parseMap(fs.readFileSync(mapPath));
const tiles = new TileSet((name) => {
  const f = `${DATA}/Image/tile.spk/${name}`;
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
});

const TW = 48, TH = 24; // 地砖, 矩形网格平铺(取自客户端 TileRenderer: x+=48, y+=24)
const c0 = Math.max(0, cc - half), c1 = Math.min(m.width - 1, cc + half);
const r0 = Math.max(0, cr - half), r1 = Math.min(m.height - 1, cr + half);

const cols = c1 - c0 + 1, rows = r1 - r0 + 1;
const W = cols * TW, H = rows * TH;
const out = new Uint8Array(W * H * 4);

let drawn = 0, missing = 0;
for (let r = r0; r <= r1; r++) {
  for (let c = c0; c <= c1; c++) {
    const sid = m.spriteID[r * m.width + c];
    const t = tiles.get(sid);
    if (!t) { missing++; continue; }
    drawn++;
    const px = (c - c0) * TW;
    const py = (r - r0) * TH;
    for (let yy = 0; yy < t.height; yy++) {
      for (let xx = 0; xx < t.width; xx++) {
        const si = (yy * t.width + xx) * 4;
        if (t.rgba[si + 3] === 0) continue;
        const ox = px + xx, oy = py + yy;
        if (ox < 0 || ox >= W || oy < 0 || oy >= H) continue;
        const oi = (oy * W + ox) * 4;
        out[oi] = t.rgba[si]; out[oi + 1] = t.rgba[si + 1]; out[oi + 2] = t.rgba[si + 2]; out[oi + 3] = 255;
      }
    }
  }
}
// ── ImageObject(建筑/物件)层 ──
const objTiles = new TileSet((name) => {
  const f = `${DATA}/Image/imageobject.spk/${name}`;
  return fs.existsSync(f) ? fs.readFileSync(f) : null;
}, 16); // imageobject 每块 16 精灵
const io = parseImageObjects(fs.readFileSync(mapPath), m);
const ox0 = c0 * TW, oy0 = r0 * TH; // 区域像素原点
function blit(spr, px, py) {
  for (let yy = 0; yy < spr.height; yy++) for (let xx = 0; xx < spr.width; xx++) {
    const si = (yy * spr.width + xx) * 4; if (spr.rgba[si + 3] === 0) continue;
    const X = px + xx, Y = py + yy; if (X < 0 || X >= W || Y < 0 || Y >= H) continue;
    const oi = (Y * W + X) * 4; out[oi] = spr.rgba[si]; out[oi + 1] = spr.rgba[si + 1]; out[oi + 2] = spr.rgba[si + 2]; out[oi + 3] = 255;
  }
}
let objDrawn = 0;
const regionObjs = (io.objs || []).filter((o) => o.spriteID !== 65535 && o.type === 3 &&
  o.pixelX >= ox0 - 200 && o.pixelX < ox0 + W + 200 && o.pixelY >= oy0 - 400 && o.pixelY < oy0 + H + 200);
regionObjs.sort((a, b) => a.pixelY - b.pixelY); // 画家算法: 上方先画
for (const o of regionObjs) {
  const spr = objTiles.get(o.spriteID); if (!spr) continue;
  blit(spr, o.pixelX - ox0, o.pixelY - oy0); objDrawn++;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePNG(out, W, H));
console.log(`地形区域 (${c0}..${c1}, ${r0}..${r1}) → ${outPath} (${W}x${H}), 铺砖 ${drawn}, 缺失 ${missing}, 建筑物件 ${objDrawn}`);
