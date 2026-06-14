// JS 版 SocketInputStream / SocketOutputStream 对应物
//
// 与服务端 src/Core/SocketInputStream.h 的模板 read/write 字节级对应：
// 原语按 sizeof(T) 原样拷贝、小端(x86)。字符串无自动长度前缀——长度由各包
// 自己先读/写一个长度字段，再 read(str,len)/write(str)。
//
// 基础宽度： bool/char/uchar/BYTE=1  short/ushort/WORD=2  int/uint/DWORD=4
//            long/ulong=8  float=4  double=8

export class PacketWriter {
  constructor() {
    this._chunks = [];
    this._len = 0;
  }
  _push(buf) {
    this._chunks.push(buf);
    this._len += buf.length;
    return this;
  }
  u8(v) { const b = Buffer.allocUnsafe(1); b.writeUInt8(v & 0xff, 0); return this._push(b); }
  i8(v) { const b = Buffer.allocUnsafe(1); b.writeInt8(v, 0); return this._push(b); }
  bool(v) { return this.u8(v ? 1 : 0); }
  byte(v) { return this.u8(v); }
  u16(v) { const b = Buffer.allocUnsafe(2); b.writeUInt16LE(v & 0xffff, 0); return this._push(b); }
  i16(v) { const b = Buffer.allocUnsafe(2); b.writeInt16LE(v, 0); return this._push(b); }
  u32(v) { const b = Buffer.allocUnsafe(4); b.writeUInt32LE(v >>> 0, 0); return this._push(b); }
  i32(v) { const b = Buffer.allocUnsafe(4); b.writeInt32LE(v | 0, 0); return this._push(b); }
  u64(v) { const b = Buffer.allocUnsafe(8); b.writeBigUInt64LE(BigInt(v), 0); return this._push(b); }
  i64(v) { const b = Buffer.allocUnsafe(8); b.writeBigInt64LE(BigInt(v), 0); return this._push(b); }
  f32(v) { const b = Buffer.allocUnsafe(4); b.writeFloatLE(v, 0); return this._push(b); }
  f64(v) { const b = Buffer.allocUnsafe(8); b.writeDoubleLE(v, 0); return this._push(b); }
  // 写字符串(不含长度前缀)：固定 len 则补零/截断，否则按字节写
  str(s, len = null) {
    let buf = Buffer.from(s ?? "", "latin1");
    if (len != null) {
      const out = Buffer.alloc(len);
      buf.copy(out, 0, 0, Math.min(len, buf.length));
      buf = out;
    }
    return this._push(buf);
  }
  bytes(buf, len = null) {
    let b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    if (len != null) {
      const out = Buffer.alloc(len);
      b.copy(out, 0, 0, Math.min(len, b.length));
      b = out;
    }
    return this._push(b);
  }
  build() { return Buffer.concat(this._chunks, this._len); }
}

export class PacketReader {
  constructor(buf, offset = 0) {
    this.buf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    this.off = offset;
  }
  _need(n) {
    if (this.off + n > this.buf.length)
      throw new RangeError(`read past end: need ${n} at ${this.off}/${this.buf.length}`);
  }
  u8() { this._need(1); return this.buf.readUInt8(this.off++); }
  i8() { this._need(1); return this.buf.readInt8(this.off++); }
  bool() { return this.u8() !== 0; }
  byte() { return this.u8(); }
  u16() { this._need(2); const v = this.buf.readUInt16LE(this.off); this.off += 2; return v; }
  i16() { this._need(2); const v = this.buf.readInt16LE(this.off); this.off += 2; return v; }
  u32() { this._need(4); const v = this.buf.readUInt32LE(this.off); this.off += 4; return v; }
  i32() { this._need(4); const v = this.buf.readInt32LE(this.off); this.off += 4; return v; }
  u64() { this._need(8); const v = this.buf.readBigUInt64LE(this.off); this.off += 8; return v; }
  i64() { this._need(8); const v = this.buf.readBigInt64LE(this.off); this.off += 8; return v; }
  f32() { this._need(4); const v = this.buf.readFloatLE(this.off); this.off += 4; return v; }
  f64() { this._need(8); const v = this.buf.readDoubleLE(this.off); this.off += 8; return v; }
  str(len) {
    this._need(len);
    const s = this.buf.toString("latin1", this.off, this.off + len);
    this.off += len;
    return s;
  }
  bytes(len) {
    this._need(len);
    const b = this.buf.subarray(this.off, this.off + len);
    this.off += len;
    return Buffer.from(b);
  }
  get remaining() { return this.buf.length - this.off; }
}

// 按宽度选 writer/reader 方法名(供生成器使用)
export const WIDTH_METHOD = {
  1: { signed: "i8", unsigned: "u8" },
  2: { signed: "i16", unsigned: "u16" },
  4: { signed: "i32", unsigned: "u32" },
  8: { signed: "i64", unsigned: "u64" },
};
