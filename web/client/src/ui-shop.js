// 商店窗 UI(NPC 商店) —— 忠实复刻开源 C_VS_UI_SHOP(VS_UI_Shop.cpp) + 官方 Shop&Storage<race>.spk。
// 布局(窗口 332×497, canvas 内坐标=相对窗口左上):
//   背景 MAIN_WINDOW(#0 303×93)×4 竖拼 @y=23/125/227/329(x=15); 货架标签 normal#1/special#2/mysterious#3(高亮+3/按下+6)
//   @(15/119/224, 422); 商品 5列×4行=20格, GetSlotX(i)=15+(i%5)*60, GetSlotY=[23,125,227,329][i/5], 格 60×90;
//   图标(Item.inf InventoryFrameID)底对齐居中; 关闭按钮(258,452, 暗金降级)。
// 数据 100% 服务端权威(GCShopList): items[{index,itemClass,itemType,silver,...}]。点商品→购买; 点标签→切货架。
import { loadUIPack } from "./uispk.js";
import { getItemInfo } from "./iteminfo.js";

const SCALE = 2;
const WIN = { w: 332, h: 497 };
const SLOT_X_COUNT = 5, SLOT_W = 60, SLOT_H = 90, SHELF_SLOT = 20;
const SHELF_X = 15, SHELF_Y = [23, 125, 227, 329];
const MAIN_WINDOW = 0;
// 货架标签: base=常态下标, 高亮=base+3, 按下=base+6; rack=SHOP_RACK_TYPE(0 NORMAL/1 SPECIAL/2 MYSTERIOUS)
const TABS = [{ x: 15, y: 422, base: 1, rack: 0 }, { x: 119, y: 422, base: 2, rack: 1 }, { x: 224, y: 422, base: 3, rack: 2 }];
const TAB_W = 95, TAB_H = 27;
const CLOSE = { x: 258, y: 452, w: 64, h: 22 };
// 发行包文件名全小写(Linux 大小写敏感, 必须精确匹配): Data/Ui/spk/shop&storage<race>.spk
const SHOP_SPK = { slayer: "shop&storageslayer", vampire: "shop&storagevampire", ousters: "shop&storageousters" };

const slotX = (i) => SHELF_X + (i % SLOT_X_COUNT) * SLOT_W;
const slotY = (i) => SHELF_Y[Math.floor(i / SLOT_X_COUNT)];

export class ShopUI {
  constructor(container) { this.container = container; this.visible = false; this.items = []; this.rackType = 1; this.race = "slayer"; this.hover = -1; }
  setItemPack(pack) { this.itemPack = pack; }
  setBuyHandler(fn) { this.onBuy = fn; }                // (item) → 发 CGShopRequestBuy
  setSellHandler(fn) { this.onSellToggle = fn; }        // 出售模式开关
  setRackHandler(fn) { this.onRack = fn; }              // (rackType) → 重新请求 CGShopRequestList

  async load(race) {
    this.race = race || "slayer";
    try { this.spk = await loadUIPack(SHOP_SPK[this.race] || SHOP_SPK.slayer); } catch { this.spk = null; }
    if (!this.cv) this._mk();
  }
  _mk() {
    const cv = document.createElement("canvas"); cv.width = WIN.w; cv.height = WIN.h;
    cv.style.cssText = `position:absolute;left:50%;top:50px;transform:translateX(-50%);z-index:23;display:none;width:${WIN.w * SCALE}px;height:${WIN.h * SCALE}px;image-rendering:pixelated;`;
    this.container.appendChild(cv); this.cv = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;
    cv.addEventListener("mousemove", (e) => this._move(e));
    cv.addEventListener("click", (e) => this._click(e));
    cv.addEventListener("mouseleave", () => { if (this.hover !== -1) { this.hover = -1; this._render(); } this._hideTip(); });
    this.tip = document.createElement("div");
    this.tip.style.cssText = "position:fixed;z-index:31;pointer-events:none;display:none;max-width:220px;padding:6px 9px;background:rgba(20,16,10,.96);border:1px solid #8a6a3a;border-radius:5px;color:#e8d8b0;font:12px/1.5 system-ui;box-shadow:0 2px 10px #000a;";
    document.body.appendChild(this.tip);
  }

  async open(npcID, list) {
    this.npcID = npcID; this.items = list.items || []; this.rackType = list.rackType !== undefined ? list.rackType : 1;
    if (!this.spk || !this.cv) await this.load(this.race);
    this.visible = true; if (this.cv) this.cv.style.display = "block"; this._render();
    if (this.onSellToggle) this.onSellToggle(true);     // 商店开 → 点背包物=出售
  }
  close() { this.visible = false; if (this.cv) this.cv.style.display = "none"; if (this.onSellToggle) this.onSellToggle(false); this._hideTip(); }
  isOpen() { return this.visible; }

