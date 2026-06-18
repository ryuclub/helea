// 游戏主入口(由 public/index.html 抽出, 行为不变)。各功能模块化的容器, 后续按职责继续拆分。
import { GameRenderer } from "./render.js";
import { createDeathSystem } from "./systems/death.js";
import { buildRaceAssets, loadCreatureAssets, ensureCreatureInfo, playerHeight, monsterHeight, setAssetLog } from "./systems/asset-loader.js";
import { createCharPanel } from "./systems/charpanel.js";
import { parseCFPK, getActionSeqs } from "./cfpk.js";
import { loadSpritesById, fetchBuf } from "./pack.js";
import { loadLevelUpEffect, loadEffectByStatus } from "./effect.js";
import { RACE_SPRITE_PACK, raceActions, raceFrameID } from "./creature-anim.js";
import { createZoneSystem } from "./systems/zone.js";
import { LoginScreen } from "./ui-login.js";
import { CharSelectScreen } from "./ui-charselect.js";
import { CharCreateScreen } from "./ui-charcreate.js";
import { QuickBar } from "./ui-quickbar.js";
import { SkillBar } from "./ui-skillbar.js";
import { HudHpBar } from "./ui-hud.js";
import { InventoryUI } from "./ui-inventory.js";
import { ShopUI } from "./ui-shop.js";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCLCreatePC, encCLDeletePC, encCLQueryCharacterName, encCGConnect, encCGReady, encCGMove, encCGSay, encCGAttack,
  encCGAddInventoryToMouse, encCGAddMouseToInventory, encCGAddMouseToGear, encCGAddGearToMouse, encCGAddZoneToInventory, encCGAddMouseToZone, encCGNPCTalk, encCGDissectionCorpse,
  encCGShopRequestList, encCGShopRequestBuy, encCGShopRequestSell, encCGUsePotionFromInventory,
  encCGAddMouseToQuickSlot, encCGUsePotionFromQuickSlot, encCGSkillToObject,
  resetGameSeq, setEncryptCode, calcEncryptCode, decode, Framer } from "./proto.js";
import { loadItemInf, getItemInfo } from "./iteminfo.js";
import { loadMonsterMap, loadCreatureSprite, monsterFrameID, spriteFrameID } from "./creature-sprite.js";

const logEl = document.getElementById("log"), statEl = document.getElementById("stat");
const _t0 = performance.now();
const log = (m, c = "") => { const d = document.createElement("div"); d.className = "l " + c; d.textContent = `[${((performance.now() - _t0) / 1000).toFixed(1)}s] ${m}`; logEl.prepend(d); };
setAssetLog(log);   // 素材系统中间日志接到 main 的 log
// 游戏内聊天消息(全屏 HUD): 画面左下, 最多保留 12 条, 旧的自动移除。
const gameMsgEl = document.getElementById("gameMsg");
function addGameMsg(text, cls = "sys") { const d = document.createElement("div"); d.className = "m " + cls; d.textContent = text; gameMsgEl.prepend(d); while (gameMsgEl.children.length > 12) gameMsgEl.lastChild.remove(); }
// 种族 ↔ pcType(PC_SLAYER=0/VAMPIRE=1/OUSTERS=2)。
const RACE_NAMES = ["slayer", "vampire", "ousters"];
const raceType = (race) => Math.max(0, RACE_NAMES.indexOf(race));
let curAccount = null, PC_NAME = null, myRace = "slayer", mySex = 0;     // 自己角色的种族/性别
let pendingName = null, pendingRace = "slayer", pendingSex = 0, pendingSlot = 0; // 建角色暂存(含选定空槽)
// 各族新手出生区(决定 in-world 加密 code; code 必须匹配真实 zone, 否则移动包解密成乱码→服务端越界崩溃)。
// slayer→12(eslania_NW, code28), vampire→1003(code248), ousters→1311(code10)。后续应从 GC_UPDATE_INFO 读真实 zone。
const RACE_START_ZONE = { slayer: 12, vampire: 1003, ousters: 1311 };
const ZONE_ID = 12;                            // 新建及预制角色均出生 zone12(eslania_NW); 加密 code=EncryptCode(zoneID,0)
// 网关 WS 地址: https(隧道外网)走同源 wss://host/ws; http(本机/局域网)走 ws://host:8080。
// 网关只读 query(host/port), 忽略路径, 故隧道下 /ws?host=...&port=... 同样工作。
const gwURL = (port) => location.protocol === "https:"
  ? `wss://${location.host}/ws?host=127.0.0.1&port=${port}`
  : `ws://${location.hostname}:8080/?host=127.0.0.1&port=${port}`;
let SPAWN_COL = 103, SPAWN_ROW = 128;          // 占位; 真实出生由服务器 GC_SET_POSITION 给出

const renderer = new GameRenderer(document.getElementById("cv")).buildScene().setZoom(1.4).start();
window.__renderer = renderer;
renderer.onLog = (m) => log(m, "info");                 // 重建各段耗时上报到日志
// 大帧间隔(卡顿)探测: 任何 >120ms 的帧都打到日志, 直接看真机冻结时长
let __last = performance.now();
(function gap() {
  const n = performance.now(); const d = n - __last; __last = n;
  if (d > 120) {                                          // 卡顿成因: GPU渲染耗时高→GPU瓶颈; 远低于总帧→JS/加载spike(块/怪)
    const r = window.__renderer, info = r ? ` [GPU渲染${r._renderMs | 0}ms · mesh${r.scene.meshes.length} · 怪${r._others ? r._others.size : 0} · 移动${r.player && r.player.stepping ? 1 : 0} · 块${r._blocks ? r._blocks.size : 0}]` : "";
    log(`⚠ 卡顿帧 ${d | 0}ms${info}`, "err");
  }
  requestAnimationFrame(gap);
})();

// 移动(客户端本地, 相机平滑跟随): 键盘按住连续走(↑↓←→/WASD, 支持斜向); 鼠标点击地面走过去。
const KEY = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
  w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
const held = new Set();
function applyIntent() {
  if (death.isDead()) { renderer.setIntent(0, 0); return; }   // 死亡(COMA): 禁止移动
  let dc = 0, dr = 0;
  for (const k of held) { const m = KEY[k]; if (m) { dc += m[0]; dr += m[1]; } }
  renderer.setIntent(Math.sign(dc), Math.sign(dr));
}
const chatEl = document.getElementById("chat");
addEventListener("keydown", (e) => {
  if (document.activeElement === chatEl) return;            // 聊天输入时不触发移动/动作
  if (!window.__player) return;
  if (e.key === " ") { e.preventDefault(); renderer.playAction("attack"); return; }      // 空格 = 攻击
  if (e.key >= "1" && e.key <= "8" && quickBar) { e.preventDefault(); quickBar.useSlot(+e.key - 1); return; } // 1~8 = 快捷栏喝药/用物
  if (e.key === "k" || e.key === "K") { e.preventDefault(); renderer.playAction("die", true); return; } // K = 死亡
  if (!KEY[e.key]) return; e.preventDefault(); held.add(e.key); applyIntent();
});
addEventListener("keyup", (e) => { if (!KEY[e.key]) return; held.delete(e.key); applyIntent(); });
// 聊天发送(回车): 经 gameserver 连接发 CG_SAY; 自己的话本地立即显示
chatEl.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const msg = chatEl.value.trim(); chatEl.value = "";
  if (!msg) return;
  if (gws && gws.readyState === 1) { gws.send(encCGSay(msg)); log(`你: ${msg}`, "ok"); addGameMsg(`你: ${msg}`, "me"); chatEl.blur(); }
  else log("(未进入游戏, 无法发言)", "err");
});

// 换区/地形系统已抽到 src/systems/zone.js(转场/ZONEMAP/当前zone 内聚)。注入 renderer/log; 异步载入 zonemap。
const zone = createZoneSystem({ renderer, log }); zone.loadZoneMap();

// 角色/怪物/NPC 素材加载 + 生物高度表已抽到 src/systems/asset-loader.js(朝 ECS/愿景④素材封装形状)。
// buildRaceAssets / loadCreatureAssets / ensureCreatureInfo / playerHeight / monsterHeight 从该模块 import。

