// C++ -> JS 封包代码生成器 (方向感知版)
//
// 方向规则：
//   C→S 包(CL/CG/CR/CU): 浏览器 encode，字段顺序 = 服务端 read()
//   S→C 包(LC/GC/RC/UC): 浏览器 decode，字段顺序 = 服务端 write()
//   服务器间(GL/LG/GS/SG/GG...): 浏览器不用，跳过
//
// 只自动生成「线性顺序」包：基础类型 + 长度前缀串 + 定长 buf。
// 含循环/分支/加密/嵌套对象的包标记 manual。
//
// 输出 src/generated/: packetIds.js, codecs.js, report.json

import fs from "node:fs";
import path from "node:path";

const CORE = process.env.CORE_DIR
  || "/Users/carlos/work/ryuclub/tzly/research/server/src/Core";
const OUT = path.resolve(import.meta.dirname, "../src/generated");

const PRIM = {
  bool: [1, false], char: [1, true], uchar: [1, false], schar: [1, true],
  byte: [1, false], BYTE: [1, false],
  short: [2, true], ushort: [2, false], WORD: [2, false],
  int: [4, true], uint: [4, false], DWORD: [4, false],
  long: [8, true], ulong: [8, false], int64: [8, true], uint64: [8, false],
  float: [4, true], double: [8, true],
};

const CLIENT_SEND = new Set(["CL", "CG", "CR", "CU"]); // 浏览器->服务端
const CLIENT_RECV = new Set(["LC", "GC", "RC", "UC"]); // 服务端->浏览器

