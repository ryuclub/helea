// 浏览器地形合成。地砖(扇区)层: 切块流式合成小画布(窗口远大于可视, 不会黑)。
// 物件层: 对齐开源 MTopView —— 整个 zone 的物件一次性常驻, 按 viewpoint 画家序绘制,
//   ★绝不按块分桶、不按加载半径丢弃、不分 flat/tall。之前那套是自创的, 会把可视物件丢掉造成黑洞。
//
// 全部解析/解码/buffer 模块级缓存, 跨块复用。

import { parseMap, parseImageObjects } from "./map.js";
import { TileSet } from "./tile.js";

export const TW = 48, TH = 24, BLOCK = 16; // 地砖像素 + 区块边长(格)

const _buf = new Map();                 // url -> Uint8Array|null
let _cfg = null, _map = null, _allObjs = null; // 配置/地图/本 zone 全部物件(不分桶, 整区常驻)
let _tileSet = null, _objSet = null;
const _imgData = new Map();              // tileID -> ImageData
// 换区代次(epoch): 开源换 zone 是同步原子重建, 无在途任务。我们是异步流式, 用 epoch 模拟同一不变量:
// 切区自增 epoch; 在途 buildBlock 每个 await 后比对, 代次过期立即丢弃(返回 null), 杜绝旧任务用新 zone 数据生成错块。
let _epoch = 0;
export function currentEpoch() { return _epoch; }

// 取 chunk(tile/obj 包)。★ 核心修复(对齐开源"磁盘加载从不永久丢图"):
// 开源客户端从本地磁盘读 SPK, 失败也只是这一帧跳过、下帧重读; 永不把一次失败永久记成空白。
// 我们走网络, 必须复刻这个"瞬时可自愈"语义 —— 否则一次偶发请求失败被永久缓存成 null → 该 chunk
// 所有瓦片永久空白(黑洞), 跨区都不清。规则:
//   ① 成功(res.ok) → 缓存字节(下次直取)。
//   ② 404(文件确实不存在) → 缓存 null(永久跳过, 防对缺失文件每帧热重试)。
//   ③ 其它(5xx/EMFILE 截断/网络错/超时) → 视为瞬时, 不写缓存 → 返回 null 让上层下次自动重试。
async function fetchChunk(url) {
  if (_buf.has(url)) return _buf.get(url);          // 仅"已成功"或"确认404"会被缓存
  let b = null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000); // 超时中止: 防卡住的 fetch 永久占住并发槽 → 全图停载
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (res.ok) b = new Uint8Array(await res.arrayBuffer());
    else if (res.status === 404) { _buf.set(url, null); return null; } // 真缺失: 永久记空(不重试)
    // 其它非 2xx: 瞬时错误, 落到下方"不缓存"分支
  } catch { b = null; }                              // 网络错误/超时: 瞬时, 不缓存
  finally { clearTimeout(timer); }
  if (b) _buf.set(url, b);                           // ★ 只缓存成功结果; 失败不写 → 下次重试(自愈)
  return b;
}
const pad5 = (n) => String(n).padStart(5, "0");

// 初始化: 解析地图 + 收集本 zone 全部物件(不分桶)。返回解析后的 map(供可走性判断)。
// 切换 zone 时务必清空 zone 专属解码缓存(对齐开源 MZone 整体重建): 否则 _imgData 里旧 zone 的
// spriteID→位图 会被新 zone 同号命中, 导致"两个场景图块混显"。
export async function initTerrain(cfg) {
  _epoch++;                                 // ★ 换区: 代次自增 → 旧 zone 在途 buildBlock 失效(防错块混入)
  _cfg = cfg;
  _imgData.clear();                         // ★ 关键: 清旧 zone 的 tileID→ImageData 解码缓存(根除切图混叠)
  const mb = new Uint8Array(await (await fetch(cfg.mapUrl)).arrayBuffer());
  _map = parseMap(mb);
  _tileSet = new TileSet((name) => _buf.get(`${cfg.tileBase}/${name}`) ?? null);
  _allObjs = null;
  if (cfg.objBase) {
    _objSet = new TileSet((name) => _buf.get(`${cfg.objBase}/${name}`) ?? null, 16);
    // 整区全部物件(不分桶): 进区后由 buildZoneObjects 一次性全载、整区常驻(对齐开源)。
    _allObjs = (parseImageObjects(mb, _map).objs || []).filter((o) => o.spriteID !== 65535 && o.type === 3);
  }
  return _map;
}

