import WebSocket from "ws";
import { encCLLogin, encCLGetPCList, encCLSelectPC, encCGConnect, encCGReady, encCGMove, resetGameSeq, setEncryptCode, calcEncryptCode, decode, Framer } from "../../client/src/proto.js";
const PC=Uint8Array.from(Buffer.from("B2BBD4D9D1DACACE","hex"));const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function conn(port){const ws=new WebSocket(`ws://127.0.0.1:8080/?host=127.0.0.1&port=${port}`);ws.binaryType="arraybuffer";ws.inbox=[];ws.closed=false;const fr=new Framer(p=>ws.inbox.push(decode(p)));ws.on("message",d=>fr.push(new Uint8Array(d)));ws.on("close",()=>ws.closed=true);return ws;}
const wf=async(ws,n,ms=2500)=>{const t=Date.now();while(Date.now()-t<ms){const x=ws.inbox.find(p=>p.name===n);if(x)return x;await sleep(30);}return null;};
const l=conn(9999);await new Promise((r,j)=>{l.on("open",r);l.on("error",j);});
l.send(encCLLogin({id:"111111",password:"111111"}));await wf(l,"LC_LOGIN_OK");
l.send(encCLGetPCList());await wf(l,"LC_PC_LIST");
l.send(encCLSelectPC({pcName:PC,pcType:0}));const rc=await wf(l,"LC_RECONNECT");l.close();await sleep(300);
resetGameSeq();
const g=conn(rc.gameServerPort||9998);await new Promise((r,j)=>{g.on("open",r);g.on("error",j);});
g.send(encCGConnect({key:rc.key,pcName:PC,pcType:0}));await wf(g,"GC_UPDATE_INFO");g.send(encCGReady());await sleep(1200);
setEncryptCode(calcEncryptCode(12,0)); // code=28
let pos={x:118,y:157}; // DB 真实坐标
console.log("用 code=28, 真实坐标", JSON.stringify(pos), "连走 6 步:");
for(let i=0;i<6;i++){let moved=false;
  for(const dir of [4,2,0,6,3,1,5,7]){g.inbox.length=0;g.send(encCGMove({dir,x:pos.x,y:pos.y}));await sleep(350);
    const ok=g.inbox.find(p=>p.name==="GC_MOVE_OK");if(ok){console.log(` 步${i+1} dir=${dir} → GC_MOVE_OK (${ok.x},${ok.y})`);pos={x:ok.x,y:ok.y};moved=true;break;}}
  if(!moved){console.log(` 步${i+1}: 全挡(${pos.x},${pos.y})`);break;}}
try{g.close();}catch{};process.exit(0);
