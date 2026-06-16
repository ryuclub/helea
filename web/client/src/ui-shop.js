// 商店窗 UI(NPC 商店)。显示服务端 GCShopList 商品(itemType + 价格 silver, 图标 item.ispk 尽力而为),
// 点商品购买 → 回调发 CGShopRequestBuy。出售由 index.html 在商店开启时点背包物触发。
//
// 美术: 开源 shop.spk/shop&storage<race>.spk 精确布局待调研, 按降序先用暗金 DOM(③ js 手搓);
// 商品数据/价格 100% 忠实(服务端权威 ShopTemplate→GCShopList)。物品名表(Item.inf 锁 dpk)缺,
// 暂显示 类型号; 图标 itemType 当帧号尽力而为(命中真图标率较高), 缺则占位。

const SCALE = 2, CELL = 30;

export class ShopUI {
  constructor(container) { this.container = container; this.visible = false; this.items = []; this.npcID = null; this.rackType = 0; }
  setItemPack(pack) { this.itemPack = pack; }          // 复用背包加载的 item.ispk
  setBuyHandler(fn) { this.onBuy = fn; }               // (item) → index.html 发 CGShopRequestBuy
  setSellHandler(fn) { this.onSellToggle = fn; }       // 出售模式开关回调(index.html 据此让点背包物=卖)

  open(npcID, list) {
    this.npcID = npcID; this.items = list.items || []; this.rackType = list.rackType || 0;
    this.marketBuy = list.marketCondBuy; this.marketSell = list.marketCondSell;
    this.visible = true; this._render();
  }
  close() { this.visible = false; if (this.el) this.el.style.display = "none"; if (this.onSellToggle) this.onSellToggle(false); }
  isOpen() { return this.visible; }

  _iconCanvas(itemType) {
    const cv = document.createElement("canvas"); cv.width = CELL; cv.height = CELL;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
    const s = this.itemPack && this.itemPack.get(itemType);
    if (s && s.width) { try { this.itemPack.blit(ctx, (CELL - s.width) / 2 | 0, (CELL - s.height) / 2 | 0, itemType); } catch {} }
    else { ctx.fillStyle = "rgba(110,82,40,.85)"; ctx.fillRect(2, 2, CELL - 4, CELL - 4); ctx.fillStyle = "#ffe8c0"; ctx.font = "8px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(itemType, CELL / 2, CELL / 2); }
    cv.style.cssText = `width:${CELL * SCALE}px;height:${CELL * SCALE}px;image-rendering:pixelated;vertical-align:middle`;
    return cv;
  }
  _ensure() {
    if (this.el) return;
    const d = document.createElement("div"); d.id = "shopWin";
    d.style.cssText = "position:absolute;left:50%;top:80px;transform:translateX(-50%);z-index:23;display:none;width:380px;max-height:70%;overflow:auto;padding:12px 14px;background:rgba(20,16,10,.96);border:2px solid #8a6a3a;border-radius:8px;color:#e8d8b0;font:13px/1.6 'Microsoft YaHei',sans-serif;box-shadow:0 4px 22px #000c;pointer-events:auto;";
    this.container.appendChild(d); this.el = d;
  }
  _render() {
    this._ensure();
    const rows = this.items.map((it) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;padding:4px 2px;border-bottom:1px solid #4a3a22";
      row.appendChild(this._iconCanvas(it.itemType));
      const info = document.createElement("div"); info.style.cssText = "flex:1;font-size:12px";
      info.innerHTML = `类型 ${it.itemClass}-${it.itemType}${it.enchant ? " +" + it.enchant : ""}<br><span style="color:#ffd87a">价 ${it.silver}</span>`;
      row.appendChild(info);
      const buy = document.createElement("span"); buy.textContent = "购买";
      buy.style.cssText = "cursor:pointer;color:#ffd87a;border:1px solid #8a6a3a;border-radius:4px;padding:2px 10px;font-size:12px";
      buy.onclick = () => { if (this.onBuy) this.onBuy(it); };
      row.appendChild(buy);
      return row;
    });
    this.el.innerHTML = "";
    const title = document.createElement("div");
    title.style.cssText = "font-size:14px;color:#ffd87a;border-bottom:1px solid #8a6a3a;margin-bottom:6px;padding-bottom:5px;display:flex;justify-content:space-between";
    title.innerHTML = `<span>商店 · ${this.items.length} 件</span><span id="shopClose" style="cursor:pointer">✕</span>`;
    this.el.appendChild(title);
    rows.forEach((r) => this.el.appendChild(r));
    const tip = document.createElement("div"); tip.style.cssText = "margin-top:8px;font-size:11px;color:#9a8";
    tip.textContent = "出售: 点击背包物品(I 键打开背包)";
    this.el.appendChild(tip);
    this.el.style.display = "block";
    document.getElementById("shopClose").onclick = () => this.close();
    if (this.onSellToggle) this.onSellToggle(true);   // 商店开启 → 背包点击=出售
  }
}
