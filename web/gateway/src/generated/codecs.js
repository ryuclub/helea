// 自动生成 —— 线性包编解码(方向感知)。复杂包见 report.json
import { PacketReader, PacketWriter } from "../stream.js";

export const CG_ABSORB_SOUL = {
  id: 1,
  fields: ["objectID","targetZoneX","targetZoneY","invenObjectID","invenX","invenY","targetInvenX","targetInvenY"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u16(o.targetZoneX);
  w.u16(o.targetZoneY);
  w.u32(o.invenObjectID);
  w.u8(o.invenX);
  w.u8(o.invenY);
  w.u8(o.targetInvenX);
  w.u8(o.targetInvenY);
    return w;
  },
};

export const CG_ACCEPT_UNION = {
  id: 2,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_ADD_GEAR_TO_MOUSE = {
  id: 3,
  fields: ["objectID","slotID"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.slotID);
    return w;
  },
};

export const CG_ADD_INVENTORY_TO_MOUSE = {
  id: 4,
  fields: ["objectID","inventoryItemObjectID","invenX","invenY"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u32(o.inventoryItemObjectID);
  w.u8(o.invenX);
  w.u8(o.invenY);
    return w;
  },
};

export const CG_ADD_ITEM_TO_CODE_SHEET = {
  id: 5,
  fields: ["objectID","x","y"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.x);
  w.u8(o.y);
    return w;
  },
};

export const CG_ADD_ITEM_TO_ITEM = {
  id: 6,
  fields: ["objectID","x","y"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.x);
  w.u8(o.y);
    return w;
  },
};

export const CG_ADD_MOUSE_TO_GEAR = {
  id: 7,
  fields: ["objectID","slotID"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.slotID);
    return w;
  },
};

export const CG_AUTH_KEY = {
  id: 16,
  fields: ["key"],
  encode(o, w) {
  w.u32(o.key);
    return w;
  },
};

export const CG_BLOOD_DRAIN = {
  id: 17,
  fields: ["objectID"],
  encode(o, w) {
  w.str(o.objectID);
    return w;
  },
};

export const CG_BUY_STORE_ITEM = {
  id: 18,
  fields: ["ownerObjectID","itemObjectID","index"],
  encode(o, w) {
  w.u32(o.ownerObjectID);
  w.u32(o.itemObjectID);
  w.u8(o.index);
    return w;
  },
};

export const CG_CASTING_SKILL = {
  id: 19,
  fields: ["skillType"],
  encode(o, w) {
  w.u16(o.skillType);
    return w;
  },
};

export const CG_DENY_UNION = {
  id: 24,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_DEPOSIT_PET = {
  id: 25,
  fields: ["objectID","index"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.index);
    return w;
  },
};

export const CG_DIAL_UP = {
  id: 26,
  fields: ["phoneNumber"],
  encode(o, w) {
  w.u32(o.phoneNumber);
    return w;
  },
};

export const CG_DONATION_MONEY = {
  id: 29,
  fields: ["gold","donationType"],
  encode(o, w) {
  w.u32(o.gold);
  w.u8(o.donationType);
    return w;
  },
};

export const CG_DOWN_SKILL = {
  id: 30,
  fields: ["skillType"],
  encode(o, w) {
  w.u16(o.skillType);
    return w;
  },
};

