// 静态服务器：serve web/client/。入口 /public/index.html。
// 附带 /api/register: 账号注册(1-A) —— 校验后向 DARKEDEN.Player 插入新账号(空号, 角色由 CL_CREATE_PC 真协议创建)。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT || 8095);
// ★全面切换到 opendarkeden 官方配套资源(DARKEDEN/Data) —— 与服务端ID体系完全匹配, 全明文(无加密dpk)。
const DKDATA = path.resolve(ROOT, "..", "..", "DARKEDEN", "Data");
const UIROOT = path.join(DKDATA, "Ui");          // UI spk (/ui/)
const ITEMROOT = path.join(DKDATA, "Ui", "spk"); // 物品图标 Item.ispk (/item/)
const INFOROOT = path.join(DKDATA, "Info");      // inf 表 (/info/): Item/CreatureSprite/AddonSprite/NPCScript
const IMAGEROOT = path.join(DKDATA, "Image");    // 精灵图: cfpk/ispk/tile.spk/imageobject.spk
const MAPROOT = path.join(DKDATA, "Map");        // 地图 .map

// 官方资源是单文件 .ispk/.spk + .spki 索引(u16 count + i32 offsets)。客户端按"分块"请求(每块N个 sprite),
// server 动态从单文件按 .spki 偏移切块返回(块格式=[u16 count][sprite字节连续], 兼容 loadSpritesById/TileSet)。
const _offCache = new Map();   // spkiPath -> [offsets..., spkSize哨兵]
function getOffsets(spkiPath, spkPath) {
  let o = _offCache.get(spkiPath);
  if (!o) {
    const b = fs.readFileSync(spkiPath); const n = b.readUInt16LE(0); o = [];
    for (let i = 0; i < n; i++) o.push(b.readInt32LE(2 + i * 4));
    o.push(fs.statSync(spkPath).size);   // 末尾哨兵=文件大小, 供最后一块取到结尾
    _offCache.set(spkiPath, o);
  }
  return o;
}
// 动态切块: 第 chunkStart 起 chunkSize 个 sprite → [u16 count][连续sprite字节]。Promise<Buffer>。
function chunkPack(spkPath, spkiPath, chunkStart, chunkSize) {
  return new Promise((resolve, reject) => {
    let offsets; try { offsets = getOffsets(spkiPath, spkPath); } catch (e) { return reject(e); }
    const total = offsets.length - 1;
    const start = Math.min(chunkStart, total), end = Math.min(start + chunkSize, total);
    const head = Buffer.alloc(2); head.writeUInt16LE(end - start);
    if (end <= start) return resolve(head);          // 空块
    const byteStart = offsets[start], len = offsets[end] - byteStart;
    fs.open(spkPath, "r", (e, fd) => {
      if (e) return reject(e);
      const body = Buffer.alloc(len);
      fs.read(fd, body, 0, len, byteStart, (e2) => { fs.close(fd, () => {}); e2 ? reject(e2) : resolve(Buffer.concat([head, body])); });
    });
  });
}
// 切块结果常驻缓存(运行期资源不变, 切一次即缓存; 同 sendFile 的目的: 杜绝重复 IO/句柄突发)。
const _chunkCache = new Map();   // 请求路径 -> Buffer
function serveChunk(res, spkPath, spkiPath, start, size, cacheKey) {
  const headers = { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=86400" }; // 切块资源(瓦片/物件)运行期不变→浏览器缓存1天, 换区不重下
  const hit = _chunkCache.get(cacheKey);
  if (hit) { res.writeHead(200, headers); res.end(hit); return; }
  chunkPack(spkPath, spkiPath, start, size)
    .then((buf) => { _chunkCache.set(cacheKey, buf); res.writeHead(200, headers); res.end(buf); })
    .catch((e) => { const code = (e && e.code === "ENOENT") ? 404 : 500; res.writeHead(code); res.end(String(code)); });
}

// 官方 Image 文件名是驼峰(Creature.cfpk/ACVampireMan.ispk), 客户端请小写 → mac 文件系统不敏感可直接命中,
// 但为跨平台稳妥, 提供小写→实际名映射(扫一次 Image 目录建表)。
let _imageNameMap = null;
function realImageName(lower) {
  if (!_imageNameMap) { _imageNameMap = new Map(); try { for (const f of fs.readdirSync(IMAGEROOT)) _imageNameMap.set(f.toLowerCase(), f); } catch {} }
  return _imageNameMap.get(lower.toLowerCase()) || lower;
}

// 通过 docker exec 跑 mysql。id/password 已严格限定 [A-Za-z0-9], 无注入风险。
// 凭证从环境变量读；默认值仅对应本地 docker-compose 起的开发库，生产务必覆盖。
const MYSQL_CONTAINER = process.env.MYSQL_CONTAINER || "odk-mysql";
const MYSQL_USER = process.env.MYSQL_USER || "root";
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || "devpass";
function mysql(sql) {
  return new Promise((resolve, reject) => {
    execFile("docker", ["exec", MYSQL_CONTAINER, "mysql", `-u${MYSQL_USER}`, `-p${MYSQL_PASSWORD}`, "-N", "-e", sql],
      { timeout: 8000 }, (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message).trim())); else resolve(stdout.trim());
      });
  });
}