let player = null, gws = null, placing = false, pendingPlace = null;
// 服务器告知真实坐标(入世/换区/传送落点): 加载该 zone 地图 → 首次生成角色/之后重定位。
// ⚠ 换区是异步(地形要 fetch+建块), 而快速连续换区(地牢逐层进出)会连发多个 GC_UPDATE_INFO/SET_POSITION。
// 旧实现 `if(placing)return` 会**丢弃**后续换区 → 角色没放到新图、新旧地块混杂。改为"最新目标胜出":
// 加载中再来请求只记下最新目标, 当前加载完接着处理它; 加载途中目标又变则跳过本次定位、重载最新。
async function placePlayerAt(x, y) {
  pendingPlace = { x, y, zone: zone.getCurZone() || (RACE_START_ZONE[myRace] || 12) };
  if (placing) return;                                       // 已有加载循环在跑, 它会接手最新 pendingPlace
  placing = true;
  try {
    while (pendingPlace) {
      const t = pendingPlace; pendingPlace = null;
      await zone.initForZone(t.zone, t.x, t.y);              // 按 zone 加载/换图(同图名早返回, 不同则清旧载新)
      if (pendingPlace) continue;                            // 加载期间又来新换区 → 本次定位作废, 去处理最新
      if (!player) {
        const { frames, anim, parts } = await buildRaceAssets(myRace, mySex, gearItems);   // 装备多部位合成(身体+武器+护甲...) + 攻击动作随右手武器
        if (pendingPlace) continue;                          // 资源加载期间又换区 → 重来
        SPAWN_COL = t.x; SPAWN_ROW = t.y;
        player = renderer.spawnSprite(frames, t.x, t.y, anim, parts);
        window.__player = player;
        renderer.addDudes3D(t.x + 2, t.y, 1);                  // 3D 渲染参照: 玩家旁放 1 个官方 Dude(骨骼动画), 与 2D 同场验证 Babylon 3D 正常
        renderer.setNetMove((dir, cx, cy) => { if (gws && gws.readyState === 1) gws.send(encCGMove({ dir, x: cx, y: cy })); });
        // 普攻: 点怪 → 渲染器回调送 CG_ATTACK(目标ObjectID + 我当前格/朝向, 加密 SHUFFLE_4)。
        renderer.setNetAttack((targetID) => { if (gws && gws.readyState === 1 && player) gws.send(encCGAttack({ targetID, x: player.col, y: player.row, dir: player.dir })); });
        // 技能: 已装填技能时点怪 → 送 CG_SKILL_TO_OBJECT(SkillType+CEffectID递增+目标, SHUFFLE_3)。回 OK_1~6(命中)/FAILED(无效/距离/冷却)。
        renderer.setNetSkill((targetID, skill) => { if (gws && gws.readyState === 1) gws.send(encCGSkillToObject({ skillType: skill.skillType, targetID, effectID: (skillEffectSeq = (skillEffectSeq + 1) & 0xffff) })); });
        // 点地面物品 → 拾取: 找首个空背包格, 发 CGAddZoneToInventory(SHUFFLE_5)。服务端回 GCCreateItem(入包)+GCDeleteAndPickupOK(移除地面)。
        renderer.setNetPickup((objectID) => {
          const g = groundItems[objectID]; if (!g) return;
          const slot = firstFreeInvSlot(g); if (!slot) { log("背包已满, 无法拾取", "err"); return; }
          if (gws && gws.readyState === 1) gws.send(encCGAddZoneToInventory({ objectID, zoneX: g.x, zoneY: g.y, invenX: slot.x, invenY: slot.y }));
        });
        // 点 NPC → 发 CGNPCTalk; 服务端回 GCNPCSayDynamic(中文对话)/GCNPCResponse(开界面/关对话)。
        renderer.setNetNPCTalk((objectID) => { if (gws && gws.readyState === 1) gws.send(encCGNPCTalk(objectID)); });
        // 点尸体 → 发 CGDissectionCorpse(解剖); 服务端把宝物从尸体拖到地面格 → 回 GCDropItemToZone → 地面物可拾取。
        renderer.setNetDissect((objectID, x, y) => { if (gws && gws.readyState === 1) gws.send(encCGDissectionCorpse({ objectID, x, y })); });
        log(`角色已站入 zone${t.zone} (${t.x},${t.y}) · ${myRace}${mySex ? "(女)" : "(男)"} · 服务器权威移动`, "ok");
      } else {
        renderer.placePlayer(t.x, t.y);                      // 换区/传送落点: 重定位现有角色到新图
        log(`到达 zone${t.zone} (${t.x},${t.y})`, "ok");
      }
      renderer.markZoneReady();   // 新区地图+物件+玩家全部就位 → 开启地砖流式(换区原子门, 防旧区污染)
      zone.fadeInWhenReady();     // 新区中心块渲染好 → 淡出黑幕露出新场景
      reconnectTries = 0;
    }
  } catch (e) {
    player = null; log("角色/地形加载失败, 即将重试: " + e.message, "err");
    placing = false;
    if (gws && gws.readyState === 1) setTimeout(() => placePlayerAt(x, y), 800);
    return;
  }
  finally { placing = false; }
}

// 其他玩家进入视野: 按其种族/性别加载对应精灵(带缓存), 复用同一渲染管线。
async function addOtherPlayer(c) {
  if (!c || c.name === myCharName) return;                   // 跳过自己
  try {
    const [{ frames, anim }] = await Promise.all([buildRaceAssets(c.race, c.sex || 0), ensureCreatureInfo()]);
    renderer.addOther(c.objectID, frames, c.x, c.y, c.dir, anim, { name: c.name, hp: c.curHP || 0, maxHP: c.maxHP || 0, kind: "player", creatureHeight: playerHeight(c.race, c.sex || 0) });
    log(`▶ 其他玩家进入视野: ${c.name} #${c.objectID} (${c.race}, ${c.x},${c.y})`, "ok");
  } catch (e) { log("其他玩家资源加载失败: " + e.message, "err"); }
}

// 怪物/NPC 精灵: 忠实链路 MType→SType(DB)→FrameID(CreatureSprite.inf)→Creature.cfpk[FrameID], 见 creature-sprite.js。
// 之前 spriteType 直接当 FrameID 是错误凑合(MType≠SType, 怪物会显示成别的怪), 现已修正。

// 怪物/NPC 进入视野: 复用 addOther 实体管线(移动 GC_MOVE→otherStep, 消失 GC_DELETE_OBJECT→removeOther 已通用)。
async function addCreature(c) {
  if (!c) return;
  try {
    const [a] = await Promise.all([loadCreatureAssets(c.spriteType, c.kind === "npc"), ensureCreatureInfo()]);
    if (!a) { log(`生物精灵缺失 type${c.spriteType} (${c.name})`, "err"); return; }
    const ch = monsterHeight(c.spriteType);   // Creature.inf[MonsterType].Height
    renderer.addOther(c.objectID, a.frames, c.x, c.y, c.dir, a.anim, { name: c.name, hp: c.curHP || 0, maxHP: c.maxHP || 0, kind: c.kind, creatureHeight: ch || null });
  } catch (e) { log("生物资源加载失败: " + e.message, "err"); }
}

// 怪死尸体(复刻开源 GCAddMonsterCorpseHandler): 用 monsterType 加载怪精灵 → 渲染成尸体(die末帧定格) + 注册为可拾取掉落容器(treasureCount)。
async function addCorpse(p) {
  if (!p) return;
  try {
    const [a] = await Promise.all([loadCreatureAssets(p.monsterType, false), ensureCreatureInfo()]);
    if (!a) { log(`尸体精灵缺失 type${p.monsterType}`, "err"); renderer.removeOther(p.objectID); return; }   // 精灵缺失: 至少清掉活怪
    const ch = monsterHeight(p.monsterType);
    renderer.addCorpse(p.objectID, a.frames, p.x, p.y, p.dir, a.anim, { name: p.monsterName, monsterType: p.monsterType, treasureCount: p.treasureCount, creatureHeight: ch || null });
  } catch (e) { log("尸体资源加载失败: " + e.message, "err"); }
}

// 连到 gameserver, 走 CGConnect→CG_READY, 入世
let deliberateClose = false, reconnectTries = 0;
function connectGame(ip, port, key) {
  resetGameSeq();                                            // gameserver 连接序列号归零
  placing = false;                                           // 重连时清掉可能卡住的占位
  gws = new WebSocket(gwURL(port));
  gws.binaryType = "arraybuffer";
  const framer = new Framer((pkt) => onGamePacket(decode(pkt)));
  gws.onmessage = (e) => framer.push(new Uint8Array(e.data));
  gws.onopen = () => { log("→ gameserver CGConnect", "ok"); gws.send(encCGConnect({ key, pcName: PC_NAME, pcType: raceType(myRace) })); };
  gws.onclose = () => { log("gameserver 连接关闭", "info"); maybeReconnect(); };
  gws.onerror = () => log("gameserver 连接错误", "err");
}
// 意外断开自动重连(服务端瞬时崩重启/网络抖动→不再永久卡死)。退避重试, 多次失败提示手动刷新。
function maybeReconnect() {
  if (deliberateClose || !window.__entered) return;         // 主动关闭或尚未入世: 不重连
  if (reconnectTries >= 6) { log("自动重连多次失败, 请手动刷新页面", "err"); statEl.innerHTML = "⚠ 连接中断, 请刷新"; return; }
  reconnectTries++;
  const delay = Math.min(1500 + reconnectTries * 1200, 6000);
  log(`连接中断 → ${(delay / 1000) | 0}s 后自动重连(第 ${reconnectTries} 次)…`, "info");
  statEl.innerHTML = `⏳ 重连中(${reconnectTries})…`;
  renderer.clearOthers();                                    // 旧他人 objectID 失效, 清掉
  setTimeout(() => { if (!deliberateClose) connectLogin(); }, delay);
}
// 角色状态(协议忠实解析并维护): HP/MP + 等级/经验/属性 等。开源血法条 HUD(HPBar<Race>.spk)。
const hpmp = { hp: 0, hpMax: 1, mp: 0, mpMax: 1, level: 0, exp: 0, str: 0, dex: 0, int: 0, strMax: 0, dexMax: 0, intMax: 0, strExp: 0, dexExp: 0, intExp: 0, gold: 0, fame: 0, alignment: 0, bonus: null };
let hudBar = null, hudLoading = false;
function updateHud() {
  if (!hudBar && !hudLoading && myRace) {        // 首次(入世后): 按本族加载真实血条美术
    hudLoading = true;
    hudBar = new HudHpBar($("game"));
    hudBar.load(myRace).then(() => { hudBar.set(hpmp.hp, hpmp.hpMax, hpmp.mp, hpmp.mpMax); hudBar.setGold(hpmp.gold); }).catch((e) => { log("HUD 加载失败: " + e.message, "err"); hudBar = null; });
  } else if (hudBar) hudBar.set(hpmp.hp, hpmp.hpMax, hpmp.mp, hpmp.mpMax);
  if (hudBar) hudBar.setGold(hpmp.gold);          // 金币读数(血条下方)
  if (skillBar) skillBar.setMP(hpmp.mp);          // MP 变化 → 技能栏置灰不可释放的技能
}

