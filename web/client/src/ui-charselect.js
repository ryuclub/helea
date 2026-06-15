// 选角界面 —— 发行包真实美术(CharManager.spk/Common.spk) + 开源选角逻辑(3 槽、选/建/删) + 逐帧动画。
// 索引目视识别(2026-06-15): Common[0]=背景; CharManager #25=Legacy 标题, #18-23=圆形踏台(6帧光圈动画),
//   按钮(73×23, 偶=高亮/奇=常态): Start #14/#15, Create #10/#11, Delete #12/#13。
// 动画: 开源 ANI_MILLISEC=100ms/帧, g_char_index 推进; 角色逐帧循环(站立), 踏台光圈循环。
import { loadUIPack } from "./uispk.js";

const SCR_W = 800, SCR_H = 600, SLOT_MAX = 3;
const COL = [200, 400, 600];            // 三槽列中心 x
const PED_BASE = 18, PED_FRAMES = 6, TITLE = 25;  // 踏台 6 帧(18..23)循环
const BTN = { START_H: 14, START_N: 15, CREATE_H: 10, CREATE_N: 11, DELETE_H: 12, DELETE_N: 13 };
const PED_Y = 440, FOOT_DY = 32, NAME_Y = 250, BTN_Y = 492, DEL_Y = 520;
const ANIM_MS = 100;
const PREVIEW_SCALE = 2;   // 预览角色放大1倍(开源选角预览比游戏内大)

export class CharSelectScreen {
  constructor(container, { onSelect, onCreate, onDelete, loadCharPreview }) {
    this.container = container; this.onSelect = onSelect; this.onCreate = onCreate; this.onDelete = onDelete;
    this.loadCharPreview = loadCharPreview;
    this.chars = []; this._anim = new Map(); this.hover = null; this._frame = 0; this._timer = null;
  }

  async load() {
    const [common, cm] = await Promise.all([loadUIPack("common"), loadUIPack("charmanager")]);
    // 去掉 common[0] 背景自带的绿色框线(最外圈+背景浅绿框): 把"绿主导"像素(G 明显>R 且>B)改黑,
    // 暗色画面/青色教堂(G≈B)不受影响。用户要求只留画面、去框。
    const bg = common.get(0);
    if (bg) { const d = bg.rgba; for (let k = 0; k < d.length; k += 4) {
      const r = d[k], g = d[k + 1], b = d[k + 2];
      if (g > r + 8 && g > b + 8) { d[k] = 0; d[k + 1] = 0; d[k + 2] = 0; }
    } }
    this._packs = { common, cm };
    this._build();
    addEventListener("resize", () => this._layout());
  }

  _build() {
    const wrap = document.createElement("div");
    wrap.id = "charWrap";
    wrap.style.cssText = `position:absolute;left:50%;top:50%;width:${SCR_W}px;height:${SCR_H}px;transform-origin:center center;display:none;`;
    const cv = document.createElement("canvas"); cv.width = SCR_W; cv.height = SCR_H;
    cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;";
    wrap.appendChild(cv);
    this.wrap = wrap; this.canvas = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;

    cv.addEventListener("mousemove", (e) => { const b = this._hit(e); const k = b ? b.col + ":" + b.kind : null; if (k !== this.hover) { this.hover = k; this._render(); } });
    cv.addEventListener("mouseleave", () => { if (this.hover) { this.hover = null; this._render(); } });
    cv.addEventListener("click", (e) => { const b = this._hit(e); if (!b) return; if (b.kind === "start") this.onSelect(b.char); else if (b.kind === "create") this.onCreate(b.col); else if (b.kind === "delete") this.onDelete(b.char); });
    this.container.appendChild(wrap);
  }

