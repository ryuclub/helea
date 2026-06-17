// 天之炼狱 渲染引擎(Babylon) —— 2D 等距阶段
//
// 原版地砖/角色是预渲染等距 2D 图, 故用正交"正视"相机 + 屏幕像素坐标在 2D 平面合成
// (地形贴图平面 + 角色精灵平面)。相机倾斜 + 3D 地面留待将来引入 3D 素材时切换。
// Entity/visual 抽象保留: 现为 2D 精灵平面, 将来可换 3D mesh。
//
// 坐标: 用"像素世界"——1 世界单位 = 1 像素, 原点在画布中心, Y 向上(Babylon)。
// 画布像素(px,py 左上原点) → 世界(x = px - Wc/2, y = Hc/2 - py)。

// 深度: 由地形画布的"底边 Y"(像素)换算 Babylon z。相机立于 -Z 看向 +Z,
// z 越小越靠近相机(越靠前)。baseY 越大(越靠屏幕下方=等距越近)→ z 越负 → 越靠前 → 遮挡上方物件。
const DEPTH_EPS = 0.01;       // 每像素 z 步进(相邻行差 tileH*EPS ≈ 0.24, 深度缓冲足够分辨)
const DEPTH_GROUND = 1;       // 地面恒在所有物件之后
const depthZ = (baseY) => -baseY * DEPTH_EPS;
// 精灵主体顶行 y(贴图上方 padding + 跳过武器/头发稀疏尖端): 名字/血条贴"视觉主体头顶"而非贴图几何顶或尖端。
function _topOpaqueRow(rgba, w, h) {
  const minPix = Math.max(2, w * 0.3 | 0);   // 某行非透明像素 ≥ 宽度30% 才算"头部主体"(跳过头发/帽/武器尖端, 名字贴头部)
  for (let y = 0; y < h; y++) { const base = y * w * 4; let c = 0; for (let x = 0; x < w; x++) if (rgba[base + x * 4 + 3] > 8) c++; if (c >= minPix) return y; }
  return 0;
}
// 深度: 物件用 viewpoint(锚点行)、角色用所在行中点, 同基准 → 北边物件在后/南边在前(开源扇区画家),
// 不再需要 CHAR_DEPTH_BIAS 硬偏置(已移除)。

// 移动矢量(dc=列增, dr=行增; 矩形网格: 列+=右, 行+=下)→ DarkEden 8 方向枚举
// 0 LEFT,1 LEFTDOWN,2 DOWN,3 RIGHTDOWN,4 RIGHT,5 RIGHTUP,6 UP,7 LEFTUP
function dirOf(dc, dr) {
  if (dc < 0 && dr < 0) return 7; if (dc < 0 && dr > 0) return 1;
  if (dc > 0 && dr < 0) return 5; if (dc > 0 && dr > 0) return 3;
  if (dc < 0) return 0; if (dc > 0) return 4; if (dr < 0) return 6; return 2;
}

import { currentEpoch } from "./terrain.js";   // 换区代次守门: 丢弃旧 zone 在途块结果