// GC_UPDATE_INFO 全量字段 → 角色状态(三族经验/等级/属性, proto.js 已逐字段解析)。
function applyCharFull(p) {
  if (p.level === undefined) return;             // 非完整玩家信息(无 PCInfo2)
  for (const k of ["level", "exp", "str", "dex", "int", "strMax", "dexMax", "intMax", "strExp", "dexExp", "intExp", "gold", "fame", "alignment", "bonus"])
    if (p[k] !== undefined) hpmp[k] = p[k];
  charpanel.update();
}
// ModifyInfo 增量(GC_MODIFY_INFORMATION / 打怪 OK1 / 被打 OK2)按 type 分发 → 状态。type 表见 proto.js readMods。
const _slayerDomains = {};                        // Slayer 六技能域等级, 取最高作"等级"
function applyMods(mods) {
  if (!mods) return;
  const prevLevel = hpmp.level;                    // 升级检测基准(入世走 applyCharFull 直接赋值不经此处, 不误报)
  for (const m of mods) {
    switch (m.type) {
      case 12: {                                     // HP 变化 → 玩家头顶飘字(受伤红 -N / 治疗绿 +N)
        const d = m.value - hpmp.hp;
        if (d && player && renderer) renderer.floatOnPlayer((d > 0 ? "+" : "") + d, d > 0 ? "#6f6" : "#f66");
        hpmp.hp = m.value; break;
      }
      case 13: hpmp.hpMax = m.value; break;
      case 14: hpmp.mp = m.value; break;  case 15: hpmp.mpMax = m.value; break;
      case 1: hpmp.str = m.value; break;  case 5: hpmp.dex = m.value; break;  case 9: hpmp.int = m.value; break;
      case 2: hpmp.strMax = m.value; break; case 6: hpmp.dexMax = m.value; break; case 10: hpmp.intMax = m.value; break;
      case 3: hpmp.strExp = m.value; break; case 7: hpmp.dexExp = m.value; break; case 11: hpmp.intExp = m.value; break;
      case 22: hpmp.fame = m.value; break; case 23: hpmp.gold = m.value; break;
      case 43: hpmp.level = m.value; break; case 47: hpmp.bonus = m.value; break;
      case 50: case 59: hpmp.exp = m.value; break;                 // 吸血鬼(50)/异界者(59)经验(到下一级)
      case 53: hpmp.alignment = m.value | 0; break;
      case 24: case 27: case 30: case 33: case 36: case 39:        // Slayer 技能域等级 → 取最高
        _slayerDomains[m.type] = m.value; hpmp.level = Math.max(hpmp.level, ...Object.values(_slayerDomains)); break;
    }
  }
  if (hpmp.level > prevLevel && prevLevel > 0) showLevelUp(hpmp.level);   // ★升级瞬间反馈
  if (hpmp.hp <= 0 && player && !death.isDead()) death.onDeath();          // ★HP 归零 → 死亡
  updateHud(); charpanel.update();
}

// 升级瞬间提示: 屏幕中央渐隐金字 + log。开源有光柱/音效特效, 暂 DOM 降级(美术后续)。
let _levelUpEl = null, _levelUpTimer = null;
function showLevelUp(level) {
  if (!_levelUpEl) {
    _levelUpEl = document.createElement("div");
    _levelUpEl.style.cssText = "position:absolute;left:50%;top:40%;transform:translateX(-50%);z-index:30;pointer-events:none;text-align:center;"
      + "font:bold 36px 'Microsoft YaHei',system-ui;color:#ffe27a;text-shadow:0 0 14px #ffae00,0 2px 6px #000;opacity:0;transition:opacity .3s ease,top .9s ease;white-space:nowrap;";
    $("game").appendChild(_levelUpEl);
  }
  _levelUpEl.innerHTML = `⬆ 升级！<br><span style="font-size:23px">等级 ${level}</span>`
    + (hpmp.bonus > 0 ? `<br><span style="font-size:15px;color:#9f9;text-shadow:0 1px 3px #000">可分配 ${hpmp.bonus} 点 · 按 C 加点</span>` : "");  // 升级有点→引导加点(连接升级↔加点)
  _levelUpEl.style.top = "40%"; _levelUpEl.style.opacity = "1";
  clearTimeout(_levelUpTimer);
  _levelUpTimer = setTimeout(() => { _levelUpEl.style.opacity = "0"; _levelUpEl.style.top = "33%"; }, 1900);
  log(`★ 升级! 等级 ${level}`, "ok");
  // 复刻开源升级效果精灵(EFFECTSTATUS_LEVELUP_xxx 光柱): 在角色身上播放 Effect.efpk 帧动画。
  if (player && renderer) loadLevelUpEffect(myRace).then((eff) => { if (eff) renderer.playCreatureEffect(player, eff); }).catch(() => {});
}

// 死亡与复活系统已抽到 src/systems/death.js(朝 ECS"系统"形状)。注入 renderer/玩家/连接/log。
const death = createDeathSystem({ renderer, getPlayer: () => player, getGws: () => gws, log });

// 技能命中目标 → 在目标身上播命中效果(复用升级特效那套 efpk/aspk: status→effect)。
//   开源链路: skillType → g_pActionInfoTable[skillType].GetEffectStatus() → EFFECTSTATUS → loadEffectByStatus。
//   SKILL_EFFECT_STATUS 映射待从 ActionInfo.inf(MActionInfo.m_EffectStatus, WORD) 抽取(怪区联调时补全+目视)。
//   映射就绪后此处即点亮命中特效; 怪物 HP/伤害飘字已走各自 HP 更新包(setCreatureHP)。
let SKILL_EFFECT_STATUS = null;   // { [skillType]: EFFECTSTATUS }(Action.inf 抽取, tools/extract-skilleffect.mjs)
async function ensureSkillEffectMap() {
  if (SKILL_EFFECT_STATUS) return SKILL_EFFECT_STATUS;
  try { SKILL_EFFECT_STATUS = await fetch("/public/assets/skilleffect.json").then((r) => r.ok ? r.json() : {}); } catch { SKILL_EFFECT_STATUS = {}; }
  return SKILL_EFFECT_STATUS;
}
function onSkillHit(targetID, skillType, effectID) {
  if (!renderer || !renderer._others) return;
  const e = renderer._others.get(targetID); if (!e) return;
  const status = SKILL_EFFECT_STATUS && SKILL_EFFECT_STATUS[skillType];
  if (status == null) return;     // 无映射(多数基础技能仅伤害无特效)→不播; 有则播状态特效(部分 status 无精灵, loadEffectByStatus 返回 null 安全)
  loadEffectByStatus(status).then((eff) => { if (eff) renderer.playCreatureEffect(e, eff); }).catch(() => {});
}

// 角色信息面板 + 加点已抽到 src/systems/charpanel.js。注入 hpmp/连接/种族/名字/log。
const charpanel = createCharPanel({ getHpmp: () => hpmp, getGws: () => gws, getRace: () => myRace, getName: () => myCharName, log });
window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;          // 聊天/输入聚焦时不触发
  if (e.key === "c" || e.key === "C") { charpanel.toggle(); }
  else if (e.key === "i" || e.key === "I") { const ui = ensureInvUI(); if (ui) ui.toggle(); }   // 背包/装备开关
  else if (e.key === "Escape") { if (skillBar) skillBar.disarm(); if (renderer) renderer.armSkill(null); }   // 取消技能装填
  else if (/^F[1-8]$/.test(e.key)) { e.preventDefault(); if (skillBar) skillBar.armByIndex(+e.key.slice(1) - 1); }   // F1~F8 装填技能
});

