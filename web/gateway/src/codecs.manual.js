// 手工编写并对真实 opendarkeden 服务端验证过的 codec。
//
// 仅在「自动生成器无法干净处理(含校验 if/方向需取 write)」时手写。
// 字段顺序/宽度依据服务端 src/Core 各包 read()(C→S) 与 write()(S→C)。

export const codecsManual = {
  // ---- C→S：登录 ----
  // 服务端 CLLogin::read: u8 szID, str id, u8 szPwd, str pwd, u8[6] mac, u8 loginMode
  CL_LOGIN: {
    id: 153,
    encode(o, w) {
      const id = o.id ?? "";
      const pwd = o.password ?? "";
      w.u8(id.length).str(id);
      w.u8(pwd.length).str(pwd);
      w.bytes(o.mac ?? Buffer.alloc(6), 6);
      w.u8(o.loginMode ?? 0);
    },
  },

  // ---- S→C：登录成功 ----
  // 服务端 LCLoginOK::write: bool isAdult, bool bFamily, BYTE stat, WORD lastDays
  LC_LOGIN_OK: {
    id: 445,
    decode(r) {
      return {
        isAdult: r.bool(),
        bFamily: r.bool(),
        stat: r.u8(),
        lastDays: r.u16(),
      };
    },
  },

  // ---- S→C：登录失败 ----
  // body 实测 1 字节错误码
  LC_LOGIN_ERROR: {
    id: 444,
    decode(r) {
      return { errorID: r.u8() };
    },
  },

  // ---- C→S：请求角色列表(空体) ----
  CL_GET_PC_LIST: {
    id: 152, // 占位，实际以 PacketID 表为准(由 protocol 层用包名取 id)
    encode(_o, _w) { /* 空体 */ },
  },

  // ---- C→S：选择角色 ----
  // 服务端 CLSelectPC::read: u8 szPCName, name[szPCName], u8 pcType
  // pcName 可传 string 或 Buffer(DB 原始编码字节)；pcType: 0=Slayer 1=Vampire 2=Ousters
  CL_SELECT_PC: {
    id: 0,
    encode(o, w) {
      const name = Buffer.isBuffer(o.pcName) ? o.pcName : Buffer.from(o.pcName ?? "", "latin1");
      w.u8(name.length).bytes(name);
      w.u8(o.pcType ?? 0);
    },
  },

  // ---- S→C：重连(给出 gameserver 地址+key) ----
  // 服务端 LCReconnect::write: u8 szIP, str IP, u32 port, u32 key
  LC_RECONNECT: {
    id: 0,
    decode(r) {
      const szIP = r.u8();
      const gameServerIP = r.str(szIP);
      const gameServerPort = r.u32();
      const key = r.u32();
      return { gameServerIP, gameServerPort, key };
    },
  },
};
