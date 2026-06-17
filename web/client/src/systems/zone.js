// 换区/地形系统(从 main.js 抽出 → ECS"系统"形状)。内聚: zoneID→地图名表、当前zone、换区转场(旧画面截图淡出)。
// deps: { renderer, log }。terrain 加载用 import。$ 替为 document.getElementById。
import { initTerrain, buildBlock, buildZoneObjects } from "../terrain.js";

export function createZoneSystem({ renderer, log }) {
  let ZONEMAP = {};                 // zoneID → 地图文件名(DB ZoneInfo 生成, 148 区)
  let curZone = null, terrainMapName = null;
  let _fadeToken = 0, _busyTimer = 0;

  async function loadZoneMap() {    // 异步载入 zonemap.json(fire-and-forget)
    try { ZONEMAP = await (await fetch("/public/assets/zonemap.json")).json(); }
    catch (e) { log("zonemap 加载失败: " + e.message, "err"); }
  }

  // 换区转场(几乎无黑屏): 换区瞬间抓旧画面截图盖最上层(冻住旧场景), 底下静默清旧载新, 新区就绪淡出露新。
  // token 防快速连换时旧淡出误盖新一轮。
  function coverWithOldFrame() {
    _fadeToken++; const tok = _fadeToken;
    const el = document.getElementById("zoneFade");
    try {                                                    // 抓当前(旧)画面盖住; canvas 开了 preserveDrawingBuffer
      el.style.backgroundImage = `url(${document.getElementById("cv").toDataURL()})`; el.style.backgroundColor = "#000";
    } catch { el.style.backgroundImage = "none"; el.style.backgroundColor = "#000"; } // 抓取失败回退黑幕
    el.classList.remove("busy");
    el.style.transition = "none";                            // 立即盖住(无淡入), 看起来就是旧画面没动
    el.style.display = "block"; el.style.opacity = "1";
    void el.offsetWidth;                                     // 重排固化, 再恢复过渡供之后淡出
    el.style.transition = "opacity .45s ease";
    clearTimeout(_busyTimer);                                // 加载超 450ms 才浮出 spinner(短转场不打扰)
    _busyTimer = setTimeout(() => { if (tok === _fadeToken) el.classList.add("busy"); }, 450);
  }

  function fadeInWhenReady() {
    const tok = _fadeToken, t0 = performance.now();
    const tick = () => {
      if (tok !== _fadeToken) return;                        // 又换区了 → 交给新一轮
      if ((renderer.isFocusBlockReady() && performance.now() - t0 > 150) || performance.now() - t0 > 8000) {
        clearTimeout(_busyTimer);
        const el = document.getElementById("zoneFade"); el.classList.remove("busy"); el.style.opacity = "0";
        setTimeout(() => { if (tok === _fadeToken) { el.style.display = "none"; el.style.backgroundImage = "none"; } }, 480);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // 按 zoneID 加载对应地图(换图: tile/obj 全局库, 仅 .map 不同)。zone 变了则清旧区块再载。
  async function initForZone(zoneID, fx, fy) {
    const mapName = ZONEMAP[zoneID] || "eslania_NW";
    if (terrainMapName === mapName) { renderer.setFocus(fx, fy); return; }
    if (terrainMapName !== null) { coverWithOldFrame(); renderer.clearBlocks(); }  // 换区: 旧画面截图盖住, 再清旧载新
    const t0 = performance.now();
    const map = await initTerrain({ mapUrl: `/public/assets/map/${mapName}.map`, tileBase: "/public/assets/tile", objBase: "/public/assets/obj" });
    renderer.setMap(map).setBlockLoader(buildBlock).setFocus(fx, fy);
    // 物件整区常驻(对齐开源 MTopView): 进区一次性载入本 zone 全部物件, 按 viewpoint 画家序绘制, 绝不按块分桶/加载半径丢弃。
    renderer.loadZoneObjects(await buildZoneObjects());
    terrainMapName = mapName;
    log(`地形就绪: ${mapName}(zone${zoneID}) ${map.width}x${map.height} (${(performance.now() - t0 | 0)}ms)`, "ok");
  }

  return {
    loadZoneMap, coverWithOldFrame, fadeInWhenReady, initForZone,
    getZoneName: (id) => ZONEMAP[id], hasZone: (id) => !!(id && ZONEMAP[id]),
    getCurZone: () => curZone, setCurZone: (z) => { curZone = z; },
  };
}
