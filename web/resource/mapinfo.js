// 解析一个 .map，打印统计，并渲染属性热力图(可通行/阻挡/传送/有物品)。
// 用法: node mapinfo.js <map路径> [输出png]
import fs from "node:fs";
import path from "node:path";
import { parseMap, SECTOR } from "./src/map.js";
import { encodePNG } from "./src/png.js";

const mapPath = process.argv[2];
const outPath = process.argv[3] || "out/map.png";
const m = parseMap(fs.readFileSync(mapPath));

// 统计
let minID = 0xffff, maxID = 0, nonzero = 0;
const cnt = { blocked: 0, portal: 0, item: 0, walk: 0 };
for (let i = 0; i < m.width * m.height; i++) {
  const id = m.spriteID[i], pr = m.property[i];
  if (id) { nonzero++; if (id < minID) minID = id; if (id > maxID) maxID = id; }
  if (pr & (SECTOR.BLOCK_GROUND | SECTOR.BLOCK_UNDERGROUND | SECTOR.BLOCK_FLYING)) cnt.blocked++;
  else cnt.walk++;
  if (pr & SECTOR.PORTAL) cnt.portal++;
  if (pr & SECTOR.ITEM) cnt.item++;
}
console.log(`zone="${m.zoneName}" id=${m.zoneID} grp=${m.zoneGroupID} type=${m.zoneType} lvl=${m.zoneLevel}`);
console.log(`尺寸 ${m.width}×${m.height} = ${m.width * m.height} 格`);
console.log(`spriteID: 非零 ${nonzero}, 范围 [${minID === 0xffff ? 0 : minID}..${maxID}]`);
console.log(`属性: 可通行 ${cnt.walk}, 阻挡 ${cnt.blocked}, 传送点 ${cnt.portal}, 有物品 ${cnt.item}`);

// 热力图: 每格 1 像素。可通行=深绿, 阻挡=暗红, 传送=亮青, 有物品=黄
const W = m.width, H = m.height;
const out = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x, pr = m.property[i];
    let r, g, b;
    const blocked = pr & (SECTOR.BLOCK_GROUND | SECTOR.BLOCK_UNDERGROUND | SECTOR.BLOCK_FLYING);
    if (pr & SECTOR.PORTAL) { r = 0; g = 230; b = 230; }
    else if (pr & SECTOR.ITEM) { r = 230; g = 220; b = 0; }
    else if (blocked) { r = 120; g = 30; b = 30; }
    else { const t = m.spriteID[i] ? 1 : 0; r = 20; g = t ? 110 : 60; b = 30; }
    const o = i * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, encodePNG(out, W, H));
console.log(`热力图 → ${outPath} (${W}×${H})`);
