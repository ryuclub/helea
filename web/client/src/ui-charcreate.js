// 建角界面 —— 忠实复刻开源 C_VS_UI_NEWCHAR(VS_UI_Title.cpp) + 官方 CharCreate.spk/Common.spk。
// 按钮坐标来自官方 skin 配置 infodata.rpk(密码 darkeden) → ChinaInterface.inf 的 *NEW_CHAR POINT_LIST。
// 官方包下标(实测尺寸吻合, 45 精灵):
//   Common.spk: BG=0, BACK=1/亮3, NEXT=4/亮6
//   CharCreate.spk(CREATE_SPK_ID): WINDOW=0(510x354主面板), CHARACTER_GUARD=1(角色框), TITLE=2, MALE_CHECK=3(选中标记7x7),
//     SLAYER=5,VAMPIRE=6,OUSTERS=7, MALE=8,FEMALE=9, FACE_BACK=10,FACE_NEXT=13, CHECK=16, SAVE=19,LOAD=22,REROLL=25,
//     BONUS_LINE=28, PLUS=29,MINUS=32。
// 布局(800x600, 原点0,0): 背景Common#0; 主面板#0@(250,150); 标题#2居中(400,50); 角色框#1@(55,350); 立绘脚点(95,440);
//   名字框(421,183); 三族(404,218)(473,218)(404,241); 性别(404,276)(465,276); SAVE/LOAD/REROLL(572/617/664,215);
//   CHECK(503,178); ±STR/DEX/INT(+740/−725, y=250/275/300); BACK(28,522) NEXT(687,522);
//   选中标记 MALE_CHECK: 族(411,223)(480,223)(411,246), 性别男(411,281)女(473,281); 属性数值 x=714 y=249起每行+25。
// 能力限制(非逻辑打折): 发色/肤色表 + 脸型(FaceMake.spk + FACE箭头) 需多部位合成系统(待建), 暂不画; Vampire发色/Ousters肤色官方固定377。
import { loadUIPack } from "./uispk.js";

const SCR_W = 800, SCR_H = 600;
const RACE_NAMES = ["slayer", "vampire", "ousters"];
const ANIM_MS = 100;
// Common.spk 下标
const C = { BG: 0, BACK: 1, BACK_H: 3, NEXT: 4, NEXT_H: 6 };
// CharCreate.spk 下标
const M = { WINDOW: 0, GUARD: 1, TITLE: 2, MARK: 3, SLAYER: 5, VAMPIRE: 6, OUSTERS: 7, MALE: 8, FEMALE: 9,
  CHECK: 16, CHECK_H: 18, SAVE: 19, SAVE_H: 21, LOAD: 22, LOAD_H: 24, REROLL: 25, REROLL_H: 27,
  BONUS_LINE: 28, PLUS: 29, PLUS_H: 31, MINUS: 32, MINUS_H: 34 };
// 坐标(官方 skin)
const PANEL_XY = [250, 150], TITLE_X = 400, TITLE_Y = 50, GUARD_XY = [55, 350], FOOT = [95, 440], NAME_XY = [421, 183];
const RACE_BTN = [[404, 218], [473, 218], [404, 241]];   // slayer/vampire/ousters
const SEX_BTN = [[404, 276], [465, 276]];                // male/female
const SAVE_XY = [572, 215], LOAD_XY = [617, 215], REROLL_XY = [664, 215], CHECK_XY = [503, 178];
const PLUS_XY = [[740, 250], [740, 275], [740, 300]], MINUS_XY = [[725, 250], [725, 275], [725, 300]];
const BACK_XY = [28, 522], NEXT_XY = [687, 522];
const RACE_MARK = [[411, 223], [480, 223], [411, 246]];  // 种族选中标记(MALE_CHECK)
const SEX_MARK = [[411, 281], [473, 281]];               // 性别选中标记(男/女)
const STAT_X = 714, STAT_Y0 = 249, STAT_DY = 25, BONUS_LINE_XY = [573, 470];