// 构建单个区块 (bx,by) 的地砖层 → {canvas,width,height,gx0,gy0}。无效块返回 null。
// 物件不在这里处理(整区常驻, 见 buildZoneObjects)。
export async function buildBlock(bx, by) {
  const m = _map; if (!m) return null;
  const myEpoch = _epoch;                  // 本块归属的代次; 跨 await 后若代次变了说明已换区 → 丢弃
  const c0 = bx * BLOCK, r0 = by * BLOCK;
  if (c0 >= m.width || r0 >= m.height || c0 < 0 || r0 < 0) return null;
  const c1 = Math.min(m.width - 1, c0 + BLOCK - 1), r1 = Math.min(m.height - 1, r0 + BLOCK - 1);

  // 预取本块 tile 块。★ 必须跳过 void 格(65535): 它会算出 floor(65535/128)*128=65408.spk —— 根本不存在的包,
  // 真 404 → fetchChunk 返回 null → 下方守门误判整块失败 → 永不渲染(38.9% 是 void → 几乎全黑)。
  // void 本就不画(对齐开源 etc.spk 黑块/我们留透明), 不该为它请求任何包。
  const tneed = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const id = m.spriteID[r * m.width + c];
    if (id === 65535) continue;              // void: 无对应 tile 包, 跳过
    tneed.add(`${_cfg.tileBase}/${pad5(Math.floor(id / 128) * 128)}.spk`);
  }
  const tneedArr = [...tneed];
  const tbufs = await Promise.all(tneedArr.map(fetchChunk));
  if (myEpoch !== _epoch) return null;     // 已换区: 此块属旧 zone, 丢弃(防用新 _map/_tileSet 生成错块)
  // ★ 根治黑洞: 只对"瞬时失败"(返回 null 且未进缓存)整块判失败返回 null → render.js 当"未加载"下帧重试,
  // 而不是把缺图烤成透明地、还当"加载成功"的成品(永不重试)。已确认 404 的包(缓存为 null)是坏数据/真缺失,
  // 容忍跳过、照常出块(否则会对它每帧热循环重建)。
  if (tneedArr.some((url, i) => !tbufs[i] && !_buf.has(url))) return null;

  const W = (c1 - c0 + 1) * TW, H = (r1 - r0 + 1) * TH;
  const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const id = m.spriteID[r * m.width + c];
    let img = _imgData.get(id);
    if (img === undefined) { const t = _tileSet.get(id); img = t ? new ImageData(new Uint8ClampedArray(t.rgba), t.width, t.height) : null; _imgData.set(id, img); }
    if (img) ctx.putImageData(img, (c - c0) * TW, (r - r0) * TH);
  }

  const gx0 = c0 * TW, gy0 = r0 * TH;
  return { canvas, width: W, height: H, gx0, gy0, epoch: myEpoch };
}

// 进区时一次性加载本 zone 全部物件(对齐开源 MTopView 整区常驻)。返回每个物件的绘制数据;
// 渲染层据此创建常驻网格, 按 viewpoint 深度排序, 绝不按块/半径丢弃。解码失败/缺图的单个物件跳过。
// 深度键 = Viewpoint(开源按 Viewpoint 升序画: 小=先画=在后(背景), 大=后画=在前)。钳到 [0,地图高] 防垃圾值。
// 整区物件解码结果按地图缓存(mapUrl→已解码物件数组): 物件运行期不变, 解码一次跨进区复用 →
// 消除"反复上下地牢每次重新解码 1088 物件"的换区卡顿(~700ms~3s)。
const _zoneObjCache = new Map();
export async function buildZoneObjects() {
  if (!_cfg || !_cfg.objBase || !_allObjs || !_allObjs.length) return [];
  const cached = _zoneObjCache.get(_cfg.mapUrl);
  if (cached) return cached;                 // 已解码过该 zone → 直接复用(无 fetch/无解码 = 无卡顿)
  const myEpoch = _epoch;
  const oneed = new Set(_allObjs.map((o) => `${_cfg.objBase}/${pad5(Math.floor(o.spriteID / 16) * 16)}.spk`));
  await Promise.all([...oneed].map(fetchChunk));
  if (myEpoch !== _epoch) return [];        // 已换区: 丢弃旧 zone 的物件(不入缓存)
  const out = [];
  for (let i = 0; i < _allObjs.length; i++) {
    const o = _allObjs[i];
    const spr = _objSet.get(o.spriteID);
    if (spr) {
      const vp = Math.max(0, Math.min(o.viewpoint, _map.height));
      out.push({ rgba: spr.rgba, width: spr.width, height: spr.height,
        gx: o.pixelX, gy: o.pixelY, baseY: vp * TH, vpRow: vp, bTrans: o.bTrans });
    }
    // 分片: 每 128 个让出主线程一帧 → 长解码不冻结 UI(加载 spinner 能转、转场能动); 让出后校验代次。
    if ((i & 127) === 127) { await new Promise((r) => setTimeout(r, 0)); if (myEpoch !== _epoch) return []; }
  }
  out.sort((a, b) => a.vpRow - b.vpRow);    // viewpoint 升序(画家序; 深度由 baseY 决定, 排序利于队列先建背景)
  _zoneObjCache.set(_cfg.mapUrl, out);      // 缓存供再次进区复用
  return out;
}

export function terrainMap() { return _map; }
