import test from 'node:test';
import assert from 'node:assert/strict';
import {io as connect} from 'socket.io-client';
import {createApp} from '../server/index.js';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const emit=(s,e,d={})=>new Promise((resolve,reject)=>s.timeout(3000).emit(e,d,(err,res)=>err?reject(err):resolve(res)));
test('real sockets: lobby, privacy, color collision, chat, full match, reconnect, rematch and full room',async()=>{
 const service=createApp({botDelay:1});await new Promise(r=>service.http.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+service.http.address().port;const sockets=[];
 async function client(){const s=connect(url,{transports:['websocket'],forceNew:true});sockets.push(s);await new Promise(r=>s.on('connect',r));return s;}
 try{const a=await client(),b=await client();const made=await emit(a,'create',{name:'Alice'}),joined=await emit(b,'join',{code:made.code,name:'Bob'});assert.equal(joined.ok,true);assert.ok(!JSON.stringify(joined.room).includes(made.token));assert.equal((await emit(a,'color',{color:'coral'})).ok,true);assert.equal((await emit(b,'color',{color:'coral'})).ok,false);await emit(b,'color',{color:'teal'});assert.equal((await emit(a,'start')).ok,false);await emit(a,'ready');await emit(b,'ready');assert.equal((await emit(b,'start')).ok,false);await emit(a,'start');assert.equal((await emit(b,'roll',{turn:0})).ok,false);
 let rb; b.on('room',r=>rb=r);await emit(a,'chat',{text:'<img src=x onerror=alert(1)>'});await wait(10);assert.equal(rb.chat.at(-1).text,'<img src=x onerror=alert(1)>');assert.ok(!JSON.stringify(rb).includes('"deck"'));assert.equal(rb.game.players.length,2);assert.ok(rb.game.players.every(p=>p.pawn&&p.colors.length===1&&p.nextColor===p.color));const beforeReconnect=rb.game.players.map(p=>p.pawn);
 a.disconnect();await wait(15);const restored=await client();const recovered=await emit(restored,'join',{code:made.code,token:made.token,name:'Alice'});assert.equal(recovered.playerId,made.playerId);assert.equal(recovered.room.status,'playing');assert.deepEqual(recovered.room.game.players.map(p=>p.pawn),beforeReconnect);const byId=new Map([[made.playerId,restored],[joined.playerId,b]]);
 let actions=0;while(service.rooms.get(made.code).status==='playing'&&actions<140){const r=service.rooms.get(made.code),g=r.game,s=byId.get(g.players[g.turn].id);let res;if(g.phase==='direction')res=await emit(s,'roll',{turn:actions%3-1});else {const {legalPlacements}=await import('../shared/game.js');const [x,y]=legalPlacements(g)[0];res=await emit(s,'paint',{a:x,b:y});}assert.equal(res.ok,true,res.error);actions++;await wait(60);}
 assert.equal(service.rooms.get(made.code).status,'finished');await emit(restored,'rematch');assert.equal(service.rooms.get(made.code).status,'finished');await emit(b,'rematch');assert.equal(service.rooms.get(made.code).status,'lobby');assert.equal(service.rooms.get(made.code).players[0].ready,false);
 // Host migrated to Bob on disconnect.
 await emit(b,'addBot');await emit(b,'addBot');const c=await client();assert.equal((await emit(c,'join',{code:made.code,name:'Extra'})).ok,false);
 const previousId=joined.playerId;b.disconnect();await wait(15);const rejoin=await client();const again=await emit(rejoin,'join',{code:made.code,token:joined.token});assert.equal(again.playerId,previousId);assert.equal(again.room.players.length,4);
 }finally{for(const s of sockets)s.disconnect();await service.close();}
});

