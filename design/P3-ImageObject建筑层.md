# ImageObject(建筑/物件层) —— ✅ 已实现 + 深度排序

> 状态：解析器全量同步(8370物件,终点=fpTile) + 建筑独立精灵渲染 + 与角色统一深度排序 + 集成进 Babylon 客户端。
> Adam城 795 建筑(石台/楼梯/立柱/城墙)与地形+角色一起在浏览器渲染, 角色可走到建筑后被遮挡。
> 关键修正: MImageObject::LoadFromFile 先调 MObject 基类(9B: type1+id4+x2+y2), 漏了会全错位;
>          imageobject.spk 每块 **16** 精灵(非tile的128); 坏精灵 try/catch 跳过。
>
> ## ✅ 深度排序(已实现)
> 不再把建筑烤进地面平面贴图。terrain.js 只烤地砖, 每个建筑作为独立精灵返回({rgba,canvasX,canvasY,baseY})。
> render.js 给地面/每栋建筑/角色各自的 z = `-baseY * 0.01`(baseY=画布底边像素): 相机立 -Z 看 +Z,
> baseY 越大(屏幕越下=等距越近)→ z 越负 → 越靠前。地面恒 z=1(最后)。
> 二值色键 alpha + `MATERIAL_ALPHATEST` → 深度缓冲精确逐像素遮挡, 无需排序、无 z-fighting。
> 角色脚底 Y 与建筑底边同基准, 故能正确走到墙/柱"后面"。
>
> ## ✅ 区块网格流式地形(全局坐标, 跟随玩家逐块加载)
> 坐标系=**全局像素**(`_gw(gx,gy)=(gx,-gy)`, 与区块无关 → 拼接无缝)。地图切 **16×16 格/块**:
> - terrain.js: `initTerrain(cfg)` 解析地图 + 把建筑**按底部所在块分桶**; `buildBlock(bx,by)` 合成单块小地面画布 + 收集本块建筑。
> - render.js: 区块管理器 —— 玩家所在块 ±`RB(2)` 内保持加载, 每帧**最多载 1 块/卸 1 块**; 建筑入**全局队列**逐帧限速创建(`BUILD_PER_FRAME=40`)。
> - 每块: 地面单贴图(真机 1-2ms) + ~25-50 建筑(限速创建)。跨块只动几个块, 不再整窗口重建~千建筑。
>
> ### 走查教训(真机分段计时定位)
> - 旧"整窗口重建"方案: 真机实测 合成 51-219ms(同步冻结) + 建筑 ~700-840ms(~1000个) → 单帧卡顿 135-306ms, 初始 2255ms。
> - **地面纹理在真机仅 1-2ms**(swiftshader 误导我以为是瓶颈) → 真凶是**约 1000 建筑的纹理/网格/材质 churn** + 同步合成。
> - 改区块网格后: 走动**最大帧间隔 29ms, 0 帧 >50ms**(swiftshader)。彻底消除冻结。
> - 持久缓存(terrain.js 模块级): 地图/物件解析、块 buffer、解码精灵、地砖 ImageData 跨块复用。
>   (dev 服务器 no-cache, 块每页面加载首取后入模块缓存; 生产应给 .spk 长缓存。)
>
> ## ⚠️ 已知限制: 大物件深度(楼梯)
> 单物件 = 单 z(底边)。楼梯/大平台跨多扇区, 一个 z 无法表达"角色站在台阶中段"——会整体压住或被压。
> 原版用**逐扇区画家算法**(物件按所占 PositionList 扇区与角色交错绘制) + Viewpoint。彻底修需扇区级排序。
> 待续: 扇区深度排序 / SHADOW(type4) / ANIMATION(type5,6) / INTERACTION(type7)。


> 地砖之上的一层：建筑、树、装饰、交互物(NPC摊位/传送)等。adam_c 有 8370 个。
> 实现准则：逐项读客户端 `MZone.cpp`/`MImageObject.cpp` 等方法再 JS 复刻。

## 在 .map 中的位置
紧跟 sector 网格数据之后(非 fpImageObject 指针——客户端 MZone::LoadFromFile 是顺序读)：
```
... W*H 个 Sector(每 4 字节) ...
u32 ImageObjectCount            // adam_c=8370
每个 ImageObject:
  u8 ObjectType                 // 见下 5 类
  <该类型的 LoadFromFile 字段>
  ImageObjectPositionList       // 该物件占据的 sector 坐标列表
```

## ObjectType(MObject.h) 与各类 LoadFromFile
- TYPE_IMAGEOBJECT=3 → MImageObject:
  `u32 ImageObjectID + u16 SpriteID + i32 PixelX + i32 PixelY + u16 Viewpoint + u8 bAnimation + u8 bTrans` (18B)
  **PixelX/PixelY = 像素坐标(矩形网格空间), 直接定位; Viewpoint 用于深度排序**
- TYPE_SHADOWOBJECT=4 → MShadowObject (待确认字段, 多半同 MImageObject)
- TYPE_ANIMATIONOBJECT=5 → MAnimationObject = MImageObject(18B) + CAnimationFrame::LoadFromFile
- TYPE_SHADOWANIMATIONOBJECT=6 → MShadowAnimationObject
- TYPE_INTERACTIONOBJECT=7 → MInteractionObject = MAnimationObject + `InteractionObjectType(SIZE_INTERACTIONOBJECTTYPE)`

常量：SIZE_OBJECTID=4, SIZE_SECTORPOSITION=2(Viewpoint/坐标), SIZE_SPRITEID=2。

## 物件精灵包
`Image/imageobject.spk/`(目录分块, 同 tile.spk 格式) + `imageobject.spki`(12101 条)。
spriteID → 块内顺序解码取(可复用 `src/tile.js` 的 TileSet, 换 base 目录)。
另有 `interactionobject.spk`、`imageobject.sspk`(阴影)。

## 待补(完成解析器所需)
1. **CAnimationFrame::LoadFromFile 完整格式**(已知头: BltType1,Direction1,SoundFrame1,SoundID; 后接帧数组?)
2. **CPositionList(ImageObjectPositionList)::LoadFromFile 格式**(每物件必读, 错则整体偏移错位)
3. **MShadowObject::LoadFromFile** 确认
4. **深度排序**: 按 Viewpoint/Y 把 ImageObject 与角色/地面正确前后交错(读 MZone/MTopView 绘制循环)

## 实现顺序建议
1. 先补齐上述 3 个变长格式 → 写 ImageObject 解析器(能正确遍历 8370 个)。
2. 渲染静态 TYPE_IMAGEOBJECT(建筑/装饰, 占多数): imageobject 精灵 按 PixelX/PixelY 贴, 按 Viewpoint 排序。
3. 动画/交互物后续。
4. 集成进 Babylon 客户端: 地形→ImageObject→角色, 统一深度排序。
