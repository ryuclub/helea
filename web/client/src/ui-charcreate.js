// 建角界面 —— 发行包真实美术(CharCreate.spk #6 主面板) + 叠加控件 + 忠实建角逻辑 + 角色逐帧动画。
// 字段坐标原在 ifpr 二进制(未解析), 按授权用真实面板美术 + 目视量得坐标重建。
// 逻辑忠实: 名字/种族/性别 → CL_CREATE_PC 到指定空槽; 各族属性走开源合法规则。
// TODO: 属性自由分配(开源 +/- 点数); 装备多部位合成。
import { loadUIPack } from "./uispk.js";

const SCR_W = 800, SCR_H = 600;
const PANEL = 6, TITLE = 48;
const SEX_BTN = [26, 27];               // Male/Female 按钮精灵
const PX = (SCR_W - 424) / 2 | 0, PY = (SCR_H - 326) / 2 | 0;  // 面板居中 (188,137)
const NAME = { x: 33, y: 78, w: 112, h: 20 };   // y 上移半字
// 种族单选行(面板内): 命中区 + 单选圈中心(用户精调: 右移1个点距, 三点间距缩小半个点 25→21)
const RACE_ROW = [54, 75, 96];                  // 命中区顶 y(随单选圈下移)
const RADIO = [{ x: 219, y: 63 }, { x: 219, y: 84 }, { x: 219, y: 105 }]; // 单选圈中心
const SEX = [{ x: 152, y: 148 }, { x: 200, y: 148 }];
const PREVIEW = { x: 14, y: 118, w: 120, h: 104 };  // x 左移半个身子
const STAT_VAL_X = 372, STAT_Y0 = 105, STAT_DY = 23;  // 点数整体左移半个+按钮宽
const RACE_NAMES = ["slayer", "vampire", "ousters"];
const ANIM_MS = 100;

// 属性机制忠实复刻开源 RollDice(VS_UI_Title.cpp:896-966):
//   Slayer: STR=5+rand%16; DEX=5+rand%(21-STR); INT=30-STR-DEX; 再随机打乱 → 和恒=30、各≥5。可重掷。
//   Vampire: 固定 20/20/20。 Ousters: 基础 10/10/10 + 15 自由加点(建角前必须加完, 源码 1965-1967)。
function rollDice(raceIdx) {
  if (raceIdx === 1) return { str: 20, dex: 20, int: 20, bonus: 0 };       // Vampire
  if (raceIdx === 2) return { str: 10, dex: 10, int: 10, bonus: 15 };      // Ousters: 10/10/10 + 15 点
  const str = 5 + (Math.random() * 16 | 0);                                // Slayer 掷骰
  const r = 30 - str - 5;
  const dex = 5 + (Math.random() * (r - 5 + 1) | 0);
  const int = 30 - str - dex;
  const s = [str, dex, int];
  for (let i = 0, n = Math.random() * 100 | 0; i < n; i++) { const a = Math.random() * 3 | 0, b = Math.random() * 3 | 0, c = s[a]; s[a] = s[b]; s[b] = c; }
  return { str: s[0], dex: s[1], int: s[2], bonus: 0 };
}

export class CharCreateScreen {
  constructor(container, { onCreate, onBack, loadCharPreview }) {
    this.container = container; this.onCreate = onCreate; this.onBack = onBack; this.loadCharPreview = loadCharPreview;
    this.race = 0; this.sex = 0; this.stat = rollDice(0); this._anim = new Map(); this._frame = 0; this._timer = null;
  }

  async load() {
    this._packs = { cc: await loadUIPack("charcreate") };
    this._build();
    addEventListener("resize", () => this._layout());
  }

