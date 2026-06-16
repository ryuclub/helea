// 背包 + 装备 UI(忠实复刻 VS_UI 布局, 用开源 spk 资源)。
//
// 资源(均松散可得): inventory<race>.spk(背包窗), gear<race>advancement.spk(装备窗背景),
//   gearslot<race>.spk(空槽图标), item.ispk(物品图标, CIndexSprite, 经 /item/ 路由)。
// 布局常量取自 research/client VS_UI_Game{Common,Slayer,Vampire,Ousters}.cpp(硬编码)。
// 背包 10×6, 格 30×30 无间距; 装备槽 rect 三族各异。
//
// 物品图标 frameID 来自原版 Item.inf(ItemClass+ItemType→FrameID), 该表锁在 dklegend.dpk(未解包):
//   按降序"①用资源"渲染窗口/格子/空槽; 物品图标缺索引表 → 尽力而为(试 itemType 当帧号),
//   失败则占位(色块 + 类型号 + 数量), 逻辑完整可见, 待 dpk 解包后换真图标。

import { loadUIPack, loadItemPack } from "./uispk.js";

const SCALE = 2;
const GRID_COLS = 10, GRID_ROWS = 6, CELL = 30;

// 背包窗: 网格起点(窗内像素偏移), 三族不同。inventory<race>.spk id: 0=窗口背景框。
const INV = {
  slayer:  { win: "inventoryslayer",  x0: 13, y0: 25 },
  vampire: { win: "inventoryvampire", x0: 17, y0: 19 },
  ousters: { win: "inventoryousters", x0: 25, y0: 35 },
};