// 账号注册: 校验规则同游戏(ID 4~10, 密码 6~10, 仅字母数字)。建空号(LogOn=LOGOFF), 角色后续用真协议建。
async function handleRegister(req, res) {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1024) req.destroy(); });
  req.on("end", async () => {
    const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
    try {
      const { id, password } = JSON.parse(body || "{}");
      if (!/^[A-Za-z0-9]{4,10}$/.test(id || "")) return reply(400, { ok: false, error: "账号需 4~10 位字母或数字" });
      if (!/^[A-Za-z0-9]{6,10}$/.test(password || "")) return reply(400, { ok: false, error: "密码需 6~10 位字母或数字" });
      const dup = await mysql(`SELECT COUNT(*) FROM DARKEDEN.Player WHERE PlayerID='${id}'`);
      if (dup !== "0") return reply(409, { ok: false, error: "账号已存在" });
      await mysql(`INSERT INTO DARKEDEN.Player (PlayerID,Password,Name,CurrentWorldID,CurrentServerGroupID,LogOn,Access,Pub,LastSlot) VALUES ('${id}','${password}','${id}',1,0,'LOGOFF','ALLOW','PRIVATE',0)`);
      reply(200, { ok: true });
    } catch (e) { reply(500, { ok: false, error: "注册失败: " + e.message }); }
  });
}