// 属性机制忠实复刻 RollDice(VS_UI_Title.cpp:896-982):
//   Slayer: STR=5+rand%16; DEX=5+rand%(余-5+1); INT=30-STR-DEX; 随机打乱 → 和恒30、各≥5、可重掷/存读。
//   Vampire: 固定 20/20/20。 Ousters: 10/10/10 + 15 自由加点(各≥10, 建角前须加完)。
function rollDice(raceIdx) {
  if (raceIdx === 1) return { str: 20, dex: 20, int: 20, bonus: 0 };
  if (raceIdx === 2) return { str: 10, dex: 10, int: 10, bonus: 15 };
  const str = 5 + (Math.random() * 16 | 0);
  const r = 30 - str - 5;
  const dex = 5 + (Math.random() * (r - 5 + 1) | 0);
  const int = 30 - str - dex;
  const s = [str, dex, int];
  for (let i = 0, n = Math.random() * 100 | 0; i < n; i++) { const a = Math.random() * 3 | 0, b = Math.random() * 3 | 0, c = s[a]; s[a] = s[b]; s[b] = c; }
  return { str: s[0], dex: s[1], int: s[2], bonus: 0 };
}
// 派生属性(RollDice 通用计算, 行968-979)
function derive(s) {
  return { hp: s.str * 2, mp: s.int * 2, defense: s.dex, protection: (s.str / 15) | 0, tohit: s.dex, dam: 1, dam2: Math.max(1, (s.str / 10) | 0) };
}

export class CharCreateScreen {
  constructor(container, { onCreate, onBack, loadCharPreview }) {
    this.container = container; this.onCreate = onCreate; this.onBack = onBack; this.loadCharPreview = loadCharPreview;
    this.race = 0; this.sex = 0; this.stat = rollDice(0); this._save = null;
    this._anim = new Map(); this._frame = 0; this._timer = null; this.hover = null;
  }

  async load() {
    const [common, cc] = await Promise.all([loadUIPack("common"), loadUIPack("charcreate")]);
    this._packs = { common, cc };
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

    // 名字输入(DOM, 覆盖在官方名字框位置 421,183)
    const nm = document.createElement("input");
    nm.type = "text"; nm.maxLength = 10; nm.autocomplete = "off"; nm.spellcheck = false;
    nm.style.cssText = `position:absolute;left:${NAME_XY[0]}px;top:${NAME_XY[1]}px;width:150px;height:20px;`
      + "border:0;background:transparent;color:#ffe8c8;caret-color:#ffe8c8;font:13px system-ui;padding:0 3px;outline:none;text-align:center;";
    wrap.appendChild(nm); this.nameInput = nm;

    cv.addEventListener("mousemove", (e) => { const b = this._hit(e); const k = b ? b.kind + ":" + (b.i ?? "") : null; if (k !== this.hover) { this.hover = k; this._render(); } });
    cv.addEventListener("mouseleave", () => { if (this.hover) { this.hover = null; this._render(); } });
    cv.addEventListener("click", (e) => this._click(e));
    this.container.appendChild(wrap);
  }