// 装备窗: 背景 gear<race>advancement.spk(id0), 空槽图标 gearslot<race>.spk(按 img 取帧)。
// 每槽 {id=SlotID, x, y, w, h, img(空槽精灵号, -1=不画底图)}。坐标=窗内像素偏移。
const GEAR = {
  slayer: { win: "gearslayeradvancement", slot: "gearslotslayer", slots: [
    { id: 0, x: 80, y: 15, w: 60, h: 60, img: 0 }, { id: 1, x: 95, y: 86, w: 30, h: 30, img: 1 }, { id: 2, x: 80, y: 120, w: 60, h: 90, img: 2 },
    { id: 3, x: 145, y: 120, w: 60, h: 90, img: 3 }, { id: 4, x: 10, y: 120, w: 60, h: 90, img: 4 }, { id: 5, x: 15, y: 215, w: 60, h: 60, img: 5 },
    { id: 6, x: 145, y: 215, w: 60, h: 60, img: 6 }, { id: 7, x: 80, y: 215, w: 60, h: 90, img: 7 }, { id: 8, x: 27, y: 279, w: 30, h: 30, img: 8 },
    { id: 9, x: 162, y: 279, w: 30, h: 30, img: 8 }, { id: 10, x: 8, y: 315, w: 30, h: 30, img: 9 }, { id: 11, x: 43, y: 315, w: 30, h: 30, img: 9 },
    { id: 12, x: 144, y: 315, w: 30, h: 30, img: 9 }, { id: 13, x: 179, y: 315, w: 30, h: 30, img: 9 }, { id: 14, x: 80, y: 307, w: 60, h: 60, img: 10 },
    { id: 15, x: 9, y: 313, w: 30, h: 30, img: -1 }, { id: 16, x: 44, y: 313, w: 30, h: 30, img: -1 }, { id: 17, x: 142, y: 313, w: 30, h: 30, img: -1 }, { id: 18, x: 177, y: 313, w: 30, h: 30, img: -1 },
    { id: 19, x: 13, y: 55, w: 60, h: 60, img: 12 }, { id: 20, x: 140, y: 60, w: 60, h: 60, img: 13 },
    { id: 21, x: 6, y: 372, w: 30, h: 30, img: 11 }, { id: 22, x: 41, y: 372, w: 30, h: 30, img: 11 }, { id: 23, x: 76, y: 372, w: 30, h: 30, img: 11 }, { id: 24, x: 111, y: 372, w: 30, h: 30, img: 11 }, { id: 25, x: 146, y: 372, w: 30, h: 30, img: 11 }, { id: 26, x: 181, y: 372, w: 30, h: 30, img: 11 },
  ] },
  vampire: { win: "gearvampireadvancement", slot: "gearslotvampire", slots: [
    { id: 0, x: 108, y: 14, w: 30, h: 30, img: 1 }, { id: 1, x: 93, y: 105, w: 60, h: 90, img: 2 }, { id: 2, x: 56, y: 167, w: 30, h: 30, img: 3 },
    { id: 3, x: 158, y: 167, w: 30, h: 30, img: 3 }, { id: 4, x: 56, y: 198, w: 30, h: 30, img: 4 }, { id: 5, x: 90, y: 198, w: 30, h: 30, img: 4 },
    { id: 6, x: 124, y: 198, w: 30, h: 30, img: 4 }, { id: 7, x: 158, y: 198, w: 30, h: 30, img: 4 }, { id: 8, x: 57, y: 14, w: 30, h: 30, img: 0 },
    { id: 9, x: 159, y: 14, w: 30, h: 30, img: 0 }, { id: 10, x: 26, y: 105, w: 60, h: 60, img: 5 }, { id: 11, x: 159, y: 105, w: 60, h: 60, img: 5 },
    { id: 12, x: 56, y: 230, w: 30, h: 30, img: 6 }, { id: 13, x: 90, y: 230, w: 30, h: 30, img: 6 }, { id: 14, x: 125, y: 230, w: 30, h: 30, img: 6 }, { id: 15, x: 158, y: 230, w: 30, h: 30, img: 6 },
    { id: 16, x: 55, y: 198, w: 30, h: 30, img: -1 }, { id: 17, x: 89, y: 198, w: 30, h: 30, img: -1 }, { id: 18, x: 123, y: 198, w: 30, h: 30, img: -1 }, { id: 19, x: 158, y: 198, w: 30, h: 30, img: -1 },
    { id: 20, x: 26, y: 45, w: 60, h: 60, img: 9 }, { id: 21, x: 159, y: 45, w: 60, h: 60, img: 8 },
    { id: 22, x: 23, y: 263, w: 30, h: 30, img: 7 }, { id: 23, x: 57, y: 263, w: 30, h: 30, img: 7 }, { id: 24, x: 91, y: 263, w: 30, h: 30, img: 7 }, { id: 25, x: 125, y: 263, w: 30, h: 30, img: 7 }, { id: 26, x: 159, y: 263, w: 30, h: 30, img: 7 }, { id: 27, x: 193, y: 263, w: 30, h: 30, img: 7 },
  ] },
  ousters: { win: "gearoustersadvancement", slot: "gearslotousters", slots: [
    { id: 0, x: 114, y: 60, w: 60, h: 60, img: 0 }, { id: 1, x: 116, y: 165, w: 60, h: 90, img: 1 }, { id: 2, x: 201, y: 165, w: 60, h: 90, img: 2 },
    { id: 3, x: 27, y: 165, w: 60, h: 90, img: 7 }, { id: 4, x: 114, y: 261, w: 60, h: 90, img: 3 }, { id: 5, x: 25, y: 100, w: 60, h: 60, img: 4 },
    { id: 6, x: 201, y: 100, w: 60, h: 60, img: 4 }, { id: 7, x: 29, y: 269, w: 30, h: 30, img: 5 }, { id: 8, x: 230, y: 269, w: 30, h: 30, img: 5 },
    { id: 9, x: 94, y: 129, w: 30, h: 30, img: 6 }, { id: 10, x: 130, y: 129, w: 30, h: 30, img: 6 }, { id: 11, x: 166, y: 129, w: 30, h: 30, img: 6 },
    { id: 12, x: 65, y: 268, w: 30, h: 30, img: 8 }, { id: 13, x: 195, y: 268, w: 30, h: 30, img: 9 }, { id: 14, x: 65, y: 304, w: 30, h: 30, img: 10 }, { id: 15, x: 195, y: 304, w: 30, h: 30, img: 11 },
    { id: 16, x: 62, y: 270, w: 30, h: 30, img: -1 }, { id: 17, x: 194, y: 270, w: 30, h: 30, img: -1 }, { id: 18, x: 62, y: 306, w: 30, h: 30, img: -1 }, { id: 19, x: 194, y: 306, w: 30, h: 30, img: -1 },
    { id: 20, x: 26, y: 37, w: 60, h: 60, img: 13 }, { id: 21, x: 203, y: 37, w: 60, h: 60, img: 14 },
    { id: 22, x: 41, y: 351, w: 30, h: 30, img: 12 }, { id: 23, x: 75, y: 351, w: 30, h: 30, img: 12 }, { id: 24, x: 111, y: 351, w: 30, h: 30, img: 12 }, { id: 25, x: 146, y: 351, w: 30, h: 30, img: 12 }, { id: 26, x: 180, y: 351, w: 30, h: 30, img: 12 }, { id: 27, x: 215, y: 351, w: 30, h: 30, img: 12 },
  ] },
};

