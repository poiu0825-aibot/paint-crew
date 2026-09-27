import express from 'express';
import {createServer} from 'node:http';
import {Server} from 'socket.io';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {COLORS,EMOTES,createGame,roll,paint,botAction,legalPlacements,scores} from '../shared/game.js';

export function createApp({botDelay=1100}={}){
const app=express(),http=createServer(app),io=new Server(http,{maxHttpBufferSize:8192});
const rooms=new Map(),timers=new Map();
app.disable('x-powered-by');
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');next();});
app.get('/api/health',(_,res)=>res.json({ok:true,game:'paint-crew',version:'1.1.0'}));
app.use(express.static(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist')));
app.get('/',(_,res)=>res.sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/index.html')));
function publicRoom(room){return {code:room.code,host:room.host,status:room.status,match:room.match,players:room.players.map(({token,...p})=>p),chat:room.chat,votes:room.votes,game:room.game?{...room.game,players:room.game.players.map(({token,deck,...p})=>({...p,remaining:deck.length,nextColor:deck[0]})),legal:room.game.phase==='paint'?legalPlacements(room.game):[],scores:scores(room.game)}:null};}
function broadcast(r){r.updated=Date.now();io.to(r.code).emit('room',publicRoom(r));schedule(r);}
function schedule(r){if(timers.has(r.code)||r.status!=='playing'||!r.game.players[r.game.turn].bot)return;const timer=setTimeout(()=>{timers.delete(r.code);if(r.status!=='playing')return;try{const p=r.game.players[r.game.turn],a=botAction(r.game);if(!p.bot)return;if(a.type==='roll')roll(r.game,p.id,a.turn);else paint(r.game,p.id,...a.cells);if(r.game.phase==='finished')r.status='finished';broadcast(r);}catch(e){console.error('Bot action failed:',e.message);}},botDelay);timers.set(r.code,timer);}
function cleanName(v){return String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'新進工人';}
function player(name,bot=false){return {id:randomUUID(),token:randomBytes(24).toString('hex'),name:cleanName(name),color:null,ready:bot,bot,online:true,disconnectedAt:null};}
function find(socket){const r=rooms.get(socket.data.code),p=r?.players.find(p=>p.id===socket.data.playerId);if(!r||!p)throw Error('請先加入房間。');return [r,p];}
function requireLobby(r){if(r.status!=='lobby')throw Error('工程已開工，請等下一局。');}
function host(r,p){if(r.host!==p.id)throw Error('這個操作由房主執行。');}
function begin(r){if(r.players.length<2)throw Error('至少需要 2 位工人，可以加入電腦陪玩。');if(r.players.some(p=>!p.color||!p.ready||!p.online))throw Error('請等所有工人選好鋼盔並準備完成。');r.status='playing';r.votes=[];r.match++;r.game=createGame(r.players.map(({token,...p})=>p));}
function leave(socket,explicit=false){const r=rooms.get(socket.data.code),p=r?.players.find(p=>p.id===socket.data.playerId);if(!r||!p)return;socket.leave(r.code);socket.data.code=null;socket.data.playerId=null;
 const still=[...io.sockets.sockets.values()].some(s=>s.data.code===r.code&&s.data.playerId===p.id);if(still)return;
 if(r.status==='lobby'&&explicit){r.players=r.players.filter(x=>x.id!==p.id);}else{p.online=false;p.disconnectedAt=Date.now();if(r.status==='lobby')p.ready=false;}
 if(r.host===p.id){r.host=r.players.find(x=>!x.bot&&x.online)?.id??p.id;}if(!r.players.some(x=>!x.bot)){rooms.delete(r.code);clearTimeout(timers.get(r.code));timers.delete(r.code);}else broadcast(r);
}
io.on('connection',socket=>{
 let lastChat=0;const recent=[];
 function event(name,fn){socket.on(name,(data,ack)=>{try{const now=Date.now();while(recent.length&&recent[0]<now-1000)recent.shift();if(recent.length>25)throw Error('操作太快，請稍候。');recent.push(now);const result=fn(data??{});if(typeof ack==='function')ack({ok:true,...result});}catch(e){if(typeof ack==='function')ack({ok:false,error:e.message});}});}
 function join(r,p){socket.join(r.code);socket.data.code=r.code;socket.data.playerId=p.id;p.online=true;p.disconnectedAt=null;broadcast(r);return {code:r.code,playerId:p.id,token:p.token,room:publicRoom(r)};}
 event('create',d=>{if(socket.data.code)throw Error('請先離開目前房間。');if(rooms.size>=500)throw Error('工地目前額滿，請稍後再試。');let code;do{code=randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(code));const p=player(d.name),r={code,host:p.id,status:'lobby',match:0,players:[p],game:null,chat:[],votes:[],updated:Date.now()};rooms.set(code,r);return join(r,p);});
 event('join',d=>{const r=rooms.get(String(d.code??'').toUpperCase().trim());if(!r)throw Error('找不到這個工地，請確認房號；服務重啟後需重新開房。');if(socket.data.code&&socket.data.code!==r.code)throw Error('請先離開目前房間。');let p=d.token&&r.players.find(p=>p.token===d.token&&!p.bot);if(!p){requireLobby(r);if(r.players.length>=4)throw Error('房間已滿（最多 4 人）。');p=player(d.name);r.players.push(p);}return join(r,p);});
 event('color',d=>{const [r,p]=find(socket);requireLobby(r);if(!COLORS.some(c=>c.id===d.color))throw Error('請選擇鋼盔顏色。');if(r.players.some(x=>x.id!==p.id&&x.color===d.color))throw Error('這個顏色已被選走。');p.color=d.color;p.ready=false;broadcast(r);});
 event('ready',()=>{const [r,p]=find(socket);requireLobby(r);if(!p.color)throw Error('先選一頂鋼盔吧。');p.ready=!p.ready;broadcast(r);});
 event('addBot',()=>{const [r,p]=find(socket);host(r,p);requireLobby(r);if(r.players.length>=4)throw Error('房間已滿。');const b=player(`師傅 ${r.players.filter(x=>x.bot).length+1} 號`,true);b.color=COLORS.find(c=>!r.players.some(p=>p.color===c.id)).id;r.players.push(b);broadcast(r);});
 event('removeBot',d=>{const [r,p]=find(socket);host(r,p);requireLobby(r);r.players=r.players.filter(x=>!(x.bot&&x.id===d.id));broadcast(r);});
 event('replace',d=>{const [r,p]=find(socket);host(r,p);if(r.status!=='playing')throw Error('目前不在對局中。');const target=r.players.find(x=>x.id===d.id);if(!target||target.bot||target.online||Date.now()-target.disconnectedAt<20000)throw Error('工人離線 20 秒後可由電腦接手。');target.bot=true;target.online=true;target.ready=true;const gp=r.game.players.find(x=>x.id===target.id);gp.bot=true;broadcast(r);});
 event('start',()=>{const [r,p]=find(socket);host(r,p);requireLobby(r);begin(r);broadcast(r);});
 for(const action of ['roll','paint'])event(action,d=>{const [r,p]=find(socket);if(r.status!=='playing'||p.bot)throw Error('目前無法行動。');if(action==='roll')roll(r.game,p.id,d.turn);else paint(r.game,p.id,d.a,d.b);if(r.game.phase==='finished')r.status='finished';broadcast(r);});
 event('chat',d=>{const [r,p]=find(socket);if(Date.now()-lastChat<650)throw Error('慢慢說，大家都看得到。');let text=String(d.text??'').trim().slice(0,180);if(!text)return;if(d.emote&&!EMOTES.includes(text))throw Error('無效表情。');lastChat=Date.now();r.chat.push({id:randomUUID(),playerId:p.id,name:p.name,color:p.color,text,emote:!!d.emote,time:Date.now()});r.chat=r.chat.slice(-60);broadcast(r);});
 event('rematch',()=>{const [r,p]=find(socket);if(r.status!=='finished')throw Error('工程還沒結束。');if(!r.votes.includes(p.id))r.votes.push(p.id);const humans=r.players.filter(p=>!p.bot&&p.online);if(humans.every(p=>r.votes.includes(p.id))){r.players=r.players.filter(p=>p.bot||p.online);r.status='lobby';r.game=null;r.votes=[];r.players.forEach(p=>p.ready=p.bot);}broadcast(r);});
 event('leave',()=>{leave(socket,true);});socket.on('disconnect',()=>leave(socket));
});
const cleanup=setInterval(()=>{for(const [code,r]of rooms){if(Date.now()-r.updated>12*60*60*1000){rooms.delete(code);clearTimeout(timers.get(code));timers.delete(code);}}},60000);cleanup.unref();
return {app,http,io,rooms,close:async()=>{clearInterval(cleanup);for(const t of timers.values())clearTimeout(t);await new Promise(resolve=>io.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const {http}=createApp();http.listen(process.env.PORT||3100,'0.0.0.0',()=>console.log(`Paint Crew ready on ${process.env.PORT||3100}`));}
