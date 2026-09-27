import React from 'react';
import {COLORS,move} from '../shared/game.js';

const color=id=>COLORS.find(c=>c.id===id)??{hex:'#c9c7bd',name:'空地',mark:'○'};

export default function Board({game:g,mine,moving,animatedPawn,direction,selected,onSelect,Hat}){
 const current=g.players[g.turn];
 return <div className="board-grid" role="group" aria-label="七乘七施工棋盤">
  {g.board.map((cell,i)=>{
   const occupants=g.players.filter(p=>!p.eliminated).map(p=>({
    ...p,position:animatedPawn&&g.lastMove?.playerId===p.id?animatedPawn:p.pawn,
   })).filter(p=>p.position.x===i%7&&p.position.y===Math.floor(i/7));
   const can=mine&&g.phase==='paint'&&!moving&&g.legal.some(pair=>pair.includes(i)&&(!selected.length||selected.length===2||pair.includes(selected[0])));
   const pick=selected.includes(i);
   const preview=mine&&g.phase==='direction'&&[1,2,3,4].some(n=>{
    const v=move({...current.pawn,dir:(current.pawn.dir+direction+4)%4},n).pawn;
    return v.x===i%7&&v.y===Math.floor(i/7);
   });
   const description=cell?color(cell.color).name+' 油漆 '+cell.tile:'空地';
   return <button key={i} data-cell={i}
    className={'cell '+(cell?'painted ':'')+(can?'legal ':'')+(pick?'selected ':'')+(preview?'route-preview ':'')+(cell&&g.players.find(x=>x.id===cell.owner)?.eliminated?'neutral ':'')}
    style={{'--paint':color(pick?current.color:cell?.color).hex}}
    aria-label={`${String.fromCharCode(65+i%7)}${Math.floor(i/7)+1} ${description}${occupants.length?'，'+occupants.map(p=>p.name+'的棋子').join('、'):''}${pick?' 已選取':''}`}
    aria-pressed={pick} onClick={()=>onSelect(i)}>
    {cell&&!pick&&<><span className="paint-mark">{color(cell.color).mark}</span><small className="tile-number">{cell.tile}</small></>}
    {pick&&<span className="selection-number">{selected.indexOf(i)+1}</span>}
    {can&&!cell&&!pick&&<span className="legal-dot"/>}
    {occupants.map((p,j)=>{
     const isMoving=moving&&g.lastMove?.playerId===p.id;
     const angle=mine&&g.phase==='direction'&&p.id===current.id?p.pawn.dir+direction:p.position.dir;
     const clustered=occupants.length>1;
     return <span key={p.id} data-worker-id={p.id} data-worker-color={p.color}
      title={`${p.name} · ${color(p.color).name}`}
      className={'worker '+(isMoving?'walking ':'')+(p.id===current.id&&g.phase!=='finished'?'active-worker ':'')+(clustered?'clustered':'')}
      style={{'--worker-color':color(p.color).hex,left:clustered?`${j%2*50+2}%`:'10%',top:clustered?`${occupants.length===2?26:Math.floor(j/2)*50+2}%`:'6%'}}>
      <span className="worker-arrow" style={{transform:`rotate(${angle*90}deg)`}}>▲</span>
      <Hat tone={p.color} size={45}/><span className="worker-body"/>
      <small className="worker-id">{g.players.findIndex(x=>x.id===p.id)+1}</small>
     </span>;
    })}
   </button>;
  })}
 </div>;
}