// 背包/装备状态(协议忠实维护) + 开源资源 UI(inventory/gear spk)。
let invItems = [], gearItems = [], invUI = null;
function ensureInvUI() {
  if (!invUI && myRace) {
    invUI = new InventoryUI($("game"));
    invUI.setActionHandler(onInvAction);                       // 注册: 操作→发对应 CG 包
    invUI.load(myRace).then(() => invUI.setData(invItems, gearItems)).catch((e) => { log("背包UI加载失败: " + e.message, "err"); invUI = null; });
  }
  return invUI;
}
// 背包/装备操作: 光标中转两次点击 = 协议两包(拿起 InvToMouse/GearToMouse → 放下 MouseToInv/MouseToGear)。
// 数据权威在此(invItems/gearItems): 乐观更新 + 发包 + refreshInv + 控制 UI 光标。成功服务端无搬移回包;
// 失败回 GCCannotAdd → cancelInvCursor 把光标物放回原位。★加密: 4/8/7 明文, 3 加密(见 proto.js)。
let invCursorItem = null, invCursorFrom = null;
function onInvAction(action, p) {
  const send = (b) => { if (gws && gws.readyState === 1) gws.send(b); };
  if (action === "pickInv") {
    const it = p.item;
    if (shopSellMode && shopUI) { send(encCGShopRequestSell({ objectID: shopUI.npcID, itemObjectID: it.objectID })); return; }   // 商店开启: 点背包物=出售
    invCursorItem = it; invCursorFrom = { type: "inv", x: it.invenX, y: it.invenY };
    invItems = invItems.filter((t) => t !== it); send(encCGAddInventoryToMouse({ objectID: it.objectID, invenX: it.invenX, invenY: it.invenY }));
    refreshInv(); invUI.setCursor(it);
  } else if (action === "pickGear") {
    const it = p.item; invCursorItem = it; invCursorFrom = { type: "gear", slotID: it.slotID };
    gearItems = gearItems.filter((t) => t !== it); send(encCGAddGearToMouse({ objectID: it.objectID, slotID: it.slotID }));
    refreshInv(); invUI.setCursor(it);
  } else if (action === "dropInv") {
    if (!invCursorItem) return; const it = invCursorItem;
    it.invenX = p.col; it.invenY = p.row; delete it.slotID; invItems.push(it);
    send(encCGAddMouseToInventory({ objectID: it.objectID, invenX: p.col, invenY: p.row }));
    invCursorItem = null; invCursorFrom = null; refreshInv(); invUI.clearCursor();
  } else if (action === "dropGear") {
    if (!invCursorItem) return; const it = invCursorItem;
    it.slotID = p.slotID; delete it.invenX; delete it.invenY; gearItems.push(it);
    send(encCGAddMouseToGear({ objectID: it.objectID, slotID: p.slotID }));
    invCursorItem = null; invCursorFrom = null; refreshInv(); invUI.clearCursor();
  } else if (action === "useInv") {                            // 右键使用: 药水(ITEM_CLASS_POTION=1)→喝, 服务端回血/蓝走 GC_MODIFY_INFORMATION
    const it = p.item;
    if (it.itemClass === 1) { send(encCGUsePotionFromInventory({ objectID: it.objectID, invenX: it.invenX, invenY: it.invenY })); log(`▶ 喝药 #${it.objectID}`, "ok"); }
    else log("该物品不能直接使用(目前仅支持药水)", "info");
  }
}
// 操作失败(GCCannotAdd)或换区: 光标物品放回原位。
function cancelInvCursor() {
  if (invCursorItem) {
    const it = invCursorItem;
    if (invCursorFrom.type === "inv") { it.invenX = invCursorFrom.x; it.invenY = invCursorFrom.y; delete it.slotID; invItems.push(it); }
    else { it.slotID = invCursorFrom.slotID; delete it.invenX; delete it.invenY; gearItems.push(it); }
    invCursorItem = null; invCursorFrom = null; refreshInv();
  }
  if (invUI) invUI.clearCursor();
}
function refreshInv() {
  if (invUI && invUI._loaded) invUI.setData(invItems, gearItems);
  if (quickBar) { if (!quickBar.itemPack && invUI && invUI.itemPack) quickBar.setItemPack(invUI.itemPack); quickBar.setGear(gearItems); }  // itemPack 懒到位后补给快捷栏
}

// 底部快捷栏(=Belt 腰带内置 inventory; 见 memory helea-web-quickbar-belt)。内容随入世/换区从腰带项 sub[] 重置;
// 绑定乐观(服务端成功无回包, 失败 GCCannotAdd 回滚); 喝药发包不乐观改数量(满血会 GCCannotUse, 数量由换区 setGear 纠正)。
let quickBar = null, _pendingQuickBind = null;
function ensureQuickBar() {
  if (quickBar) return quickBar;
  quickBar = new QuickBar($("game"));
  if (invUI && invUI.itemPack) quickBar.setItemPack(invUI.itemPack);
  quickBar.setCursorGetter(() => invCursorItem);                              // 背包光标持物(绑定来源)
  quickBar.setBindHandler((slotID) => {                                       // 光标药水→腰带槽(乐观)
    const it = invCursorItem; if (!it) return;
    if (gws && gws.readyState === 1) gws.send(encCGAddMouseToQuickSlot({ objectID: it.objectID, slotID }));
    _pendingQuickBind = { objectID: it.objectID, item: { ...it }, slotID };   // GCCannotAdd 失败回滚用
    const belt = gearItems.find((g) => g.itemClass === 26);                   // 更新腰带 sub 保持 gearItems 权威
    if (belt) { belt.sub = (belt.sub || []).filter((s) => s.slotID !== slotID); belt.sub.push({ objectID: it.objectID, itemClass: it.itemClass, itemType: it.itemType, num: it.num || 1, slotID }); }
    invCursorItem = null; invCursorFrom = null; if (invUI) invUI.clearCursor(); refreshInv();   // 药水入腰带不回背包; refreshInv 顺带 setGear
  });
  quickBar.setUseHandler((it, slotID) => {                                    // 喝药: HP/MP 走 GC_MODIFY_INFORMATION→applyMods
    if (gws && gws.readyState === 1) gws.send(encCGUsePotionFromQuickSlot({ objectID: it.objectID, slotID }));
    log(`▶ 快捷栏喝药 槽${slotID + 1}`, "ok");
  });
  return quickBar;
}

// 技能栏(右侧竖排; 见 memory helea-web-skill-system)。GC_SKILL_INFO 下发 skills[] → 显示可用技能图标。
// 点技能装填 → renderer 记 armedSkill → 点怪释放。Esc 取消装填。CEffectID 递增序列。
let skillBar = null, skillEffectSeq = 0;
function ensureSkillBar() {
  if (skillBar) return skillBar;
  skillBar = new SkillBar($("game")); window.__skillbar = skillBar;
  ensureSkillEffectMap();                                                     // 预载 skillType→EFFECTSTATUS(命中特效用)
  skillBar.setArmHandler((skill) => {                                          // 装填/取消 → 渲染器 armedSkill
    if (renderer) renderer.armSkill(skill);
    log(skill ? `▶ 装填技能「${skill.n}」, 点怪释放` : "技能已取消", skill ? "ok" : "info");
  });
  return skillBar;
}

// NPC 对话框: 显示服务端直发的 GBK 中文对话(GCNPCSayDynamic)。美术暂用暗金 DOM
// (开源 npcdialog.spk/npcface 精确布局+头像索引待调研, 按降序先 DOM 手搓; 文本/数据 100% 忠实)。
let npcDialog = null;
function ensureNPCDialog() {
  if (npcDialog) return npcDialog;
  const d = document.createElement("div"); d.id = "npcDialog";
  d.style.cssText = "position:absolute;left:50%;bottom:60px;transform:translateX(-50%);z-index:22;display:none;min-width:360px;max-width:520px;padding:14px 18px;background:rgba(20,16,10,.95);border:2px solid #8a6a3a;border-radius:8px;color:#e8d8b0;font:14px/1.8 'Microsoft YaHei',sans-serif;box-shadow:0 4px 20px #000c;pointer-events:auto;";
  $("game").appendChild(d); npcDialog = d; return d;
}
function showNPCDialog(name, message) {
  const d = ensureNPCDialog();
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  d.innerHTML = `<div style="font-size:15px;color:#ffd87a;border-bottom:1px solid #8a6a3a;margin-bottom:8px;padding-bottom:5px">${esc(name || "NPC")}</div>`
    + `<div style="white-space:pre-wrap">${esc(message)}</div>`
    + `<div style="text-align:right;margin-top:10px"><span id="npcClose" style="cursor:pointer;color:#ffd87a;border:1px solid #8a6a3a;border-radius:4px;padding:2px 14px">关闭</span></div>`;
  d.style.display = "block";
  $("npcClose").onclick = hideNPCDialog;
}
function hideNPCDialog() { if (npcDialog) npcDialog.style.display = "none"; }

