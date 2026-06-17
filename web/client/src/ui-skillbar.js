// 技能栏(右侧竖排) —— 显示角色已学/可用技能图标, 点选"装填"技能后点怪释放(CG_SKILL_TO_OBJECT)。
// 数据: GC_SKILL_INFO(proto.js readSkillInfo) 下发 skills[]; 图标/中文名查 public/assets/skillinfo.json
//   (SkillType→{s:SkillIcon.spk下标, n:中文名, e:英文名}, 由 tools/extract-skillinfo.mjs 生成)。
// 图标包: SkillIcon.spk(CSprite, 36×36) 经 /ui/spk 路由, uispk.loadUIPack 加载。
// 交互: 点技能槽 → onArm(skill) 装填(renderer 标记 armedSkill); 再点怪 → 释放。Esc/再点同槽 → 取消装填。
import { loadUIPack } from "./uispk.js";

const SCALE = 1.4, CELL = 36, GAP = 4, PAD = 5;

export class SkillBar {
  constructor(container) { this.container = container; this.skills = []; this.hover = -1; this.armed = -1; this.pack = null; this.info = {}; }
  setArmHandler(fn) { this.onArm = fn; }          // (skill|null) → 装填/取消(renderer 记 armedSkill)

  // 异步加载图标包 + 技能信息表(只一次)。
  async load() {
    if (this._loaded) return; this._loaded = true;
    try {
      this.pack = await loadUIPack("SkillIcon");
      this.info = await fetch("/public/assets/skillinfo.json").then((r) => r.ok ? r.json() : {});
    } catch { this.info = {}; }
  }

  // 用 GC_SKILL_INFO 的 skills[] 刷新: 仅留 enable 且图标表里有的(去重, 保序)。
  async setSkills(skills) {
    await this.load();
    const seen = new Set(); this.skills = [];
    for (const sk of (skills || [])) {
      if (!sk.enable) continue; if (seen.has(sk.skillType)) continue;
      const meta = this.info[sk.skillType]; if (!meta) continue;            // 无图标(实验技能)→不显示
      seen.add(sk.skillType); this.skills.push({ ...sk, ...meta });
    }
    if (!this.cv) this._mk();
    this.cv.style.display = this.skills.length ? "block" : "none";
    this._fit(); this._render();
  }

  _fit() { const n = Math.max(1, this.skills.length); const H = PAD * 2 + n * CELL + (n - 1) * GAP, W = PAD * 2 + CELL; this.cv.width = W; this.cv.height = H; this.cv.style.width = (W * SCALE) + "px"; this.cv.style.height = (H * SCALE) + "px"; this.ctx.imageSmoothingEnabled = false; }

  _mk() {
    const cv = document.createElement("canvas");
    cv.style.cssText = `position:absolute;right:8px;top:120px;z-index:22;display:none;image-rendering:pixelated;cursor:pointer;`;
    this.container.appendChild(cv); this.cv = cv; this.ctx = cv.getContext("2d");
    cv.addEventListener("mousemove", (e) => this._move(e));
    cv.addEventListener("click", (e) => this._click(e));
    cv.addEventListener("mouseleave", () => { if (this.hover !== -1) { this.hover = -1; this._render(); } this._hideTip(); });
    this.tip = document.createElement("div");
    this.tip.style.cssText = "position:fixed;z-index:31;pointer-events:none;display:none;max-width:220px;padding:5px 8px;background:rgba(20,16,10,.96);border:1px solid #8a6a3a;border-radius:5px;color:#e8d8b0;font:12px/1.4 system-ui;box-shadow:0 2px 10px #000a;";
    document.body.appendChild(this.tip);
  }

  _slotY(i) { return PAD + i * (CELL + GAP); }
  _evt(e) { const r = this.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.cv.width, y: (e.clientY - r.top) / r.height * this.cv.height }; }
  _slotAt(px, py) { if (px < PAD || px >= PAD + CELL) return -1; for (let i = 0; i < this.skills.length; i++) { const sy = this._slotY(i); if (py >= sy && py < sy + CELL) return i; } return -1; }

  _move(e) {
    const { x, y } = this._evt(e); const i = this._slotAt(x, y);
    if (i !== this.hover) { this.hover = i; this._render(); }
    const sk = i >= 0 ? this.skills[i] : null;
    if (sk) {
      const cd = sk.interval ? `<div style="color:#9c9;font-size:11px">冷却 ${(sk.interval / 1000).toFixed(1)}s${sk.castingTime ? ` · 吟唱 ${(sk.castingTime / 1000).toFixed(1)}s` : ""}</div>` : "";
      this.tip.innerHTML = `<div style="color:#ffd87a;font-weight:600">${sk.n}</div><div style="color:#9c9;font-size:11px">${sk.e}</div>${cd}<div style="color:#c9b070;font-size:11px;margin-top:2px">点击装填, 再点怪释放</div>`;
      this.tip.style.left = (e.clientX - 232) + "px"; this.tip.style.top = (e.clientY - 30) + "px"; this.tip.style.display = "block";
    } else this._hideTip();
  }
  _hideTip() { if (this.tip) this.tip.style.display = "none"; }

  _click(e) {
    const { x, y } = this._evt(e); const i = this._slotAt(x, y); if (i < 0) return;
    if (this.armed === i) { this.armed = -1; if (this.onArm) this.onArm(null); }   // 再点同槽 → 取消装填
    else { this.armed = i; if (this.onArm) this.onArm(this.skills[i]); }
    this._render();
  }
  disarm() { if (this.armed !== -1) { this.armed = -1; this._render(); } }   // 外部(释放完/Esc)取消高亮

  _render() {
    if (!this.cv) return; const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < this.skills.length; i++) {
      const sx = PAD, sy = this._slotY(i), sk = this.skills[i];
      ctx.fillStyle = "rgba(8,6,4,.9)"; ctx.fillRect(sx, sy, CELL, CELL);
      const s = this.pack && this.pack.get(sk.s);
      if (s && s.width) { try { this.pack.blit(ctx, (sx + (CELL - s.width) / 2) | 0, (sy + (CELL - s.height) / 2) | 0, sk.s); } catch {} }
      // 边框: 装填=亮金粗框, 悬停=亮金, 否则暗金
      ctx.lineWidth = this.armed === i ? 2 : 1;
      ctx.strokeStyle = this.armed === i ? "#ffe070" : (this.hover === i ? "#ffe8a0" : "#6b5a38");
      ctx.strokeRect(sx + 0.5, sy + 0.5, CELL - 1, CELL - 1);
    }
  }
}
