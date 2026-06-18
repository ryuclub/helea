// 角色信息面板系统(C 键开关) + 属性加点(从 main.js 抽出 → ECS"系统"形状)。
// 数据忠实来自服务端; 美术暂用 DOM(开源 infoXXX.spk 完整面板留后续)。
// deps: { getHpmp():角色状态对象, getGws():游戏WS, getRace():myRace, getName():角色名, log }。
import { encCGUseBonusPoint } from "../proto.js";

const ATTR_OF = { 0: "int", 1: "str", 2: "dex" };   // INC_INT/STR/DEX → hpmp 字段
const _bbtn = (w) => `<span class="bonusBtn" data-w="${w}" style="cursor:pointer;padding:0 5px;margin-left:1px;color:#1a120a;background:#ffd87a;border-radius:3px;font-weight:bold">+</span>`;

export function createCharPanel({ getHpmp, getGws, getRace, getName, log }) {
  let panel = null, _pendingBonus = null;

  function useBonusPoint(which) {                      // 加属性点(乐观; GC_MODIFY_INFORMATION 覆盖真实值; FAIL 回滚)
    const hpmp = getHpmp();
    if (!hpmp.bonus || hpmp.bonus <= 0) return;
    const g = getGws(); if (g && g.readyState === 1) g.send(encCGUseBonusPoint({ which }));
    const attr = ATTR_OF[which]; hpmp.bonus--; hpmp[attr]++; _pendingBonus = { attr }; update();
  }

  function ensure() {
    if (panel) return panel;
    const d = document.createElement("div"); d.id = "charPanel";
    d.style.cssText = "position:absolute;right:14px;top:60px;z-index:20;display:none;min-width:190px;padding:10px 13px;background:rgba(20,16,10,.92);border:1px solid #6a5a3a;border-radius:6px;color:#e8d8b0;font:12px/1.75 monospace;box-shadow:0 2px 14px #000a;pointer-events:auto;";
    d.addEventListener("click", (e) => { const b = e.target.closest(".bonusBtn"); if (b) useBonusPoint(+b.dataset.w); });  // 委托(innerHTML 重建不丢)
    document.getElementById("game").appendChild(d); panel = d; return d;
  }

  function update() {
    if (!panel || panel.style.display === "none") return;
    const hpmp = getHpmp(), myRace = getRace(), myCharName = getName();
    const raceCN = { slayer: "屠夫", vampire: "吸血鬼", ousters: "魔灵" }[myRace] || myRace || "";
    const expLine = (myRace === "slayer")
      ? `力/敏/智经验: ${hpmp.strExp} / ${hpmp.dexExp} / ${hpmp.intExp}`
      : `距下一级: ${hpmp.exp}`;
    panel.innerHTML =
      `<div style="font-size:13px;color:#ffd87a;border-bottom:1px solid #6a5a3a;margin-bottom:6px;padding-bottom:4px">${myCharName || ""} · ${raceCN}</div>`
      + `等级: <b style="color:#ffd87a">${hpmp.level}</b>${myRace === "slayer" ? " <span style='color:#9a8'>技能域</span>" : ""}<br>`
      + `HP: ${hpmp.hp}/${hpmp.hpMax}${hpmp.mpMax > 0 ? `　MP: ${hpmp.mp}/${hpmp.mpMax}` : ""}<br>`
      + (hpmp.bonus > 0
          ? `力STR: ${hpmp.str} ${_bbtn(1)}　敏DEX: ${hpmp.dex} ${_bbtn(2)}　智INT: ${hpmp.int} ${_bbtn(0)}<br>`   // 有加点→显示 + 按钮
          : `力STR: ${hpmp.str}　敏DEX: ${hpmp.dex}　智INT: ${hpmp.int}<br>`)
      + expLine + `<br>`
      + `善恶: ${hpmp.alignment}　名望: ${hpmp.fame}<br>`
      + `金钱: ${hpmp.gold}` + (hpmp.bonus != null ? `　加点: ${hpmp.bonus}` : "");
  }

  function toggle() { const d = ensure(); d.style.display = d.style.display === "none" ? "block" : "none"; update(); }
  function onBonusOk() { _pendingBonus = null; }       // 加点成功(已乐观, 属性走 GC_MODIFY_INFORMATION)
  function onBonusFail() { if (_pendingBonus) { const hpmp = getHpmp(); hpmp.bonus++; hpmp[_pendingBonus.attr]--; _pendingBonus = null; update(); log("加点失败", "err"); } }

  return { ensure, update, toggle, useBonusPoint, onBonusOk, onBonusFail };
}
