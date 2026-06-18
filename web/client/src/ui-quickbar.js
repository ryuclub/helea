// 底部快捷栏 = Belt 腰带装备的内置 inventory 视图(非独立8槽; 见 memory helea-web-quickbar-belt)。
// 内容来源: gear 里腰带项(itemClass=ITEM_CLASS_BELT=26)的 sub[], 每 sub.slotID = 腰带 pocket 槽号(0~7)。
//   无腰带 → 快捷栏隐藏(对齐开源 no-belt 态)。
// 绑定: 背包光标持药水 → 点空槽 → CG_ADD_MOUSE_TO_QUICKSLOT(9)。
// 喝药: 点药水槽 或 数字键 1~8 → CG_USE_POTION_FROM_QUICKSLOT(140)。回血/蓝走 GC_MODIFY_INFORMATION→applyMods。
// UI: 开源 quickitemslayer.spk 为可旋转拼接式(START/END/STATCH_EDGE), 按降级③先暗金 js 手搓底部横排 8 槽;
//     spk 美术后续升级。逻辑(绑定/喝药协议)100% 忠实。
import { getItemInfo } from "./iteminfo.js";

const SCALE = 2, MAX_SLOT = 8, CELL = 34, GAP = 3, PAD = 5;
const W = PAD * 2 + MAX_SLOT * CELL + (MAX_SLOT - 1) * GAP, H = PAD * 2 + CELL;

export class QuickBar {
  constructor(container) { this.container = container; this.slots = new Array(MAX_SLOT).fill(null); this.beltID = null; this.hover = -1; }
  setItemPack(pack) { this.itemPack = pack; }
  setBindHandler(fn) { this.onBind = fn; }        // (slotID) → 绑光标药水入腰带槽(发 CG_ADD_MOUSE_TO_QUICKSLOT)
  setUseHandler(fn) { this.onUse = fn; }          // (item, slotID) → 喝(发 CG_USE_POTION_FROM_QUICKSLOT)
  setCursorGetter(fn) { this.getCursor = fn; }    // () → 当前背包光标持物 | null

  // 从 gear 列表刷新: 找腰带项(itemClass=26)→其 sub[] 按 slotID 填槽。无腰带→隐藏。
  setGear(gear) {
    const belt = (gear || []).find((it) => it.itemClass === 26);
    this.slots.fill(null);
    if (!belt) { this.beltID = null; if (this.cv) this.cv.style.display = "none"; return; }
    this.beltID = belt.objectID;
    for (const s of (belt.sub || [])) if (s.slotID >= 0 && s.slotID < MAX_SLOT) this.slots[s.slotID] = s;
    if (!this.cv) this._mk();
    this.cv.style.display = "block"; this._render();
  }

  _mk() {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    cv.style.cssText = `position:absolute;left:50%;bottom:8px;transform:translateX(-50%);z-index:22;display:none;width:${W * SCALE}px;height:${H * SCALE}px;image-rendering:pixelated;`;
    this.container.appendChild(cv); this.cv = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;
    cv.addEventListener("mousemove", (e) => this._move(e));
    cv.addEventListener("click", (e) => this._click(e));
    cv.addEventListener("mouseleave", () => { if (this.hover !== -1) { this.hover = -1; this._render(); } this._hideTip(); });
    this.tip = document.createElement("div");
    this.tip.style.cssText = "position:fixed;z-index:31;pointer-events:none;display:none;max-width:200px;padding:5px 8px;background:rgba(20,16,10,.96);border:1px solid #8a6a3a;border-radius:5px;color:#e8d8b0;font:12px/1.4 system-ui;box-shadow:0 2px 10px #000a;";
    document.body.appendChild(this.tip);
  }

  _slotX(i) { return PAD + i * (CELL + GAP); }
  _evt(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
  _slotAt(px, py) { if (py < PAD || py >= PAD + CELL) return -1; for (let i = 0; i < MAX_SLOT; i++) { const sx = this._slotX(i); if (px >= sx && px < sx + CELL) return i; } return -1; }

  _move(e) {
    const { x, y } = this._evt(e); const i = this._slotAt(x, y); const it = i >= 0 ? this.slots[i] : null;
    if (i !== this.hover) { this.hover = i; this._render(); }
    if (it) {
      const info = getItemInfo(it.itemClass, it.itemType); const nm = (info && info.eName) || `类型 ${it.itemClass}-${it.itemType}`;
      this.tip.innerHTML = `<div style="color:#ffd87a;font-weight:600">${nm}</div><div style="color:#9c9;font-size:11px">数字键 ${i + 1} 或点击使用</div>`;
      this.tip.style.left = (e.clientX + 12) + "px"; this.tip.style.top = (e.clientY - 36) + "px"; this.tip.style.display = "block";
    } else this._hideTip();
  }
  _hideTip() { if (this.tip) this.tip.style.display = "none"; }

  _click(e) {
    const { x, y } = this._evt(e); const i = this._slotAt(x, y); if (i < 0) return;
    const it = this.slots[i];
    if (it) { if (this.onUse) this.onUse(it, i); return; }                              // 有药水 → 喝
    const cur = this.getCursor && this.getCursor();                                     // 空槽 + 光标药水 → 绑定
    if (cur && cur.itemClass === 1 && this.onBind) this.onBind(i);
  }

  // 数字键 1~8 触发(index 键盘转发): 使用第 i 槽药水。
  useSlot(i) { const it = this.slots[i]; if (it && this.onUse) this.onUse(it, i); }

  _render() {
    if (!this.cv) return; const ctx = this.ctx; ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "rgba(20,16,10,.92)"; ctx.fillRect(0, 0, W, H);                      // 暗金底栏
    ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
    for (let i = 0; i < MAX_SLOT; i++) {
      const sx = this._slotX(i), sy = PAD;
      ctx.fillStyle = "rgba(8,6,4,.9)"; ctx.fillRect(sx, sy, CELL, CELL);                // 槽底
      ctx.strokeStyle = this.hover === i ? "#ffe8a0" : "#6b5a38"; ctx.strokeRect(sx + 0.5, sy + 0.5, CELL - 1, CELL - 1);
      const it = this.slots[i];
      if (it) {
        const info = getItemInfo(it.itemClass, it.itemType);
        const fid = info && info.invFrameID !== 65535 ? info.invFrameID : it.itemType;
        const s = this.itemPack && this.itemPack.get(fid);
        if (s && s.width) { try { this.itemPack.blit(ctx, (sx + (CELL - s.width) / 2) | 0, (sy + (CELL - s.height) / 2) | 0, fid); } catch {} }
        else { ctx.fillStyle = "rgba(110,82,40,.85)"; ctx.fillRect(sx + 4, sy + 4, CELL - 8, CELL - 8); }
        if (it.num > 1) { ctx.fillStyle = "#ffe8c0"; ctx.font = "9px monospace"; ctx.textAlign = "right"; ctx.textBaseline = "bottom"; ctx.fillText(String(it.num), sx + CELL - 2, sy + CELL - 1); }
      }
      ctx.fillStyle = "#9a865c"; ctx.font = "8px monospace"; ctx.textAlign = "left"; ctx.textBaseline = "top";   // 槽号 1~8
      ctx.fillText(String(i + 1), sx + 2, sy + 2);
    }
  }
}