// 商店(M3b): 点商店NPC→GCNPCAsk(脚本菜单, 文本在官方 NPCScript.inf)→弹"购买/离开"按钮→CGShopRequestList→GCShopList→商店窗。
// 购买: 点商品发 CGShopRequestBuy(找空背包格); 出售: 商店开启时点背包物发 CGShopRequestSell。
let shopUI = null, shopSellMode = false;
function ensureShopUI() {
  if (shopUI) return shopUI;
  shopUI = new ShopUI($("game"));
  if (invUI && invUI.itemPack) shopUI.setItemPack(invUI.itemPack);          // 复用背包 item.ispk
  shopUI.setBuyHandler((it) => {
    const slot = firstFreeInvSlot(it); if (!slot) { log("背包已满, 无法购买", "err"); return; }
    if (gws && gws.readyState === 1) gws.send(encCGShopRequestBuy({ objectID: shopUI.npcID, rackType: shopUI.rackType, rackIndex: it.index, num: 1, x: slot.x, y: slot.y }));
  });
  shopUI.setSellHandler((on) => { shopSellMode = on; });
  shopUI.setRackHandler((rack) => {                                          // 切货架 → 重新请求该货架商品(服务端续发 GCShopList)
    if (gws && gws.readyState === 1) gws.send(encCGShopRequestList({ objectID: shopUI.npcID, rackType: rack }));
  });
  return shopUI;
}
// NPC 动态菜单(GCNPCAskDynamic 293): 服务端直发中文 subject+contents选项。点选项推进 quest 对话。
function showNPCAsk(objectID, name, subject, contents) {
  const d = ensureNPCDialog();
  const esc = (s) => String(s || "").replace(/</g, "&lt;");
  let html = `<div style="font-size:15px;color:#ffd87a;border-bottom:1px solid #8a6a3a;margin-bottom:8px;padding-bottom:5px">${esc(name)}</div>`;
  if (subject) html += `<div style="margin-bottom:10px;line-height:1.7">${esc(subject)}</div>`;
  html += `<div style="display:flex;flex-direction:column;gap:6px">`;
  (contents || []).forEach((c, i) => { html += `<span class="npcOpt" data-i="${i}" style="cursor:pointer;color:#ffd87a;border:1px solid #8a6a3a;border-radius:4px;padding:5px 12px">${esc(c)}</span>`; });
  html += `</div><div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px">`
    + `<span id="npcClose2" style="cursor:pointer;color:#e8d8b0;border:1px solid #6a5a3a;border-radius:4px;padding:3px 14px">离开</span></div>`;
  d.innerHTML = html; d.style.display = "block";
  d.querySelectorAll(".npcOpt").forEach((el) => el.onclick = () => { if (gws && gws.readyState === 1) gws.send(encCGNPCTalk(objectID)); });   // 点选项→推进 quest 对话(服务端续发下个菜单/对话/商店)
  $("npcClose2").onclick = hideNPCDialog;
}
// NPC 菜单(GC_NPC_ASK 292 无文本变体: scriptID→客户端 NPCScript.inf 韩文原版; 暂保留商店入口)。
function showNPCMenu(objectID, name) {
  const d = ensureNPCDialog();
  d.innerHTML = `<div style="font-size:15px;color:#ffd87a;border-bottom:1px solid #8a6a3a;margin-bottom:8px;padding-bottom:5px">${(name || "NPC").replace(/</g, "&lt;")}</div>`
    + `<div style="margin-bottom:8px;color:#9a8;font-size:12px">(脚本对话文本待接 NPCScript.inf, 暂提供商店入口)</div>`
    + `<div style="display:flex;gap:10px;justify-content:flex-end">`
    + `<span id="npcBuy" style="cursor:pointer;color:#ffd87a;border:1px solid #8a6a3a;border-radius:4px;padding:2px 14px">购买</span>`
    + `<span id="npcClose2" style="cursor:pointer;color:#e8d8b0;border:1px solid #6a5a3a;border-radius:4px;padding:2px 14px">离开</span></div>`;
  d.style.display = "block";
  $("npcBuy").onclick = () => { if (gws && gws.readyState === 1) gws.send(encCGShopRequestList({ objectID, rackType: 1 })); hideNPCDialog(); };   // RackType=SHOP_RACK_SPECIAL(1): 服务端仅此货架发 GCShopList(NORMAL=0 不发)
  $("npcClose2").onclick = hideNPCDialog;
}
// 地面掉落物: objectID -> {x,y,itemType}(拾取时需 zoneX/zoneY)。换区清空(随 renderer.clearGroundItems)。
let groundItems = {};
// 首个能容纳该物品的背包空位(10x6)。按官方 Item.inf 的 gridW×gridH 标记占用 + 找连续空位(对齐开源 MGridItemManager)。
function firstFreeInvSlot(item) {
  const occ = Array.from({ length: 6 }, () => new Array(10).fill(false));
  for (const it of invItems) {                                // 已有物品按各自 grid 占多格
    const info = getItemInfo(it.itemClass, it.itemType);
    const gw = (info && info.gridW) || 1, gh = (info && info.gridH) || 1;
    for (let dy = 0; dy < gh; dy++) for (let dx = 0; dx < gw; dx++) { const yy = (it.invenY || 0) + dy, xx = (it.invenX || 0) + dx; if (yy < 6 && xx < 10) occ[yy][xx] = true; }
  }
  const ni = item && getItemInfo(item.itemClass, item.itemType);
  const nw = (ni && ni.gridW) || 1, nh = (ni && ni.gridH) || 1;
  for (let y = 0; y <= 6 - nh; y++) for (let x = 0; x <= 10 - nw; x++) {
    let free = true;
    for (let dy = 0; dy < nh && free; dy++) for (let dx = 0; dx < nw && free; dx++) if (occ[y + dy][x + dx]) free = false;
    if (free) return { x, y };
  }
  return null;
}