  _evt(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * WIN.w, y: (e.clientY - r.top) / r.height * WIN.h }; }
  _slotAt(px, py) { for (let i = 0; i < SHELF_SLOT; i++) { const sx = slotX(i), sy = slotY(i); if (px >= sx && px < sx + SLOT_W && py >= sy && py < sy + SLOT_H) return i; } return -1; }
  _itemAt(idx) { return this.items.find((it) => it.index === idx); }

  _move(e) {
    const { x, y } = this._evt(e); const idx = this._slotAt(x, y); const it = idx >= 0 ? this._itemAt(idx) : null;
    if (idx !== this.hover) { this.hover = it ? idx : -1; this._render(); }
    if (it) { const info = getItemInfo(it.itemClass, it.itemType); const nm = (info && info.eName) || `类型 ${it.itemClass}-${it.itemType}`;
      this.tip.innerHTML = `<div style="color:#ffd87a;font-weight:600">${nm}${it.enchant ? " +" + it.enchant : ""}</div><div style="color:#ffd87a;font-size:11px">价 ${it.silver}</div>`;
      this.tip.style.left = (e.clientX + 14) + "px"; this.tip.style.top = (e.clientY + 14) + "px"; this.tip.style.display = "block"; }
    else this._hideTip();
  }
  _hideTip() { if (this.tip) this.tip.style.display = "none"; }
  _click(e) {
    const { x, y } = this._evt(e);
    for (const t of TABS) if (x >= t.x && x < t.x + TAB_W && y >= t.y && y < t.y + TAB_H) {   // 切货架
      if (t.rack !== this.rackType && this.onRack) this.onRack(t.rack); return;
    }
    if (x >= CLOSE.x && x < CLOSE.x + CLOSE.w && y >= CLOSE.y && y < CLOSE.y + CLOSE.h) { this.close(); return; }
    const idx = this._slotAt(x, y); const it = idx >= 0 ? this._itemAt(idx) : null;            // 点商品→购买
    if (it && this.onBuy) this.onBuy(it);
  }

  _frame(it) { const info = getItemInfo(it.itemClass, it.itemType); const f = info && info.invFrameID; return (f !== undefined && f !== 65535) ? f : it.itemType; }
  _render() {
    if (!this.cv) return;
    const ctx = this.ctx; ctx.clearRect(0, 0, WIN.w, WIN.h);
    if (this.spk) { for (let r = 0; r < 4; r++) this.spk.blit(ctx, SHELF_X, SHELF_Y[r], MAIN_WINDOW); }   // 背景×4 竖拼
    else { ctx.fillStyle = "rgba(20,16,10,.96)"; ctx.fillRect(0, 0, WIN.w, WIN.h); }                       // spk 缺→暗金底
    // 货架标签(当前货架高亮)
    if (this.spk) for (const t of TABS) this.spk.blit(ctx, t.x, t.y, t.rack === this.rackType ? t.base + 3 : t.base);
    // 商品格子: 图标(底对齐居中) + 价格
    for (const it of this.items) {
      const i = it.index; if (i < 0 || i >= SHELF_SLOT) continue;
      const sx = slotX(i), sy = slotY(i);
      if (this.hover === i) { ctx.strokeStyle = "#ffe8a0"; ctx.lineWidth = 1; ctx.strokeRect(sx + 0.5, sy + 0.5, SLOT_W - 1, SLOT_H - 1); }
      const fid = this._frame(it), s = this.itemPack && this.itemPack.get(fid);
      if (s && s.width) this.itemPack.blit(ctx, (sx + (SLOT_W - s.width) / 2) | 0, (sy + SLOT_H - s.height - 14) | 0, fid);
      else { ctx.fillStyle = "rgba(110,82,40,.8)"; ctx.fillRect(sx + 6, sy + 6, SLOT_W - 12, SLOT_H - 24); }
      ctx.fillStyle = "#ffd87a"; ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText(String(it.silver), sx + SLOT_W / 2, sy + SLOT_H - 2);
    }
    // 关闭按钮(暗金降级)
    ctx.fillStyle = "rgba(40,28,14,.9)"; ctx.fillRect(CLOSE.x, CLOSE.y, CLOSE.w, CLOSE.h);
    ctx.strokeStyle = "#a8843c"; ctx.strokeRect(CLOSE.x + 0.5, CLOSE.y + 0.5, CLOSE.w - 1, CLOSE.h - 1);
    ctx.fillStyle = "#ffe2a0"; ctx.font = "12px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("关闭", CLOSE.x + CLOSE.w / 2, CLOSE.y + CLOSE.h / 2);
    // 出售提示
    ctx.fillStyle = "#9a8"; ctx.font = "11px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("出售: 点背包物品(I)", 15, CLOSE.y + CLOSE.h / 2);
  }
}