// ---------- typedef ----------
function collectTypedefs() {
  const files = [
    ...fs.readdirSync(path.join(CORE, "types")).map((f) => path.join(CORE, "types", f)),
    path.join(CORE, "Packet.h"),
  ];
  const alias = {};
  const re = /typedef\s+(unsigned\s+|signed\s+)?([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*;/g;
  for (const f of files) {
    let txt;
    try { txt = fs.readFileSync(f, "latin1"); } catch { continue; }
    let m;
    while ((m = re.exec(txt))) alias[m[3]] = ((m[1] ? m[1].trim() + " " : "") + m[2]).trim();
  }
  return alias;
}
function resolveType(type, alias, depth = 0) {
  if (depth > 20 || !type) return null;
  let t = type.trim().replace(/\bconst\b/g, "").trim();
  let so = null;
  if (/^unsigned\s+/.test(t)) { so = false; t = t.replace(/^unsigned\s+/, ""); }
  else if (/^signed\s+/.test(t)) { so = true; t = t.replace(/^signed\s+/, ""); }
  if (t === "unsigned") t = "uint";
  if (PRIM[t]) { const [size, signed] = PRIM[t]; return { size, signed: so ?? signed }; }
  if (alias[t]) { const r = resolveType(alias[t], alias, depth + 1); if (r && so != null) return { size: r.size, signed: so }; return r; }
  return null;
}
function widthMethod(info) {
  const s = info.size;
  if (s === 1) return info.signed ? "i8" : "u8";
  if (s === 2) return info.signed ? "i16" : "u16";
  if (s === 4) return info.signed ? "i32" : "u32";
  if (s === 8) return info.signed ? "i64" : "u64";
  return null;
}

// ---------- 枚举 ----------
function parseEnum() {
  const txt = fs.readFileSync(path.join(CORE, "Packet.h"), "latin1");
  const start = txt.search(/enum\s*\{/);
  const block = txt.slice(start, start + txt.slice(start).indexOf("};"));
  const names = [];
  let idx = 0;
  for (let line of block.split("\n")) {
    line = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    for (let tok of line.split(",")) {
      tok = tok.trim();
      if (!tok.startsWith("PACKET_")) continue;
      const eq = tok.match(/^(PACKET_\w+)\s*=\s*(\d+)/);
      if (eq) { idx = Number(eq[2]); names.push([eq[1], idx++]); }
      else { const nm = tok.match(/^(PACKET_\w+)/); if (nm) names.push([nm[1], idx++]); }
    }
  }
  return names;
}
function classCandidates(packetName) {
  const parts = packetName.replace(/^PACKET_/, "").split("_");
  const dir = parts[0], rest = parts.slice(1);
  const cap = rest.map((w) => w[0] + w.slice(1).toLowerCase()).join("");
  const keep = rest.map((w) => (w.length <= 2 ? w : w[0] + w.slice(1).toLowerCase())).join("");
  return [...new Set([dir + cap, dir + keep, dir + rest.join("")])];
}

// ---------- 成员 / 局部 / 方法体 ----------
function parseMembers(htext) {
  const members = {};
  // 逐行解析，避免正则用 \s 跨越 private:/换行 污染类型(如 'private:\n ObjectID_t')
  for (let line of htext.split("\n")) {
    line = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").trim();
    const m = line.match(/^((?:unsigned\s+|signed\s+)?[A-Za-z_][\w:<>]*)\s+(m_[A-Za-z_]\w*)\s*(\[\s*([A-Za-z0-9_+]+)\s*\])?\s*;$/);
    if (m) {
      // 去掉可能残留的标签前缀(public:/private:)，取最后一段类型
      const type = m[1].replace(/^.*:\s*/, "").trim();
      members[m[2]] = { type, array: m[3] ? (m[4] || "") : null };
    }
  }
  return members;
}
function parseLocals(body) {
  const locals = {};
  const re = /^\s*([A-Za-z_][\w]*)\s+([A-Za-z_]\w*)\s*(=|;)/gm;
  let m;
  while ((m = re.exec(body))) {
    if (m[1] === "return" || m[1] === "const") continue;
    locals[m[2]] = m[1];
  }
  return locals;
}
function extractMethod(text, cls, method) {
  const re = new RegExp(`(?:void|uint|int)\\s+${cls}::${method}\\s*\\([^)]*\\)\\s*(?:const\\s*)?\\{`);
  const m = text.match(re);
  if (!m) return null;
  let i = text.indexOf("{", m.index), depth = 0, j = i;
  for (; j < text.length; j++) { if (text[j] === "{") depth++; else if (text[j] === "}") { if (--depth === 0) { j++; break; } } }
  return text.slice(i + 1, j - 1);
}
function complexity(body) {
  const r = [];
  if (/__USE_ENCRYPTER__/.test(body)) r.push("encrypted");
  if (/\bfor\b|\bwhile\b/.test(body)) r.push("loop");
  if (/\bif\b|\belse\b|\bswitch\b/.test(body)) r.push("conditional");
  if (/->\s*(read|write)\s*\(/.test(body)) r.push("nested-object");
  return r;
}
function splitTopComma(s) {
  const out = []; let d = 0, cur = "";
  for (const ch of s) {
    if ("([<".includes(ch)) d++; else if (")]>".includes(ch)) d--;
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function streamCalls(body, streamVar, method) {
  const calls = [];
  const re = new RegExp(`${streamVar}\\s*\\.\\s*${method}\\s*\\(([^;]*)\\)\\s*;`, "g");
  let m;
  while ((m = re.exec(body))) calls.push(splitTopComma(m[1].trim()).map((a) => a.trim()));
  return calls;
}
const jsField = (m) => m.replace(/^m_/, "").replace(/^[A-Z]/, (c) => c.toLowerCase());

function isStringType(t) { return t && /string|char/.test(t); }
function constLen(expr) {
  let s = expr.trim();
  if (/^\d+$/.test(s)) return Number(s);
  let m = s.match(/^(\d+)\s*\*\s*sz[A-Za-z]+$/) || s.match(/^sz[A-Za-z]+\s*\*\s*(\d+)$/);
  if (m) return Number(m[1]);
  return null;
}

// ---------- 生成 ENCODE (C→S, 来自 read 顺序) ----------
function genEncode(members, body, alias) {
  const calls = streamCalls(body, "iStream", "read");
  if (!calls.length) return { ok: false, why: "no-read-calls" };
  const locals = parseLocals(body);
  const lines = [], fields = [];
  let pendingLenOf = null; // 上一个长度字段(局部)，供下一个串用

  for (const args of calls) {
    const raw = args[0];
    const name = raw.replace(/^\(.*?\)\s*/, "").replace(/[&*]/g, "").trim();
    const isMember = name.startsWith("m_");
    const field = isMember ? jsField(name) : name;
    const lenArg = args[1];

    if (lenArg != null) {
      // read(member, len) 串/buf
      const lenC = constLen(lenArg);
      const lenJs = lenC != null ? lenC : (/^[A-Za-z_]\w*$/.test(lenArg.trim()) ? lenArg.trim() : null);
      if (lenJs == null) return { ok: false, why: `len:${lenArg}` };
      const typ = isMember ? members[name]?.type : null;
      if (isStringType(typ) || /name|id|message|password|comment/i.test(name)) {
        // 串：encode 写「长度字段(若是局部) + 串」。长度局部在前已写。
        lines.push(`  w.str(o.${field});`);
      } else {
        lines.push(`  w.bytes(o.${field}, ${typeof lenJs === "number" ? lenJs : "null"});`);
      }
      if (isMember) fields.push(field);
    } else {
      // 基础类型(成员或局部长度变量)
      let info = isMember ? resolveType(members[name]?.type, alias) : resolveType(locals[name], alias);
      if (!info) return { ok: false, why: `type:${name}` };
      const mth = widthMethod(info);
      if (!mth) return { ok: false, why: `width:${name}` };
      if (isMember) {
        lines.push(`  w.${mth}(o.${field});`);
        fields.push(field);
      } else {
        // 局部长度变量：encode 时写「下一个串的长度」。先占位，待绑定。
        lines.push(`  w.${mth}(__LEN__);`);
        pendingLenOf = lines.length - 1;
      }
    }
    // 绑定长度：若刚写了串且上面有 pending 长度占位，替换为该串长度
    if (lenArg == null) continue;
  }

  // 处理 __LEN__ 占位：把每个 __LEN__ 绑定到其后第一个 w.str(o.X) 的 X.length
  let strIdx = [];
  lines.forEach((l, i) => { const m = l.match(/w\.str\(o\.(\w+)\)/); if (m) strIdx.push([i, m[1]]); });
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("__LEN__")) {
      const nextStr = strIdx.find(([j]) => j > i);
      const f = nextStr ? nextStr[1] : null;
      lines[i] = f ? lines[i].replace("__LEN__", `(o.${f} ?? "").length`) : lines[i].replace("__LEN__", "0");
    }
  }
  return { ok: true, fn: "encode", fields, body: lines.join("\n") };
}

// ---------- 生成 DECODE (S→C, 来自 write 顺序) ----------
function genDecode(members, body, alias) {
  const calls = streamCalls(body, "oStream", "write");
  if (!calls.length) return { ok: false, why: "no-write-calls" };
  const locals = parseLocals(body);
  const lines = [], fields = [];
  let lenVar = null, lenN = 0;

  for (const args of calls) {
    const raw = args[0];
    const expr = raw.trim();
    const name = expr.replace(/^\(.*?\)\s*/, "").replace(/[&*]/g, "").trim();
    const isMember = name.startsWith("m_");
    const lenArg = args[1];

    // 长度表达式: (BYTE)x.size() / x.size()
    const sizeM = expr.match(/^(?:\(\s*([A-Za-z_]\w*)\s*\)\s*)?[A-Za-z_][\w.]*\.size\s*\(\s*\)$/);
    if (lenArg == null && sizeM) {
      const ltype = sizeM[1] || "BYTE";
      const info = resolveType(ltype, alias) || { size: 1, signed: false };
      const v = `_len${++lenN}`;
      lines.push(`  const ${v} = r.${widthMethod(info)}();`);
      lenVar = v;
      continue;
    }

    if (lenArg != null) {
      const lenC = constLen(lenArg);
      const lenJs = lenC != null ? lenC : (/^[A-Za-z_]\w*$/.test(lenArg) ? lenArg : null);
      if (lenJs == null) return { ok: false, why: `len:${lenArg}` };
      const field = isMember ? jsField(name) : name;
      lines.push(`  const ${field} = r.bytes(${lenJs});`);
      fields.push(field); continue;
    }

    const typ = isMember ? members[name]?.type : locals[name];
    const field = isMember ? jsField(name) : name;
    const arr = isMember ? members[name]?.array : null;

    if (isStringType(typ) && (lenVar || arr != null)) {
      // 串成员
      if (arr != null) {
        const n = constLen(arr) ?? arr;
        lines.push(`  const ${field} = r.str(${n});`);
      } else {
        lines.push(`  const ${field} = r.str(${lenVar});`);
        lenVar = null;
      }
      fields.push(field); continue;
    }

    // 基础类型(成员或局部)
    const info = resolveType(typ, alias);
    if (!info) return { ok: false, why: `type:${name}` };
    const mth = widthMethod(info);
    if (!mth) return { ok: false, why: `width:${name}` };
    lines.push(`  const ${field} = r.${mth}();`);
    fields.push(field);
  }
  return { ok: true, fn: "decode", fields, body: lines.join("\n") };
}

// ---------- 主流程 ----------
function main() {
  const alias = collectTypedefs();
  const enums = parseEnum();
  fs.mkdirSync(OUT, { recursive: true });

  const idLines = enums.map(([n, id]) => `  ${n.replace(/^PACKET_/, "")}: ${id},`).join("\n");
  fs.writeFileSync(path.join(OUT, "packetIds.js"),
    `// 自动生成 —— 勿手改\nexport const PacketID = {\n${idLines}\n};\n\n` +
    `export const PacketName = Object.fromEntries(Object.entries(PacketID).map(([k, v]) => [v, k]));\n`);

  const report = { total: enums.length, encode: [], decode: [], manual: [], skipped: [], nofile: [] };
  const blocks = [];

  for (const [pname, id] of enums) {
    const dir = pname.replace(/^PACKET_/, "").split("_")[0];
    const wantEncode = CLIENT_SEND.has(dir);
    const wantDecode = CLIENT_RECV.has(dir);
    if (!wantEncode && !wantDecode) { report.skipped.push(pname); continue; }

    let cls = null, files = null;
    for (const c of classCandidates(pname)) {
      const cpp = path.join(CORE, c + ".cpp"), h = path.join(CORE, c + ".h");
      if (fs.existsSync(cpp) || fs.existsSync(h)) { cls = c; files = { cpp: fs.existsSync(cpp) ? cpp : null, h: fs.existsSync(h) ? h : null }; break; }
    }
    if (!cls) { report.nofile.push(pname); continue; }

    const cpp = files.cpp ? fs.readFileSync(files.cpp, "latin1") : "";
    const h = files.h ? fs.readFileSync(files.h, "latin1") : "";
    const all = cpp + "\n" + h;
    const members = parseMembers(h || cpp);
    const method = wantEncode ? "read" : "write";
    const mbody = extractMethod(all, cls, method);
    if (mbody == null) { report.manual.push({ p: pname, why: [`no-${method}-method`] }); continue; }
    const cx = complexity(mbody);
    if (cx.length) { report.manual.push({ p: pname, why: cx }); continue; }

    const gen = wantEncode ? genEncode(members, mbody, alias) : genDecode(members, mbody, alias);
    if (!gen.ok) { report.manual.push({ p: pname, why: [gen.why] }); continue; }

    const short = pname.replace(/^PACKET_/, "");
    const fnBlock = wantEncode
      ? `  encode(o, w) {\n${gen.body}\n    return w;\n  },`
      : `  decode(r) {\n${gen.body}\n    return { ${gen.fields.join(", ")} };\n  },`;
    blocks.push(`export const ${short} = {\n  id: ${id},\n  fields: ${JSON.stringify(gen.fields)},\n${fnBlock}\n};\n`);
    (wantEncode ? report.encode : report.decode).push(short);
  }

  fs.writeFileSync(path.join(OUT, "codecs.js"),
    `// 自动生成 —— 线性包编解码(方向感知)。复杂包见 report.json\n` +
    `import { PacketReader, PacketWriter } from "../stream.js";\n\n` + blocks.join("\n"));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));

  console.log(`枚举总数 ${report.total}`);
  console.log(`生成 encode(C→S) ${report.encode.length}`);
  console.log(`生成 decode(S→C) ${report.decode.length}`);
  console.log(`合计自动生成 ${report.encode.length + report.decode.length}`);
  console.log(`需手工 ${report.manual.length} / 跳过(服务器间) ${report.skipped.length} / 无源文件 ${report.nofile.length}`);
}
main();