function onGamePacket(p) {
  if (window.__pktLog) { window.__pktLog[p.name] = (window.__pktLog[p.name] || 0) + 1; }   // 诊断: 入世游戏包统计
  if (p.name === "GC_UPDATE_INFO") {
    death.reviveCleanup();                                                                                 // 复活/换区: 清死亡态(满血在复活点重生)
    if (p.curHP !== undefined) { hpmp.hp = p.curHP; hpmp.hpMax = p.maxHP || 1; hpmp.mp = p.curMP; hpmp.mpMax = p.maxMP || 1; updateHud(); applyCharFull(p); }
    if (p.inventory) { invCursorItem = null; invCursorFrom = null; if (invUI) invUI.clearCursor(); invItems = p.inventory; gearItems = p.gear || []; ensureInvUI(); ensureQuickBar(); refreshInv(); }  // 入世/换区: 全量背包+装备, 清光标
    groundItems = {};                                                                                      // 换区: 清地面物数据(plane 由 renderer.clearGroundItems 清)
    // 真实 zone: 从包解析(三族均对真实包核对)。决定加密 code + 加载哪张图(含传送换区)。
    const parsed = zone.hasZone(p.zoneID) ? p.zoneID : null;
    if (parsed === null && player) {
      // 已在世却解析不出新 zone(极少见: 解析异常): 用错 code 会崩服 → 主动断开, 不自动重连(避免循环)。
      log("⚠ 无法解析新区域, 已断开以避免错误, 请手动刷新重进", "err");
      statEl.innerHTML = "⚠ 区域解析失败, 请刷新"; deliberateClose = true; gws.close(); return;
    }
    const z = parsed || (RACE_START_ZONE[myRace] || 12);
    const tx = (p.zoneX ?? SPAWN_COL), ty = (p.zoneY ?? SPAWN_ROW);  // 换区临时落点(开源 SetX/Y(zoneX,zoneY))
    zone.setCurZone(z);
    setEncryptCode(calcEncryptCode(z, 0));
    log(`◀ GC_UPDATE_INFO 原始zoneID=${p.zoneID} → zone${z}(${tx},${ty})${parsed ? "" : "(不在ZONEMAP→回退!)"} 图=${zone.getZoneName(z) || "?"} code${calcEncryptCode(z, 0)}`, parsed ? "ok" : "err");
    // 开源标准: GC_UPDATE_INFO 即 MoveZone —— 先卸旧图载新图(用临时坐标 zoneX/zoneY 落位/聚焦),
    // 图就绪后才发 CGReady(服务器随后才发 GC_SET_POSITION 定最终位置)。地形重载绝不放到 SET_POSITION。
    placePlayerAt(tx, ty).then(() => { if (gws && gws.readyState === 1) gws.send(encCGReady()); });
  }
  // 开源 InitPlayer: 只在已载好的新图上把角色定位到最终坐标(不重载地形, 同 zone 早返回)。
  else if (p.name === "GC_SET_POSITION") { log(`◀ GC_SET_POSITION (${p.x},${p.y})`, "ok"); placePlayerAt(p.x, p.y); }
  else if (p.name === "GC_MOVE_OK") { renderer.serverStep(p.x, p.y, p.dir); }
  else if (p.name === "GC_MOVE_ERROR") { renderer.serverReject(p.x, p.y); }
  else if (p.name === "GC_SAY") { log(`玩家#${p.objectID}: ${p.message}`, "info"); addGameMsg(`玩家: ${p.message}`, "other"); if (window.__renderer?.sayBubble) window.__renderer.sayBubble(p.objectID, p.message); } // 附近玩家聊天
  else if (p.name === "GC_MODIFY_INFORMATION") { // HP/MP/经验/等级/属性 增量: 按 type 分发到状态
    applyMods(p.mods);
  }
  else if (p.name === "GC_SKILL_INFO") { ensureSkillBar().setSkills(p.skills); log(`◀ GC_SKILL_INFO ${p.race} 技能 ${p.skills.length}(可用 ${p.skills.filter((s) => s.enable).length})`, "ok"); }   // 入世下发技能列表→技能栏
  else if (p.name === "GC_SKILL_TO_OBJECT_OK_1") { applyMods(p.mods); onSkillHit(p.targetID, p.skillType, p.effectID); log(`◀ 技能命中 #${p.targetID}`, "ok"); }   // 我命中: 自身ModifyInfo(经验/HP)+目标效果(怪HP走 setCreatureHP 飘字)
  else if (p.name === "GC_SKILL_TO_OBJECT_OK_2" || p.name === "GC_SKILL_TO_OBJECT_OK_4" || p.name === "GC_SKILL_TO_OBJECT_OK_5") { if (p.targetID) onSkillHit(p.targetID, p.skillType); }   // 他人技能(广播): 目标身上播效果
  else if (p.name === "GC_SKILL_FAILED_1") { log("◀ 技能失败(距离/冷却/未命中)", "err"); if (renderer) renderer.floatOnPlayer("未命中", "#ddd"); if (skillBar) skillBar.disarm(); if (renderer) renderer.armSkill(null); }   // 我的技能失败→飘字+取消装填
  else if (p.name === "GC_CREATURE_DIED") { if (renderer._others && renderer._others.get(p.objectID)) renderer.killOther(p.objectID); }   // 通用死亡广播(怪/他人)→死亡动画。★玩家自死只靠 HP≤0(applyMods onDeath)判定, 此包不兜底(否则怪死会误判成我死)
  else if (p.name === "GC_USE_BONUS_POINT_OK") { charpanel.onBonusOk(); }                                  // 加点成功(已乐观, 属性走 GC_MODIFY_INFORMATION)
  else if (p.name === "GC_USE_BONUS_POINT_FAIL") { charpanel.onBonusFail(); }                              // 加点失败→回滚+提示
  // ── 其他玩家可见(三族, 各自精灵包) ──
  else if (p.name === "GC_ADD_SLAYER" || p.name === "GC_ADD_VAMPIRE" || p.name === "GC_ADD_OUSTERS") { addOtherPlayer(p.creature); }
  else if (p.name === "GC_ADD_MONSTER" || p.name === "GC_ADD_NPC") { addCreature(p.creature); }   // 怪物/NPC 进入视野
  else if (p.name === "GC_MOVE") { renderer.otherStep(p.objectID, p.x, p.y, p.dir); }   // 他人移动
  else if (p.name === "GC_DELETE_OBJECT") { const e = renderer._others && renderer._others.get(p.objectID); if (!(e && e.dying)) renderer.removeOther(p.objectID); if (groundItems[p.objectID]) { renderer.removeGroundItem(p.objectID); delete groundItems[p.objectID]; } }  // 离开/被捡走; 正在播死亡动画的不打断(由死亡序列移除)
  // ── 物品/背包/装备(增量) ──
  else if (p.name === "GC_CREATE_ITEM") { invItems.push(p.item); refreshInv(); }                         // 物品入背包格
  else if (p.name === "GC_DELETE_INVENTORY_ITEM") { invItems = invItems.filter((it) => it.objectID !== p.objectID); refreshInv(); } // 删背包格
  else if (p.name === "GC_ADD_GEAR_TO_INVENTORY") {                                                       // 卸装: 槽SlotID→背包(X,Y)。乐观更新已移走时幂等跳过
    const i = gearItems.findIndex((it) => it.slotID === p.slotID);
    if (i >= 0) { const it = gearItems[i]; gearItems.splice(i, 1); it.invenX = p.invenX; it.invenY = p.invenY; delete it.slotID; invItems.push(it); refreshInv(); }
  }
  else if (p.name === "GC_CANNOT_ADD") {                                                                   // 操作失败: 光标物品回原位
    if (_pendingQuickBind && _pendingQuickBind.objectID === p.objectID) {                                  // 快捷栏绑定被拒(无腰带/类型不符/槽满)→回滚: 腰带sub移除+药水回背包
      const belt = gearItems.find((g) => g.itemClass === 26);
      if (belt && belt.sub) belt.sub = belt.sub.filter((s) => s.objectID !== _pendingQuickBind.objectID);
      invItems.push(_pendingQuickBind.item); _pendingQuickBind = null; refreshInv();
    } else cancelInvCursor();
  }
  else if (p.name === "GC_ADD_NEW_ITEM_TO_ZONE" || p.name === "GC_ADD_ITEM_TO_ZONE" || p.name === "GC_DROP_ITEM_TO_ZONE") {  // 地面掉落物(新掉/入世已有/丢或解剖落地)
    groundItems[p.objectID] = { x: p.x, y: p.y, itemType: p.itemType, itemClass: p.itemClass };   // 存 itemClass 供 firstFreeInvSlot 按 grid 尺寸找位
    const s = (invUI && invUI.itemPack) ? invUI.itemPack.get(p.itemType) : null;                          // 地面图标(官方 Item.inf), 缺则黄块
    renderer.addGroundItem(p.objectID, p.x, p.y, s);
  }
  else if (p.name === "GC_DELETE_AND_PICKUP_OK") { renderer.removeGroundItem(p.objectID); delete groundItems[p.objectID]; } // 拾取成功: 移除地面物
  // ── NPC 交互 ──
  else if (p.name === "GC_NPC_SAY_DYNAMIC") {                                                              // NPC 中文对话(服务端直发GBK)
    const e = renderer._others.get(p.objectID); showNPCDialog(e ? e.name : "NPC", p.message);
  }
  else if (p.name === "GC_NPC_RESPONSE") {                                                                 // NPC 响应码
    if (p.code === 10) hideNPCDialog();                                                                    // QUIT_DIALOGUE: 关对话
    else log(`◀ NPC响应 code=${p.code}${p.parameter !== undefined ? " param=" + p.parameter : ""}(开界面待实现)`, "info");
  }
  else if (p.name === "GC_NPC_ASK") { const e = renderer._others.get(p.objectID); showNPCMenu(p.objectID, e ? e.name : "NPC"); }   // 292 无文本→降级商店入口
  else if (p.name === "GC_NPC_ASK_DYNAMIC") { const e = renderer._others.get(p.objectID); showNPCAsk(p.objectID, e ? e.name : "NPC", p.subject, p.contents); }   // 293 服务端中文菜单
  else if (p.name === "GC_NPC_SAY") { log(`◀ GC_NPC_SAY scriptID=${p.scriptID}(文本在 NPCScript.inf)`, "info"); }
  // ── 商店 ──
  else if (p.name === "GC_SHOP_LIST") { const s = ensureShopUI(); if (invUI && invUI.itemPack) s.setItemPack(invUI.itemPack); s.race = myRace; s.open(p.objectID, p); log(`◀ 商店 ${p.items.length} 件商品`, "ok"); }
  else if (p.name === "GC_SHOP_BUY_OK") { log("◀ 购买成功", "ok"); }                                       // 物品入背包走 GCCreateItem, 金钱走 GC_MODIFY
  else if (p.name === "GC_SHOP_BUY_FAIL") { const r = { 0: "金钱不足", 1: "背包空间不足", 2: "NPC不存在", 3: "非NPC", 4: "商品不存在" }[p.code] || ("code" + p.code); log("◀ 购买失败: " + r, "err"); }
  else if (p.name === "GC_SHOP_SELL_OK") { log("◀ 出售成功", "ok"); }
  else if (p.name === "GC_SHOP_SELL_FAIL") { log("◀ 出售失败", "err"); }
  // ── 战斗(复刻开源近战流程) ──
  else if (p.name === "GC_ATTACK_MELEE_OK_1") {   // 我命中确认: 自身ModifyInfo(经验/属性/HP) → 状态
    applyMods(p.mods);
  }
  else if (p.name === "GC_ATTACK_MELEE_OK_2") {   // 我被怪攻击: ModifyInfo 含我方HP变化(applyMods 飘字-N) + 攻击者播攻击动画 + 我受击泛红
    applyMods(p.mods);
    renderer.otherAttack(p.objectID);
    if (player) renderer.flashHit(player);
  }
  else if (p.name === "GC_ATTACK_MELEE_OK_3") { renderer.otherAttack(p.objectID); }        // 旁观: 攻击者播攻击动画
  // 被击者新HP→血条+伤害飘字。服务端 broadcast 已排除被击者本人, 故只会是视野内的怪/他人(自身HP走 GC_MODIFY_INFORMATION)。
  else if (p.name === "GC_STATUS_CURRENT_HP") { renderer.setCreatureHP(p.objectID, p.curHP); }
  else if (p.name === "GC_ADD_MONSTER_CORPSE") { addCorpse(p); }   // 复刻开源 GCAddMonsterCorpseHandler: 地面新增尸体实体(掉落容器), 非"移除怪"
}

// ───── 注册 / 登录 / 建角色 流程 ─────
let loginWS = null, myCharName = "";
const $ = (id) => document.getElementById(id);
const accEl = $("acc"), pwEl = $("pw");
accEl.value = localStorage.getItem("lastAccount") || "";   // 记住上次账号

// 侧栏显隐(手机上腾出游戏画面)。切换后触发 resize 让 Babylon 重算画布尺寸。
$("toggleSide").onclick = () => {
  $("side").classList.toggle("hidden");
  setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
};

// 注册(1-A): 调后端 /api/register 建空号(角色由 CL_CREATE_PC 真协议创建)。
async function registerAccount(id, password) {
  const note = (msg, ok) => { log(msg, ok ? "ok" : "err"); if (loginScreen && loginScreen.toast) loginScreen.toast(msg, ok); };  // 登录屏可见反馈
  if (!/^[A-Za-z0-9]{4,10}$/.test(id || "")) { note("账号需 4~10 位字母或数字", false); return false; }
  if (!/^[A-Za-z0-9]{6,10}$/.test(password || "")) { note("密码需 6~10 位字母或数字", false); return false; }
  try {
    note("注册中…", true);
    const r = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, password }) });
    const j = await r.json();
    if (j.ok) { note(`✅ 注册成功: ${id} —— 直接点「确定」登录`, true); if (loginScreen && loginScreen.idInput) { loginScreen.idInput.value = id; } localStorage.setItem("lastAccount", id); return true; }
    note("注册失败: " + j.error, false); return false;
  } catch (e) { note("注册请求失败: " + e.message, false); return false; }
}
$("reg").onclick = async () => { $("reg").disabled = true; await registerAccount(accEl.value.trim(), pwEl.value); $("reg").disabled = false; };