// 怪物 MType→SType 映射(MonsterInfo 表)。客户端据此 + CreatureSprite.inf 取怪物精灵 FrameID(忠实链路)。查一次缓存。
let _monsterMap = null;
async function handleMonsterMap(res) {
  try {
    if (!_monsterMap) {
      const out = await mysql("SELECT MType,SType FROM DARKEDEN.MonsterInfo");
      const m = {};
      for (const line of out.split("\n")) { const [mt, st] = line.split("\t"); if (mt) m[+mt] = +st; }
      _monsterMap = JSON.stringify(m);
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }); res.end(_monsterMap);
  } catch (e) { res.writeHead(500, { "Content-Type": "application/json" }); res.end("{}"); }
}
// Alpha 精灵包(.aspk)单精灵解码 —— 特效精灵(升级光柱等)。文件 160MB 不能整发, 用 .aspki 偏移定位单精灵, 服务端解码成 RGBA 切片返回。
// .aspki: [u16 count] + count×i32 绝对偏移。.aspk: [u16 count] + 各精灵。
// 单精灵: [u32 bodyLen][u16 W][u16 H] + 逐行(u8 段数 + 每段[u8 透明跳过 + u8 像素数 + 像素数×u16 565色]) + 行尾(H×u16 行长, 跳过)。
// 565 色 → RGBA; alpha=max(r,g,b)(特效叠加发光, 暗边自然淡出)。返回二进制: [u16 count] + 每精灵[u32 id][u16 W][u16 H][W*H*4 RGBA]。
const _aspkOffCache = new Map();
function aspkOffsets(aspkiPath) {
  let o = _aspkOffCache.get(aspkiPath);
  if (!o) { const b = fs.readFileSync(aspkiPath); const n = b.readUInt16LE(0); o = new Int32Array(n); for (let i = 0; i < n; i++) o[i] = b.readInt32LE(2 + i * 4); _aspkOffCache.set(aspkiPath, o); }
  return o;
}
function decodeAspkSprite(fd, off) {
  const head = Buffer.alloc(8); fs.readSync(fd, head, 0, 8, off);
  const bodyLen = head.readUInt32LE(0), W = head.readUInt16LE(4), H = head.readUInt16LE(6);
  if (!W || !H || W > 4096 || H > 4096) return { W: 0, H: 0, rgba: Buffer.alloc(0) };
  const body = Buffer.alloc(bodyLen); fs.readSync(fd, body, 0, bodyLen, off + 8);
  const rgba = Buffer.alloc(W * H * 4); let p = 0;
  for (let y = 0; y < H; y++) {
    if (p >= bodyLen) break;
    const segCount = body[p++]; let x = 0;
    for (let s = 0; s < segCount && p + 1 < bodyLen; s++) {
      x += body[p++]; const pix = body[p++];
      for (let k = 0; k < pix && p + 1 < bodyLen; k++) {
        const c = body.readUInt16LE(p); p += 2;
        const r5 = (c >> 11) & 0x1f, g6 = (c >> 5) & 0x3f, b5 = c & 0x1f;
        const r = (r5 << 3) | (r5 >> 2), g = (g6 << 2) | (g6 >> 4), b = (b5 << 3) | (b5 >> 2);
        if (x < W) { const o = (y * W + x) * 4; rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = Math.max(r, g, b); }
        x++;
      }
    }
  }
  return { W, H, rgba };
}
const _aspkCache = new Map();   // "name|ids" -> Buffer
function handleAspk(req, res) {
  try {
    const u = new URL(req.url, "http://x");
    const name = (u.searchParams.get("name") || "").replace(/[^A-Za-z0-9]/g, "");
    const ids = (u.searchParams.get("ids") || "").split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n >= 0).slice(0, 1024);
    if (!name || !ids.length) { res.writeHead(400); res.end("400"); return; }
    const key = name + "|" + ids.join(",");
    const hit = _aspkCache.get(key);
    if (hit) { res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=86400" }); res.end(hit); return; }
    const aspk = path.join(IMAGEROOT, realImageName(name + ".aspk")), aspki = path.join(IMAGEROOT, realImageName(name + ".aspki"));
    const offs = aspkOffsets(aspki), fd = fs.openSync(aspk, "r");
    const parts = [Buffer.alloc(2)]; parts[0].writeUInt16LE(ids.length);
    try {
      for (const id of ids) {
        const off = (id < offs.length) ? offs[id] : -1;
        const sp = (off >= 0) ? decodeAspkSprite(fd, off) : { W: 0, H: 0, rgba: Buffer.alloc(0) };
        const hdr = Buffer.alloc(8); hdr.writeUInt32LE(id, 0); hdr.writeUInt16LE(sp.W, 4); hdr.writeUInt16LE(sp.H, 6);
        parts.push(hdr, sp.rgba);
      }
    } finally { fs.closeSync(fd); }
    const buf = Buffer.concat(parts); _aspkCache.set(key, buf);
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=86400" }); res.end(buf);
  } catch (e) { const code = (e && e.code === "ENOENT") ? 404 : 500; res.writeHead(code); res.end(String(code)); }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ispk": "application/octet-stream",
  ".spk": "application/octet-stream",
  ".spki": "application/octet-stream",
  ".cfpk": "application/octet-stream",
  ".cfpki": "application/octet-stream",
  ".map": "application/octet-stream",
  ".ifr": "application/octet-stream",
  ".png": "image/png",
};

// 资源内存缓存: 瓦片/物件/地图等二进制包数量有限(~500 chunk)且运行期不变, 读一次常驻内存。
// 目的: ① 彻底消除高并发突发请求下的句柄耗尽(EMFILE)—— 这正是"偶发瓦片请求失败→客户端永久黑洞"的服务端触发源;
//       ② 避免重复磁盘 IO。.html/.js 不缓存(开发期改了即刷即见)。
const ASSET_CACHE = new Map();           // file -> Buffer
const CACHEABLE = new Set([".spk", ".spki", ".ispk", ".ispki", ".cfpk", ".cfpki", ".efpk", ".efpki", ".map", ".ifr", ".inf"]);

