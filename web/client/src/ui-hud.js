// 游戏内 HP/MP 血法条 HUD —— 发行包真实美术(HPBar<Race>.spk) + 开源裁剪填充逻辑。
// 取自 research/client VS_UI_GameCommon.cpp C_VS_UI_HPBAR::Show(slayer width_mode 非 small):
//   BltLocked(MAIN_WIDTH#0) 画边框(214×37);
//   HP 填充: rect(0,0, GetWidth(HPBAR_WIDTH#2)*hp/HP_MAX, H), BltLockedClip(x+28, y+4, rect, #2);
//   MP 填充: rect(0,0, GetWidth(MPBAR_WIDTH#4)*mp/MP_MAX, H), BltLockedClip(x+28, y+22, rect, #4)。
// 数据 = g_char_slot_ingame.HP/HP_MAX/MP/MP_MAX(本端从 GC_UPDATE_INFO/GC_MODIFY_INFORMATION 维护)。
import { loadUIPack } from "./uispk.js";

const MAIN = 0, HPBAR = 2, MPBAR = 4;   // 横向(width)模式精灵索引(slayer 枚举)
const HP_OFF = { x: 28, y: 4 }, MP_OFF = { x: 28, y: 22 };
const RACE_PACK = { slayer: "hpbarslayer", vampire: "hpbarvampire", ousters: "hpbarousters" };

export class HudHpBar {
  constructor(container) { this.container = container; this.hp = 0; this.hpMax = 1; this.mp = 0; this.mpMax = 1; }

  async load(race) {
    this.pack = await loadUIPack(RACE_PACK[race] || RACE_PACK.slayer);
    const w = this.pack.width(MAIN), h = this.pack.height(MAIN);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.style.cssText = "position:absolute;left:14px;top:14px;z-index:18;width:" + w * 2 + "px;height:" + h * 2 + "px;image-rendering:pixelated;";
    this.canvas = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;
    this.container.appendChild(cv);
    this._render();
  }

  set(hp, hpMax, mp, mpMax) {
    this.hp = hp; this.hpMax = hpMax || 1; this.mp = mp; this.mpMax = mpMax || 0;
    this._render();
  }

  // 金币显示(血条下方一行)。开源金钱在背包/状态; 这里给个 HUD 常驻读数(千分位)。
  setGold(gold) {
    if (!this.canvas) return;
    if (!this._goldEl) {
      const g = document.createElement("div");
      const top = parseInt(this.canvas.style.top) + this.canvas.height * 2 + 4;
      g.style.cssText = `position:absolute;left:14px;top:${top}px;z-index:18;color:#ffd34d;font:bold 13px/1 system-ui;text-shadow:0 1px 2px #000,0 0 3px #000;pointer-events:none;`;
      this.container.appendChild(g); this._goldEl = g;
    }
    this._goldEl.textContent = "🪙 " + (gold || 0).toLocaleString("en-US");
  }

  _render() {
    if (!this.pack) return;
    const p = this.pack, ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    p.blit(ctx, 0, 0, MAIN);                                       // 边框
    const hpW = Math.round(p.width(HPBAR) * Math.min(1, Math.max(0, this.hp / this.hpMax)));
    p.blitClip(ctx, HP_OFF.x, HP_OFF.y, 0, 0, hpW, p.height(HPBAR), HPBAR);   // HP 填充(裁剪)
    if (this.mpMax > 0) {                                          // 吸血鬼无 MP → 跳过
      const mpW = Math.round(p.width(MPBAR) * Math.min(1, Math.max(0, this.mp / this.mpMax)));
      p.blitClip(ctx, MP_OFF.x, MP_OFF.y, 0, 0, mpW, p.height(MPBAR), MPBAR);
    }
  }

  show() { if (this.canvas) this.canvas.style.display = "block"; }
  hide() { if (this.canvas) this.canvas.style.display = "none"; }
}
