// 三族进阶角色动作解析 —— 复刻开源客户端 MTopViewDraw.cpp 的重映射逻辑。
// 服务器只发基础 action(STAND=0/MOVE=1/ATTACK=2/DIE=6); 客户端按种族重映射成进阶 action(≥100),
// 再 -100 得 cfpk 下标。各进阶枚举均从 100 起(MTypeDef.h)。
//
// 数据来源(全部从 research/client 推导, 非肉眼试):
//   Slayer  ConvAdvancementSlayerActionFromSlayerAction(按右手武器分流; 默认 mace/cross)
//   Vampire GetAdvancementVampireActionFromVampireAction(AdvancementVampireActionConvTable 查表)
//   Ousters ConvAdvancementOustersActionFromOusterAction(按 bChakram 分流; 默认 wristlet)

export const BASE_ACTION = { STAND: 0, MOVE: 1, ATTACK: 2, DIE: 6 };

// 各族「基础 action → cfpk 下标」(进阶 action 号 - 100)。我们持有的是 AC(进阶)精灵包, 按 AC 规则取动作。
// 经完整对照开源(MTopViewDraw.cpp 重映射 + VS_UI_TITLE_SHOWCHAR.CPP):
//   Slayer 默认 mace/cross: STOP_MACE_AND_CROSS=103→3, MOVE=107→7, ATTACK=108→8, DIE=136→36。
//   Vampire AC: ADVANCEMENT_STOP=100→0, MOVE=101→1, ATTACK_NORMAL=102→2, DIE=106→6。
//   Ousters AC 默认 wristlet(无 chakram): WRISTLET_STOP=102→2, WRISTLET_MOVE=103→3(开源 _ShowCharacterACOusters);
//     ⚠ 必须配 FrameID 1(身体); 之前误用 FrameID 0 故 idx2/3 取不到帧。die=6, attack 待 ConvTable 校正(暂 4)。
const RACE_ACTION_INDEX = {
  slayer:  { stand: 3, move: 7, attack: 8, die: 36 },
  vampire: { stand: 0, move: 1, attack: 2, die: 6 },
  ousters: { stand: 2, move: 3, attack: 4, die: 6 }, // wristlet on FrameID 1(开源 coat=1 + WRISTLET 动作)
};
// cfpk 第一维(FrameID/coat): 开源按 外观/装备/进阶 选 FrameID 叠多部位。AC 包结构(完整调查):
//   AC Slayer 身体 = AC_BODY=FrameID 0; AC Vampire 身体 = FrameID 0(武器在 FrameID 1);
//   AC Ousters 身体 = FrameID 1(开源 _ShowCharacterACOusters coat=1), 武器(chakram)在 FrameID 0。
// ⚠ 完整忠实: 形象应随等级/装备多部位合成(身体+头盔+武器+...); 此处取"基础身体单层", 装备合成层待建(见记忆)。
const RACE_FRAME_ID = { slayer: 0, vampire: 0, ousters: 1 };
export const raceFrameID = (race) => RACE_FRAME_ID[race] ?? 0;

// 各族 AC 身体精灵包(发行包 Data/Image; ac=advancement class)。按性别分包(ousters 单一, 全女设定)。
// sex: 0=男(MALE) 1=女(FEMALE)。目视核对: acvampireman=盔甲(男)、acvampirewoman=长袍(女), 映射正确。
//   用户先前"选男出女"实为性别未重载的 bug(已修 setSex→_ensureStand), 非文件反。
export const RACE_SPRITE_PACK = {
  slayer:  { 0: "acslayerman",   1: "acslayerwoman" },
  vampire: { 0: "acvampireman",  1: "acvampirewoman" },
  ousters: { 0: "acousters",     1: "acousters" }, // ousters 无性别分包(单一)
};

// 取某族某基础动作的 cfpk 下标。未知族回退 slayer。
export function actionIndex(race, actionName) {
  const t = RACE_ACTION_INDEX[race] || RACE_ACTION_INDEX.slayer;
  return t[actionName] ?? t.stand;
}

// 该族绘制需要的全部动作下标集合(供 cfpk 取序列)。
export function raceActions(race) {
  return RACE_ACTION_INDEX[race] || RACE_ACTION_INDEX.slayer;
}