  _build() {
    const wrap = document.createElement("div");
    wrap.id = "ccWrap";
    wrap.style.cssText = `position:absolute;left:50%;top:50%;width:${SCR_W}px;height:${SCR_H}px;transform-origin:center center;display:none;`;
    const cv = document.createElement("canvas"); cv.width = SCR_W; cv.height = SCR_H;
    cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;";
    wrap.appendChild(cv);
    this.wrap = wrap; this.canvas = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;

    const nm = document.createElement("input");
    nm.type = "text"; nm.maxLength = 12; nm.autocomplete = "off"; nm.spellcheck = false;
    nm.style.cssText = `position:absolute;left:${PX + NAME.x}px;top:${PY + NAME.y}px;width:${NAME.w}px;height:${NAME.h}px;`
      + "border:0;background:transparent;color:#ffe8c8;caret-color:#ffe8c8;font:13px system-ui;padding:0 3px;outline:none;";
    wrap.appendChild(nm); this.nameInput = nm;

    // 创建 / 返回 按钮(暗金主题, 与界面美术风格一致, 不再用突兀的绿/灰)
    const mkBtn = (txt, left, fn, primary) => {
      const b = document.createElement("button"); b.textContent = txt;
      b.style.cssText = `position:absolute;left:${left}px;top:${PY + 338}px;width:96px;padding:6px 0;`
        + `background:linear-gradient(#3a2a14,#22160a);color:${primary ? "#ffe2a0" : "#cbb890"};`
        + `border:1px solid ${primary ? "#a8843c" : "#6b5a38"};border-radius:4px;font:600 13px system-ui;letter-spacing:2px;cursor:pointer;`;
      b.onclick = fn; wrap.appendChild(b); return b;
    };
    this.createBtn = mkBtn("创建角色", PX + 110, () => this._submit(), true);
    mkBtn("返回", PX + 218, () => this.onBack(), false);

    // 属性控件: Slayer 重掷骰子; Ousters 自由加点 +/-(每族按 race 显隐, 在 _render 同步)
    const mkMini = (txt, left, top, fn) => {
      const b = document.createElement("button"); b.textContent = txt;
      b.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:16px;height:16px;padding:0;line-height:13px;`
        + "background:linear-gradient(#3a2a14,#22160a);color:#ffe2a0;border:1px solid #a8843c;border-radius:3px;font:700 12px system-ui;cursor:pointer;display:none;";
      b.onclick = fn; wrap.appendChild(b); return b;
    };
    this.allocBtns = [];
    for (let i = 0; i < 3; i++) { const y = PY + STAT_Y0 + i * STAT_DY - 3;
      this.allocBtns.push(mkMini("−", PX + 382, y, () => this._alloc(i, -1)));   // 随点数整体左移
      this.allocBtns.push(mkMini("+", PX + 400, y, () => this._alloc(i, +1)));
    }
    this.rerollBtn = document.createElement("button"); this.rerollBtn.textContent = "重掷";
    this.rerollBtn.style.cssText = `position:absolute;left:${PX + 330}px;top:${PY + 296}px;width:64px;padding:4px 0;`
      + "background:linear-gradient(#3a2a14,#22160a);color:#ffe2a0;border:1px solid #a8843c;border-radius:4px;font:600 12px system-ui;cursor:pointer;display:none;";
    this.rerollBtn.onclick = () => { this.stat = rollDice(this.race); this._render(); };
    wrap.appendChild(this.rerollBtn);

    cv.addEventListener("click", (e) => this._click(e));
    this.container.appendChild(wrap);
  }

  _evtPanel(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * SCR_W - PX, y: (e.clientY - r.top) / r.height * SCR_H - PY };
  }
  _click(e) {
    const { x, y } = this._evtPanel(e);
    for (let i = 0; i < 3; i++) if (x > 218 && x < 300 && y > RACE_ROW[i] && y < RACE_ROW[i] + 18) { this.setRace(i); return; }
    const cc = this._packs.cc;
    for (let i = 0; i < 2; i++) { const s = SEX[i]; if (x > s.x && x < s.x + cc.width(SEX_BTN[i]) && y > s.y && y < s.y + cc.height(SEX_BTN[i])) { this.setSex(i); return; } }
  }

  setRace(r) { this.race = r; this.stat = rollDice(r); this._ensureAnim(); this._render(); }  // 换族重掷属性(开源切族重置)
  setSex(s) { this.sex = s; this._ensureAnim(); this._render(); }
  // Ousters 自由加点: + 花一点(各≥10), − 退一点
  _alloc(idx, d) {
    const k = ["str", "dex", "int"][idx];
    if (d > 0) { if (this.stat.bonus <= 0) return; this.stat[k]++; this.stat.bonus--; }
    else { if (this.stat[k] <= 10) return; this.stat[k]--; this.stat.bonus++; }
    this._render();
  }
  async _ensureAnim() {
    const key = RACE_NAMES[this.race] + ":" + this.sex;
    if (!this._anim.has(key)) { try { this._anim.set(key, await this.loadCharPreview(RACE_NAMES[this.race], this.sex)); } catch { this._anim.set(key, null); } this._render(); }
  }

  // 游戏内提示(替代浏览器 alert): 暗金风格浮层, 顶部居中, 2.2s 后淡出。
  _toast(msg) {
    let t = this._toastEl;
    if (!t) {
      t = document.createElement("div");
      t.style.cssText = "position:absolute;left:50%;transform:translateX(-50%);max-width:380px;"
        + `top:${PY + 56}px;padding:9px 18px;background:linear-gradient(#2a1d0e,#160d05);border:1px solid #a8843c;`
        + "border-radius:6px;color:#ffe2a0;font:13px system-ui;letter-spacing:1px;text-align:center;"
        + "box-shadow:0 2px 12px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;pointer-events:none;z-index:5;";
      this.wrap.appendChild(t); this._toastEl = t;
    }
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  _submit() {
    const name = this.nameInput.value.trim();
    if (!/^[A-Za-z0-9]{1,12}$/.test(name)) { this._toast("角色名请用 1~12 位字母或数字"); return; }
    if (this.race === 2 && this.stat.bonus !== 0) { this._toast(`魔灵必须把 15 点加完才能创建(还剩 ${this.stat.bonus} 点)`); return; } // 开源 1965-1967
    this.createBtn.disabled = true;
    this.onCreate({ name, race: this.race, sex: this.sex, str: this.stat.str, dex: this.stat.dex, int: this.stat.int });
  }

  _render() {
    const { ctx, _packs: { cc } } = this;
    ctx.clearRect(0, 0, SCR_W, SCR_H);
    cc.blit(ctx, (SCR_W - cc.width(TITLE)) / 2, 14, TITLE);    // Legacy 标题
    cc.blit(ctx, PX, PY, PANEL);                                // 主面板
    // 选中种族: 填实选中圈(对齐面板自带单选圈)
    const rd = RADIO[this.race];
    ctx.fillStyle = "#ffcc33"; ctx.beginPath(); ctx.arc(PX + rd.x, PY + rd.y, 4, 0, 7); ctx.fill();
    // 性别按钮(选中加金框)
    for (let i = 0; i < 2; i++) { const s = SEX[i]; cc.blit(ctx, PX + s.x, PY + s.y, SEX_BTN[i]);
      if (this.sex === i) { ctx.strokeStyle = "#ffcc33"; ctx.lineWidth = 2; ctx.strokeRect(PX + s.x - 1, PY + s.y - 1, cc.width(SEX_BTN[i]) + 2, cc.height(SEX_BTN[i]) + 2); } }
    // 角色预览(逐帧动画, 立于预览框底部中心; 锚点脚位 + 帧 cx/cy)
    const a = this._anim.get(RACE_NAMES[this.race] + ":" + this.sex);
    const seq = a && a.stand;
    if (seq && seq.length) {
      const fr = seq[this._frame % seq.length];
      const footX = PX + PREVIEW.x + PREVIEW.w / 2, footY = PY + PREVIEW.y + PREVIEW.h - 6;
      const cv = this._frameCanvas(fr);
      ctx.drawImage(cv, (footX + fr.cx - 24) | 0, (footY + fr.cy - 24) | 0);  // render.js 同款锚点(-TW/2,-TH), 修偏右下
    }
    // 属性值(掷骰/加点结果; HP/MP 等服务端派生, 留空)
    const s = this.stat; ctx.fillStyle = "#cfe"; ctx.font = "12px system-ui"; ctx.textAlign = "center";
    [s.str, s.dex, s.int].forEach((v, i) => ctx.fillText(String(v), PX + STAT_VAL_X, PY + STAT_Y0 + i * STAT_DY + 8));
    ctx.textAlign = "left";
    // 属性控件显隐: Slayer 显重掷; Ousters 显加点 +/- 与剩余点数
    const isOus = this.race === 2, isSlay = this.race === 0;
    this.allocBtns.forEach((b) => b.style.display = isOus ? "block" : "none");
    this.rerollBtn.style.display = isSlay ? "block" : "none";
    if (isOus) { ctx.fillStyle = "#ffcc33"; ctx.font = "11px system-ui"; ctx.fillText(`剩余加点 ${this.stat.bonus}`, PX + 350, PY + STAT_Y0 + 3 * STAT_DY + 4); }
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

  reset(slot) { this.slot = slot; this.race = 0; this.sex = 0; this.stat = rollDice(0); this.nameInput.value = ""; this.createBtn.disabled = false; this._ensureAnim(); }
  show(slot) { this.reset(slot); this.wrap.style.display = "block"; this._layout(); this._render(); this.nameInput.focus(); this._startAnim(); }
  hide() { this.wrap.style.display = "none"; this._stopAnim(); }
  _startAnim() { if (this._timer) return; this._timer = setInterval(() => { this._frame++; this._render(); }, ANIM_MS); }
  _stopAnim() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
}