function sendFile(res, file) {
  const ext = path.extname(file);
  // 游戏二进制资源(官方 Data, 运行期不变)→浏览器缓存 1 天, 换区/重进游戏不再重复下载(换区性能关键);
  // 代码(html/js/css)→no-cache 开发即改即见。注: 开发期替换了 spk/cfpk/ispk/map 资源 → 浏览器强刷(Cmd+Shift+R)一次拉新。
  const cacheable = CACHEABLE.has(ext);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": cacheable ? "public, max-age=86400" : "no-cache, no-store, must-revalidate",
  };
  const hit = ASSET_CACHE.get(file);
  if (hit) { res.writeHead(200, headers); res.end(hit); return; }
  // fs.readFile: 一次性读取(瞬时句柄, 读完即释放), 不像 createReadStream 长期占句柄 → 杜绝 EMFILE。
  // 关键: 整块读完才发, 失败时返回干净的 404/500; 绝不出现 createReadStream 那种"200 头已发、流中途出错→
  // 截断响应"——那会被客户端当成坏瓦片字节、解码失败、永久缓存成黑洞。
  fs.readFile(file, (err, buf) => {
    if (err) {
      const code = (err.code === "ENOENT" || err.code === "EISDIR") ? 404 : 500;
      res.writeHead(code); res.end(String(code)); return;
    }
    if (CACHEABLE.has(ext)) ASSET_CACHE.set(file, buf);
    res.writeHead(200, headers); res.end(buf);
  });
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (req.method === "POST" && p === "/api/register") return handleRegister(req, res);
  if (p === "/api/monstermap") return handleMonsterMap(res);
  if (p === "/api/aspk") return handleAspk(req, res);
  if (p === "/") p = "/public/index.html";
  // 开源 UI 资源: /ui/<相对 Data/Ui 的路径>(如 /ui/spk/login.spk, /ui/txt/ui.ifr)。独立穿越防护。
  let file;
  if (p.startsWith("/ui/")) {
    file = path.join(UIROOT, p.slice(4));
    if (!file.startsWith(UIROOT)) { res.writeHead(404); res.end("404"); return; }
  } else if (p.startsWith("/item/")) {                          // 物品图标: /item/Item.ispk → Data/Ui/spk/
    file = path.join(ITEMROOT, p.slice(6));
    if (!file.startsWith(ITEMROOT)) { res.writeHead(404); res.end("404"); return; }
  } else if (p.startsWith("/info/")) {                          // inf 表: /info/Item.inf → Data/Info/
    file = path.join(INFOROOT, p.slice(6));
    if (!file.startsWith(INFOROOT)) { res.writeHead(404); res.end("404"); return; }
  } else if (p.startsWith("/public/assets/")) {
    // ★全面切到官方资源: 客户端按"分块路径"请求, 这里从官方单文件(.ispk/.spk + .spki)动态切块返回。
    const rel = p.slice("/public/assets/".length);
    let m;
    if ((m = rel.match(/^map\/(.+\.map)$/))) {                  // 地图: map/X.map → Data/Map/X.map
      return sendFile(res, path.join(MAPROOT, path.basename(m[1])));
    }
    if ((m = rel.match(/^tile\/(\d+)\.spk$/))) {                // 瓦片块(chunkSize 128)
      return serveChunk(res, path.join(IMAGEROOT, "tile.spk"), path.join(IMAGEROOT, "tile.spki"), parseInt(m[1], 10), 128, p);
    }
    if ((m = rel.match(/^obj\/(\d+)\.spk$/))) {                 // 物件块(chunkSize 16)
      return serveChunk(res, path.join(IMAGEROOT, "ImageObject.spk"), path.join(IMAGEROOT, "ImageObject.spki"), parseInt(m[1], 10), 16, p);
    }
    if ((m = rel.match(/^(.+)\.ispk\/(\d+)\.ispk$/))) {         // 精灵块 {pack}.ispk/NN.ispk(chunkSize 64)
      const spk = realImageName(m[1] + ".ispk"), spki = realImageName(m[1] + ".ispki");
      return serveChunk(res, path.join(IMAGEROOT, spk), path.join(IMAGEROOT, spki), parseInt(m[2], 10), 64, p);
    }
    if ((m = rel.match(/^(.+\.[ce]fpk)$/))) {                   // 整 cfpk(角色/怪)/efpk(特效)直接发(客户端整包解析)
      return sendFile(res, path.join(IMAGEROOT, realImageName(m[1])));
    }
    // 其余(zonemap.json 等实体)→ web/client/public/assets/
    file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(404); res.end("404"); return; }
  } else {
    file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(404); res.end("404"); return; }
  }
  sendFile(res, file);   // 内存缓存 + readFile: 干净 404/500, 永不截断 200(根除 EMFILE 触发的黑洞)
}).listen(PORT, () => console.log(`Web 客户端: http://127.0.0.1:${PORT}/`));
