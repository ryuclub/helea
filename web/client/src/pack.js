// 角色精灵目录分块包(.ispk/ 目录)按 spriteID 取精灵 —— 浏览器
//
// 包格式: 目录下 {chunkStart 5位}.ispk, 每块 = u16 count + count 个顺序 CIndexSprite。
// spriteID → 块 floor(id/chunkSize)*chunkSize, 块内顺序解码取第 (id%chunkSize) 个。

import { decodeCIndexSprite } from "./spk.js";

const pad5 = (n) => String(n).padStart(5, "0");

// 带重试的二进制 fetch: 开源客户端从本地磁盘读图(必然成功), web 端把瞬时网络失败用重试补齐,
// 持久失败才抛错 —— 角色精灵缺失 = 不可见, 绝不能静默吞掉(否则坏资源被缓存, 永久看不到角色)。
export async function fetchBuf(url, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 200 * (i + 1))); }
  }
  throw new Error(`资源加载失败(重试${tries}次): ${url} · ${lastErr && lastErr.message}`);
}

// 取指定 spriteID 集合 → { [id]: {rgba,width,height} | null }。base=包目录 URL, chunkSize 见 header.inf。
// 精灵 chunk 持久失败会抛错(角色资源必须完整), 由调用方决定重试/报错。
export async function loadSpritesById(base, chunkSize, spriteIds) {
  const ids = [...new Set(spriteIds)];
  const chunkNames = new Set(ids.map((id) => pad5(Math.floor(id / chunkSize) * chunkSize) + ".ispk"));
  const bufs = new Map();
  await Promise.all([...chunkNames].map(async (nm) => {
    bufs.set(nm, await fetchBuf(`${base}/${nm}`));
  }));
  const out = {};
  for (const id of ids) {
    const buf = bufs.get(pad5(Math.floor(id / chunkSize) * chunkSize) + ".ispk");
    if (!buf) { out[id] = null; continue; }
    const within = id % chunkSize;
    let off = 2, s = null;
    try { for (let i = 0; i <= within; i++) { s = decodeCIndexSprite(buf, off); off = s.end; } }
    catch { s = null; }
    out[id] = s;
  }
  return out;
}