const TW = 48, TH = 24;       // 地砖像素(全局坐标基准)
const BLOCK = 16;             // 区块边长(格), 必须与 terrain.js 一致
// 开源客户端整张地图常驻内存(MZone::m_ppSector 全量), zone 内从不卸载, 只按可视窗口(±10列/±16行)绘制。
// 我们用区块流式, 但要逼近开源: 加载半径放大到远超可视窗口(±48格), 提前把前方块备好(消除"该载没载的黑块");
// 卸载半径再留足滞回(±64格, RB+1), 让跨多块的高建筑不会因底部块被提前卸载而整楼消失(=空气墙真因之一)。
const RB = 3;                 // 加载半径(块, ±48 格): 远超开源可视窗口 → 移动时前方早已就绪
const MAX_CONCURRENT_LOADS = 6; // 区块并发加载上限(并行 fetch, 消除"边缘黑块过会儿才显示")
const BUILD_PER_FRAME = 40;   // 每帧最多创建的建筑数(全局限速, 防单帧爆量)
// 墙透明椭圆窗半轴(像素): 纵向椭圆, 比角色(精灵约 48宽×96高)稍大 → 约 68宽×124高 刚好包住人。
const WALL_TRANS_RX = 34, WALL_TRANS_RY = 62;

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas; this.entities = [];
    this._others = new Map();        // objectID -> 其他玩家/怪物/NPC 实体(复用主角精灵管线)
    this._floaters = [];             // 飘字(伤害数字): {x,y,z(世界), text, t0, color}
    this._effects = [];              // 一次性特效(升级光柱等): {entity, plane, mat, seq, textures, idx, t0, frameMs}
    this._groundItems = new Map();   // objectID -> 地面掉落物 {plane,mat,col,row}
    this._walls = [];                // 可透明墙(bTrans)网格 {mesh,gx,gy,w,h,vpRow}: 角色走到墙后→半透明(开源 IsWallTransPosition)
    this._blocks = new Map();        // "bx,by" -> {bx,by,ground,buildings:[],loading}
    this._blockLoader = null; this._map = null;   // 在途块数从 _blocks 里 loading:true 实时统计(无独立计数器)
    this._loadingAll = false; this._wholeMapLoaded = false;  // 整区同步加载模式(开源整图常驻): 期间/之后停用异步流式
    this._zoneObjects = [];          // 本 zone 全部物件网格(整区常驻, 对齐开源; 不按块/半径丢弃, 换区才整批清)
    this._objQ = null;               // 物件创建队列(进区一次性入队, 逐帧限速建网格)
    // 换区原子性门(对齐开源"换区同步重建, 无在途任务"): 换区一开始(clearBlocks)置 false → 关闭地砖流式,
    // 直到新区地图/物件/玩家就位(markZoneReady)再开。否则换区途中 _updateBlocks 会用"旧 zone 的 _map"
    // 建块却打上"新 epoch"(initTerrain 里 _epoch++ 先于 _map 赋值) → 旧区内容混入新区 = 错块/黑带。
    this._zoneReady = true;
    this._focusCol = 128; this._focusRow = 128;
  }

  buildScene() {
    const B = BABYLON;
    this.engine = new B.Engine(this.canvas, true, { preserveDrawingBuffer: true });
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0.04, 0.04, 0.06, 1);
    // 正视正交相机: 立于 -Z 看向 +Z 的 XY 平面
    const cam = new B.FreeCamera("cam", new B.Vector3(0, 0, -100), this.scene);
    cam.setTarget(B.Vector3.Zero());
    cam.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
    this.camera = cam; this._zoom = 1; this._setOrtho();
    // 仅影响 3D mesh(2D 精灵/地砖是 unlit)。groundColor 抬高背光面亮度, 避免 3D 角色偏黑。
    const hemi = new B.HemisphericLight("l", new B.Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.35; hemi.groundColor = new B.Color3(0.75, 0.75, 0.75);
    // 2D 覆盖层: 画生物头顶血条/名字/飘血伤害(把世界坐标投影到屏幕)。pointer-events:none 不挡点击。
    const ov = document.createElement("canvas");
    ov.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
    (this.canvas.parentElement || document.body).appendChild(ov);
    this.overlay = ov; this.octx = ov.getContext("2d");
    addEventListener("resize", () => { this.engine.resize(); this._setOrtho(); });
    GameRenderer._registerWallShader();
    return this;
  }

  // 墙透明着色器(忠实开源 m_ImageObjectFilter): 逐像素圆形挖洞 —— 以角色为中心、半径内的墙像素半透明,
  // 圆外保持不透明(屏幕上=围绕角色的椭圆窗口)。开源是 200×200 滤镜 k=sqrt((i-100)²+(j-100)²) 在半径~84px 内挖空。
  // 我们世界坐标 1单位=1像素(_gw: y 取负), 故 distance(片元世界, 角色世界) 即屏幕像素距离, 圆内 alpha 降。
  static _registerWallShader() {
    const B = BABYLON;
    if (B.Effect.ShadersStore["heleaWallVertexShader"]) return;
    B.Effect.ShadersStore["heleaWallVertexShader"] = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection; uniform mat4 world;
varying vec2 vUV; varying vec2 vWorld;
void main(){ vUV = uv; vWorld = (world * vec4(position,1.0)).xy; gl_Position = worldViewProjection * vec4(position,1.0); }`;
    B.Effect.ShadersStore["heleaWallFragmentShader"] = `
precision highp float;
varying vec2 vUV; varying vec2 vWorld;
uniform sampler2D diffuse; uniform vec2 uPlayer; uniform vec2 uRadii; uniform float uEnable;
void main(){
  vec4 c = texture2D(diffuse, vUV);
  if (c.a < 0.5) discard;                       // alpha test: 全透明纹素丢弃(等价开源色键)
  float a = 1.0;
  vec2 d = (vWorld - uPlayer) / uRadii;         // 椭圆: 横/纵各除以半轴(uRadii.x 横, .y 纵)
  if (uEnable > 0.5 && dot(d, d) < 1.0) a = 0.42; // 角色周围椭圆内 → 半透明窗口
  gl_FragColor = vec4(c.rgb, a);
}`;
  }
  _setOrtho() {
    const w = this.engine.getRenderWidth() / 2 / this._zoom;
    const h = this.engine.getRenderHeight() / 2 / this._zoom;
    const c = this.camera;
    c.orthoLeft = -w; c.orthoRight = w; c.orthoTop = h; c.orthoBottom = -h;
  }
  setZoom(z) { this._zoom = z; this._setOrtho(); return this; }

  // 全局像素 → 世界坐标(世界原点=地图像素原点; Y 向上 → 取负)。与区块无关 → 区块拼接无缝。
  _gw(gx, gy) { return new BABYLON.Vector3(gx, -gy, 0); }
  setMap(m) { this._map = m; return this; }
  setBlockLoader(fn) { this._blockLoader = fn; return this; } // (bx,by)=>Promise<{canvas,width,height,gx0,gy0,buildings}|null>
  setFocus(col, row) { this._focusCol = col; this._focusRow = row; return this; } // 玩家未生成前的初始加载中心
  // 换区原子门: 新区地图/物件/玩家全部就位后调用, 重新开启地砖流式(对齐开源换区同步重建完成)。
  markZoneReady() { this._zoneReady = true; return this; }
  // 玩家(或聚焦)所在块的地砖是否已建好 —— 换区加载界面据此撤除(避免撤早露黑)。
  isFocusBlockReady() {
    const e = this.player;
    const col = e ? e.col : this._focusCol, row = e ? e.row : this._focusRow;
    const b = this._blocks.get(Math.floor(col / BLOCK) + "," + Math.floor(row / BLOCK));
    return !!(b && b.ground && !b.loading);
  }

  // 区块网格流式: 每帧最多发起1块加载/卸载1块; 玩家所在块 ±RB 内保持加载。
  // 整区同步加载(开源整图常驻做法): 换区时一次性 await 全图所有块, 加载完再放角色 → 无异步流式竞态、无漏块。
  // 换区代次(epoch)中途变了立即停止(说明又换区了)。
  async loadAllBlocks() {
    const m = this._map; if (!m || !this._blockLoader) return;
    const bw = Math.ceil(m.width / BLOCK), bh = Math.ceil(m.height / BLOCK);
    // 大图(如 eslania 256×256=256块)整区同步要 6s+ 且纹理过多(移动端 OOM) → 只对小图(地牢/小场景, 128×128=64块≈0.6s)
    // 整区同步; 大图仍走流式(大图多为登录直进的开阔区, 不经快速换区, 流式正常)。
    if (bw * bh > 100) { this._wholeMapLoaded = false; this._loadingAll = false; return; }
    this._loadingAll = true; this._wholeMapLoaded = false;
    const ld = currentEpoch();
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      if (ld !== currentEpoch()) { this._loadingAll = false; return; }   // 已换区 → 放弃本区
      const k = bx + "," + by; if (this._blocks.has(k)) continue;
      let data = null; try { data = await this._blockLoader(bx, by); } catch { data = null; }
      if (ld !== currentEpoch()) { this._loadingAll = false; return; }
      if (data && data.epoch === ld) { this._blocks.set(k, { bx, by, ground: null, buildings: [], loading: true, epoch: ld }); this._addBlock(k, data); }
    }
    this._loadingAll = false; this._wholeMapLoaded = true;
  }

  _updateBlocks(col, row) {
    if (!this._blockLoader) return;
    if (!this._zoneReady) return;                           // 换区原子门: 新区未就位时不流式(防旧 _map 污染新区)
    if (this._loadingAll || this._wholeMapLoaded) return;   // 整区同步模式: 不做异步流式加载/卸载(全图常驻)
    const pc = Math.floor(col / BLOCK), pr = Math.floor(row / BLOCK);
    // 地图块边界(超出此范围的块不存在, 绝不选为候选): 否则越界块每帧 建→null→删→重选, 抢占并发槽饿死边缘真块=黑。
    const m = this._map;
    const bcols = m ? Math.ceil(m.width / BLOCK) : 0, brows = m ? Math.ceil(m.height / BLOCK) : 0;
    // 卸载: 超出 RB+1 的已载块(滞回, 防边界抖动)
    for (const [k, blk] of this._blocks) {
      if (Math.abs(blk.bx - pc) > RB + 1 || Math.abs(blk.by - pr) > RB + 1) { this._removeBlock(k); break; }
    }
    // 在途数 = _blocks 里 loading:true 的占位个数(实时统计, 自校正, 永不漂移卡死)。
    // 旧实现用独立计数器 _blockLoadingCount, 在多次快速换区+epoch丢弃下会漂移卡在高位 → 不再加载 → 黑块。
    let inflight = 0; for (const b of this._blocks.values()) if (b.loading) inflight++;
    // 并发加载 RB 内缺失块(近者优先, 仅地图内有效块), 最多 MAX_CONCURRENT_LOADS 个在途。
    while (inflight < MAX_CONCURRENT_LOADS) {
      let best = null, bestD = 1e9;
      for (let by = Math.max(0, pr - RB); by <= Math.min(brows - 1, pr + RB); by++)
        for (let bx = Math.max(0, pc - RB); bx <= Math.min(bcols - 1, pc + RB); bx++) {
        const k = bx + "," + by; if (this._blocks.has(k)) continue;
        const d = (bx - pc) ** 2 + (by - pr) ** 2; if (d < bestD) { bestD = d; best = { bx, by, k }; }
      }
      if (!best) return;
      const ld = currentEpoch();                  // 本次加载的代次, 标在占位上
      inflight++;
      this._blocks.set(best.k, { bx: best.bx, by: best.by, ground: null, buildings: [], loading: true, epoch: ld }); // 占位(loading:true 计入在途)
      Promise.resolve(this._blockLoader(best.bx, best.by))
        // 守门: 只处理"仍是本任务自己代次的占位"; 若已换区/被新代次占位取代 → 丢弃(防误删新块或贴旧块)
        .then((data) => {
          const blk = this._blocks.get(best.k); if (!blk || blk.epoch !== ld) return;
          if (data && data.epoch === ld) this._addBlock(best.k, data); else this._blocks.delete(best.k);
        })
        .catch(() => { const blk = this._blocks.get(best.k); if (blk && blk.epoch === ld) this._blocks.delete(best.k); });
    }
  }

  _addBlock(key, data) {
    const B = BABYLON, blk = this._blocks.get(key); if (!blk) return;
    if (!data || !data.canvas || !data.width || !data.height) { blk.loading = false; return; }   // 空块(地图边缘/0尺寸)跳过, 避免 drawImage 报错
    // 地面(单块小贴图, 真机 1-2ms)
    const tex = new B.DynamicTexture("g", { width: data.width, height: data.height }, this.scene, false, B.Texture.NEAREST_SAMPLINGMODE);
    tex.getContext().drawImage(data.canvas, 0, 0); tex.update(); tex.hasAlpha = true;
    const gp = B.MeshBuilder.CreatePlane("g", { width: data.width, height: data.height }, this.scene);
    const c = this._gw(data.gx0 + data.width / 2, data.gy0 + data.height / 2);
    gp.position = new B.Vector3(c.x, c.y, DEPTH_GROUND);
    const gm = new B.StandardMaterial("gm", this.scene);
    gm.diffuseTexture = tex; gm.emissiveColor = new B.Color3(1, 1, 1); gm.disableLighting = true;
    gm.useAlphaFromDiffuseTexture = true; gm.transparencyMode = B.Material.MATERIAL_ALPHATEST; gm.specularColor = B.Color3.Black();
    gp.material = gm; blk.ground = gp;
    blk.loading = false;
  }

  // 进区: 接收本 zone 全部物件绘制数据(对齐开源整区常驻), 入队逐帧限速建网格。换区时由 clearBlocks 整批清。
  loadZoneObjects(list) {
    if (!list || !list.length) { this._objQ = null; return; }
    this._objQ = { list, i: 0 };
  }

  // 每帧从物件队列创建至多 BUILD_PER_FRAME 个(全局限速)。物件整区常驻, 不随块卸载 → 绝不黑洞。
  _drainBuildQueue() {
    const B = BABYLON;
    if (!this._objQ) return;
    let budget = BUILD_PER_FRAME;
    const q = this._objQ;
    const end = Math.min(q.i + budget, q.list.length);
    for (; q.i < end; q.i++) {
      const b = q.list[q.i];
      const tx = B.RawTexture.CreateRGBATexture(b.rgba, b.width, b.height, this.scene, false, true, B.Texture.NEAREST_SAMPLINGMODE); tx.hasAlpha = true;
      const pl = B.MeshBuilder.CreatePlane("obj", { width: b.width, height: b.height }, this.scene);
      const w = this._gw(b.gx + b.width / 2, b.gy + b.height / 2);
      pl.position = new B.Vector3(w.x, w.y, depthZ(b.baseY));
      const isWall = (b.bTrans & 1);   // OBJECT_TRANS_FLAG(bit0): 可透明墙 → 用圆窗着色器; 其余 → 普通不透明材质
      let mat;
      if (isWall) {
        mat = new B.ShaderMaterial("wallm", this.scene, { vertex: "heleaWall", fragment: "heleaWall" },
          { attributes: ["position", "uv"], uniforms: ["world", "worldViewProjection", "uPlayer", "uRadii", "uEnable"],
            samplers: ["diffuse"], needAlphaBlending: true });
        mat.setTexture("diffuse", tx);
        mat.setVector2("uPlayer", new B.Vector2(-1e9, -1e9)); // 初始远离 → 全不透明
        mat.setVector2("uRadii", new B.Vector2(WALL_TRANS_RX, WALL_TRANS_RY)); // 椭圆半轴(横,纵)
        mat.setFloat("uEnable", 0);
        mat.backFaceCulling = false;
        mat.forceDepthWrite = true;     // 仍写深度 → 墙正常遮挡其它; 仅圆窗像素混合透出角色
      } else {
        mat = new B.StandardMaterial("om", this.scene);
        mat.diffuseTexture = tx; mat.emissiveColor = new B.Color3(1, 1, 1); mat.disableLighting = true;
        mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHATEST; mat.specularColor = B.Color3.Black();
      }
      pl.material = mat; this._zoneObjects.push(pl);
      if (isWall) this._walls.push({ mesh: pl, mat, gx: b.gx, gy: b.gy, w: b.width, h: b.height, vpRow: b.vpRow, _en: 0 });
    }
    if (q.i >= q.list.length) this._objQ = null;
  }

  _removeBlock(key) {
    const blk = this._blocks.get(key); if (!blk) return;
    if (blk.ground) { blk.ground.material?.diffuseTexture?.dispose(); blk.ground.material?.dispose(); blk.ground.dispose(); }
    for (const pl of blk.buildings) { pl.material?.diffuseTexture?.dispose(); pl.material?.dispose(); pl.dispose(); }
    this._blocks.delete(key);
  }

  // 换区: 清空当前所有区块(连同在途占位)/建筑队列 + 移除所有其他玩家(旧区视野失效)。换图前调用。
  // 在途块占位也一并删除 → 在途数(loading:true 统计)自然归零; 旧任务回调由 epoch 守门丢弃。
  // 换区也要清掉主角在途步进, 防跨 zone 插值拖影。
  clearBlocks() {
    this._wholeMapLoaded = false; this._loadingAll = false;   // 换区: 退出旧区整图常驻态(新区会重新整区加载)
    this._zoneReady = false;                                  // 换区原子门: 关流式, 直到新区就位(markZoneReady)
    for (const k of [...this._blocks.keys()]) this._removeBlock(k);
    // 整批清本 zone 常驻物件(对齐开源换区整体重建): 释放网格+纹理+材质。
    for (const pl of this._zoneObjects) { pl.material?.diffuseTexture?.dispose(); pl.material?.dispose(); pl.dispose(); }
    this._zoneObjects.length = 0; this._objQ = null;
    this._walls.length = 0;
    if (this.player) { this.player.stepping = false; this._sendMove = 0; this.path = null; this._atkTarget = null; }
    for (const id of [...this._others.keys()]) this.removeOther(id);
    this.clearGroundItems();                                  // 换区: 清旧区地面掉落物
  }
  // 仅清其他玩家(重连时旧 objectID 失效, 保留地形)。
  clearOthers() { for (const id of [...this._others.keys()]) this.removeOther(id); }

  // 墙透明(忠实开源 m_ImageObjectFilter 圆形滤镜): 每帧把"圆心=角色"喂给墙着色器, 着色器逐像素判断:
  // 角色周围半径内的墙像素半透明(透出角色), 圆外不变 → 屏幕上=围绕角色的椭圆窗口, 而非整面墙变透明。
  // 仅对"在角色前方(vpRow>=pRow)且矩形逼近圆"的墙开启(uEnable=1, 省 uniform); 其余关闭(uEnable=0)。
  _updateWallTransparency(pCol, pRow) {
    const px = pCol * TW + TW / 2, cy = pRow * TH - 36; // 椭圆心(全局像素): 角色身体中心(脚底上方约半身, 纵椭圆覆盖全身)
    const pwx = px, pwy = -cy;                          // 世界坐标(_gw: y 取负)
    const ex = WALL_TRANS_RX + 4, ey = WALL_TRANS_RY + 4;
    let purge = false;
    for (const wll of this._walls) {
      const m = wll.mesh;
      if (!m || m.isDisposed()) { purge = true; continue; }
      // 墙矩形到椭圆心最近点的椭圆归一化距离 < 1(才可能有窗口像素) 且 墙在角色前方
      const nx = Math.max(wll.gx, Math.min(px, wll.gx + wll.w));
      const ny = Math.max(wll.gy, Math.min(cy, wll.gy + wll.h));
      const dx = (nx - px) / ex, dy = (ny - cy) / ey;
      const en = (dx * dx + dy * dy < 1 && wll.vpRow >= pRow) ? 1 : 0;
      if (en) wll.mat.setVector2("uPlayer", new BABYLON.Vector2(pwx, pwy)); // 椭圆心随角色移动
      if (en !== wll._en) { wll.mat.setFloat("uEnable", en); wll._en = en; }
    }
    if (purge) this._walls = this._walls.filter((w) => w.mesh && !w.mesh.isDisposed());
  }

  // 角色精灵实体。framesById={[spriteID]:{rgba,width,height}}; anim={stand,move}, 每个=dirs[8] of [{s,cx,cy}]
  // (来自 cfpk 帧包: 每帧含精灵ID + 脚底偏移 cX/cY; 序列已含原版"每姿势保持数帧的乒乓"走法)
  // 通用精灵实体构建(主角与其他玩家共用)。不挂相机/指针, 不设 this.player。
  // parts: 多部位[{anim,order}](身体+装备外观层, 同动作时序不同精灵, 叠加渲染); 无 parts 退化单层身体。
  _makeSpriteEntity(framesById, col, row, anim, name = "spr", parts = null) {
    const B = BABYLON;
    const textures = {}, frameMeta = {};  // 按 spriteID 索引(稀疏), 各部位共享(同 ispk)
    for (const id in framesById) {
      const f = framesById[id]; if (!f) continue;
      const tx = B.RawTexture.CreateRGBATexture(f.rgba, f.width, f.height, this.scene, false, true, B.Texture.NEAREST_SAMPLINGMODE);
      tx.hasAlpha = true; textures[id] = tx;
      frameMeta[id] = { w: f.width, h: f.height, vtop: _topOpaqueRow(f.rgba, f.width, f.height) };  // vtop=非透明顶行(贴图上 padding), 名字/血条贴视觉头顶用
    }
    const partList = (parts && parts.length) ? parts : [{ anim, order: 0 }];   // 多部位 or 单层
    const planes = partList.map((pt, i) => {
      const plane = B.MeshBuilder.CreatePlane(name + "_" + i, { size: 1 }, this.scene);
      const mat = new B.StandardMaterial(name + "m" + i, this.scene);
      mat.emissiveColor = new B.Color3(1, 1, 1); mat.disableLighting = true;
      mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHATEST; mat.specularColor = B.Color3.Black();
      plane.material = mat;
      return { anim: pt.anim, order: pt.order || 0, plane, mat };
    });
    return { planes, plane: planes[0].plane, mat: planes[0].mat,   // e.plane=身体(兼容血条/dispose 等现有引用)
      textures, frameMeta, anim, col, row, dir: 2,
      action: "stand", animIdx: 0, animClock: 0, _lastNow: 0, frameOverride: null, oneShot: null,
      stepping: false, fromCol: col, fromRow: row, toCol: col, toRow: row, t0: 0, stepMs: 320 };
  }

  spawnSprite(framesById, col, row, anim, parts) {
    const e = this._makeSpriteEntity(framesById, col, row, anim, "hero", parts);
    this.entities.push(e); this.player = e;
    this.intent = { dc: 0, dr: 0 };   // 键盘移动意图(按住连续走)
    this.path = null;                  // 鼠标寻路路径(格子数组)
    this._renderAt(e, e.col, e.row);
    this._centerTile(e.col, e.row);
    this._installPointer();
    return e;
  }

  // ───── 其他玩家(视野内) ─────
  // 出现/更新: GC_ADD_SLAYER 等。framesById/anim 与主角同一套(同为三族角色精灵)。
  addOther(objectID, framesById, col, row, dir, anim, info = null) {
    let e = this._others.get(objectID);
    if (e) { e.col = col; e.row = row; e.dir = dir; e.stepping = false; if (info) Object.assign(e, info); this._renderAt(e, col, row); return e; }
    e = this._makeSpriteEntity(framesById, col, row, anim, "oth" + objectID);
    e.dir = dir; e.objectID = objectID; if (info) Object.assign(e, info);   // {name, hp, maxHP, kind}
    this._others.set(objectID, e); this._renderAt(e, col, row);
    return e;
  }
  // 死亡: 播 die 动画(定格末帧)→短暂停留作"尸体"→移除。无 die 动作的怪直接移除。
  killOther(objectID) {
    const e = this._others.get(objectID); if (!e || e.dying) return;
    const die = e.anim && e.anim.die;
    if (!die || !die.some((d) => d && d.length)) { this.removeOther(objectID); return; }
    e.dying = true; e.dieT0 = performance.now(); e.stepping = false; e.maxHP = 0;  // maxHP=0→不再画血条
  }
  _updateDying(e, now) {
    const t = now - e.dieT0;
    e.action = "die";
    const seq = e.anim.die[e.dir] || e.anim.die[2] || e.anim.die.find((d) => d && d.length);
    if (seq && seq.length) e.frameOverride = Math.min(Math.floor(t / 70), seq.length - 1);  // ~14fps 播一遍后定格
    this._renderAt(e, e.col, e.row);
    if (t > 1600) this.removeOther(e.objectID);                                  // 尸体停留 ~1.6s 后移除
  }
  // 更新某生物的 HP(战斗/受击) → 血条即时反映。
  setOtherHP(objectID, hp, maxHP) { const e = this._others.get(objectID); if (e) { e.hp = hp; if (maxHP != null) e.maxHP = maxHP; } }
  // 点击怪物→攻击的回调(index.html 设为发 CG_ATTACK)。
  setNetAttack(fn) { this._netAttack = fn; return this; }
  // 点怪释放技能回调(index.html 设为发 CG_SKILL_TO_OBJECT)。(targetID, skill)。
  setNetSkill(fn) { this._netSkill = fn; return this; }
  // 装填/取消技能(技能栏点选): 装填后点怪即释放该技能而非近战。
  armSkill(skill) { this._armedSkill = skill || null; }
  // 点击地面物品→拾取的回调(index.html 设为发 CGAddZoneToInventory)。
  setNetPickup(fn) { this._netPickup = fn; return this; }
  // 点击 NPC→对话的回调(index.html 设为发 CGNPCTalk)。
  setNetNPCTalk(fn) { this._netNPCTalk = fn; return this; }
  // 地面掉落物(GCAddNewItemToZone): 在格子建一个可点击 plane。sprite={rgba,width,height}(官方 Item.inf 图标)
  //   则用真图标; 缺省发光黄块(降级为 3D 标记)。
  addGroundItem(objectID, col, row, sprite) {
    const B = BABYLON;
    if (this._groundItems.has(objectID)) this.removeGroundItem(objectID);
    let w = TW * 0.5, h = TW * 0.5;
    if (sprite && sprite.rgba) { w = sprite.width; h = sprite.height; }
    const plane = B.MeshBuilder.CreatePlane("gi", { width: w, height: h }, this.scene);
    const wp = this._gw(col * TW + TW / 2, row * TH + TH / 2);
    plane.position = new B.Vector3(wp.x, wp.y, -1);          // 略前于地面, 可被 pick
    const mat = new B.StandardMaterial("gim", this.scene); mat.disableLighting = true; mat.specularColor = B.Color3.Black();
    if (sprite && sprite.rgba) {
      const tx = B.RawTexture.CreateRGBATexture(sprite.rgba, sprite.width, sprite.height, this.scene, false, true, B.Texture.NEAREST_SAMPLINGMODE);
      tx.hasAlpha = true; mat.diffuseTexture = tx; mat.emissiveColor = new B.Color3(1, 1, 1);
      mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHATEST;
    } else { mat.emissiveColor = new B.Color3(1, 0.85, 0.2); mat.alpha = 0.85; }
    plane.material = mat;
    this._groundItems.set(objectID, { plane, mat });
  }
  removeGroundItem(objectID) {
    const g = this._groundItems.get(objectID); if (!g) return;
    try { g.mat.diffuseTexture && g.mat.diffuseTexture.dispose(); g.mat.dispose(); g.plane.dispose(); } catch {}
    this._groundItems.delete(objectID);
  }
  clearGroundItems() { for (const id of [...this._groundItems.keys()]) this.removeGroundItem(id); }
  // 某生物播一次攻击动画(GC_ATTACK 广播; 自己的攻击由本地 playAction 处理)。
  otherAttack(objectID) { const e = this._others.get(objectID); if (e && e.anim.attack) { e._atkUntil = performance.now() + 450; } }
  // 某生物 HP 更新到绝对值(服务端 GC_STATUS_CURRENT_HP 广播被击者新HP)。
  // 据旧HP-新HP 算伤害飘字; HP 到 0 等服务端删/尸体包再移除。
  setCreatureHP(objectID, newHP) {
    const e = this._others.get(objectID); if (!e || e.dying) return;
    const dmg = Math.max(0, (e.hp ?? newHP) - newHP);
    e.hp = newHP;
    if (dmg > 0) { this.floatText(e, "-" + dmg, "#f55"); this.flashHit(e); }   // 命中反馈: 飘字+泛红
    if (newHP <= 0) this.killOther(objectID);              // HP 归零 → 死亡动画(先于尸体包)
  }
  // 在某实体头顶飘一条文字(伤害/治疗/Miss)。entity 可为 player 或 _others 项; 缺省 player。
  floatText(entity, text, color = "#fff") {
    const e = entity || this.player; if (!e || !e.plane || e.plane.isDisposed()) return;
    this._floaters.push({ x: e.plane.position.x, y: e.plane.position.y + (e._h || 60) / 2, z: e.plane.position.z, text, t0: performance.now(), color });
  }
  // 在玩家自己头顶飘字(被击 -N / 治疗 +N / Miss)。
  floatOnPlayer(text, color) { this.floatText(this.player, text, color); }
  // 受击闪烁: 精灵短暂泛红(emissive), ~140ms 恢复。用于被击/命中反馈。
  flashHit(entity) {
    const e = entity || this.player; if (!e) return;
    const planes = e.planes || [{ mat: e.mat }];
    const B = BABYLON;
    for (const pl of planes) if (pl.mat) pl.mat.emissiveColor = new B.Color3(1, 0.35, 0.35);
    clearTimeout(e._flashT);
    e._flashT = setTimeout(() => { if (e.dying) return; for (const pl of planes) if (pl.mat) pl.mat.emissiveColor = new B.Color3(1, 1, 1); }, 140);
  }
  // 他人移动 GC_MOVE(282): 平滑步进到 (nc,nr), 朝向 dir。
  otherStep(objectID, nc, nr, dir) {
    const e = this._others.get(objectID); if (!e) return;
    e.dir = dir; e.action = "move";
    e.fromCol = e.col; e.fromRow = e.row; e.toCol = nc; e.toRow = nr;
    e.stepping = true; e.t0 = performance.now();
  }
  // 他人离开视野 GC_DELETE_OBJECT(232): 释放资源。
  removeOther(objectID) {
    const e = this._others.get(objectID); if (!e) return;
    try { (e.planes || [{ plane: e.plane, mat: e.mat }]).forEach((p) => { p.plane.dispose(); p.mat.dispose(); }); for (const id in e.textures) e.textures[id] && e.textures[id].dispose(); } catch {}
    this._others.delete(objectID);
  }
  // 每帧驱动其他玩家: 推进动画 + 步进插值 + 绘制(无相机跟随)。
  _updateOther(e, now, frameMs) {
    if (!e._lastNow) e._lastNow = now;
    if (e.dying) { this._updateDying(e, now); return; }    // 死亡序列优先
    e.animClock += now - e._lastNow; e._lastNow = now;
    while (e.animClock >= frameMs) { e.animClock -= frameMs; e.animIdx++; }
    if (e._atkUntil && now < e._atkUntil && e.anim.attack) {   // 攻击动画(临时)
      e.action = "attack"; this._renderAt(e, e.col, e.row);
    } else if (e.stepping) {
      e.action = "move";
      const p = Math.min(1, (now - e.t0) / e.stepMs);
      const a = this._tileGTL(e.fromCol, e.fromRow), b = this._tileGTL(e.toCol, e.toRow);
      const gx = a.x + (b.x - a.x) * p, gy = a.y + (b.y - a.y) * p;
      this._drawFrame(e, gx, gy);
      if (p >= 1) { e.col = e.toCol; e.row = e.toRow; e.stepping = false; }
    } else {
      if (e.action !== "stand") e.action = "stand";
      this._renderAt(e, e.col, e.row);
    }
  }

  // 格子 → 全局瓦片左上像素(与窗口无关)
  _tileGTL(col, row) { return { x: col * TW, y: row * TH }; }
  // 当前序列帧 {s,cx,cy}; frameOverride!=null 时用指定帧(一次性动作), 否则循环
  _curFrame(e) {
    const seq = e.anim[e.action] && e.anim[e.action][e.dir]; if (!seq || !seq.length) return null;
    const idx = (e.frameOverride != null) ? Math.min(e.frameOverride, seq.length - 1) : (e.animIdx % seq.length);
    return seq[idx];
  }
  // 把当前帧画到"全局瓦片左上=(gx,gy)": 应用 cX/cY 偏移 + 按帧缩放 + 脚底(瓦片底)定深度
  // 多部位渲染: 遍历 e.planes(身体+装备外观层), 每部位同 action/dir/animIdx 取各自精灵叠加。
  _drawFrame(e, gx, gy) {
    const planes = e.planes || [{ anim: e.anim, plane: e.plane, mat: e.mat, order: 0 }];
    const depthY = gy + TH / 2;                                   // 角色深度=所在行中点(开源扇区画家)
    for (const part of planes) {
      const fr = this._curFrameOf(part.anim, e);
      if (!fr) { part.plane.setEnabled(false); continue; }        // 该部位此动作无帧→隐藏
      const m = e.frameMeta[fr.s]; if (!m) { part.plane.setEnabled(false); continue; }
      part.plane.setEnabled(true);
      if (part.order === 0) { e._h = m.h; e._vtop = m.vtop || 0; }  // 身体定血条/名字高度
      const cx = gx + fr.cx + m.w / 2, cy = gy + fr.cy + m.h / 2;   // 贴图中心(全局像素), 各部位各自锚点
      const w = this._gw(cx, cy);
      part.plane.position.set(w.x, w.y, depthZ(depthY) - part.order * 0.0008);  // 装备层在身体前(order大更前)
      part.plane.scaling.x = m.w; part.plane.scaling.y = m.h;
      part.mat.diffuseTexture = e.textures[fr.s];
    }
  }
  // 用指定部位 anim 取当前帧(多部位共享 e.action/dir/animIdx/frameOverride)。
  _curFrameOf(anim, e) {
    const seq = anim && anim[e.action] && anim[e.action][e.dir]; if (!seq || !seq.length) return null;
    const idx = (e.frameOverride != null) ? Math.min(e.frameOverride, seq.length - 1) : (e.animIdx % seq.length);
    return seq[idx];
  }
  _renderAt(e, col, row) { const tl = this._tileGTL(col, row); this._drawFrame(e, tl.x, tl.y); }
  _centerTile(col, row) { this._camTo(col * TW + TW / 2, row * TH + TH / 2); }
  _camTo(gx, gy) {
    const w = this._gw(gx, gy);
    this.camera.position = new BABYLON.Vector3(w.x, w.y, -100);
    this.camera.setTarget(new BABYLON.Vector3(w.x, w.y, 0));
  }

  // 2D/3D 共存演示: 导入 Babylon 官方 Dude 模型(骨骼行走动画), 克隆 count 个放在 (col,row) 一带。
  // 与 2D 地砖/精灵同场渲染, 验证未来可逐步替换为 3D 素材。无特殊处理, 原样加入。
  addDudes3D(col, row, count = 1) {
    const B = BABYLON;
    B.SceneLoader.ImportMesh("", "https://playground.babylonjs.com/scenes/Dude/", "Dude.babylon", this.scene,
      (meshes, ps, skeletons) => {
        const root = meshes[0];
        const bb = root.getHierarchyBoundingVectors(true);
        const s = 90 / Math.max(1, bb.max.y - bb.min.y);   // 自动缩放到约 90px 高(更小)
        const depth = Math.max(0.001, bb.max.z - bb.min.z);
        const place = (mesh, cc) => {
          // z 压扁到约一个深度槽(正交直视 z 轴 → 厚度不可见), 使其与 2D 同一深度缓冲正确遮挡
          mesh.scaling.set(s, s, 0.2 / depth);
          mesh.rotation = new B.Vector3(0, 0, 0);          // 面朝相机(正面)
          const w = this._gw(cc * TW + TW / 2, row * TH + TH / 2);
          mesh.position = new B.Vector3(w.x, w.y, depthZ(row * TH + TH / 2)); // 同 2D 角色: 行中点深度
        };
        // 去掉镜面高光: specular 依赖相机位置, 相机跟随主角 → 否则模型亮度随主角远近/角度变化。改纯漫反射。
        const killSpec = (mat) => {
          if (!mat) return;
          if (mat.subMaterials) { mat.subMaterials.forEach(killSpec); return; }
          if (mat.specularColor) mat.specularColor = new B.Color3(0, 0, 0);
          if ("specularPower" in mat) mat.specularPower = 0;
        };
        meshes.forEach((m) => killSpec(m.material));
        place(root, col);
        if (skeletons[0]) this.scene.beginAnimation(skeletons[0], 0, 100, true, 1.0);
        for (let i = 1; i < count; i++) {
          const c = root.clone("dude" + i);
          place(c, col + i * 3);
          if (skeletons[0]) { const sk = skeletons[0].clone("sk" + i); c.skeleton = sk; this.scene.beginAnimation(sk, 0, 100, true, 1.0); }
        }
        if (this.onLog) this.onLog(`3D 演示: Dude×${count} 已载入(骨骼行走动画)`);
      },
      null,
      (scene, msg) => { if (this.onLog) this.onLog("3D 模型加载失败(需联网): " + msg); }
    );
    return this;
  }

  // 键盘移动意图: dc,dr ∈ {-1,0,1}; (0,0)=松开停步。移动会中断/解除一次性动作(攻击/死亡)。
  setIntent(dc, dr) { this.intent = { dc, dr }; if (dc || dr) { this.path = null; this._atkTarget = null; if (this.player) this.player.oneShot = null; } }   // 键盘移动→取消攻击锁定

  // 服务器权威移动: 设置移动请求回调。设了之后, 移动意图不再本地步进, 而是回调(dir,curCol,curRow)发 CG_MOVE,
  // 等服务器 GC_MOVE_OK 后由 serverStep 播放到新格。null=本地模拟模式。
  setNetMove(fn) { this._netMove = fn; this._sendMove = 0; return this; }
  // 服务器确认移动(GC_MOVE_OK): 开源本地预测模型下, 客户端已自行走过该步, 此处仅递减待确认计数(不再驱动移动)。
  serverStep(nc, nr, dir) {
    if (this._sendMove > 0) this._sendMove--;
    // 可选: 若本地预测与服务端(nc,nr)严重偏离可矫正; 开源默认信任本地, 仅靠 GC_MOVE_ERROR 重同步。
  }
  // 服务器拒绝移动(GC_MOVE_ERROR): 重同步到服务器坐标 + 清待确认计数 + 弃当前路径。
  serverReject(x, y) {
    const e = this.player; if (!e) return;
    e.col = x; e.row = y; e.stepping = false; this._sendMove = 0; this.path = null; this._renderAt(e, x, y);
  }
  // 传送落点: 把现有角色放到新区坐标 + 相机居中(换区后调用)。
  placePlayer(x, y) {
    const e = this.player; if (!e) return;
    e.col = x; e.row = y; e.stepping = false; this._sendMove = 0; e.action = "stand"; e.animIdx = 0;
    this._renderAt(e, x, y); this._centerTile(x, y);
  }

  // 近战太远: 寻路到目标怪的最近相邻可走格(玩家到达后再点击发起攻击)。
  _approachTarget(e) {
    const pe = this.player; if (!pe) return;
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    let best = null, bestD = Infinity;
    for (const [dc, dr] of DIRS) {
      const c = e.col + dc, r = e.row + dr;
      if (!this._walkable(c, r)) continue;
      const d = Math.max(Math.abs(c - pe.col), Math.abs(r - pe.row));
      if (d < bestD) { bestD = d; best = { col: c, row: r }; }
    }
    if (best) this.moveTo(best.col, best.row);
  }
  // 锁定目标战斗(每帧驱动): 与目标相邻则面向+攻击(冷却门槛), 否则空闲时寻路逼近。点一次怪即持续追打。
  // 目标消失/死亡 → 解除锁定。键盘移动/点地面会清 _atkTarget。
  _tickCombat(now) {
    const oid = this._atkTarget; if (oid == null) return;
    const e = this._others.get(oid), pe = this.player;
    if (!e || e.dying || !e.plane || e.plane.isDisposed() || !pe) { this._atkTarget = null; return; }
    const dist = Math.max(Math.abs(e.col - pe.col), Math.abs(e.row - pe.row));   // 切比雪夫
    if (dist <= 1) {                                              // 相邻: 攻击(冷却门槛防 spam)
      pe.dir = dirOf(Math.sign(e.col - pe.col), Math.sign(e.row - pe.row));
      if (now >= (this._atkCdUntil || 0)) {
        this.playAction("attack");
        if (this._armedSkill && this._netSkill) this._netSkill(oid, this._armedSkill);
        else this._netAttack(oid);
        this._atkCdUntil = now + (this.atkDelayMs || 700);        // 攻速冷却(对齐服务端节奏)
      }
    } else if (!pe.stepping && !pe.oneShot) {   // 太远且不在步进/动作中: 逼近(本地预测移动, 不阻塞)
      this._approachTarget(e);
    }
  }
  // 一次性动作(攻击 attack / 死亡 die): 播一遍。hold=true 定格末帧(死亡), 否则播完回站立。
  playAction(name, hold = false) {
    const e = this.player; if (!e || !(e.anim[name] && e.anim[name].length)) return;
    e.oneShot = { action: name, start: e.animIdx, hold };
    this.intent = { dc: 0, dr: 0 }; this.path = null; e.stepping = false;
  }

  // 在生物身上播放一次性特效精灵动画(复刻开源 EFFECTSTATUS, 如升级光柱)。
  // eff={frames(s→{rgba,width,height}), anim(dir→[{s,cx,cy,back}])}; dir 朝向(升级用 down=2)。
  playCreatureEffect(entity, eff, dir = 2) {
    if (!entity || !eff || !eff.anim) return;
    const seq = eff.anim[dir] || eff.anim[2] || eff.anim.find((d) => d && d.length);
    if (!seq || !seq.length) return;
    const B = BABYLON;
    const plane = B.MeshBuilder.CreatePlane("eff", { size: 1 }, this.scene);
    const mat = new B.StandardMaterial("effm", this.scene);
    mat.emissiveColor = new B.Color3(1, 1, 1); mat.disableLighting = true;
    // 特效=发光火焰/光柱: 用 alpha 混合(软淡出, 对齐开源 memcpyAlpha 线性混合), 而非 ALPHATEST 硬切(会丢失光晕渐隐)。
    mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHABLEND; mat.specularColor = B.Color3.Black();
    mat.alphaMode = B.Engine.ALPHA_COMBINE; mat.backFaceCulling = false;
    plane.material = mat;
    const textures = {};
    for (const fr of seq) { const f = eff.frames[fr.s]; if (f && !textures[fr.s]) { const tx = B.RawTexture.CreateRGBATexture(f.rgba, f.width, f.height, this.scene, false, true, B.Texture.NEAREST_SAMPLINGMODE); tx.hasAlpha = true; textures[fr.s] = { tx, w: f.width, h: f.height }; } }
    this._effects.push({ entity, plane, mat, seq, textures, t0: performance.now(), frameMs: 55 });  // ~18fps(开源 delayFrame30)
  }
  // 每帧推进特效: 按时间取帧, 跟随生物当前格定位(效果略前于生物), 播完一遍 dispose。
  _updateEffects(now) {
    if (!this._effects.length) return;
    this._effects = this._effects.filter((ef) => {
      const idx = Math.floor((now - ef.t0) / ef.frameMs);
      if (idx >= ef.seq.length) { try { ef.plane.dispose(); ef.mat.dispose(); for (const k in ef.textures) ef.textures[k].tx.dispose(); } catch {} return false; }
      const fr = ef.seq[idx], t = ef.textures[fr.s];
      if (!t) { ef.plane.setEnabled(false); return true; }
      ef.plane.setEnabled(true);
      const en = ef.entity, tl = this._tileGTL(en.col, en.row);     // 跟生物当前格(升级时静止)
      const w = this._gw(tl.x + fr.cx + t.w / 2, tl.y + fr.cy + t.h / 2);
      ef.plane.position.set(w.x, w.y, depthZ(tl.y + TH / 2) - 0.02);  // 略前于生物(特效叠在前)
      ef.plane.scaling.x = t.w; ef.plane.scaling.y = t.h;
      ef.mat.diffuseTexture = t.tx;
      return true;
    });
  }

  // 格子可走性: 在界内 且 非 BLOCK_GROUND(0x02)
  _walkable(col, row) {
    const m = this._map;
    if (!m || col < 0 || row < 0 || col >= m.width || row >= m.height) return false;
    return !(m.property[row * m.width + col] & 0x02);
  }
  // 鼠标点击目标格 → BFS 寻路
  moveTo(col, row) {
    const m = this._map;
    if (this.player) this.player.oneShot = null; // 鼠标移动解除一次性动作
    const tc = Math.max(0, Math.min(m.width - 1, col)), tr = Math.max(0, Math.min(m.height - 1, row));
    const e = this.player;
    const path = this._findPath(e.col, e.row, tc, tr);
    if (path && path.length) { this.path = path; this.intent = { dc: 0, dr: 0 }; }
  }
  // BFS 寻路(8 向, 不穿墙角, 节点上限 30000)。返回不含起点的格子数组, 无路返回 null。
  _findPath(sc, sr, tc, tr) {
    if (!this._walkable(tc, tr) || (sc === tc && sr === tr)) return null;
    const m = this._map, W = m.width, key = (c, r) => r * W + c;
    const prev = new Map(); const q = [[sc, sr]]; prev.set(key(sc, sr), -1);
    const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    let head = 0, guard = 0;
    while (head < q.length && guard++ < 30000) {
      const [c, r] = q[head++];
      if (c === tc && r === tr) break;
      for (const [dc, dr] of DIRS) {
        const nc = c + dc, nr = r + dr;
        if (!this._walkable(nc, nr) || prev.has(key(nc, nr))) continue;
        if (dc && dr && (!this._walkable(c + dc, r) || !this._walkable(c, r + dr))) continue; // 不穿墙角
        prev.set(key(nc, nr), key(c, r)); q.push([nc, nr]);
      }
    }
    if (!prev.has(key(tc, tr))) return null; // 不可达
    const out = []; let k = key(tc, tr);
    while (k !== -1 && k !== key(sc, sr)) { out.push({ col: k % W, row: (k - k % W) / W }); k = prev.get(k); }
    return out.reverse();
  }
  // 世界坐标 → 全局像素 → 格子(矩形网格)。world = _gw(gx,gy) = (gx, -gy)。
  _worldToTile(w) { return { col: Math.floor(w.x / TW), row: Math.floor(-w.y / TH) }; }
  // 注册鼠标点击 → 拾取地面 → 设目标格
  _installPointer() {
    if (this._pointerInstalled) return; this._pointerInstalled = true;
    this.scene.onPointerObservable.add((pi) => {
      if (pi.type !== BABYLON.PointerEventTypes.POINTERPICK) return;
      const p = pi.pickInfo; if (!p || !p.hit) return;
      // 点到生物精灵: 怪物→攻击(面向+发 CG_ATTACK+本地攻击动画), NPC→对话(发 CGNPCTalk); 否则点地面寻路。
      if (p.pickedMesh) {
        for (const [oid, e] of this._others) {
          if (e.plane !== p.pickedMesh) continue;
          if (e.kind === "monster" && this._netAttack) {                                   // 锁定目标: 持续追打(自动逼近→相邻则攻击), 直到怪死/取消
            this._atkTarget = oid; this._tickCombat(performance.now());
            return;
          }
          if (e.kind === "npc" && this._netNPCTalk) { this._netNPCTalk(oid); return; }
        }
      }
      if (this._netPickup && p.pickedMesh) {                  // 点到地面物品 → 拾取
        for (const [oid, g] of this._groundItems) {
          if (g.plane === p.pickedMesh) { this._netPickup(oid); return; }
        }
      }
      const { col, row } = this._worldToTile(p.pickedPoint);
      this._atkTarget = null;             // 点地面移动→取消攻击锁定
      this.moveTo(col, row);
    });
  }

  // 决定本步方向: 键盘意图优先(可斜向), 否则沿鼠标寻路路径走下一格
  _nextStepDir(e) {
    if (this.intent.dc || this.intent.dr) return { dc: this.intent.dc, dr: this.intent.dr };
    if (this.path && this.path.length) {
      const next = this.path[0];
      const dc = Math.sign(next.col - e.col), dr = Math.sign(next.row - e.row);
      if (next.col === e.col && next.row === e.row) { this.path.shift(); return this._nextStepDir(e); }
      return { dc, dr };
    }
    return { dc: 0, dr: 0 };
  }
  _setDir(e, dc, dr) { e.dir = dirOf(dc, dr); }
  _beginStep(e, dc, dr) {
    this._setDir(e, dc, dr);
    const nc = e.col + dc, nr = e.row + dr;
    if (!this._walkable(nc, nr)) { this.path = null; return false; } // 障碍/触边: 停步
    e.fromCol = e.col; e.fromRow = e.row; e.toCol = nc; e.toRow = nr;
    e.stepping = true; e.t0 = performance.now();
    return true;
  }

  start() {
    const FRAME_MS = 45; // 序列帧推进间隔(独立于位移)
    const MAX_CLIENT_MOVE = 5; // 开源 MAX_CLIENT_MOVE: 本地预测最多领先服务端的步数(防超前)
    this.scene.onBeforeRenderObservable.add(() => {
     try {
      const now = performance.now();
      const e = this.player;
      this._updateBlocks(e ? e.col : this._focusCol, e ? e.row : this._focusRow); // 区块网格: 每帧载/卸1块
      this._drainBuildQueue();            // 建筑限速创建(全局 BUILD_PER_FRAME/帧)
      for (const o of this._others.values()) this._updateOther(o, now, FRAME_MS); // 其他玩家逐帧驱动
      this._updateEffects(now);           // 一次性特效(升级等)逐帧 + 播完移除
      if (!e) return;
      this._tickCombat(now);              // 锁定目标: 自动逼近+攻击(点一次怪持续追打)
      // 动画时钟: 按真实时间推进序列(cfpk 序列已编码姿势保持) —— 与位移解耦, 不卡帧
      if (!e._lastNow) e._lastNow = now;
      e.animClock += now - e._lastNow; e._lastNow = now;
      while (e.animClock >= FRAME_MS) { e.animClock -= FRAME_MS; e.animIdx++; }

      // 一次性动作(攻击/死亡): 播一遍, 期间不移动
      if (e.oneShot) {
        e.action = e.oneShot.action;
        const seq = e.anim[e.action] && e.anim[e.action][e.dir];
        const len = seq ? seq.length : 1;
        let fr = e.animIdx - e.oneShot.start;
        if (fr >= len) {
          if (e.oneShot.hold) fr = len - 1;                 // 死亡: 定格末帧
          else { e.oneShot = null; e.frameOverride = null; e.action = "stand"; e.animIdx = 0; } // 攻击: 回站立
        }
        if (e.oneShot) { e.frameOverride = Math.min(fr, len - 1); this._renderAt(e, e.col, e.row); return; }
      }
      e.frameOverride = null;

      if (e.stepping) {
        e.action = "move";
        const p = Math.min(1, (now - e.t0) / e.stepMs);
        const a = this._tileGTL(e.fromCol, e.fromRow), b = this._tileGTL(e.toCol, e.toRow);
        const gx = a.x + (b.x - a.x) * p, gy = a.y + (b.y - a.y) * p;       // 逐帧像素插值(全局瓦片左上)
        this._drawFrame(e, gx, gy);
        this._camTo(gx + TW / 2, gy + TH / 2);                             // 相机平滑跟随
        if (p >= 1) { e.col = e.toCol; e.row = e.toRow; e.stepping = false; }
      } else {
        const { dc, dr } = this._nextStepDir(e);                            // 连续走: 一步接一步
        if (dc || dr) {
          // 忠实开源(MPlayer 本地预测): 立即本地步进 + 发 CGMove(不等确认); _sendMove 计数限流防超前。
          if (this._netMove && (this._sendMove || 0) >= MAX_CLIENT_MOVE) { this._renderAt(e, e.col, e.row); }  // 待确认堆积(网络慢)→本帧不发新步; GC_MOVE_OK 会递减, 不会卡死
          else if (this._beginStep(e, dc, dr)) {                            // 本地立即步进(走向下一格), 同帧发包
            e.action = "move";
            if (this._netMove) { this._netMove(e.dir, e.fromCol, e.fromRow); this._sendMove = (this._sendMove || 0) + 1; }  // 发包(起步格+方向); GC_MOVE_OK 仅确认计数(本地已走)
            this._renderAt(e, e.col, e.row);
          } else { this._renderAt(e, e.col, e.row); }                       // 障碍/触边: beginStep=false, 停
        } else { if (e.action !== "stand") { e.action = "stand"; e.animIdx = 0; } this._renderAt(e, e.col, e.row); }
      }
      this._updateWallTransparency(e.col, e.row);   // 走到墙后→墙半透明(透出角色)
     } catch (err) { if (!this._loopErrLogged) { console.error("[render loop]", err); this._loopErrLogged = true; } } // 单帧异常不冻死全局
    });
    // 渲染后画 2D 覆盖层(血条/名字): 用最新相机矩阵, 且不受上面 early-return 影响。
    this.scene.onAfterRenderObservable.add(() => { try { this._drawOverlays(); } catch {} });
    this.engine.runRenderLoop(() => this.scene.render());
    return this;
  }

  // 生物头顶血条 + 名字(把世界坐标投影到屏幕画到覆盖层 canvas)。
  _drawOverlays() {
    const ctx = this.octx, ov = this.overlay; if (!ctx) return;
    const B = BABYLON, w = this.engine.getRenderWidth(), h = this.engine.getRenderHeight();
    if (ov.width !== w || ov.height !== h) { ov.width = w; ov.height = h; }
    ctx.clearRect(0, 0, w, h);
    const vpw = this.camera.viewport.toGlobal(w, h), tm = this.scene.getTransformMatrix();
    ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    for (const e of this._others.values()) {
      if (!e.plane || e.plane.isDisposed() || !e.name) continue;
      // 忠实开源(MTopViewDraw.cpp:1332): 血条/名字定位 = 脚底 − Creature.inf 的 Height(每生物常量, 见 memory)。
      // 我们: 脚底世界Y = 贴图底(position.y − _h/2); 头顶世界Y = 脚底 + Height(世界Y向上为正)。缺 Height 时回退贴图视觉顶启发式。
      const ch = e.creatureHeight;
      const headY = (ch != null)
        ? e.plane.position.y - (e._h || 60) / 2 + ch
        : e.plane.position.y + (e._h || 60) / 2 - (e._vtop || 0) + 4;
      const sp = B.Vector3.Project(new B.Vector3(e.plane.position.x, headY, e.plane.position.z), B.Matrix.Identity(), tm, vpw);
      if (sp.z < 0 || sp.z > 1) continue;                          // 相机后方
      const x = sp.x; let y = sp.y;
      if (e.maxHP > 0) {                                            // 血条
        const bw = 40, bh = 4, ratio = Math.max(0, Math.min(1, e.hp / e.maxHP));
        ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(x - bw / 2 - 1, y - bh - 1, bw + 2, bh + 2);
        ctx.fillStyle = "#400"; ctx.fillRect(x - bw / 2, y - bh, bw, bh);
        ctx.fillStyle = e.kind === "monster" ? "#d33" : "#3c5"; ctx.fillRect(x - bw / 2, y - bh, bw * ratio, bh);
        y -= bh + 3;
      }
      ctx.font = "11px system-ui";                                 // 名字
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillText(e.name, x + 1, y - 1);
      ctx.fillStyle = e.kind === "monster" ? "#f9a" : (e.kind === "npc" ? "#9cf" : "#ffe8c8"); ctx.fillText(e.name, x, y - 2);
    }
    // 飘字(伤害数字): 上升 + 淡出, 900ms 后移除。
    const now = performance.now();
    if (this._floaters.length) {
      ctx.font = "bold 15px system-ui";
      this._floaters = this._floaters.filter((f) => {
        const t = (now - f.t0) / 900; if (t >= 1) return false;
        const sp = B.Vector3.Project(new B.Vector3(f.x, f.y, f.z), B.Matrix.Identity(), tm, vpw);
        if (sp.z < 0 || sp.z > 1) return true;
        const fx = sp.x, fy = sp.y - 4 - t * 34; ctx.globalAlpha = 1 - t;
        ctx.fillStyle = "rgba(0,0,0,.8)"; ctx.fillText(f.text, fx + 1, fy + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, fx, fy);
        return true;
      });
      ctx.globalAlpha = 1;
    }
  }
}
