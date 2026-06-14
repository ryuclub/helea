// 天之炼狱 渲染引擎(Babylon) —— 实体/visual 架构
//
// 设计: 一个正交等距场景(相机固定)。每个实体(Entity)有网格坐标+朝向+状态，
// 其"外观"(visual)可替换: 现在=2D billboard(.spk 解码帧)，将来=3D mesh，位置/逻辑不动。
//
// 用全局 BABYLON(由 <script src=vendor/babylon.js> 提供)。

export class Entity {
  constructor(renderer, { id, col = 0, row = 0 }) {
    this.r = renderer; this.id = id; this.col = col; this.row = row;
    this.dir = 0; this.frame = 0; this._tick = 0;
    this.node = null; this.textures = null; this.material = null; this.dirCount = 1; this.framesPerDir = 1;
  }
  // 2D billboard 外观: frames = [{width,height,rgba}], dirCount/framesPerDir 描述方向×帧布局
  setBillboard(frames, { dirCount = 3, framesPerDir = 4, worldHeight = 2.4 } = {}) {
    const B = BABYLON, scene = this.r.scene;
    this.dirCount = dirCount; this.framesPerDir = framesPerDir;
    this.textures = frames.map((f) => {
      const t = B.RawTexture.CreateRGBATexture(f.rgba, f.width, f.height, scene, false, true, B.Texture.NEAREST_SAMPLINGMODE);
      t.hasAlpha = true; return t;
    });
    const f0 = frames[0], W = worldHeight * (f0.width / f0.height);
    const plane = B.MeshBuilder.CreatePlane(`e${this.id}`, { width: W, height: worldHeight }, scene);
    plane.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    const mat = new B.StandardMaterial(`m${this.id}`, scene);
    mat.diffuseTexture = this.textures[0];
    mat.emissiveColor = new B.Color3(1, 1, 1); mat.disableLighting = true;
    mat.useAlphaFromDiffuseTexture = true; mat.transparencyMode = B.Material.MATERIAL_ALPHATEST;
    mat.specularColor = B.Color3.Black();
    plane.material = mat;
    this.node = plane; this.material = mat; this._h = worldHeight;
    this.place();
    return this;
  }
  // 将来: 用 3D mesh 替换 visual(位置不动)
  setMesh(mesh, worldHeight = 2.2) {
    if (this.node) this.node.dispose();
    this.node = mesh; this._h = worldHeight; this.place();
    return this;
  }
  setGrid(col, row) { this.col = col; this.row = row; this.place(); return this; }
  place() { if (this.node) this.node.position = this.r.isoToWorld(this.col, this.row, (this._h || 2) / 2); }
  // 行走动画(billboard): 循环帧, 轮换朝向(占位)
  animate() {
    if (!this.textures) return;
    if (++this._tick % 14 !== 0) return;
    this.frame = (this.frame + 1) % this.framesPerDir;
    if (this.frame === 0) this.dir = (this.dir + 1) % this.dirCount;
    this.material.diffuseTexture = this.textures[this.dir * this.framesPerDir + this.frame];
  }
}

export class GameRenderer {
  constructor(canvas) { this.canvas = canvas; this.entities = []; }
  buildScene() {
    const B = BABYLON;
    this.engine = new B.Engine(this.canvas, true, { preserveDrawingBuffer: true });
    this.scene = new B.Scene(this.engine);
    this.scene.clearColor = new B.Color4(0.05, 0.05, 0.08, 1);
    const cam = new B.ArcRotateCamera("cam", -Math.PI / 4, Math.PI / 3.2, 30, new B.Vector3(0, 0.5, 0), this.scene);
    cam.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
    this.camera = cam; this._setOrtho();
    const light = new B.HemisphericLight("l", new B.Vector3(0.3, 1, 0.4), this.scene);
    light.intensity = 0.95;
    addEventListener("resize", () => { this.engine.resize(); this._setOrtho(); });
    return this;
  }
  _setOrtho() {
    const z = 7, a = this.engine.getRenderWidth() / this.engine.getRenderHeight();
    const c = this.camera;
    c.orthoLeft = -z * a; c.orthoRight = z * a; c.orthoTop = z; c.orthoBottom = -z;
  }
  // 网格(col,row) → 世界坐标(以网格中心为原点)
  isoToWorld(col, row, y = 0) {
    return new BABYLON.Vector3(col - this._cx, y, row - this._cy);
  }
  addGround(cols, rows) {
    const B = BABYLON; this._cx = cols / 2 - 0.5; this._cy = rows / 2 - 0.5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const t = B.MeshBuilder.CreateBox(`g${r}_${c}`, { width: 1, height: 0.1, depth: 1 }, this.scene);
      t.position = this.isoToWorld(c, r, 0);
      const m = new B.StandardMaterial(`gm${r}_${c}`, this.scene);
      const v = (r + c) & 1 ? 0.24 : 0.17;
      m.diffuseColor = new B.Color3(0.10, v + 0.08, 0.13); m.specularColor = B.Color3.Black();
      t.material = m;
    }
    return this;
  }
  spawn(opts) { const e = new Entity(this, opts); this.entities.push(e); return e; }
  start() {
    this.scene.onBeforeRenderObservable.add(() => { for (const e of this.entities) e.animate(); });
    this.engine.runRenderLoop(() => this.scene.render());
    return this;
  }
}
