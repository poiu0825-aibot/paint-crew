export const SIZE=7;
export const COLORS=[{id:'coral',name:'珊瑚紅',hex:'#e87359',mark:'●'},{id:'teal',name:'湖水綠',hex:'#3e9991',mark:'✚'},{id:'gold',name:'工程黃',hex:'#e8b443',mark:'◆'},{id:'blue',name:'天空藍',hex:'#668fc4',mark:'▰'}];
export const DICE=[1,2,2,3,3,4];
export const DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
export const EMOTES=['👷 開工啦！','😎 刷得漂亮','😱 我的地！','🤝 好手氣'];
const xy=i=>[i%7,Math.floor(i/7)];
export const adjacent=(a,b)=>{const [x,y]=xy(a),[u,v]=xy(b);return Math.abs(x-u)+Math.abs(y-v)===1;};
export function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// Edge connectors are undirected pairs. Two corner loops return to the same
// corner, facing inward at 90 degrees, and consume one re-entry step.
export function step(p){
 let {x,y,dir}=p;const [dx,dy]=DIRS[dir];const nx=x+dx,ny=y+dy;
 if(nx>=0&&nx<7&&ny>=0&&ny<7)return {x:nx,y:ny,dir};
 if(dir===0){if(x===0)return {x:0,y:0,dir:1};x=x%2?x+1:x-1;dir=2;}
 else if(dir===1){if(y===6)return {x:6,y:6,dir:0};y=y%2?y-1:y+1;dir=3;}
 else if(dir===2){if(x===6)return {x:6,y:6,dir:3};x=x%2?x-1:x+1;dir=0;}
 else {if(y===0)return {x:0,y:0,dir:2};y=y%2?y+1:y-1;dir=1;}
 return {x,y,dir};
}
export function move(p,n){const path=[];for(let i=0;i<n;i++){p=step(p);path.push(p);}return {pawn:p,path};}
export function createGame(players){
 const starts=players.length===2?[[3,2,2],[3,4,0]]:[[3,2,2],[4,3,3],[3,4,0],[2,3,1]];
 return {board:Array(49).fill(null),players:players.map((p,i)=>({...p,pawn:{x:starts[i][0],y:starts[i][1],dir:starts[i][2]},cash:30,eliminated:false,painted:0,paid:0,earned:0,colors:[p.color],deck:Array(players.length===2?24:players.length===3?15:12).fill(p.color)})),turn:0,phase:'direction',round:1,serial:0,lastMove:null,logs:['每位工人已就位，各自移動自己的棋子。'],result:null};
}
export function region(board,index){const color=board[index]?.color;if(!color)return [];const seen=new Set([index]),todo=[index];while(todo.length){const a=todo.pop();for(let b=0;b<49;b++){if(!seen.has(b)&&board[b]?.color===color&&adjacent(a,b)){seen.add(b);todo.push(b);}}}return [...seen];}
export function placementError(g,a,b){
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=49||b>=49||!adjacent(a,b))return '請選擇兩個上下或左右相鄰的格子。';
 const pawn=g.players[g.turn].pawn,p=pawn.y*7+pawn.x;
 if(g.players.some(worker=>!worker.eliminated&&[a,b].includes(worker.pawn.y*7+worker.pawn.x)))return '有工人站立的格子不能刷漆。';
 if(!adjacent(a,p)&&!adjacent(b,p))return '至少一格必須緊鄰自己的工人（不含斜角）。';
 const x=g.board[a],y=g.board[b];if(x&&y&&x.tile===y.tile&&x.owner!==g.players[g.turn].id)return '不能一次完整蓋掉對手同一塊 2×1 油漆。';
 return null;
}
export function legalPlacements(g){const out=[];for(let a=0;a<49;a++)for(const b of [a+1,a+7])if(b<49&&!placementError(g,a,b))out.push([a,b]);return out;}
function log(g,t){g.logs.push(t);g.logs=g.logs.slice(-30);}
export function scores(g){return g.players.map(p=>{const area=g.board.filter(c=>c?.owner===p.id).length;return {id:p.id,name:p.name,color:p.color,cash:p.cash,area,total:p.cash+area,eliminated:p.eliminated,painted:p.painted,paid:p.paid,earned:p.earned};}).sort((a,b)=>Number(a.eliminated)-Number(b.eliminated)||b.total-a.total||b.cash-a.cash);}
function finish(g){g.phase='finished';const ranks=scores(g),first=ranks[0];g.result={ranks,winners:ranks.filter(p=>!p.eliminated&&p.total===first.total&&p.cash===first.cash).map(p=>p.id)};log(g,'收工！工程款與可見漆地一起計分。');}
function advance(g){
 if(g.players.filter(p=>!p.eliminated).length<=1||g.players.every(p=>p.eliminated||!p.deck.length)){finish(g);return;}
 for(let i=0;i<g.players.length;i++){g.turn=(g.turn+1)%g.players.length;if(g.turn===0)g.round++;if(!g.players[g.turn].eliminated&&g.players[g.turn].deck.length)break;}g.phase='direction';
}
export function roll(g,playerId,turn,rng=Math.random){
 if(g.phase!=='direction'||g.players[g.turn].id!==playerId)throw Error('現在不是你的擲骰時間。');
 if(![-1,0,1].includes(turn))throw Error('只能向左、直走或向右，不能迴轉。');
 const p=g.players[g.turn];p.pawn.dir=(p.pawn.dir+turn+4)%4;const dice=DICE[Math.floor(rng()*6)];const start={...p.pawn};const {pawn,path}=move(p.pawn,dice);p.pawn=pawn;
 const cell=g.board[pawn.y*7+pawn.x],owner=g.players.find(v=>v.id===cell?.owner);let payment=null;
 if(owner&&owner.id!==p.id&&!owner.eliminated){const cells=region(g.board,pawn.y*7+pawn.x),due=cells.length,amount=Math.min(p.cash,due);p.cash-=amount;owner.cash+=amount;p.paid+=amount;owner.earned+=amount;payment={from:p.id,to:owner.id,amount,due,cells};log(g,`${p.name} 付給 ${owner.name} ${amount} 元（連通 ${due} 格，餘額 ${p.cash} 元）。`);if(p.cash===0){p.eliminated=true;p.deck=[];log(g,`${p.name} 餘額 0 元，退出施工；留下的油漆成為中立地。`);}}
 else log(g,`${p.name} 前進 ${dice} 格，這次不用付費。`);
 g.lastMove={id:++g.serial,dice,start,path,payment,playerId};g.phase='paint';if(p.eliminated)advance(g);else if(!legalPlacements(g).length){p.deck.shift();log(g,'沒有合法空間，消耗一桶油漆並換下一位。');advance(g);}return g;
}
export function paint(g,playerId,a,b){if(g.phase!=='paint'||g.players[g.turn].id!==playerId)throw Error('現在不是你的刷漆時間。');const error=placementError(g,a,b);if(error)throw Error(error);const p=g.players[g.turn],color=p.deck.shift(),tile=++g.serial;g.board[a]=g.board[b]={owner:p.id,color,tile};p.painted++;log(g,`${p.name} 完成一塊 2×1 油漆。`);advance(g);return g;}
export function botAction(g,rng=Math.random){const p=g.players[g.turn];if(g.phase==='direction'){let best=Infinity,choice=0;for(const t of [-1,0,1]){let cost=0;for(const n of DICE){const {pawn}=move({...p.pawn,dir:(p.pawn.dir+t+4)%4},n);const idx=pawn.y*7+pawn.x,cell=g.board[idx],owner=g.players.find(x=>x.id===cell?.owner);if(owner&&owner.id!==p.id&&!owner.eliminated)cost+=region(g.board,idx).length;}cost+=rng()*.5;if(cost<best){best=cost;choice=t;}}return {type:'roll',turn:choice};}
 let best=-Infinity,choice;for(const cells of legalPlacements(g)){let score=rng();for(const c of cells){const old=g.board[c];score+=!old?1:old.owner!==p.id?3:-1;for(let a=0;a<49;a++)if(adjacent(a,c)&&g.board[a]?.color===p.deck[0])score+=.65;}if(score>best){best=score;choice=cells;}}return {type:'paint',cells:choice};}
