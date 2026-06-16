// 静态服务器：serve web/client/。入口 /public/index.html。
// 附带 /api/register: 账号注册(1-A) —— 校验后向 DARKEDEN.Player 插入新账号(空号, 角色由 CL_CREATE_PC 真协议创建)。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const ROOT = import.meta.dirname;
const PORT = Number(process.env.PORT || 8095);
// 开源界面资源(发行包 Data/Ui): UI spk/spki/ifr 真实美术与布局, 直接按原始路径服务(不复制)。
const UIROOT = path.resolve(ROOT, "..", "..", "DarkEden Legend New Version April 2026", "Data", "Ui");
// 物品图标资源(发行包 Data/new_item): item.ispk/.ispki 等, 直接按原始路径服务(不复制)。
const ITEMROOT = path.resolve(ROOT, "..", "..", "DarkEden Legend New Version April 2026", "Data", "new_item");

// 通过 docker exec 跑 mysql。id/password 已严格限定 [A-Za-z0-9], 无注入风险。
function mysql(sql) {
  return new Promise((resolve, reject) => {
    execFile("docker", ["exec", "odk-mysql", "mysql", "-uroot", "-p123456", "-N", "-e", sql],
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
const CACHEABLE = new Set([".spk", ".spki", ".ispk", ".ispki", ".cfpk", ".cfpki", ".map", ".ifr"]);

function sendFile(res, file) {
  const ext = path.extname(file);
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache, no-store, must-revalidate", // 开发期: 改了即刷即见
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
  if (p === "/") p = "/public/index.html";
  // 开源 UI 资源: /ui/<相对 Data/Ui 的路径>(如 /ui/spk/login.spk, /ui/txt/ui.ifr)。独立穿越防护。
  let file;
  if (p.startsWith("/ui/")) {
    file = path.join(UIROOT, p.slice(4));
    if (!file.startsWith(UIROOT)) { res.writeHead(404); res.end("404"); return; }
  } else if (p.startsWith("/item/")) {                          // 物品图标: /item/item.ispk → Data/new_item/
    file = path.join(ITEMROOT, p.slice(6));
    if (!file.startsWith(ITEMROOT)) { res.writeHead(404); res.end("404"); return; }
  } else {
    file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(404); res.end("404"); return; }
  }
  sendFile(res, file);   // 内存缓存 + readFile: 干净 404/500, 永不截断 200(根除 EMFILE 触发的黑洞)
}).listen(PORT, () => console.log(`Web 客户端: http://127.0.0.1:${PORT}/`));
