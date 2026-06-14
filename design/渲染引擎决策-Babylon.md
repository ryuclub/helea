# 渲染引擎决策：Babylon.js（已用 spike 验证）

> 结论：采用 **Babylon.js**。理由是项目长期目标为「2D 现用 → 逐步引入并替换 3D 素材」，
> 需要从一开始就用 3D 引擎，避免将来换引擎重写。已通过 2D+3D 共存 spike 验证可行。

## 为什么不是 Pixi / Phaser / three
- Pixi/Phaser：2D 原生、性能好，但纯 2D；将来上 3D 要换引擎重写 → 与长期目标冲突。
- three.js：3D 可，但 Babylon 自带相机/资源/GUI/动画等更完整的引擎电池，2D+3D 混合更省事。
- Babylon：3D 引擎 + 完整电池，2D(billboard)与 3D(mesh)可在同一场景/相机/坐标系共存。

## 迁移架构（2D→3D 平滑替换）
- **一个 Babylon 场景**，相机固定为**正交 + 等距俯视**（ArcRotateCamera, ORTHOGRAPHIC），永不变。
- 每个游戏实体 = 位置/朝向/状态 + **可替换 visual**：
  - 现在：2D billboard（`.spk` 解码 → `RawTexture`，`BILLBOARDMODE_ALL`，`MATERIAL_ALPHATEST`）
  - 将来：3D mesh（逐个替换，位置/逻辑不动）
- 迁移期 2D 与 3D 实体**同场景共存**、深度遮挡正确（alpha-test 写深度）。

## spike 验证结果（web/spike/）
真机(Playwright)截图 `web/spike/out/babylon-spike.png` 证明：
1. 资源直接可用：`.spk` RGBA → `RawTexture`，原版斯雷亚精灵正常显示(41×79,12帧动画)。
2. 2D billboard(斯雷亚) + 3D mesh(胶囊占位) + 3D 棋盘地面，同一正交相机下共存。
3. 遮挡正确：2D 角色站在胶囊前正确遮挡。
- 关键 API：`RawTexture.CreateRGBATexture(rgba,w,h,scene,false,true,NEAREST)` + `hasAlpha`；
  材质 `StandardMaterial` + `emissiveColor=白` + `disableLighting` + `transparencyMode=ALPHATEST`。
- Babylon.js 本地 vendor：`web/spike/public/vendor/babylon.js`(8.5MB UMD)。

## 待办（已知难点，正式迁移时处理）
1. 角色 8 向方向帧：billboard 按「朝向 vs 相机」选帧（3D mesh 化后自动消失）。
2. 大量精灵性能：用 thin instances / 合批，视野裁剪。
3. 等距地砖：平铺到 3D 地面 vs 2D 地层，二选一（原型确认）。
4. 把 P4 demo 的 Canvas2D 渲染层迁到这套 Babylon 实体/visual 架构。
