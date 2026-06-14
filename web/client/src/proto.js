// 天之炼狱 协议层 —— 浏览器原生(DataView/Uint8Array，无 Node Buffer 依赖)
// 同构: Node(用 ws 传入 socket) 与浏览器(原生 WebSocket) 皆可用。
//
// 包头 7 字节(小端): u16 PacketID, u32 PacketSize(=body长度), u8 Sequence。整包 = 7 + size。

export const HEADER = 7;

// 仅登录/选角链路需要的包 id(取自服务端 Core/Packet.h 枚举)
export const PACKET = {
  CL_LOGIN: 153,
  CL_GET_PC_LIST: 150,
  CL_SELECT_PC: 159,
  LC_LOGIN_OK: 445,
  LC_LOGIN_ERROR: 444,
  LC_PC_LIST: 446,
  LC_RECONNECT: 450,
  // gameserver 入口
  CG_CONNECT: 21,
  GC_UPDATE_INFO: 410,
  GC_DISCONNECT: 233,
};
export const NAME = Object.fromEntries(Object.entries(PACKET).map(([k, v]) => [v, k]));

// ---- 写缓冲 ----
export class Writer {
  constructor() { this.bytes = []; }
  u8(v) { this.bytes.push(v & 0xff); return this; }
  u16(v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff); return this; }
  u32(v) { this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff); return this; }
  str(s) { for (let i = 0; i < s.length; i++) this.bytes.push(s.charCodeAt(i) & 0xff); return this; }
  raw(arr) { for (const b of arr) this.bytes.push(b & 0xff); return this; }
  build() { return Uint8Array.from(this.bytes); }
}

// ---- 读缓冲 ----
export class Reader {
  constructor(u8, off = 0) { this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = off; }
  u8() { return this.dv.getUint8(this.p++); }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  str(n) { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(this.dv.getUint8(this.p++)); return s; }
}

// 组帧
export function frame(id, body, seq = 0) {
  const out = new Uint8Array(HEADER + body.length);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, id, true);
  dv.setUint32(2, body.length, true);
  dv.setUint8(6, seq & 0xff);
  out.set(body, HEADER);
  return out;
}

// ---- 编码(C→S) ----
export function encCLLogin({ id, password, mac = new Uint8Array(6), loginMode = 0 }) {
  const w = new Writer();
  w.u8(id.length).str(id).u8(password.length).str(password).raw(mac).u8(loginMode);
  return frame(PACKET.CL_LOGIN, w.build());
}
export function encCLGetPCList() { return frame(PACKET.CL_GET_PC_LIST, new Uint8Array(0)); }
export function encCLSelectPC({ pcName, pcType = 0 }) {
  // pcName: Uint8Array(原始字节) 或 string
  const name = pcName instanceof Uint8Array ? pcName : Uint8Array.from([...pcName].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u8(name.length).raw(name).u8(pcType);
  return frame(PACKET.CL_SELECT_PC, w.build());
}
// gameserver 入口: CGConnect::read = DWORD key, u8 pcType, u8 szName, name, mac[6]
export function encCGConnect({ key, pcName, pcType = 0, mac = new Uint8Array(6) }) {
  const name = pcName instanceof Uint8Array ? pcName : Uint8Array.from([...pcName].map((c) => c.charCodeAt(0) & 0xff));
  const w = new Writer();
  w.u32(key).u8(pcType).u8(name.length).raw(name).raw(mac);
  return frame(PACKET.CG_CONNECT, w.build());
}

// ---- 解码(S→C) ----
export function decode(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const id = dv.getUint16(0, true);
  const size = dv.getUint32(2, true);
  const seq = dv.getUint8(6);
  const out = { id, name: NAME[id] || `UNKNOWN_${id}`, size, seq };
  const r = new Reader(u8, HEADER);
  try {
    if (id === PACKET.LC_LOGIN_OK) { out.isAdult = r.u8(); out.bFamily = r.u8(); out.stat = r.u8(); out.lastDays = r.u16(); }
    else if (id === PACKET.LC_LOGIN_ERROR) { out.errorID = r.u8(); }
    else if (id === PACKET.LC_RECONNECT) { const n = r.u8(); out.gameServerIP = r.str(n); out.gameServerPort = r.u32(); out.key = r.u32(); }
  } catch (e) { out._err = e.message; }
  return out;
}

// 流式分帧(处理 TCP 粘包/拆包 over WS)
export class Framer {
  constructor(onPacket) { this.buf = new Uint8Array(0); this.on = onPacket; }
  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf); merged.set(chunk, this.buf.length);
    this.buf = merged;
    for (;;) {
      if (this.buf.length < HEADER) return;
      const dv = new DataView(this.buf.buffer, this.buf.byteOffset, this.buf.byteLength);
      const size = dv.getUint32(2, true);
      const total = HEADER + size;
      if (this.buf.length < total) return;
      const pkt = this.buf.slice(0, total);
      this.buf = this.buf.slice(total);
      this.on(pkt);
    }
  }
}