export const CG_EXPEL_GUILD = {
  id: 32,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_FAIL_QUEST = {
  id: 34,
  fields: ["bFail"],
  encode(o, w) {
  w.u8(o.bFail);
    return w;
  },
};

export const CG_GET_EVENT_ITEM = {
  id: 35,
  fields: ["eventType"],
  encode(o, w) {
  w.u8(o.eventType);
    return w;
  },
};

export const CG_LEARN_SKILL = {
  id: 42,
  fields: ["skillType","domainType"],
  encode(o, w) {
  w.u16(o.skillType);
  w.u8(o.domainType);
    return w;
  },
};

export const CG_LOTTERY_SELECT = {
  id: 44,
  fields: ["type","questLevel","giftID"],
  encode(o, w) {
  w.u8(o.type);
  w.u32(o.questLevel);
  w.u32(o.giftID);
    return w;
  },
};

export const CG_MAKE_ITEM = {
  id: 45,
  fields: ["itemClass","itemType"],
  encode(o, w) {
  w.u8(o.itemClass);
  w.u16(o.itemType);
    return w;
  },
};

export const CG_MODIFY_TAX_RATIO = {
  id: 51,
  fields: ["ratio"],
  encode(o, w) {
  w.u32(o.ratio);
    return w;
  },
};

export const CG_MOUSE_TO_STASH = {
  id: 52,
  fields: ["objectID","rack","index"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.rack);
  w.u8(o.index);
    return w;
  },
};

export const CG_PARTY_INVITE = {
  id: 56,
  fields: ["targetObjectID","code"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u8(o.code);
    return w;
  },
};

export const CG_PARTY_SAY = {
  id: 59,
  fields: ["color","message"],
  encode(o, w) {
  w.u32(o.color);
  w.u8((o.message ?? "").length);
  w.str(o.message);
    return w;
  },
};

export const CG_PHONE_DISCONNECT = {
  id: 61,
  fields: ["slotID"],
  encode(o, w) {
  w.u8(o.slotID);
    return w;
  },
};

