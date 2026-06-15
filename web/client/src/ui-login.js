// 忠实复刻开源登录界面(VS_UI C_VS_UI_LOGIN, 800×600)。
// 资源: Title.spk(背景) + Login.spk(登录框) + LoginMenu.spk(菜单按钮), 均来自 Data/Ui/spk。
// 坐标全部取自 research/client/VS_UI/src/VS_UI_Title.cpp 的 800×600(非1024)分支:
//   登录框 Set(400-W/2, 300-H/2-57) → (289,153), 框尺寸 222×179。
//   输入框(窗口内相对): ID(59,49) 密码(59,89), Rect 宽130 高23。
//   登录菜单按钮(窗口内相对): OK(52,123) NEW(118,123) CANCEL(156,28)。
//   LoginMenu.spk 枚举: NEW_ID=0,OK=1,CANCEL=2,PUSHED_NEW_ID=3,PUSHED_OK=4,PUSHED_CANCEL=5。
import { loadUIPack } from "./uispk.js";

const SCR_W = 800, SCR_H = 600;
const BOX_W = 222, BOX_H = 179;
const BOX_X = 400 - BOX_W / 2;          // 289
const BOX_Y = 300 - (BOX_H / 2) - 57;   // 153.5 → 取整 153
const FIELD_W = 130, FIELD_H = 23;
const ID = { x: 59, y: 49 }, PW = { x: 59, y: 89 };
const M = { NEW: 0, OK: 1, CANCEL: 2, P_NEW: 3, P_OK: 4, P_CANCEL: 5 };
const BTN = [
  { key: "ok",     rx: 52,  ry: 123, idx: M.OK,     pidx: M.P_OK },
  { key: "new",    rx: 118, ry: 123, idx: M.NEW,    pidx: M.P_NEW },
  { key: "cancel", rx: 156, ry: 28,  idx: M.CANCEL, pidx: M.P_CANCEL },
];

export class LoginScreen {
  constructor(container, { onLogin, onRegister }) {
    this.container = container;
    this.onLogin = onLogin; this.onRegister = onRegister;
    this.pressed = null; this._packs = null; this._buttons = [];
  }

  async load() {
    // 真实 UI 资源(发行包)。
    const [title, login, menu] = await Promise.all([
      loadUIPack("title"), loadUIPack("login"), loadUIPack("loginmenu"),
    ]);
    this._packs = { title, login, menu };
    this._build();
    this._render();
    this._layout();
    addEventListener("resize", () => this._layout());
  }

  _build() {
    // 800×600 缩放容器: canvas(底) + 两个输入框(随容器缩放, 坐标 1:1)。
    const wrap = document.createElement("div");
    wrap.id = "loginWrap";
    wrap.style.cssText = `position:absolute;left:50%;top:50%;width:${SCR_W}px;height:${SCR_H}px;transform-origin:center center;`;
    const cv = document.createElement("canvas");
    cv.width = SCR_W; cv.height = SCR_H;
    cv.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;";
    wrap.appendChild(cv);
    this.canvas = cv; this.ctx = cv.getContext("2d"); this.ctx.imageSmoothingEnabled = false;
    this.wrap = wrap;

    const mkInput = (type, gx, gy) => {
      const el = document.createElement("input");
      el.type = type; el.autocomplete = "off"; el.spellcheck = false;
      // 输入凹槽是开源美术的黑底 → 文字用浅色(暖白), 背景透明显出原框。
      el.style.cssText = `position:absolute;left:${BOX_X + gx}px;top:${BOX_Y + gy}px;width:${FIELD_W}px;height:${FIELD_H}px;`
        + "border:0;background:transparent;color:#ffe8c8;caret-color:#ffe8c8;font:15px system-ui,sans-serif;padding:0 4px;outline:none;letter-spacing:1px;";
      wrap.appendChild(el); return el;
    };
    this.idInput = mkInput("text", ID.x, ID.y);
    this.pwInput = mkInput("password", PW.x, PW.y);
    this.idInput.maxLength = 13; this.pwInput.maxLength = 10;

    const submit = () => { const id = this.idInput.value.trim(), pw = this.pwInput.value; if (id && pw) this.onLogin(id, pw); };
    for (const el of [this.idInput, this.pwInput]) el.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    this._submit = submit;

    // 画布点击 → 命中测试登录菜单按钮(按下/抬起反馈)。
    cv.addEventListener("mousedown", (e) => { const b = this._hit(e); if (b) { this.pressed = b.key; this._render(); } });
    cv.addEventListener("mouseup", (e) => {
      const b = this._hit(e); const was = this.pressed; this.pressed = null; this._render();
      if (b && was === b.key) this._click(b.key);
    });
    cv.addEventListener("mouseleave", () => { if (this.pressed) { this.pressed = null; this._render(); } });

    this.container.appendChild(wrap);
  }

  // 鼠标事件 → 画布像素坐标(考虑 CSS 缩放) → 命中哪个按钮。
  _hit(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * SCR_W, py = (e.clientY - r.top) / r.height * SCR_H;
    const menu = this._packs.menu;
    for (const b of BTN) {
      const x = BOX_X + b.rx, y = BOX_Y + b.ry, w = menu.width(b.idx), h = menu.height(b.idx);
      if (px >= x && px < x + w && py >= y && py < y + h) return b;
    }
    return null;
  }

  _click(key) {
    if (key === "ok") this._submit();
    else if (key === "new") { const id = this.idInput.value.trim(), pw = this.pwInput.value; this.onRegister(id, pw); }
    else if (key === "cancel") { this.idInput.value = ""; this.pwInput.value = ""; this.idInput.focus(); }
  }

  _render() {
    const { ctx, _packs: { title, login, menu } } = this;
    ctx.clearRect(0, 0, SCR_W, SCR_H);
    title.blit(ctx, 0, 0, 0);                 // 标题背景(800×600)
    login.blit(ctx, BOX_X, BOX_Y, 0);         // 登录框
    for (const b of BTN) {                     // 菜单按钮(按下用 pushed 帧)
      const idx = (this.pressed === b.key) ? b.pidx : b.idx;
      menu.blit(ctx, BOX_X + b.rx, BOX_Y + b.ry, idx);
    }
  }

  // 等比缩放 800×600 适配容器, 居中。输入框作为子元素自动跟随缩放。
  _layout() {
    const cw = this.container.clientWidth || SCR_W, ch = this.container.clientHeight || SCR_H;
    const s = Math.max(0.1, Math.min(cw / SCR_W, ch / SCR_H));
    this.wrap.style.transform = `translate(-50%,-50%) scale(${s})`;
  }

  show() { this.wrap.style.display = "block"; this._layout(); this.idInput.focus(); }
  hide() { this.wrap.style.display = "none"; }
  setEnabled(on) { this.idInput.disabled = !on; this.pwInput.disabled = !on; }
}
