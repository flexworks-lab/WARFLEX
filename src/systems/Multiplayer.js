export class Multiplayer {
  constructor({THREE,scene,localPlayer,getUsername,damagePlayer,onRemoteShot}){
    this.THREE=THREE;
    this.scene=scene;
    this.localPlayer=localPlayer;
    this.getUsername=getUsername;
    this.damagePlayer=damagePlayer;
    this.onRemoteShot=onRemoteShot;
    this.socket=null;
    this.id=null;
    this.players=new Map();
    this.connected=false;
    this.lastSend=0;
    this.url=window.__WARFLEX_MULTIPLAYER_URL || (
      location.protocol==='https:'
        ? 'wss://multiplayer-production-10d1.up.railway.app'
        : 'ws://localhost:8080'
    );
  }

  connect(){
    this.disconnect(false);
    return new Promise((resolve,reject)=>{
      let settled=false;
      try{
        this.socket=new WebSocket(this.url);
        this.socket.addEventListener('open',()=>{
          this.connected=true;
          this.socket.send(JSON.stringify({
            type:'hello',
            username:this.getUsername(),
            position:this.localPlayer.position,
            yaw:0,
            health:100,
          }));
          settled=true;
          resolve(true);
        });
        this.socket.addEventListener('message',(event)=>{
          let msg;
          try{msg=JSON.parse(event.data);}catch{return;}
          this.handle(msg);
        });
        this.socket.addEventListener('close',()=>{
          this.connected=false;
          if(!settled){settled=true;reject(new Error('MULTIPLAYER SERVER UNAVAILABLE'));}
        });
        this.socket.addEventListener('error',()=>{
          if(!settled){settled=true;reject(new Error('MULTIPLAYER SERVER UNAVAILABLE'));}
        });
      }catch(error){
        settled=true;
        reject(error);
      }
    });
  }

  disconnect(clear=true){
    try{this.socket?.close();}catch{}
    this.socket=null;
    this.connected=false;
    for(const remote of this.players.values()) this.scene.remove(remote.group);
    this.players.clear();
    if(clear) this.id=null;
  }

  makeRig(username){
    const THREE=this.THREE;
    const group=new THREE.Group();
    group.name='WARFLEX_REMOTE_PLAYER';

    const bodyMat=new THREE.MeshStandardMaterial({color:0x4f6672,roughness:.72,metalness:.22});
    const darkMat=new THREE.MeshStandardMaterial({color:0x171d22,roughness:.82,metalness:.18});
    const skinMat=new THREE.MeshStandardMaterial({color:0x9a765f,roughness:.9});
    const visorMat=new THREE.MeshStandardMaterial({
      color:0x0a1a22,
      emissive:0x17647c,
      emissiveIntensity:1.8,
      roughness:.16,
      metalness:.62
    });

    const box=(size,pos,mat,parent=group)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(...size),mat);
      m.position.set(...pos);
      m.castShadow=true;
      m.receiveShadow=true;
      parent.add(m);
      return m;
    };

    box([.9,1.0,.52],[0,1.25,0],darkMat);
    box([.76,.58,.58],[0,1.38,-.08],bodyMat);

    const head=new THREE.Mesh(new THREE.SphereGeometry(.32,20,14),skinMat);
    head.position.set(0,2.02,0);
    head.castShadow=true;
    group.add(head);

    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.37,20,14),darkMat);
    helmet.scale.set(1,.62,1);
    helmet.position.set(0,2.17,0);
    helmet.castShadow=true;
    group.add(helmet);

    box([.46,.09,.04],[0,2.03,-.31],visorMat);

    for(const side of [-1,1]){
      const arm=new THREE.Group();
      arm.position.set(side*.57,1.48,0);
      group.add(arm);
      box([.25,.65,.28],[0,-.28,0],bodyMat,arm);
      box([.26,.48,.27],[0,-.84,0],darkMat,arm);

      const leg=new THREE.Group();
      leg.position.set(side*.22,.88,0);
      group.add(leg);
      box([.34,.75,.38],[0,-.37,0],darkMat,leg);
      box([.40,.25,.56],[0,-.83,-.06],darkMat,leg);
    }

    const rifle=new THREE.Group();
    rifle.position.set(.18,1.35,-.34);
    rifle.rotation.z=-.08;
    group.add(rifle);
    box([.18,.20,.75],[0,0,-.30],darkMat,rifle);
    box([.10,.10,.62],[0,.02,-.76],bodyMat,rifle);
    box([.12,.28,.22],[0,-.22,-.25],darkMat,rifle);

    const labelCanvas=document.createElement('canvas');
    labelCanvas.width=512;
    labelCanvas.height=96;
    const ctx=labelCanvas.getContext('2d');
    ctx.clearRect(0,0,512,96);
    ctx.font='700 34px Arial';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle='#ffffff';
    ctx.shadowColor='rgba(0,0,0,.9)';
    ctx.shadowBlur=10;
    ctx.fillText(username,256,48);
    const labelTexture=new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({
      map:labelTexture,
      transparent:true,
      depthTest:false,
      depthWrite:false,
    }));
    label.scale.set(3.8,.72,1);
    label.position.set(0,3.0,0);
    group.add(label);

    return {group,label,labelTexture,username};
  }

  addPlayer(data){
    if(!data || data.id===this.id) return;
    let remote=this.players.get(data.id);
    if(!remote){
      const rig=this.makeRig(data.username||'PLAYER');
      rig.group.position.set(data.position?.x||0,data.position?.y||1.65,data.position?.z||18);
      rig.group.rotation.y=Number(data.yaw)||0;
      this.scene.add(rig.group);
      remote={...rig,targetPosition:rig.group.position.clone(),targetYaw:rig.group.rotation.y,health:Number(data.health??100)};
      this.players.set(data.id,remote);
    }
    remote.username=data.username||remote.username;
    remote.targetPosition.set(data.position?.x||0,data.position?.y||1.65,data.position?.z||18);
    remote.targetYaw=Number(data.yaw)||0;
    remote.health=Number(data.health??100);
    this.updateLabel(remote);
  }

  updateLabel(remote){
    const ctx=remote.labelTexture.image?.getContext?.('2d');
    if(!ctx) return;
    ctx.clearRect(0,0,512,96);
    ctx.font='700 34px Arial';
    ctx.textAlign='center';
    ctx.textBaseline='middle';
    ctx.fillStyle='#ffffff';
    ctx.shadowColor='rgba(0,0,0,.9)';
    ctx.shadowBlur=10;
    ctx.fillText(remote.username||'PLAYER',256,48);
    remote.labelTexture.needsUpdate=true;
  }

  handle(msg){
    if(msg.type==='welcome'){
      this.id=msg.id;
      return;
    }
    if(msg.type==='state'){
      for(const p of msg.players||[]) this.addPlayer(p);
      return;
    }
    if(msg.type==='player_joined'||msg.type==='player_updated'||msg.type==='player_respawned'){
      this.addPlayer(msg.player);
      return;
    }
    if(msg.type==='player_left'){
      const remote=this.players.get(msg.id);
      if(remote) this.scene.remove(remote.group);
      this.players.delete(msg.id);
      return;
    }
    if(msg.type==='player_shot'){
      const origin=new this.THREE.Vector3(msg.origin?.x||0,msg.origin?.y||0,msg.origin?.z||0);
      const direction=new this.THREE.Vector3(msg.direction?.x||0,msg.direction?.y||0,msg.direction?.z||-1);
      this.onRemoteShot?.(origin,direction,msg);
      return;
    }
    if(msg.type==='player_hit' && msg.targetId===this.id){
      this.damagePlayer(Number(msg.damage)||34);
      return;
    }
  }

  raycastPlayers(origin,direction,maxDistance){
    if(!this.connected) return null;
    const raycaster=new this.THREE.Raycaster(origin,direction,0,maxDistance);
    const meshes=[];
    for(const remote of this.players.values()){
      if(remote.health<=0) continue;
      remote.group.traverse(o=>{if(o.isMesh) meshes.push(o);});
    }
    const hit=raycaster.intersectObjects(meshes,false)[0];
    if(!hit) return null;

    let target=null;
    for(const [id,remote] of this.players){
      let found=false;
      remote.group.traverse(o=>{if(o===hit.object) found=true;});
      if(found){target={id,remote};break;}
    }
    if(!target) return null;
    return {distance:hit.distance,point:hit.point.clone(),targetId:target.id,headshot:hit.point.y>target.remote.group.position.y+1.75};
  }

  sendShot(origin,direction,hit){
    if(!this.connected) return;
    this.socket.send(JSON.stringify({
      type:'shoot',
      origin:{x:origin.x,y:origin.y,z:origin.z},
      direction:{x:direction.x,y:direction.y,z:direction.z},
      hitId:hit?.targetId||null,
      hit:Boolean(hit),
      damage:hit?.headshot?70:34,
    }));
    if(hit){
      this.socket.send(JSON.stringify({
        type:'hit',
        targetId:hit.targetId,
        damage:hit.headshot?70:34,
      }));
    }
  }

  sendRespawn(){
    if(!this.connected) return;
    this.socket.send(JSON.stringify({type:'respawn'}));
  }

  sendState(now,yaw,health){
    if(!this.connected || now-this.lastSend<50) return;
    this.lastSend=now;
    this.socket.send(JSON.stringify({
      type:'update',
      position:{
        x:this.localPlayer.position.x,
        y:this.localPlayer.position.y,
        z:this.localPlayer.position.z,
      },
      yaw,
      health,
    }));
  }

  update(dt){
    for(const remote of this.players.values()){
      remote.group.position.lerp(remote.targetPosition,1-Math.exp(-18*dt));
      remote.group.rotation.y=this.THREE.MathUtils.damp(remote.group.rotation.y,remote.targetYaw,18,dt);
    }
  }
}
