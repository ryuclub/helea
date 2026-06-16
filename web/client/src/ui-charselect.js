// 选角界面 —— 忠实复刻开源 C_VS_UI_CHAR_MANAGER(VS_UI_Title.cpp) + 官方 CharManager.spk/Common.spk。
// 官方包下标(实测尺寸逐一吻合, 9/7 精灵):
//   Common.spk(COMMON_SPK_ID):   BG=0(800x600背景), BACK=1/按2/亮3, NEXT=4/按5/亮6
//   CharManager.spk(CHAR_MANAGER_SPK_ID): WINDOW=0/选中1, TITLE=2, DELETE=3/按4/亮5, CREATE=6/按7/亮8
// 布局(800x600, 原点0,0): 三槽框 x=250/430/610 y=180(167x271); 标题居中(400,50);
//   立绘脚点=槽框+(55,170); 名字=槽框+(76,42)居中; BACK(28,522) NEXT(687,522) CREATE(555,542) DELETE=槽框+(119,36)。
// 交互(开源): 点槽→选中(m_select_heart); NEXT→选中角色进游戏; BACK→返回; CREATE→空槽建角; DELETE→删该槽。
// 动画: 开源 ANI_MILLISEC=100ms/帧, 角色站立逐帧循环。
import { loadUIPack } from "./uispk.js";

const SCR_W = 800, SCR_H = 600, SLOT = 3;
const HEART_RECT = [250, 430, 610], HEART_Y = 180, HEART_W = 167, HEART_H = 271;
const TITLE_X = 400, TITLE_Y = 50;
// 立绘脚点相对槽框左上。立绘渲染 31×85 ×PREVIEW_SCALE(2)=62×170; 用户调: 右+1/2人宽(31)、下+1/3人高(57)使框内居中。
const FOOT_DX = 86, FOOT_DY = 227;
const NAME_DX = 76, NAME_DY = 58;      // 名字中心相对槽框左上(用户调: 下移一个字高16px, 42→58)
const DEL_DX = 119, DEL_DY = 36;       // 删除按钮相对槽框左上
const BACK_XY = [28, 522], NEXT_XY = [687, 522], CREATE_XY = [555, 542];
const ANIM_MS = 100, PREVIEW_SCALE = 2;
// Common.spk 下标
const C = { BG: 0, BACK: 1, BACK_P: 2, BACK_H: 3, NEXT: 4, NEXT_P: 5, NEXT_H: 6 };
// CharManager.spk 下标
const M = { WINDOW: 0, WINDOW_H: 1, TITLE: 2, DEL: 3, DEL_P: 4, DEL_H: 5, CREATE: 6, CREATE_P: 7, CREATE_H: 8 };

export class CharSelectScreen {
  constructor(container, { onSelect, onCreate, onDelete, onBack, loadCharPreview }) {
    this.container = container;
    this.onSelect = onSelect; this.onCreate = onCreate; this.onDelete = onDelete; this.onBack = onBack;
    this.loadCharPreview = loadCharPreview;
    this.chars = []; this._anim = new Map(); this.hover = null; this._frame = 0; this._timer = null;
    this._select = -1;                 // 当前选中槽(m_select_heart)
  }

  async load() {
    const [common, cm] = await Promise.all([loadUIPack("common"), loadUIPack("charmanager")]);
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

    cv.addEventListener("mousemove", (e) => { const b = this._hit(e); const k = b ? b.kind + ":" + (b.i ?? "") : null; if (k !== this.hover) { this.hover = k; this._render(); } });
    cv.addEventListener("mouseleave", () => { if (this.hover) { this.hover = null; this._render(); } });
    cv.addEventListener("click", (e) => this._click(e));
    this.container.appendChild(wrap);
  }

  _click(e) {
    const b = this._hit(e); if (!b) return;
    if (b.kind === "slot") { this._select = b.i; this._render(); }
    else if (b.kind === "next") { const ch = this.chars.find((c) => c.slot === this._select); if (ch) this.onSelect(ch); }
    else if (b.kind === "back") { if (this.onBack) this.onBack(); }
    else if (b.kind === "create") { const s = this._firstFree(); if (s >= 0) this.onCreate(s); }
    else if (b.kind === "delete") { const ch = this.chars.find((c) => c.slot === b.i); if (ch) this.onDelete(ch); }
  }

