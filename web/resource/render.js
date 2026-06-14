// 解码一个 .spk(+.spki) 的全部精灵，拼成一张 PNG 预览(放大 + 棋盘底显透明)。
// 用法: node render.js <spk路径> [放大倍数] [输出png]

import fs from "node:fs";
import path from "node:path";
import { decodeCSprite, decodeCIndexSprite, parseSpki, spkCount } from "./src/spk.js";
import { encodePNG } from "./src/png.js";

const spkPath = process.argv[2];
const scale = Number(process.argv[3] || 6);
const outPath = process.argv[4] || "out/preview.png";
const limit = Number(process.argv[5] || 0); // 0=全部，否则取前 N 帧

// 按扩展名选解码器与索引扩展
const isIndex = /\.ispk$/i.test(spkPath);
const decoder = isIndex ? decodeCIndexSprite : decodeCSprite;
const idxExt = isIndex ? ".ispki" : ".spki";

const spk = fs.readFileSync(spkPath);
const spkiPath = spkPath.replace(/\.i?spk$/i, idxExt);

let sprites;
if (fs.existsSync(spkiPath)) {
  let offs = parseSpki(fs.readFileSync(spkiPath));
  if (limit > 0) offs = offs.slice(0, limit);
  sprites = offs.map((o) => decoder(spk, o));
} else {
  const n = limit > 0 ? Math.min(limit, spkCount(spk)) : spkCount(spk);
  sprites = [];
  let off = 2;
  for (let i = 0; i < n; i++) { const s = decoder(spk, off); sprites.push(s); off = s.end; }
}

console.log(`精灵数: ${sprites.length}`);
sprites.forEach((s, i) => console.log(`  #${i} ${s.width}x${s.height}`));

// 横向拼接(间隔 4px)，棋盘底
const gap = 4;
const maxH = Math.max(...sprites.map((s) => s.height));
const totalW = sprites.reduce((a, s) => a + s.width + gap, gap);
const W = totalW * scale;
const H = (maxH + gap * 2) * scale;
const out = new Uint8Array(W * H * 4);

// 棋盘底
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = (((x >> 3) ^ (y >> 3)) & 1) ? 90 : 60;
    const idx = (y * W + x) * 4;
    out[idx] = c; out[idx + 1] = c; out[idx + 2] = c; out[idx + 3] = 255;
  }
}

// 贴精灵(放大, alpha 混合)
let cursor = gap;
for (const s of sprites) {
  for (let y = 0; y < s.height; y++) {
    for (let x = 0; x < s.width; x++) {
      const si = (y * s.width + x) * 4;
      if (s.rgba[si + 3] === 0) continue;
      const r = s.rgba[si], g = s.rgba[si + 1], b = s.rgba[si + 2];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (cursor + x) * scale + dx;
          const py = (gap + y) * scale + dy;
          const oi = (py * W + px) * 4;
          out[oi] = r; out[oi + 1] = g; out[oi + 2] = b; out[oi + 3] = 255;
        }
      }
    }
  }
  cursor += s.width + gap;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePNG(out, W, H));
console.log(`已输出 ${outPath} (${W}x${H})`);