  _evt(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * SCR_W, y: (e.clientY - r.top) / r.height * SCR_H }; }

  // 命中区(按族显隐: REROLL/SAVE/LOAD 仅Slayer; PLUS/MINUS 仅Ousters)
  _buttons() {
    const { common, cc } = this._packs, out = [];
    const r = (kind, xy, idx, pack, i) => ({ kind, i, x: xy[0], y: xy[1], w: pack.width(idx), h: pack.height(idx) });
    out.push(r("back", BACK_XY, C.BACK, common));
    out.push(r("next", NEXT_XY, C.NEXT, common));
    out.push({ kind: "check", x: CHECK_XY[0], y: CHECK_XY[1], w: cc.width(M.CHECK), h: cc.height(M.CHECK) });
    for (let i = 0; i < 3; i++) out.push({ kind: "race", i, x: RACE_BTN[i][0], y: RACE_BTN[i][1], w: cc.width(M.SLAYER + i) + 20, h: cc.height(M.SLAYER + i) });
    if (this.race !== 2) for (let i = 0; i < 2; i++) out.push({ kind: "sex", i, x: SEX_BTN[i][0], y: SEX_BTN[i][1], w: cc.width(M.MALE + i) + 20, h: cc.height(M.MALE + i) });
    if (this.race === 0) {
      out.push({ kind: "save", x: SAVE_XY[0], y: SAVE_XY[1], w: cc.width(M.SAVE), h: cc.height(M.SAVE) });
      out.push({ kind: "load", x: LOAD_XY[0], y: LOAD_XY[1], w: cc.width(M.LOAD), h: cc.height(M.LOAD) });
      out.push({ kind: "reroll", x: REROLL_XY[0], y: REROLL_XY[1], w: cc.width(M.REROLL), h: cc.height(M.REROLL) });
    }
    if (this.race === 2) for (let i = 0; i < 3; i++) {
      out.push({ kind: "plus", i, x: PLUS_XY[i][0], y: PLUS_XY[i][1], w: cc.width(M.PLUS), h: cc.height(M.PLUS) });
      out.push({ kind: "minus", i, x: MINUS_XY[i][0], y: MINUS_XY[i][1], w: cc.width(M.MINUS), h: cc.height(M.MINUS) });
    }
    return out;
  }

  _hit(e) {
    const { x, y } = this._evt(e);
    const bs = this._buttons();
    for (let k = bs.length - 1; k >= 0; k--) { const b = bs[k]; if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b; }
    return null;
  }

  _click(e) {
    const b = this._hit(e); if (!b) return;
    switch (b.kind) {
      case "race": this.setRace(b.i); break;
      case "sex": this.setSex(b.i); break;
      case "reroll": this.stat = rollDice(0); this._render(); break;
      case "save": this._save = { ...this.stat }; this._toast("已保存属性"); break;
      case "load": if (this._save) { this.stat = { ...this._save }; this._render(); } break;
      case "plus": this._alloc(b.i, +1); break;
      case "minus": this._alloc(b.i, -1); break;
      case "check": this._check(); break;
      case "next": this._submit(); break;
      case "back": this.onBack(); break;
    }
  }

  setRace(r) { this.race = r; this.sex = 0; this.stat = rollDice(r); this._save = null; this._ensureAnim(); this._render(); }  // 切族重掷(开源)
  setSex(s) { this.sex = s; this._ensureAnim(); this._render(); }
  _alloc(idx, d) {                                                  // Ousters 自由加点(各≥10)
    const k = ["str", "dex", "int"][idx];
    if (d > 0) { if (this.stat.bonus <= 0) return; this.stat[k]++; this.stat.bonus--; }
    else { if (this.stat[k] <= 10) return; this.stat[k]--; this.stat.bonus++; }
    this._render();
  }
  _check() {
    const name = this.nameInput.value.trim();
    if (!/^[A-Za-z0-9]{1,10}$/.test(name)) { this._toast("角色名请用 1~10 位字母或数字"); return; }
    this._toast(`"${name}" 格式合法`);                              // 服务端重名检查(CG包)待接, 先本地格式校验
  }
  async _ensureAnim() {
    const key = RACE_NAMES[this.race] + ":" + this.sex;
    if (!this._anim.has(key)) { try { this._anim.set(key, await this.loadCharPreview(RACE_NAMES[this.race], this.sex)); } catch { this._anim.set(key, null); } this._render(); }
  }

  _toast(msg) {
    let t = this._toastEl;
    if (!t) {
      t = document.createElement("div");
      t.style.cssText = "position:absolute;left:50%;transform:translateX(-50%);max-width:380px;top:96px;padding:9px 18px;"
        + "background:linear-gradient(#2a1d0e,#160d05);border:1px solid #a8843c;border-radius:6px;color:#ffe2a0;"
        + "font:13px system-ui;letter-spacing:1px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;pointer-events:none;z-index:5;";
      this.wrap.appendChild(t); this._toastEl = t;
    }
    t.textContent = msg; t.style.opacity = "1";
    clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2200);
  }

  _submit() {
    const name = this.nameInput.value.trim();
    if (!/^[A-Za-z0-9]{1,10}$/.test(name)) { this._toast("角色名请用 1~10 位字母或数字"); return; }
    if (this.race === 2 && this.stat.bonus !== 0) { this._toast(`魔灵必须把 15 点加完才能创建(还剩 ${this.stat.bonus} 点)`); return; }  // 开源 NEXT_ID 检查
    this.onCreate({ name, race: this.race, sex: this.sex, str: this.stat.str, dex: this.stat.dex, int: this.stat.int });
  }

  _render() {
    const { ctx, _packs: { common, cc } } = this;
    ctx.clearRect(0, 0, SCR_W, SCR_H);
    common.blit(ctx, 0, 0, C.BG);                                   // 背景
    cc.blit(ctx, PANEL_XY[0], PANEL_XY[1], M.WINDOW);              // 主面板
    cc.blit(ctx, (TITLE_X - cc.width(M.TITLE) / 2) | 0, TITLE_Y, M.TITLE);  // 标题居中
    cc.blit(ctx, GUARD_XY[0], GUARD_XY[1], M.GUARD);              // 角色框
    if (this.race === 2) cc.blit(ctx, BONUS_LINE_XY[0], BONUS_LINE_XY[1], M.BONUS_LINE);

    // 三族 + 性别按钮
    for (let i = 0; i < 3; i++) cc.blit(ctx, RACE_BTN[i][0], RACE_BTN[i][1], M.SLAYER + i);
    if (this.race !== 2) for (let i = 0; i < 2; i++) cc.blit(ctx, SEX_BTN[i][0], SEX_BTN[i][1], M.MALE + i);
    // 选中标记
    cc.blit(ctx, RACE_MARK[this.race][0], RACE_MARK[this.race][1], M.MARK);
    if (this.race !== 2) cc.blit(ctx, SEX_MARK[this.sex][0], SEX_MARK[this.sex][1], M.MARK);

    // 属性按钮(按族)
    if (this.race === 0) {
      cc.blit(ctx, SAVE_XY[0], SAVE_XY[1], this.hover === "save:" ? M.SAVE_H : M.SAVE);
      cc.blit(ctx, LOAD_XY[0], LOAD_XY[1], this.hover === "load:" ? M.LOAD_H : M.LOAD);
      cc.blit(ctx, REROLL_XY[0], REROLL_XY[1], this.hover === "reroll:" ? M.REROLL_H : M.REROLL);
    }
    if (this.race === 2) for (let i = 0; i < 3; i++) {
      cc.blit(ctx, PLUS_XY[i][0], PLUS_XY[i][1], this.hover === "plus:" + i ? M.PLUS_H : M.PLUS);
      cc.blit(ctx, MINUS_XY[i][0], MINUS_XY[i][1], this.hover === "minus:" + i ? M.MINUS_H : M.MINUS);
    }
    cc.blit(ctx, CHECK_XY[0], CHECK_XY[1], this.hover === "check:" ? M.CHECK_H : M.CHECK);
    common.blit(ctx, BACK_XY[0], BACK_XY[1], this.hover === "back:" ? C.BACK_H : C.BACK);
    common.blit(ctx, NEXT_XY[0], NEXT_XY[1], this.hover === "next:" ? C.NEXT_H : C.NEXT);

    // 角色立绘(脚点 95,440)
    const a = this._anim.get(RACE_NAMES[this.race] + ":" + this.sex), seq = a && a.stand;
    if (seq && seq.length) {
      const fr = seq[this._frame % seq.length], cv = this._frameCanvas(fr);
      ctx.drawImage(cv, (FOOT[0] + fr.cx - 24) | 0, (FOOT[1] + fr.cy - 24) | 0);
    }

    // 属性数值(x=714, 行距25): STR/DEX/INT/HP/MP/DEF/PROT/TOHIT/DAM[/bonus]
    const s = this.stat, d = derive(s);
    const vals = [s.str, s.dex, s.int, d.hp, d.mp, d.defense, d.protection, d.tohit, `${d.dam}~${d.dam2}`];
    if (this.race === 2) vals.push(s.bonus);
    ctx.fillStyle = "#ffe8c8"; ctx.font = "13px system-ui"; ctx.textAlign = "left";
    vals.forEach((v, i) => ctx.fillText(String(v), STAT_X, STAT_Y0 + i * STAT_DY + 5));
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

  reset(slot) { this.slot = slot; this.race = 0; this.sex = 0; this.stat = rollDice(0); this._save = null; this.nameInput.value = ""; this._ensureAnim(); }
  show(slot) { this.reset(slot); this.wrap.style.display = "block"; this._layout(); this._render(); this.nameInput.focus(); this._startAnim(); }
  hide() { this.wrap.style.display = "none"; this._stopAnim(); }
  _startAnim() { if (this._timer) return; this._timer = setInterval(() => { this._frame++; this._render(); }, ANIM_MS); }
  _stopAnim() { if (this._timer) { clearInterval(this._timer); this._timer = null; } }
}