  _firstFree() { for (let s = 0; s < SLOT; s++) if (!this.chars.find((c) => c.slot === s)) return s; return -1; }

  // 命中区: 角色槽(仅有角色) + BACK/NEXT/CREATE + 每槽 DELETE(仅有角色)。
  _buttons() {
    const cm = this._packs.cm, common = this._packs.common, out = [];
    out.push({ kind: "back", x: BACK_XY[0], y: BACK_XY[1], w: common.width(C.BACK), h: common.height(C.BACK) });
    out.push({ kind: "next", x: NEXT_XY[0], y: NEXT_XY[1], w: common.width(C.NEXT), h: common.height(C.NEXT) });
    if (this._firstFree() >= 0) out.push({ kind: "create", x: CREATE_XY[0], y: CREATE_XY[1], w: cm.width(M.CREATE), h: cm.height(M.CREATE) });
    for (let i = 0; i < SLOT; i++) {
      const ch = this.chars.find((c) => c.slot === i);
      out.push({ kind: "slot", i, x: HEART_RECT[i], y: HEART_Y, w: HEART_W, h: HEART_H });
      if (ch) out.push({ kind: "delete", i, x: HEART_RECT[i] + DEL_DX, y: HEART_Y + DEL_DY, w: cm.width(M.DEL), h: cm.height(M.DEL) });
    }
    return out;
  }

  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * SCR_W, py = (e.clientY - r.top) / r.height * SCR_H;
    // 后加入的(DELETE/CREATE)优先于槽框, 倒序命中
    const bs = this._buttons();
    for (let k = bs.length - 1; k >= 0; k--) { const b = bs[k]; if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b; }
    return null;
  }

  async setChars(chars) {
    this.chars = chars || [];
    if (!this.chars.find((c) => c.slot === this._select)) this._select = this.chars.length ? this.chars[0].slot : -1;
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
    common.blit(ctx, 0, 0, C.BG);                                       // 背景
    cm.blit(ctx, (TITLE_X - cm.width(M.TITLE) / 2) | 0, TITLE_Y, M.TITLE);  // 标题居中
    ctx.textAlign = "center"; ctx.font = "16px system-ui,sans-serif";
    for (let i = 0; i < SLOT; i++) {
      const sx = HEART_RECT[i], sy = HEART_Y, sel = this._select === i;
      cm.blit(ctx, sx, sy, sel ? M.WINDOW_H : M.WINDOW);               // 槽框(选中高亮)
      const ch = this.chars.find((c) => c.slot === i);
      if (ch) {
        const a = this._anim.get(ch.race + ":" + (ch.sex || 0)), seq = a && a.stand;
        if (seq && seq.length) this._drawFrame(ctx, seq[this._frame % seq.length], sx + FOOT_DX, sy + FOOT_DY, PREVIEW_SCALE);
        ctx.fillStyle = "#ffe8c8"; ctx.fillText(ch.name, sx + NAME_DX, sy + NAME_DY);
        const dh = this.hover === "delete:" + i;
        cm.blit(ctx, sx + DEL_DX, sy + DEL_DY, dh ? M.DEL_H : M.DEL);  // 删除按钮
      }
    }
    common.blit(ctx, BACK_XY[0], BACK_XY[1], this.hover === "back:" ? C.BACK_H : C.BACK);
    common.blit(ctx, NEXT_XY[0], NEXT_XY[1], this.hover === "next:" ? C.NEXT_H : C.NEXT);
    if (this._firstFree() >= 0) cm.blit(ctx, CREATE_XY[0], CREATE_XY[1], this.hover === "create:" ? M.CREATE_H : M.CREATE);
  }

  // 画一帧角色精灵(脚点锚点同 render.js: top-left = 脚点 + (cx-24, cy-24)*scale)。
  _drawFrame(ctx, fr, footX, footY, scale = 1) {
    if (!fr) return;
    const cv = this._frameCanvas(fr);
    ctx.drawImage(cv, (footX + (fr.cx - 24) * scale) | 0, (footY + (fr.cy - 24) * scale) | 0, fr.width * scale, fr.height * scale);
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
