// Item.inf 解析(CTypeTable, 同构 DataView) —— 官方明文物品表, 提供图标 FrameID/多格尺寸/名称/属性。
// 结构: classCount(u32) → 每 class [typeCount(u32) → typeCount 条 ITEMTABLE_INFO]。
// record(变长, 含变长 OptionList): 3 个字符串(u32 len+ascii) + 定长字段 + 变长 option。
// 用法: const {table}=parseItemInf(buf); const info=table[itemClass]?.[itemType]; info.invFrameID 等。
let _cache = null;
export function parseItemInf(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset || 0, buf.byteLength);
  let p = 0;
  const u8 = () => dv.getUint8(p++);
  const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, true); p += 4; return v; };
  const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
  const str = () => { const n = u32(); let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(p++)); return s; };

  const classCount = u32();
  const table = {};
  for (let c = 0; c < classCount; c++) {
    const typeCount = u32();
    table[c] = {};
    for (let t = 0; t < typeCount; t++) {
      const eName = str(), hName = str(), desc = str();
      const tileFrameID = u16(), invFrameID = u16(), gearFrameID = u16(), dropFrameID = u16(), addonMale = u16(), addonFemale = u16();
      const useSound = u16(), tileSound = u16(), invSound = u16(), gearSound = u16();   // eslint 占位, 仅推进偏移
      const gridW = u8(), gridH = u8();
      const price = u32(), weight = u16();
      const value = []; for (let i = 0; i < 7; i++) value.push(i32());
      const reqSTR = u8(), reqDEX = u8(), reqINT = u8(), reqSUM = u16();
      const reqLevel = u8(), advLevel = u8(), maleOnly = u8(), femaleOnly = u8();
      const useAction = u32(), silverMax = u32(), toHit = u32();
      const maxNumber = u32(), critical = u32();
      const optSize = u8(); for (let i = 0; i < optSize; i++) u8();                     // 变长 OptionList
      const itemStyle = u32(), elementalType = u32(), elemental = u16(), race = u8(), descFrameID = u16();
      void useSound; void tileSound; void invSound; void gearSound; void useAction; void silverMax; void itemStyle; void elementalType;
      table[c][t] = {
        eName, hName, desc, tileFrameID, invFrameID, gearFrameID, dropFrameID, addonMale, addonFemale,
        gridW, gridH, price, weight, value, reqSTR, reqDEX, reqINT, reqSUM, reqLevel, advLevel,
        maleOnly, femaleOnly, toHit, maxNumber, critical, elemental, race, descFrameID,
      };
    }
  }
  return { classCount, table, end: p };
}

// 浏览器侧: fetch /info/Item.inf 解析一次缓存。
export async function loadItemInf(url = "/info/Item.inf") {
  if (_cache) return _cache;
  const ab = await (await fetch(url)).arrayBuffer();
  _cache = parseItemInf(new Uint8Array(ab));
  return _cache;
}
export function getItemInfo(itemClass, itemType) {
  return _cache && _cache.table[itemClass] ? _cache.table[itemClass][itemType] : null;
}
