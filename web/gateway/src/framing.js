// DarkEden(天之炼狱) 封包分帧
//
// 包头固定 7 字节(小端)：
//   offset 0  u16  PacketID
//   offset 2  u32  PacketSize   <- 包体长度(不含包头)
//   offset 6  u8   Sequence
// 整包长度 = 7 + PacketSize
//
// 依据服务端 src/Core/Player.cpp:137 (length() < szPacketHeader + packetSize)
// 与 Packet.h:42 (szPacketHeader = 2 + 4 + 1)。

export const HEADER_SIZE = 7;
export const OFF_ID = 0;
export const OFF_SIZE = 2;
export const OFF_SEQ = 6;

// 从一段 buffer 解析包头(不校验长度是否足够)
export function readHeader(buf) {
  return {
    id: buf.readUInt16LE(OFF_ID),
    size: buf.readUInt32LE(OFF_SIZE),
    seq: buf.readUInt8(OFF_SEQ),
  };
}

// 组装一个完整封包 buffer(用于测试/构造)
export function buildPacket(id, body = Buffer.alloc(0), seq = 0) {
  const header = Buffer.alloc(HEADER_SIZE);
  header.writeUInt16LE(id, OFF_ID);
  header.writeUInt32LE(body.length, OFF_SIZE);
  header.writeUInt8(seq & 0xff, OFF_SEQ);
  return Buffer.concat([header, body]);
}

// 流式分帧器：喂入任意 TCP 字节块，回调吐出一个个完整封包。
// 处理 TCP 粘包/拆包(一次 recv 可能含多个包或半个包)。
export class PacketFramer {
  constructor(onPacket, { maxPacket = 16 * 1024 * 1024 } = {}) {
    this._buf = Buffer.alloc(0);
    this._onPacket = onPacket;
    this._maxPacket = maxPacket;
  }

  // 喂入一段字节；同步触发 onPacket(packetBuffer, header) 若干次
  push(chunk) {
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;

    for (;;) {
      if (this._buf.length < HEADER_SIZE) return; // 头都不够
      const size = this._buf.readUInt32LE(OFF_SIZE);
      const total = HEADER_SIZE + size;

      if (total > this._maxPacket) {
        throw new Error(`packet too large: ${total} (size field=${size})`);
      }
      if (this._buf.length < total) return; // 包体未到齐，等更多字节

      const packet = this._buf.subarray(0, total);
      const header = readHeader(packet);
      // 推进缓冲再回调，避免回调里再次 push 造成重入错乱
      this._buf = this._buf.subarray(total);
      this._onPacket(Buffer.from(packet), header);
    }
  }

  // 当前积压的未成帧字节数(调试用)
  get pending() {
    return this._buf.length;
  }
}
