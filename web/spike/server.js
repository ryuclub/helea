import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = import.meta.dirname, PORT = Number(process.env.PORT || 8096);
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".ispk":"application/octet-stream"};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/public/index.html";
  const f=path.join(ROOT,p);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end("404");return;}
  res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"});
  fs.createReadStream(f).pipe(res);
}).listen(PORT,()=>console.log(`spike: http://127.0.0.1:${PORT}/`));
