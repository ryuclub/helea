// 天之炼狱(DarkEden) 地图(.map)解析器 —— 同构(DataView)
//
// 结构(依据客户端 ZoneFileHeader.cpp / MZone.cpp / MSector.cpp):
//   MString ZoneVersion        (u32 len + bytes; "=MAP_2000_05_10=")
//   u16 ZoneID, u16 ZoneGroupID
//   MString ZoneName           (u32 len + bytes)
//   u8 ZoneType, u8 ZoneLevel   (老地图可能是 u16，靠描述长度合理性探测)
//   MString Description        (u32 len + bytes)
//   u32 fpTile, u32 fpImageObject   (文件内偏移指针)
//   u16 Width, u16 Height
//   Sector[Height*Width]: u16 spriteID, u8 property, u8 light   (每格 4 字节)
//
// Sector.property 位标志(MSector.h):
export const SECTOR = {
  BLOCK_UNDERGROUND: 0x01,
  BLOCK_GROUND: 0x02,
  BLOCK_FLYING: 0x04,
  ITEM: 0x08,
  UNDERGROUNDCREATURE: 0x10,
  GROUNDCREATURE: 0x20,
  FLYINGCREATURE: 0x40,
  PORTAL: 0x80,
};

function asView(buf) {
  if (buf instanceof DataView) return buf;
  if (buf instanceof ArrayBuffer) return new DataView(buf);
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

export function parseMap(buf) {
  const dv = asView(buf);
  let p = 0;
  const readStr = () => {
    const len = dv.getUint32(p, true); p += 4;
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint8(p + i));
    p += len;
    return s;
  };

  const version = readStr();
  const zoneID = dv.getUint16(p, true); p += 2;
  const zoneGroupID = dv.getUint16(p, true); p += 2;
  const zoneName = readStr();

  // ZoneType/ZoneLevel: 先按 u8 试，若随后的描述长度不合理则回退 u16
  const afterName = p;
  const tryLayout = (typeBytes) => {
    let q = afterName + typeBytes * 2;
    const dlen = dv.getUint32(q, true);
    return dlen <= 65536 ? dlen : -1;
  };
  let typeBytes = 1;
  if (tryLayout(1) < 0 && tryLayout(2) >= 0) typeBytes = 2;
  const zoneType = dv.getUint8(p); p += typeBytes;
  const zoneLevel = dv.getUint8(p); p += typeBytes; // 仅取低字节
  const description = readStr();

  const fpTile = dv.getUint32(p, true); p += 4;
  const fpImageObject = dv.getUint32(p, true); p += 4;
  const width = dv.getUint16(p, true); p += 2;
  const height = dv.getUint16(p, true); p += 2;

  // 扇区网格(行优先: height 行 × width 列)
  const sectorBase = p;
  const spriteID = new Uint16Array(width * height);
  const property = new Uint8Array(width * height);
  const light = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    spriteID[i] = dv.getUint16(p, true); p += 2;
    property[i] = dv.getUint8(p); p += 1;
    light[i] = dv.getUint8(p); p += 1;
  }

  return {
    version, zoneID, zoneGroupID, zoneName, zoneType, zoneLevel, description,
    fpTile, fpImageObject, width, height,
    spriteID, property, light,
    sectorBase, imageObjectEnd: p,
  };
}
