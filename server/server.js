import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 8080);
const MAX_PLAYERS = 16;
const players = new Map();

const server = http.createServer((req,res)=>{
  if(req.url === '/health'){
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify({ok:true,players:players.size}));
    return;
  }
  res.writeHead(200, {'content-type':'text/plain'});
  res.end('WARFLEX multiplayer server');
});

const wss = new WebSocketServer({server});

function safeName(value){
  const name = String(value || 'PLAYER').replace(/[^a-zA-Z0-9 _.-]/g,'').trim().slice(0,18);
  return name || 'PLAYER';
}

function broadcast(payload, except=null){
  const data=JSON.stringify(payload);
  for(const [ws] of players){
    if(ws===except || ws.readyState!==1) continue;
    ws.send(data);
  }
}

function snapshot(){
  return [...players.values()].map(p=>({
    id:p.id,
    username:p.username,
    position:p.position,
    yaw:p.yaw,
    health:p.health,
  }));
}

function sendState(ws){
  ws.send(JSON.stringify({type:'state',players:snapshot()}));
}

wss.on('connection',(ws)=>{
  if(players.size >= MAX_PLAYERS){
    ws.send(JSON.stringify({type:'error',message:'SERVER FULL'}));
    ws.close();
    return;
  }

  const id=crypto.randomUUID();
  const player={
    id,
    username:'PLAYER',
    position:{x:0,y:1.65,z:18},
    yaw:0,
    health:100,
  };
  players.set(ws,player);

  ws.send(JSON.stringify({type:'welcome',id,player}));
  sendState(ws);
  broadcast({type:'player_joined',player},ws);

  ws.on('message',(raw)=>{
    let msg;
    try{msg=JSON.parse(raw.toString());}catch{return;}
    const p=players.get(ws);
    if(!p) return;

    if(msg.type==='hello'){
      p.username=safeName(msg.username);
      if(msg.position) p.position=msg.position;
      p.yaw=Number(msg.yaw)||0;
      broadcast({type:'player_updated',player:p},ws);
      sendState(ws);
      return;
    }

    if(msg.type==='update'){
      if(msg.position) p.position=msg.position;
      if(Number.isFinite(msg.yaw)) p.yaw=msg.yaw;
      if(Number.isFinite(msg.health)) p.health=Math.max(0,Math.min(100,msg.health));
      broadcast({type:'player_updated',player:p},ws);
      return;
    }

    if(msg.type==='shoot'){
      broadcast({
        type:'player_shot',
        id:p.id,
        origin:msg.origin,
        direction:msg.direction,
        hitId:msg.hitId || null,
        hit:msg.hit === true,
        damage:Number(msg.damage)||34,
      },ws);
      return;
    }

    if(msg.type==='hit'){
      const target=[...players.values()].find(x=>x.id===msg.targetId);
      if(!target) return;
      target.health=Math.max(0,target.health-(Number(msg.damage)||34));
      broadcast({
        type:'player_hit',
        targetId:target.id,
        attackerId:p.id,
        damage:Number(msg.damage)||34,
        health:target.health,
      });
      if(target.health<=0){
        target.health=0;
        broadcast({type:'player_died',player:target});
      }
      return;
    }

    if(msg.type==='respawn'){
      p.health=100;
      p.position=msg.position && Number.isFinite(msg.position.x) && Number.isFinite(msg.position.z)
        ? {x:Math.max(-70,Math.min(70,msg.position.x)),y:1.65,z:Math.max(-45,Math.min(65,msg.position.z))}
        : {x:(Math.random()-.5)*70,y:1.65,z:20+Math.random()*45};
      broadcast({type:'player_respawned',player:p});
    }
  });

  ws.on('close',()=>{
    const p=players.get(ws);
    players.delete(ws);
    if(p) broadcast({type:'player_left',id:p.id});
  });
});

server.listen(PORT,()=>console.log('WARFLEX multiplayer listening on '+PORT));