// 连 loginserver 走登录流程(按钮 + 自动重连共用)。
let curPassword = null;
function connectLogin() {
  log("连接网关 → loginserver …", "info");
  loginWS = new WebSocket(gwURL(9999));
  loginWS.binaryType = "arraybuffer";
  const framer = new Framer((pkt) => onPacket(decode(pkt)));
  loginWS.onmessage = (e) => framer.push(new Uint8Array(e.data));
  loginWS.onopen = () => { log(`已连接 → CL_LOGIN(${curAccount})`, "ok"); loginWS.send(encCLLogin({ id: curAccount, password: curPassword })); };
  loginWS.onerror = () => { log("登录连接错误", "err"); $("go").disabled = false; $("reg").disabled = false; };
  loginWS.onclose = () => log("登录连接关闭", "info");
}
// 登录按钮(侧栏调试回退)
$("go").onclick = () => { doLogin(accEl.value.trim(), pwEl.value); };

// 统一登录入口(画布登录屏 + 侧栏回退共用)。
function doLogin(id, password) {
  if (!/^[A-Za-z0-9]{4,10}$/.test(id || "") || !password) { log("账号 4~10 位字母数字, 并填密码", "err"); return; }
  curAccount = id; curPassword = password; localStorage.setItem("lastAccount", id);
  if (loginScreen) loginScreen.setEnabled(false);
  connectLogin();
}

// 开源忠实登录界面(Title.spk/Login.spk/LoginMenu.spk) —— 覆盖层 #uiScreen。
let loginScreen = null;
(async () => {
  try {
    loginScreen = new LoginScreen($("uiScreen"), {
      onLogin: (id, pw) => doLogin(id, pw),
      onRegister: (id, pw) => registerAccount(id, pw),
    });
    await loginScreen.load();
    const last = localStorage.getItem("lastAccount"); if (last && loginScreen.idInput) loginScreen.idInput.value = last;
    log("登录界面就绪(开源 Login.spk)", "info");
  } catch (e) { log("登录界面加载失败: " + e.message, "err"); $("uiScreen").style.display = "none"; $("auth").style.display = "block"; }
})();

// 取某族某性别的站立/行走逐帧序列(真实 cfpk 美术, 朝向2=开源选角/建角用的斜向正面),
// 供选角/建角屏画"逐帧循环动画"(开源 ANI_MILLISEC=100ms/帧, g_char_index 推进)。
async function loadCharPreview(race, sex) {
  const { frames, anim } = await buildRaceAssets(race, sex);
  const pick = (dirs) => {
    if (!dirs || !dirs.length) return [];
    const seq = dirs[2] || dirs[0] || [];                         // 开源固定方向[2]
    return seq.map((fr) => { const f = frames[fr.s]; return f ? { rgba: f.rgba, width: f.width, height: f.height, cx: fr.cx | 0, cy: fr.cy | 0 } : null; }).filter(Boolean);
  };
  return { stand: pick(anim.stand), move: pick(anim.move) };
}
// 兼容: 选角/建角屏当前用单帧预览(loadStand)。返回站立首帧。后续接入逐帧动画/装备合成时再统一。
async function loadStand(race, sex) {
  const a = await loadCharPreview(race, sex);
  return a.stand[0] || null;
}
// 选角界面(发行包 CharManager.spk 美术 + 开源选角逻辑)。
let charSelect = null;
(async () => {
  try {
    charSelect = new CharSelectScreen($("uiScreen"), {
      onSelect: (ch) => { charSelect.hide(); selectAndEnter(ch); },
      onCreate: (slot) => { pendingSlot = slot; charSelect.hide(); if (charCreate) charCreate.show(slot); else { $("uiScreen").style.display = "none"; $("create").style.display = "block"; $("docreate").disabled = false; } log(`创建角色到槽${slot}`, "info"); },
      onDelete: (ch) => { if (ch) openDeleteDialog(ch); },
      onBack: () => { try { loginWS && loginWS.close(); } catch {} charSelect.hide(); if (loginScreen) { loginScreen.show(); loginScreen.setEnabled(true); } },
      loadCharPreview,
    });
    await charSelect.load();
    log("选角界面就绪(开源 CharManager.spk)", "info");
  } catch (e) { log("选角界面加载失败(回退侧栏): " + e.message, "err"); }
})();
// 建角界面(发行包 CharCreate.spk 美术 + 忠实建角逻辑)。
let charCreate = null;
(async () => {
  try {
    charCreate = new CharCreateScreen($("uiScreen"), {
      onCreate: ({ name, race, sex, str, dex, int: intel }) => {
        pendingName = name; pendingRace = RACE_NAMES[race]; pendingSex = sex;
        log(`→ CL_CREATE_PC(${name}, ${pendingRace}, ${sex ? "女" : "男"}, ${str}/${dex}/${intel}, 槽${pendingSlot})`, "info");
        loginWS.send(encCLCreatePC({ name, slot: pendingSlot, sex, str, dex, int: intel, race }));
      },
      onBack: () => { charCreate.hide(); showCharSelect(lastChars); },
      onCheck: (name) => { if (loginWS && loginWS.readyState === 1) loginWS.send(encCLQueryCharacterName({ name })); },  // 查重名→loginserver
      loadCharPreview,
    });
    await charCreate.load();
    log("建角界面就绪(开源 CharCreate.spk)", "info");
  } catch (e) { log("建角界面加载失败(回退侧栏): " + e.message, "err"); }
})();

// 展示选角屏(覆盖层), 收起登录屏/建角屏/侧栏面板。
function showCharSelect(chars) {
  lastChars = chars;
  $("uiScreen").style.display = "block";
  $("create").style.display = "none"; $("pclist").style.display = "none";
  if (loginScreen) loginScreen.hide();
  if (charCreate) charCreate.hide();
  if (charSelect) { charSelect.setChars(chars); charSelect.show(); }
  else renderPCList({ chars, slots: [] });   // 选角屏不可用时回退侧栏 HTML
}
let lastChars = [];

// 删除角色确认框 —— 忠实开源 C_VS_UI_CHAR_DELETE(非韩文版): 必须输入确认串 "DeletePc" 才删(暗金对话框, 非 JS confirm)。
function openDeleteDialog(ch) {
  let dlg = $("delDlg");
  if (!dlg) {
    dlg = document.createElement("div"); dlg.id = "delDlg";
    dlg.style.cssText = "position:absolute;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);";
    dlg.innerHTML = `<div style="width:320px;background:linear-gradient(#2a1d0e,#160d05);border:2px solid #a8843c;border-radius:8px;padding:18px 20px;color:#e8d6a8;font:14px system-ui;text-align:center">
      <div id="delTitle" style="font-weight:700;color:#ffd76a;margin-bottom:8px">确认删除角色</div>
      <div id="delMsg" style="font-size:12px;color:#c9b88c;margin-bottom:10px"></div>
      <input id="delInput" autocomplete="off" placeholder="DeletePc" style="width:100%;padding:6px 8px;background:#0d0803;border:1px solid #6b5a38;border-radius:4px;color:#ffe8c8;outline:none;margin-bottom:12px"/>
      <div style="display:flex;gap:10px;justify-content:center">
        <button id="delOk" style="flex:1;padding:7px 0;background:linear-gradient(#3a2a14,#22160a);color:#ffe2a0;border:1px solid #a8843c;border-radius:4px;font-weight:600;cursor:pointer">确定</button>
        <button id="delCancel" style="flex:1;padding:7px 0;background:linear-gradient(#2a2018,#171009);color:#cbb890;border:1px solid #6b5a38;border-radius:4px;font-weight:600;cursor:pointer">取消</button>
      </div></div>`;
    $("game").appendChild(dlg);
  }
  $("delTitle").textContent = `确认删除角色「${ch.name}」`;
  $("delMsg").textContent = `此操作不可恢复。请输入 DeletePc 确认删除：`;
  const inp = $("delInput"); inp.value = ""; dlg.style.display = "flex"; inp.focus();
  const close = () => { dlg.style.display = "none"; };
  $("delCancel").onclick = close;
  const ok = () => {
    if (inp.value !== "DeletePc") { $("delMsg").textContent = "确认串不正确, 请输入 DeletePc"; $("delMsg").style.color = "#e88"; return; }
    log(`→ CL_DELETE_PC ${ch.name}(槽${ch.slot})`, "info");
    loginWS.send(encCLDeletePC({ name: ch.nameBytes, slot: ch.slot, ssn: curAccount || "0" }));
    close();
  };
  $("delOk").onclick = ok;
  inp.onkeydown = (e) => { if (e.key === "Enter") ok(); else if (e.key === "Escape") close(); };
}