export class InventoryUI {
  constructor(container) {
    this.container = container; this.race = null;
    this.inv = []; this.gear = []; this.visible = false; this._loaded = false;
  }

  async load(race) {
    if (this._loaded && this.race === race) return;
    this.race = race;
    const inv = INV[race] || INV.slayer, gear = GEAR[race] || GEAR.slayer;
    [this.invPack, this.gearWin, this.slotPack, this.itemPack] = await Promise.all([
      loadUIPack(inv.win), loadUIPack(gear.win), loadUIPack(gear.slot), loadItemPack(),
    ]);
    if (!this.invCv) this._mkCanvas();
    this._loaded = true;
    this._applyVisibility();                  // load 可能晚于首次 toggle, 完成后补应用可见性
    if (this.visible) this._render();
  }
  _applyVisibility() {
    const d = this.visible ? "block" : "none";
    if (this.invCv) this.invCv.style.display = d;
    if (this.gearCv) this.gearCv.style.display = d;
  }

  _mkCanvas() {
    this.invCv = this._canvas(this.invPack.width(0) || 220, this.invPack.height(0) || 220, "left:40px");
    this.gearCv = this._canvas(this.gearWin.width(0) || 230, this.gearWin.height(0) || 420, "right:40px");
  }
  _canvas(w, h, pos) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.style.cssText = `position:absolute;${pos};top:90px;z-index:19;display:none;width:${w * SCALE}px;height:${h * SCALE}px;image-rendering:pixelated;`;
    this.container.appendChild(cv); return cv;
  }

  setData(inv, gear) { this.inv = inv || []; this.gear = gear || []; if (this.visible) this._render(); }
  toggle() {
    this.visible = !this.visible;
    this._applyVisibility();
    if (this.visible) this._render();
  }

  // 尽力而为: itemType 当 frameID(精确表 Item.inf 锁 dpk)。命中真图标则用, 否则占位。
  _frame(item) { return item.itemType; }
  _drawItem(ctx, item, cx, cy, cw, ch) {
    const fid = this._frame(item);
    const s = this.itemPack && this.itemPack.get(fid);
    if (s && s.width) {
      this.itemPack.blit(ctx, (cx + (cw - s.width) / 2) | 0, (cy + (ch - s.height) / 2) | 0, fid);
    } else {
      ctx.fillStyle = "rgba(110,82,40,.85)"; ctx.fillRect(cx + 2, cy + 2, cw - 4, ch - 4);
      ctx.strokeStyle = "rgba(200,170,110,.7)"; ctx.strokeRect(cx + 2.5, cy + 2.5, cw - 5, ch - 5);
      ctx.fillStyle = "#ffe8c0"; ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(item.itemType, cx + cw / 2, cy + ch / 2);
    }
    if (item.num > 1) {
      ctx.fillStyle = "#fff"; ctx.font = "9px monospace"; ctx.textAlign = "right"; ctx.textBaseline = "bottom";
      ctx.fillText(item.num, cx + cw - 1, cy + ch);
    }
  }

  _render() {
    if (!this._loaded) return;
    // 背包窗
    const ictx = this.invCv.getContext("2d"); ictx.imageSmoothingEnabled = false;
    ictx.clearRect(0, 0, this.invCv.width, this.invCv.height);
    this.invPack.blit(ictx, 0, 0, 0);
    const inv = INV[this.race] || INV.slayer;
    for (const it of this.inv) {
      const gx = inv.x0 + (it.invenX || 0) * CELL, gy = inv.y0 + (it.invenY || 0) * CELL;
      this._drawItem(ictx, it, gx, gy, CELL, CELL);
    }
    // 装备窗
    const gctx = this.gearCv.getContext("2d"); gctx.imageSmoothingEnabled = false;
    gctx.clearRect(0, 0, this.gearCv.width, this.gearCv.height);
    this.gearWin.blit(gctx, 0, 0, 0);
    const gear = GEAR[this.race] || GEAR.slayer;
    const bySlot = {}; for (const it of this.gear) bySlot[it.slotID] = it;
    for (const sl of gear.slots) {
      const it = bySlot[sl.id];
      if (it) { this._drawItem(gctx, it, sl.x, sl.y, sl.w, sl.h); continue; }
      if (sl.img >= 0) {                                   // 空槽底图
        const s = this.slotPack.get(sl.img);
        if (s) this.slotPack.blit(gctx, (sl.x + (sl.w - s.width) / 2) | 0, (sl.y + (sl.h - s.height) / 2) | 0, sl.img);
      }
    }
  }
}