  _buttons() {
    const cm = this._packs.cm, out = [];
    const rect = (col, kind, char, idx, y) => { const w = cm.width(idx), h = cm.height(idx); return { col, kind, char, x: COL[col] - w / 2, y, w, h }; };
    for (let i = 0; i < SLOT_MAX; i++) {
      const ch = this.chars.find((c) => c.slot === i);
      if (ch) { out.push(rect(i, "start", ch, BTN.START_N, BTN_Y)); out.push(rect(i, "delete", ch, BTN.DELETE_N, DEL_Y)); }
      else out.push(rect(i, "create", null, BTN.CREATE_N, BTN_Y));
    }
    return out;
  }

  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * SCR_W, py = (e.clientY - r.top) / r.height * SCR_H;
    for (const b of this._buttons()) if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b;
    return null;
  }

  async setChars(chars) {
    this.chars = chars || [];
    await Promise.all(this.chars.map(async (c) => {
      const key = c.race + ":" + (c.sex || 0);
      if (!this._anim.has(key)) {
        try { this._anim.set(key, await this.loadCharPreview(c.race, c.sex || 0)); } catch { this._anim.set(key, null); }
      }
    }));
    this._render();
  }

  _render() {
    const { ctx, _packs: { common, cm } } = this;
    ctx.clearRect(0, 0, SCR_W, SCR_H);
    common.blit(ctx, 0, 0, 0);                                   // 背景
    cm.blit(ctx, (SCR_W - cm.width(TITLE)) / 2, 20, TITLE);      // Legacy 标题
    ctx.textAlign = "center"; ctx.font = "16px system-ui,sans-serif";
    const glow = PED_BASE + (this._frame % PED_FRAMES);         // 踏台光圈逐帧
    for (let i = 0; i < SLOT_MAX; i++) {
      const cx = COL[i];
      const pf = this._pedFrame(glow);                           // 踏台(光圈动画, 已椭圆遮罩去矩形暗角)
      ctx.drawImage(pf, (cx - pf.width / 2) | 0, PED_Y);
      const ch = this.chars.find((c) => c.slot === i);
      if (ch) {
        const a = this._anim.get(ch.race + ":" + (ch.sex || 0));
        const seq = a && a.stand;
        if (seq && seq.length) {                                 // 角色站立逐帧动画(脚点居中踏台 + 放大)
          const fr = seq[this._frame % seq.length];
          this._drawFrame(ctx, fr, cx, PED_Y + FOOT_DY, PREVIEW_SCALE);
        }
        ctx.fillStyle = "#ffe8c8"; ctx.fillText(ch.name, cx, NAME_Y);
      }
    }
    const PAIR = { start: [BTN.START_H, BTN.START_N], create: [BTN.CREATE_H, BTN.CREATE_N], delete: [BTN.DELETE_H, BTN.DELETE_N] };
    for (const b of this._buttons()) {
      const hov = this.hover === b.col + ":" + b.kind;
      const [h, n] = PAIR[b.kind];
      cm.blit(ctx, b.x, b.y, hov ? h : n);
    }
  }

  // 画一帧角色精灵: 脚点(footX,footY)=角色站立点, 用 render.js 同款锚点(开源 cfpk cx/cy 是相对"瓦片左上"的,
  // 脚在瓦片中心底 = +TW/2,+TH; 故 top-left = 脚点 + (cx-TW/2, cy-TH)*scale)。少了这个 -24 修正会偏右下(=之前"歪")。
  _drawFrame(ctx, fr, footX, footY, scale = 1) {
    if (!fr) return;
    const cv = this._frameCanvas(fr);
    ctx.drawImage(cv, (footX + (fr.cx - 24) * scale) | 0, (footY + (fr.cy - 24) * scale) | 0, fr.width * scale, fr.height * scale);
  }
  // 踏台辉光帧: 原始 sprite 自带矩形暗色背景, 用椭圆遮罩(destination-in)裁成圆盘, 去掉四角矩形(对齐开源圆盘遮罩)。按帧缓存。
  _pedFrame(idx) {
    if (!this._pedCache) this._pedCache = new Map();
    let c = this._pedCache.get(idx);
    if (c) return c;
    const cm = this._packs.cm, w = cm.width(idx), h = cm.height(idx);
    c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingEnabled = false;
    cm.blit(g, 0, 0, idx);                                       // 原始辉光帧(含矩形暗角)
    g.globalCompositeOperation = "destination-in";              // 只保留椭圆内 → 抹掉矩形四角
    g.save(); g.translate(w / 2, h / 2); g.scale(1, h / w);     // 圆缩放成内接椭圆
    g.fillStyle = "#fff"; g.beginPath(); g.arc(0, 0, w / 2, 0, Math.PI * 2); g.fill(); g.restore();
    g.globalCompositeOperation = "source-over";
    this._pedCache.set(idx, c);
    return c;
  }
  _frameCanvas(fr) {
    if (!fr._cv) { const c = document.createElement("canvas"); c.width = fr.width; c.height = fr.height;
      c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(fr.rgba), fr.width, fr.height), 0, 0); fr._cv = c; }
    return fr._cv;
  }

  _layout() {
    const cw = this.container.clientWidth || SCR_W, ch = this.container.clientHeight || SCR_H;
    const s = Math.max(0.1, Math.min(cw / SCR_W, ch / SCR_H));
    this.wrap.style.transform = `translate(-50%,-50%) scale(${s})`;
  }

  show() { this.wrap.style.display = "block"; this._layout(); this._render(); this._startAnim(); }
  hide() { this.wrap.style.display = "none"; this._stopAnim(); }
  _startAnim() { if (this._timer) return; this._timer = setInterval(() => { this._frame++; this._render(); }, ANIM_MS); }
  _stopAnim() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
}
