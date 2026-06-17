// 死亡与复活系统(从 main.js 抽出 → 朝 ECS 客户端"系统"形状: 自包含 + 依赖注入)。
// 忠实开源: HP≤0→COMA 死亡, 5s 后可发 CG_RESURRECT, 服务端回 GC_UPDATE_INFO 在复活点重生。
// deps: { renderer, getPlayer():玩家实体, getGws():游戏WS, log(msg,cls) }。
import { encCGResurrect } from "../proto.js";

export function createDeathSystem({ renderer, getPlayer, getGws, log }) {
  let isDead = false, _deathEl = null, _reviveTimer = null;

  function onDeath() {
    if (isDead) return; isDead = true;
    const p = getPlayer();
    if (p && renderer) renderer.playAction("die", true);          // 角色定格死亡末帧
    showDeathScreen();
    log("★ 你已倒下", "err");
  }

  function showDeathScreen() {
    if (!_deathEl) {
      _deathEl = document.createElement("div");
      _deathEl.style.cssText = "position:absolute;inset:0;z-index:40;background:rgba(40,0,0,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#ffdede;font:system-ui;text-align:center;";
      _deathEl.innerHTML = `<div style="font:bold 40px 'Microsoft YaHei',system-ui;color:#ff5a5a;text-shadow:0 2px 8px #000">你已倒下</div>`
        + `<div id="reviveHint" style="font-size:15px;color:#e8b0b0"></div>`
        + `<button id="reviveBtn" style="margin-top:6px;padding:9px 26px;font:bold 16px system-ui;color:#fff;background:#7a1414;border:1px solid #c66;border-radius:6px;cursor:pointer">复活</button>`;
      document.getElementById("game").appendChild(_deathEl);
      _deathEl.querySelector("#reviveBtn").addEventListener("click", doResurrect);
    }
    _deathEl.style.display = "flex";
    let left = 5; const hint = _deathEl.querySelector("#reviveHint"), btn = _deathEl.querySelector("#reviveBtn");
    btn.disabled = true; btn.style.opacity = ".5";
    hint.textContent = `${left} 秒后可复活…`;
    clearInterval(_reviveTimer);
    _reviveTimer = setInterval(() => {
      if (--left <= 0) { clearInterval(_reviveTimer); hint.textContent = "点击复活返回复活点"; btn.disabled = false; btn.style.opacity = "1"; }
      else hint.textContent = `${left} 秒后可复活…`;
    }, 1000);
  }

  function doResurrect() { const g = getGws(); if (g && g.readyState === 1) g.send(encCGResurrect()); log("▶ 请求复活", "ok"); }   // 服务端回 GC_UPDATE_INFO 完成重生

  function reviveCleanup() {   // 收到 GC_UPDATE_INFO(复活/换区)时调用: 清死亡态
    if (!isDead) return; isDead = false; clearInterval(_reviveTimer);
    if (_deathEl) _deathEl.style.display = "none";
    const p = getPlayer();
    if (p) { p.oneShot = null; p.frameOverride = null; p.action = "stand"; p.animIdx = 0; }
  }

  return { onDeath, showDeathScreen, doResurrect, reviveCleanup, isDead: () => isDead };
}