// 建角色: 发 CL_CREATE_PC 到选定空槽(种族/性别由表单选)。角色名暂限字母数字(中文需 GB2312, 后续支持)。
$("docreate").onclick = () => {
  const name = $("cname").value.trim();
  if (!/^[A-Za-z0-9]{1,12}$/.test(name)) { log("角色名请用 1~12 位字母或数字", "err"); return; }
  const raceIdx = parseInt($("crace").value, 10) || 0, sex = parseInt($("csex").value, 10) || 0;
  // 各族属性规则(开源原版 CLCreatePCHandler): Slayer 各5~20且和≤30; Vampire 必须20/20/20; Ousters 各≥10且和=45。
  const STATS = [{ str: 10, dex: 10, int: 10 }, { str: 20, dex: 20, int: 20 }, { str: 15, dex: 15, int: 15 }][raceIdx];
  $("docreate").disabled = true;
  pendingName = name; pendingRace = RACE_NAMES[raceIdx]; pendingSex = sex;
  log(`→ CL_CREATE_PC(${name}, ${pendingRace}, ${sex ? "女" : "男"}, ${STATS.str}/${STATS.dex}/${STATS.int}, 槽${pendingSlot})`, "info");
  loginWS.send(encCLCreatePC({ name, slot: pendingSlot, sex, ...STATS, race: raceIdx }));
};

// 选定服务端下发的某个角色进入(开源流程: 用 LC_PC_LIST 里的真实名字/种族, 不依赖本地缓存)。
function selectAndEnter(ch) {
  PC_NAME = ch.nameBytes; myCharName = ch.name;
  myRace = ch.race; mySex = ch.sex || 0;
  log(`→ CL_SELECT_PC ${ch.name}(${myRace}${mySex ? "女" : "男"}, 槽${ch.slot})`, "ok");
  $("pclist").style.display = "none"; $("create").style.display = "none";
  loginWS.send(encCLSelectPC({ pcName: ch.nameBytes, pcType: raceType(myRace) }));
}
// 调试钩子(真机验证脚本用): 程序化登录/选角, 绕开画布登录屏点击。
window.__dbg = { doLogin, selectAndEnter, getChars: () => lastChars, loadCreature: loadCreatureAssets, monsterFrameID, spriteFrameID, showNPCAsk,
  openShop: (list) => { const s = ensureShopUI(); s.race = myRace; s.open(0xABCD, list); },  // 验证用: 喂假 GCShopList 直接开商店窗
  selScreen: () => charSelect, ccScreen: () => charCreate, showCharSelect,                     // 验证用: 选角/建角屏
  qbTest: (gear) => { const q = ensureQuickBar(); q.setGear(gear); return q; },                // 验证用: 喂假腰带 gear 测快捷栏
  applyMods,                                                                                    // 验证用: 测升级检测
  skillTest: (skills) => ensureSkillBar().setSkills(skills || [5, 6, 7, 8, 9, 154, 155].map((skillType, i) => ({ skillType, enable: true, interval: 2000 + i * 500, castingTime: i % 2 ? 800 : 0 }))),  // 验证用: 喂假技能列表测技能栏
  deathTest: () => death.showDeathScreen(),                                                      // 验证用: 显示死亡画面(不需真死)
  reviveTest: () => death.reviveCleanup(),                                                       // 验证用: 清死亡态
  spawnTest: async () => { const pl = window.__player; if (!pl) return; await addOtherPlayer({ objectID: 99999, race: myRace, sex: mySex, x: pl.col + 1, y: pl.row, dir: 4, name: "测试目标", curHP: 30, maxHP: 50 }); },  // 验证用: 注入带血条/名字的目标
  addDudes: (n = 1) => { const pl = window.__player; if (pl) renderer.addDudes3D(pl.col + 2, pl.row, n); },  // 验证用: 玩家旁加 n 个 3D Dude
  atkDebug: (on = true) => { renderer._dbgAtk = on; log("攻击诊断 " + (on ? "开" : "关") + ": 锁定怪后看 [atk] 日志(dist/oneShot/step/path/send)", "ok"); } };  // 真机诊断: 被围怪攻击状态点怪无法攻击时, 开此看 _tickCombat 卡在哪
// 全面诊断只读快照(真机验证脚本用): 采集核心状态, 无副作用。
window.__dbg.state = () => ({
  race: myRace, sex: mySex, name: myCharName,
  hp: hpmp.hp, hpMax: hpmp.hpMax, mp: hpmp.mp, mpMax: hpmp.mpMax,
  level: hpmp.level, exp: hpmp.exp, gold: hpmp.gold, fame: hpmp.fame, bonus: hpmp.bonus,
  str: hpmp.str, dex: hpmp.dex, int: hpmp.int,
  invCount: invItems.length, gearCount: gearItems.length,
  invItems: invItems.slice(0, 40), gearItems,
  skills: window.__skillbar?.skills || null,
  hudExists: !!hudBar, skillBarExists: !!skillBar, invUIExists: !!invUI, quickBarExists: !!quickBar,
});
// 渲染服务端角色列表: 每个角色一个按钮(可选), 有空槽再给「创建新角色」入口。
function renderPCList(p) {
  const box = $("pclist"); box.style.display = "block";
  box.querySelectorAll(".pcbtn").forEach((b) => b.remove());
  for (const ch of p.chars) {
    const b = document.createElement("button");
    b.className = "pcbtn"; b.style.cssText = "width:100%;margin:4px 0;background:#2b6;color:#021";
    b.textContent = `▶ ${ch.name} · ${ch.race}${ch.sex ? "(女)" : "(男)"}`;
    b.onclick = () => selectAndEnter(ch);
    box.appendChild(b);
  }
  // 找最低空槽(SLOT_MAX=3); 有空槽 → 显示创建入口并记下目标槽。
  const used = new Set(p.chars.map((c) => c.slot));
  let free = -1; for (let s = 0; s < 3; s++) if (!used.has(s)) { free = s; break; }
  if (free >= 0) { pendingSlot = free; $("create").style.display = "block"; $("docreate").disabled = false; }
  else $("create").style.display = "none";
}

function onPacket(p) {
  if (window.__pktLog) { window.__pktLog[p.name] = (window.__pktLog[p.name] || 0) + 1; }   // 诊断: 入世包统计
  if (p.name === "LC_LOGIN_OK") { log("◀ LC_LOGIN_OK → 取角色列表", "ok"); loginWS.send(encCLGetPCList()); }
  else if (p.name === "LC_LOGIN_ERROR") {
    log("◀ LC_LOGIN_ERROR 错误码=" + p.errorID, "err");
    if (window.__entered && !deliberateClose) {              // 重连中: 账号可能仍 GAME(踢人中), 稍后再试
      if (reconnectTries < 6) { reconnectTries++; setTimeout(() => { if (!deliberateClose) connectLogin(); }, 2500); }
      else statEl.innerHTML = "⚠ 重连失败, 请手动刷新";
    } else { $("go").disabled = false; $("reg").disabled = false; if (loginScreen) loginScreen.setEnabled(true); }
  }
  else if (p.name === "LC_PC_LIST") {
    log(`◀ LC_PC_LIST 槽位[${p.slots.join("")}] · ${p.chars.length} 个角色`, "ok");
    // 重连时(已进过游戏)自动选回原角色, 不打断; 首次登录则展示选角屏让用户选/建。
    if (window.__entered && myCharName) {
      const back = p.chars.find((c) => c.name === myCharName) || p.chars[0];
      if (back) { selectAndEnter(back); return; }
    }
    showCharSelect(p.chars);
  }
  else if (p.name === "LC_CREATE_PC_OK") {
    log("◀ LC_CREATE_PC_OK 角色已创建", "ok");
    $("create").style.display = "none";
    loginWS.send(encCLGetPCList());                              // 开源流程: 建角后回到选角界面重取列表
  }
  else if (p.name === "LC_CREATE_PC_ERROR") { log("◀ 创建失败 错误码=" + p.errorID + (p.errorID === 2 ? "(重名/槽位占用)" : ""), "err"); $("docreate").disabled = false; }
  else if (p.name === "LC_DELETE_PC_OK") { log("◀ LC_DELETE_PC_OK 角色已删除", "ok"); loginWS.send(encCLGetPCList()); }  // 重取列表 → 选角屏刷新
  else if (p.name === "LC_DELETE_PC_ERROR") { log("◀ 删除失败 错误码=" + p.errorID, "err"); }
  else if (p.name === "LC_QUERY_RESULT_CHARACTER_NAME") { log(`◀ 查重名 "${p.queryName}" → ${p.exist ? "已占用" : "可用"}`, p.exist ? "err" : "ok"); if (charCreate) charCreate.showCheckResult(p.queryName, p.exist); }
  else if (p.name === "LC_RECONNECT") {
    log(`◀ LC_RECONNECT → 游戏服 ${p.gameServerIP}:${p.gameServerPort}`, "ok");
    statEl.innerHTML = `✅ 已进入游戏 · 服务器权威`;
    $("auth").style.display = "none"; $("create").style.display = "none"; $("pclist").style.display = "none";
    $("uiScreen").style.display = "none";                       // 进入游戏 → 移除登录覆盖层
    loginWS.close();                                            // 关登录连接, 转 gameserver
    connectGame(p.gameServerIP, p.gameServerPort, p.key);
    window.__entered = true;
    loadItemInf().catch(() => {});                              // 预载官方 Item.inf(背包/商店/购买放置共用)
  } else { log(`◀ ${p.name}(${p.size}B)`, ""); }
}
