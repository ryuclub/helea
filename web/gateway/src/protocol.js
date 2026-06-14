// 协议层：把「具名封包 <-> 字节」串起来，供 web 客户端使用。
//
// encodePacket(name, obj) -> 完整封包 Buffer(含 7 字节包头)
// decodePacket(buf)       -> { id, name, ...fields }
//
// codec 来源:
//   - codecsManual : 手工编写且对真实服务端验证过(优先)
//   - 后续可挂接 codegen 自动生成的 codecs.js
//
// 方向规则(关键)：
//   C→S 包(CL/CG): 浏览器 encode，对应服务端 read() 顺序
//   S→C 包(LC/GC): 浏览器 decode，对应服务端 write() 顺序

import { PacketReader, PacketWriter } from "./stream.js";
import { PacketID, PacketName } from "./generated/packetIds.js";
import { codecsManual } from "./codecs.manual.js";

export const HEADER_SIZE = 7;

const codecs = { ...codecsManual };

export function registerCodec(name, codec) {
  codecs[name] = codec;
}

// 组帧：id + size + seq + body
function frame(id, body, seq = 0) {
  const h = Buffer.allocUnsafe(HEADER_SIZE);
  h.writeUInt16LE(id, 0);
  h.writeUInt32LE(body.length, 2);
  h.writeUInt8(seq & 0xff, 6);
  return Buffer.concat([h, body]);
}

export function encodePacket(name, obj = {}, seq = 0) {
  const id = PacketID[name];
  if (id == null) throw new Error(`未知包名: ${name}`);
  const codec = codecs[name];
  if (!codec || !codec.encode) throw new Error(`无 encode codec: ${name}`);
  const w = new PacketWriter();
  codec.encode(obj, w);
  return frame(id, w.build(), seq);
}

export function decodePacket(buf) {
  const id = buf.readUInt16LE(0);
  const size = buf.readUInt32LE(2);
  const seq = buf.readUInt8(6);
  const name = PacketName[id] ?? `UNKNOWN_${id}`;
  const out = { id, name, seq, size };
  const codec = codecs[name];
  if (codec && codec.decode) {
    const r = new PacketReader(buf, HEADER_SIZE);
    try {
      Object.assign(out, codec.decode(r));
    } catch (e) {
      out._decodeError = e.message;
    }
  } else {
    out._raw = buf.subarray(HEADER_SIZE, HEADER_SIZE + size);
  }
  return out;
}

export { PacketID, PacketName };