export const CG_QUIT_GUILD = {
  id: 65,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_QUIT_UNION = {
  id: 66,
  fields: ["guildID","method"],
  encode(o, w) {
  w.u16(o.guildID);
  w.u8(o.method);
    return w;
  },
};

export const CG_QUIT_UNION_ACCEPT = {
  id: 67,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_QUIT_UNION_DENY = {
  id: 68,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_RELIC_TO_OBJECT = {
  id: 72,
  fields: ["itemObjectID","objectID","x","y"],
  encode(o, w) {
  w.u32(o.itemObjectID);
  w.u32(o.objectID);
  w.u8(o.x);
  w.u8(o.y);
    return w;
  },
};

export const CG_RELOAD_FROM_INVENTORY = {
  id: 73,
  fields: ["objectID","invenX","invenY"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.invenX);
  w.u8(o.invenY);
    return w;
  },
};

export const CG_REQUEST_GUILD_LIST = {
  id: 75,
  fields: ["guildType"],
  encode(o, w) {
  w.u8(o.guildType);
    return w;
  },
};

export const CG_REQUEST_GUILD_MEMBER_LIST = {
  id: 76,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_REQUEST_INFO = {
  id: 77,
  fields: ["code","value"],
  encode(o, w) {
  w.u8(o.code);
  w.u32(o.value);
    return w;
  },
};

export const CG_REQUEST_NEWBIE_ITEM = {
  id: 79,
  fields: ["itemClass"],
  encode(o, w) {
  w.u8(o.itemClass);
    return w;
  },
};

export const CG_REQUEST_REPAIR = {
  id: 81,
  fields: ["objectID"],
  encode(o, w) {
  w.u32(o.objectID);
    return w;
  },
};

export const CG_REQUEST_STORE_INFO = {
  id: 82,
  fields: ["ownerObjectID"],
  encode(o, w) {
  w.u32(o.ownerObjectID);
    return w;
  },
};

export const CG_REQUEST_UNION = {
  id: 83,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_SELECT_BLOOD_BIBLE = {
  id: 88,
  fields: ["bloodBibleID"],
  encode(o, w) {
  w.u16(o.bloodBibleID);
    return w;
  },
};

export const CG_SELECT_GUILD = {
  id: 89,
  fields: ["guildID"],
  encode(o, w) {
  w.u16(o.guildID);
    return w;
  },
};

export const CG_SELECT_NICKNAME = {
  id: 91,
  fields: ["nicknameID"],
  encode(o, w) {
  w.u16(o.nicknameID);
    return w;
  },
};

export const CG_SELECT_PORTAL = {
  id: 92,
  fields: ["zoneID"],
  encode(o, w) {
  w.u16(o.zoneID);
    return w;
  },
};

export const CG_SELECT_QUEST = {
  id: 93,
  fields: ["questID","nPCOID"],
  encode(o, w) {
  w.u32(o.questID);
  w.u32(o.nPCOID);
    return w;
  },
};

export const CG_SELECT_RANK_BONUS = {
  id: 94,
  fields: ["rankBonusType"],
  encode(o, w) {
  w.u32(o.rankBonusType);
    return w;
  },
};

export const CG_SELECT_REGEN_ZONE = {
  id: 95,
  fields: ["regenZoneID"],
  encode(o, w) {
  w.u8(o.regenZoneID);
    return w;
  },
};

export const CG_SELECT_TILE_EFFECT = {
  id: 96,
  fields: ["effectObjectID"],
  encode(o, w) {
  w.u32(o.effectObjectID);
    return w;
  },
};

export const CG_SHOP_REQUEST_BUY = {
  id: 100,
  fields: ["objectID","rackType","rackIndex","num","x","y"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.rackType);
  w.u8(o.rackIndex);
  w.u8(o.num);
  w.u8(o.x);
  w.u8(o.y);
    return w;
  },
};

export const CG_SHOP_REQUEST_LIST = {
  id: 101,
  fields: ["objectID","rackType"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.rackType);
    return w;
  },
};

export const CG_SHOP_REQUEST_SELL = {
  id: 102,
  fields: ["objectID","itemObjectID","opCode"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u32(o.itemObjectID);
  w.u8(o.opCode);
    return w;
  },
};

export const CG_SILVER_COATING = {
  id: 103,
  fields: ["objectID"],
  encode(o, w) {
  w.u32(o.objectID);
    return w;
  },
};

export const CG_STASH_DEPOSIT = {
  id: 111,
  fields: ["amount"],
  encode(o, w) {
  w.u32(o.amount);
    return w;
  },
};

export const CG_STASH_LIST = {
  id: 112,
  fields: ["objectID"],
  encode(o, w) {
  w.u32(o.objectID);
    return w;
  },
};

export const CG_STASH_TO_MOUSE = {
  id: 114,
  fields: ["objectID","rack","index"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.rack);
  w.u8(o.index);
    return w;
  },
};

export const CG_STASH_WITHDRAW = {
  id: 115,
  fields: ["amount"],
  encode(o, w) {
  w.u32(o.amount);
    return w;
  },
};

export const CG_STORE_SIGN = {
  id: 118,
  fields: ["sign"],
  encode(o, w) {
  w.u8((o.sign ?? "").length);
  w.str(o.sign);
    return w;
  },
};

export const CG_SUBMIT_SCORE = {
  id: 119,
  fields: ["gameType","level","score"],
  encode(o, w) {
  w.u8(o.gameType);
  w.u8(o.level);
  w.u16(o.score);
    return w;
  },
};

export const CG_TAKE_OUT_GOOD = {
  id: 120,
  fields: ["objectID"],
  encode(o, w) {
  w.u32(o.objectID);
    return w;
  },
};

export const CG_TAME_MONSTER = {
  id: 121,
  fields: ["objectID"],
  encode(o, w) {
  w.u32(o.objectID);
    return w;
  },
};

export const CG_THROW_BOMB = {
  id: 122,
  fields: ["zoneX","zoneY","bombX","bombY","attackSlayerFlag"],
  encode(o, w) {
  w.u8(o.zoneX);
  w.u8(o.zoneY);
  w.u8(o.bombX);
  w.u8(o.bombY);
  w.u8(o.attackSlayerFlag);
    return w;
  },
};

export const CG_THROW_ITEM = {
  id: 123,
  fields: ["objectID","targetObjectID","invenX","invenY"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u32(o.targetObjectID);
  w.u8(o.invenX);
  w.u8(o.invenY);
    return w;
  },
};

export const CG_TRADE_ADD_ITEM = {
  id: 124,
  fields: ["targetObjectID","itemObjectID"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u32(o.itemObjectID);
    return w;
  },
};

export const CG_TRADE_FINISH = {
  id: 125,
  fields: ["targetObjectID","code"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u8(o.code);
    return w;
  },
};

export const CG_TRADE_MONEY = {
  id: 126,
  fields: ["targetObjectID","gold","code"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u32(o.gold);
  w.u8(o.code);
    return w;
  },
};

export const CG_TRADE_PREPARE = {
  id: 127,
  fields: ["targetObjectID","code"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u8(o.code);
    return w;
  },
};

export const CG_TRADE_REMOVE_ITEM = {
  id: 128,
  fields: ["targetObjectID","itemObjectID"],
  encode(o, w) {
  w.u32(o.targetObjectID);
  w.u32(o.itemObjectID);
    return w;
  },
};

export const CG_TRY_JOIN_GUILD = {
  id: 129,
  fields: ["guildID","guildMemberRank"],
  encode(o, w) {
  w.u16(o.guildID);
  w.u8(o.guildMemberRank);
    return w;
  },
};

export const CG_UNBURROW = {
  id: 131,
  fields: ["x","y","dir"],
  encode(o, w) {
  w.u8(o.x);
  w.u8(o.y);
  w.u8(o.dir);
    return w;
  },
};

export const CG_USE_BONUS_POINT = {
  id: 134,
  fields: ["which"],
  encode(o, w) {
  w.u8(o.which);
    return w;
  },
};

export const CG_WITHDRAW_PET = {
  id: 145,
  fields: ["objectID","index"],
  encode(o, w) {
  w.u32(o.objectID);
  w.u8(o.index);
    return w;
  },
};

export const CG_WITHDRAW_TAX = {
  id: 146,
  fields: ["gold"],
  encode(o, w) {
  w.u32(o.gold);
    return w;
  },
};

export const CL_CHANGE_SERVER = {
  id: 147,
  fields: ["serverGroupID"],
  encode(o, w) {
  w.u8(o.serverGroupID);
    return w;
  },
};

export const CL_RECONNECT_LOGIN = {
  id: 157,
  fields: ["key","loginMode"],
  encode(o, w) {
  w.u32(o.key);
  w.u8(o.loginMode);
    return w;
  },
};

export const CL_SELECT_SERVER = {
  id: 160,
  fields: ["serverGroupID"],
  encode(o, w) {
  w.u8(o.serverGroupID);
    return w;
  },
};

export const CL_SELECT_WORLD = {
  id: 161,
  fields: ["worldID"],
  encode(o, w) {
  w.u8(o.worldID);
    return w;
  },
};

export const CL_VERSION_CHECK = {
  id: 162,
  fields: ["version"],
  encode(o, w) {
  w.u32(o.version);
    return w;
  },
};

export const GC_ADD_EFFECT_TO_TILE = {
  id: 176,
  fields: ["objectID","x","y","effectID","duration"],
  decode(r) {
  const objectID = r.u32();
  const x = r.u8();
  const y = r.u8();
  const effectID = r.u16();
  const duration = r.u16();
    return { objectID, x, y, effectID, duration };
  },
};

export const GC_ADD_GEAR_TO_INVENTORY = {
  id: 177,
  fields: ["slotID","invenX","invenY"],
  decode(r) {
  const slotID = r.u8();
  const invenX = r.u8();
  const invenY = r.u8();
    return { slotID, invenX, invenY };
  },
};

export const GC_ADD_GEAR_TO_ZONE = {
  id: 178,
  fields: ["slotID"],
  decode(r) {
  const slotID = r.u8();
    return { slotID };
  },
};

export const GC_ADD_HELICOPTER = {
  id: 179,
  fields: ["objectID","code"],
  decode(r) {
  const objectID = r.u32();
  const code = r.u8();
    return { objectID, code };
  },
};

export const GC_ADD_OUSTERS_CORPSE = {
  id: 191,
  fields: ["treasureCount"],
  decode(r) {
  const treasureCount = r.u8();
    return { treasureCount };
  },
};

export const GC_ADD_SLAYER_CORPSE = {
  id: 193,
  fields: ["treasureCount"],
  decode(r) {
  const treasureCount = r.u8();
    return { treasureCount };
  },
};

export const GC_ADD_STORE_ITEM = {
  id: 194,
  fields: ["ownerObjectID","index"],
  decode(r) {
  const ownerObjectID = r.u32();
  const index = r.u8();
    return { ownerObjectID, index };
  },
};

export const GC_ADD_VAMPIRE_CORPSE = {
  id: 196,
  fields: ["treasureCount"],
  decode(r) {
  const treasureCount = r.u8();
    return { treasureCount };
  },
};

export const GC_ADDRESS_LIST_VERIFY = {
  id: 201,
  fields: ["code","parameter"],
  decode(r) {
  const code = r.u8();
  const parameter = r.u32();
    return { code, parameter };
  },
};

export const GC_ATTACK = {
  id: 202,
  fields: ["objectID","x","y","dir"],
  decode(r) {
  const objectID = r.bytes(szObjectID);
  const x = r.bytes(szCoord);
  const y = r.bytes(szCoord);
  const dir = r.bytes(szDir);
    return { objectID, x, y, dir };
  },
};

export const GC_AUTH_KEY = {
  id: 211,
  fields: ["key"],
  decode(r) {
  const key = r.u32();
    return { key };
  },
};

export const GC_CANNOT_ADD = {
  id: 218,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_CANNOT_USE = {
  id: 219,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_CASTING_SKILL = {
  id: 220,
  fields: ["skillType"],
  decode(r) {
  const skillType = r.u16();
    return { skillType };
  },
};

export const GC_CHANGE_DARK_LIGHT = {
  id: 221,
  fields: ["darkLevel","lightLevel"],
  decode(r) {
  const darkLevel = r.u8();
  const lightLevel = r.u8();
    return { darkLevel, lightLevel };
  },
};

export const GC_CHANGE_SHAPE = {
  id: 222,
  fields: ["objectID","itemClass","itemType","optionType","attackSpeed","flag"],
  decode(r) {
  const objectID = r.u32();
  const itemClass = r.u8();
  const itemType = r.u16();
  const optionType = r.u8();
  const attackSpeed = r.u8();
  const flag = r.u8();
    return { objectID, itemClass, itemType, optionType, attackSpeed, flag };
  },
};

export const GC_DELETE_INVENTORY_ITEM = {
  id: 231,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_DELETE_OBJECT = {
  id: 232,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_DOWN_SKILL_FAILED = {
  id: 234,
  fields: ["skillType","desc"],
  decode(r) {
  const skillType = r.u16();
  const desc = r.u8();
    return { skillType, desc };
  },
};

export const GC_ENTER_VAMPIRE_PORTAL = {
  id: 237,
  fields: ["objectID","x","y"],
  decode(r) {
  const objectID = r.u32();
  const x = r.u8();
  const y = r.u8();
    return { objectID, x, y };
  },
};

export const GC_GET_DAMAGE = {
  id: 242,
  fields: ["objectID","getDamage"],
  decode(r) {
  const objectID = r.bytes(szObjectID);
  const getDamage = r.bytes(szWORD);
    return { objectID, getDamage };
  },
};

export const GC_GUILD_RESPONSE = {
  id: 253,
  fields: ["code","parameter"],
  decode(r) {
  const code = r.u16();
  const parameter = r.u32();
    return { code, parameter };
  },
};

export const GC_KICK_MESSAGE = {
  id: 259,
  fields: ["t","seconds"],
  decode(r) {
  const t = r.u8();
  const seconds = r.u32();
    return { t, seconds };
  },
};

export const GC_KNOCK_BACK = {
  id: 260,
  fields: ["objectID","originX","originY","targetX","targetY"],
  decode(r) {
  const objectID = r.u32();
  const originX = r.u16();
  const originY = r.u16();
  const targetX = r.u16();
  const targetY = r.u16();
    return { objectID, originX, originY, targetX, targetY };
  },
};

export const GC_LEARN_SKILL_FAILED = {
  id: 265,
  fields: ["skillType","desc"],
  decode(r) {
  const skillType = r.u16();
  const desc = r.u8();
    return { skillType, desc };
  },
};

export const GC_LEARN_SKILL_READY = {
  id: 267,
  fields: ["skillDomainType"],
  decode(r) {
  const skillDomainType = r.u8();
    return { skillDomainType };
  },
};

export const GC_LIGHTNING = {
  id: 268,
  fields: ["delay"],
  decode(r) {
  const delay = r.u8();
    return { delay };
  },
};

export const GC_MODIFY_MONEY = {
  id: 276,
  fields: ["amount"],
  decode(r) {
  const amount = r.u32();
    return { amount };
  },
};

export const GC_NICKNAME_VERIFY = {
  id: 289,
  fields: ["code","parameter"],
  decode(r) {
  const code = r.u8();
  const parameter = r.u32();
    return { code, parameter };
  },
};

export const GC_OTHER_MODIFY_INFO = {
  id: 300,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_PARTY_ERROR = {
  id: 302,
  fields: ["code","targetObjectID"],
  decode(r) {
  const code = r.u8();
  const targetObjectID = r.u32();
    return { code, targetObjectID };
  },
};

export const GC_PARTY_INVITE = {
  id: 303,
  fields: ["code","targetObjectID"],
  decode(r) {
  const code = r.u8();
  const targetObjectID = r.u32();
    return { code, targetObjectID };
  },
};

export const GC_PET_STASH_VERIFY = {
  id: 310,
  fields: ["code"],
  decode(r) {
  const code = r.u8();
    return { code };
  },
};

export const GC_PHONE_DISCONNECTED = {
  id: 314,
  fields: ["phoneNumber","slotID"],
  decode(r) {
  const phoneNumber = r.u32();
  const slotID = r.u8();
    return { phoneNumber, slotID };
  },
};

export const GC_QUEST_STATUS = {
  id: 316,
  fields: ["questID","currentNum","time"],
  decode(r) {
  const questID = r.u16();
  const currentNum = r.u16();
  const time = r.u32();
    return { questID, currentNum, time };
  },
};

export const GC_REAL_WEARING_INFO = {
  id: 318,
  fields: ["info"],
  decode(r) {
  const info = r.u32();
    return { info };
  },
};

export const GC_REMOVE_CORPSE_HEAD = {
  id: 323,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_REMOVE_FROM_GEAR = {
  id: 325,
  fields: ["slotID"],
  decode(r) {
  const slotID = r.u8();
    return { slotID };
  },
};

export const GC_REMOVE_STORE_ITEM = {
  id: 327,
  fields: ["ownerObjectID","index"],
  decode(r) {
  const ownerObjectID = r.u32();
  const index = r.u8();
    return { ownerObjectID, index };
  },
};

export const GC_REQUEST_POWER_POINT_RESULT = {
  id: 329,
  fields: ["errorCode","sumPowerPoint","requestPowerPoint"],
  decode(r) {
  const errorCode = r.u8();
  const sumPowerPoint = r.i32();
  const requestPowerPoint = r.i32();
    return { errorCode, sumPowerPoint, requestPowerPoint };
  },
};

export const GC_SELECT_RANK_BONUS_FAILED = {
  id: 339,
  fields: ["rankBonusType","desc"],
  decode(r) {
  const rankBonusType = r.u32();
  const desc = r.u8();
    return { rankBonusType, desc };
  },
};

export const GC_SET_POSITION = {
  id: 341,
  fields: ["x","y","dir"],
  decode(r) {
  const x = r.u8();
  const y = r.u8();
  const dir = r.u8();
    return { x, y, dir };
  },
};

export const GC_SHOP_BUY_FAIL = {
  id: 343,
  fields: ["objectID","code","amount"],
  decode(r) {
  const objectID = r.u32();
  const code = r.u8();
  const amount = r.u32();
    return { objectID, code, amount };
  },
};

export const GC_SHOP_MARKET_CONDITION = {
  id: 347,
  fields: ["objectID","marketCondBuy","marketCondSell"],
  decode(r) {
  const objectID = r.u32();
  const marketCondBuy = r.i16();
  const marketCondSell = r.i16();
    return { objectID, marketCondBuy, marketCondSell };
  },
};

export const GC_SHOP_SELL_FAIL = {
  id: 348,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_SHOW_GUILD_REGIST = {
  id: 355,
  fields: ["registrationFee"],
  decode(r) {
  const registrationFee = r.u32();
    return { registrationFee };
  },
};

export const GC_SKILL_FAILED_1 = {
  id: 359,
  fields: ["skillType","grade"],
  decode(r) {
  const skillType = r.u16();
  const grade = r.u8();
    return { skillType, grade };
  },
};

export const GC_STASH_SELL = {
  id: 381,
  fields: ["price"],
  decode(r) {
  const price = r.u32();
    return { price };
  },
};

export const GC_SYSTEM_AVAILABILITIES = {
  id: 385,
  fields: ["flag","degree","skillLimit"],
  decode(r) {
  const flag = r.u32();
  const degree = r.u8();
  const skillLimit = r.u8();
    return { flag, degree, skillLimit };
  },
};

export const GC_TAKE_OFF = {
  id: 387,
  fields: ["objectID","slotID"],
  decode(r) {
  const objectID = r.u32();
  const slotID = r.u8();
    return { objectID, slotID };
  },
};

export const GC_TAKE_OUT_FAIL = {
  id: 388,
  fields: ["objectID"],
  decode(r) {
  const objectID = r.u32();
    return { objectID };
  },
};

export const GC_TEACH_SKILL_INFO = {
  id: 390,
  fields: ["domainType","targetLevel"],
  decode(r) {
  const domainType = r.u8();
  const targetLevel = r.u8();
    return { domainType, targetLevel };
  },
};

export const GC_TRADE_ERROR = {
  id: 399,
  fields: ["targetObjectID","code"],
  decode(r) {
  const targetObjectID = r.u32();
  const code = r.u8();
    return { targetObjectID, code };
  },
};

export const GC_TRADE_FINISH = {
  id: 400,
  fields: ["targetObjectID","code"],
  decode(r) {
  const targetObjectID = r.u32();
  const code = r.u8();
    return { targetObjectID, code };
  },
};

export const GC_TRADE_MONEY = {
  id: 401,
  fields: ["targetObjectID","gold","code"],
  decode(r) {
  const targetObjectID = r.u32();
  const gold = r.u32();
  const code = r.u8();
    return { targetObjectID, gold, code };
  },
};

export const GC_TRADE_PREPARE = {
  id: 402,
  fields: ["targetObjectID","code"],
  decode(r) {
  const targetObjectID = r.u32();
  const code = r.u8();
    return { targetObjectID, code };
  },
};

export const GC_TRADE_REMOVE_ITEM = {
  id: 403,
  fields: ["targetObjectID","itemObjectID"],
  decode(r) {
  const targetObjectID = r.u32();
  const itemObjectID = r.u32();
    return { targetObjectID, itemObjectID };
  },
};

export const GC_TRADE_VERIFY = {
  id: 404,
  fields: ["code"],
  decode(r) {
  const code = r.u8();
    return { code };
  },
};

export const GC_USE_POWER_POINT_RESULT = {
  id: 414,
  fields: ["errorCode","itemCode","powerPoint"],
  decode(r) {
  const errorCode = r.u8();
  const itemCode = r.u8();
  const powerPoint = r.i32();
    return { errorCode, itemCode, powerPoint };
  },
};

export const LC_LOGIN_ERROR = {
  id: 444,
  fields: ["errorID"],
  decode(r) {
  const errorID = r.u8();
    return { errorID };
  },
};

export const LC_REGISTER_PLAYER_ERROR = {
  id: 451,
  fields: ["errorID"],
  decode(r) {
  const errorID = r.u8();
    return { errorID };
  },
};
