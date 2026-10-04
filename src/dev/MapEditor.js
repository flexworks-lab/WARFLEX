import { TransformControls } from 'three/addons/controls/TransformControls.js';

export class MapEditor {
  constructor({ THREE, scene, camera, renderer, root, fallbackRoot, obstacles, onPlaytest }) {
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.root = root;
    this.fallbackRoot = fallbackRoot;
    this.obstacles = obstacles;
    this.onPlaytest = onPlaytest;
    this.enabled = new URLSearchParams(location.search).get('editor') === 'WARFLEX_DEV';
    this.selected = new Set();
    this.keys = new Set();
    this.speed = 18;
    this.mapName = 'Untitled Map';
    this.sensitivity = 0.0022;
    this.snap = 0.5;
    this.rotSnap = 15;
    this.transform = 'translate';
    this.look = false;
    this.pan = false;
    this.directDragging = false;
    this.dragPlane = new this.THREE.Plane();
    this.dragOffset = new this.THREE.Vector3();
    this.dragPoint = new this.THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.euler = new THREE.Euler(0,0,0,'YXZ');
    this.transformControls = new TransformControls(camera, renderer.domElement);
    this.transformControls.setMode('translate');
    this.transformControls.setSpace('world');
    this.transformControls.setSize(0.9);
    this.transformControls.addEventListener('dragging-changed', (e) => { this.transformDragging = Boolean(e.value); });
    this.transformControls.addEventListener('objectChange', () => { this.applySnapToSelection(); this.refreshInspector(); this.refreshColliders(); this.dirty=true; });
    this.gizmo = this.transformControls.getHelper();
    this.gizmo.visible = false;
    scene.add(this.gizmo);
    this.grid = new THREE.GridHelper(260,520,0x54707d,0x25343b);
    this.grid.position.y = 0.01;
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.26;
    scene.add(this.grid);
    this.boundDown = this.onDown.bind(this);
    this.boundMove = this.onMove.bind(this);
    this.boundUp = this.onUp.bind(this);
    this.boundWheel = this.onWheel.bind(this);
    this.boundKeyDown = this.onKeyDown.bind(this);
    this.boundKeyUp = this.onKeyUp.bind(this);
    if (this.enabled) this.open();
  }

  open() {
    this.mapSyncHandler=()=>{this.refreshMapInfo();this.refreshHierarchy();}; window.addEventListener('storage',this.mapSyncHandler); window.addEventListener('warfex-map-library-changed',this.mapSyncHandler);
    this.root.visible = true;
    this.fallbackRoot.visible = false;
    this.grid.visible = true;
    this.renderer.domElement.style.display = 'block';
    this.camera.position.set(22,10,62);
    this.camera.rotation.order = 'YXZ';
    this.lookAt(new this.THREE.Vector3(0,1.4,0));
    window.addEventListener('pointerdown',this.boundDown);
    window.addEventListener('pointermove',this.boundMove);
    window.addEventListener('pointerup',this.boundUp);
    window.addEventListener('wheel',this.boundWheel,{passive:false});
    window.addEventListener('keydown',this.boundKeyDown);
    window.addEventListener('keyup',this.boundKeyUp);
    window.addEventListener('contextmenu',e=>{if(this.enabled&&!e.target?.closest?.('#warfex-editor'))e.preventDefault();});
    this.createUI();
    this.ensureRequiredSpawns();
    this.refreshHierarchy();
    this.refreshInspector();
    this.refreshMapInfo();
    this.syncCurrentMapToServer();
    this.toast('WARFLEX EDITOR ACTIVE');
    document.body.classList.add('warfex-editor-active');
    document.querySelector('#hud')?.classList.add('hidden');
    document.querySelector('#start-screen')?.classList.add('hidden');
    document.querySelector('#pause-screen')?.classList.add('hidden');
    document.querySelector('#game-over')?.classList.add('hidden');
    document.querySelector('.gun-viewport-canvas')?.style.setProperty('display','none');
  }

  close() {
    window.removeEventListener('storage',this.mapSyncHandler); window.removeEventListener('warfex-map-library-changed',this.mapSyncHandler);
    this.enabled=false;
    this.keys.clear();
    this.gizmo.visible=false;
    this.transformControls.detach();
    this.grid.visible=false;
    this.root.visible=false;
    this.fallbackRoot.visible=true;
    this.destroyUI();
    document.body.classList.remove('warfex-editor-active');
  }

  createUI() {
    if (this.ui) return;
    const panel = document.createElement('div');
    panel.id = 'warfex-editor';

    const top = document.createElement('div');
    top.className = 'we-topbar';
    const title = document.createElement('div');
    title.innerHTML = '<strong>WARFLEX MAP EDITOR</strong><span> DEV BUILD // CUSTOM MAP WORKSPACE</span>';
    const actions = document.createElement('div');
    actions.className = 'we-actions';
    const addAction = (label, action) => { const b=document.createElement('button'); b.textContent=label; b.dataset.a=action; b.addEventListener('click',()=>this.action(action)); actions.appendChild(b); };
    [['SAVE','save'],['LOAD','load'],['EXPORT JSON','export'],['IMPORT JSON','import'],['PLAYTEST','play'],['EXIT','exit']].forEach(([label,action])=>addAction(label,action));
    top.append(title, actions);

    const left = document.createElement('aside');
    left.className = 'we-left';
    const heading = (text) => { const h=document.createElement('h4'); h.textContent=text; left.appendChild(h); };
    const grid = () => { const g=document.createElement('div'); g.className='we-grid'; left.appendChild(g); return g; };
    const addButton = (parent,label,fn) => { const b=document.createElement('button'); b.textContent=label; b.addEventListener('click',fn); parent.appendChild(b); };

    heading('PARTS');
    const parts=grid();
    [['BOX','box'],['WALL','wall'],['WORLD WALL','worldWall'],['FLOOR','floor'],['PILLAR','pillar'],['BEAM','beam'],['CYLINDER','cylinder'],['SPHERE','sphere'],['RAMP','ramp'],['SPAWN POINT','spawnPoint'],['ENEMY SPAWN','enemySpawn']].forEach(([label,type])=>addButton(parts,label,()=>this.addPart(type)));
    heading('PREBUILDS');
    const prefabs=grid();
    [['ROOM','room'],['WAREHOUSE','warehouse'],['BUNKER','bunker'],['CONTAINER','container'],['CONTAINER STACK','containerStack'],['GATE','gate'],['TOWER','tower'],['HESCO','hesco'],['ROAD','road'],['TANK PAD','tankPad'],['CHECKPOINT','checkpoint'],['FUEL TANK','fuel']].forEach(([label,type])=>addButton(prefabs,label,()=>this.addPrefab(type)));
    heading('TOOLS');
    const tools=grid();
    [['MOVE','translate'],['ROTATE','rotate'],['SCALE','scale']].forEach(([label,type])=>addButton(tools,label,()=>this.setTool(type)));
    [['DUPLICATE','duplicate'],['GROUP','group'],['UNGROUP','ungroup'],['FOCUS','focus'],['DELETE','delete']].forEach(([label,action])=>addButton(tools,label,()=>this.action(action)));

    heading('SETTINGS');
    const options=document.createElement('div'); options.className='we-options'; left.appendChild(options);
    const numberSetting=(label,id,value,min,max,step,fn)=>{ const row=document.createElement('label'); row.textContent=label+' '; const input=document.createElement('input'); input.id=id; input.type='number'; input.value=String(value); input.min=String(min); input.max=String(max); input.step=String(step); input.addEventListener('change',()=>{const n=Number(input.value);if(Number.isFinite(n))fn(n);}); row.appendChild(input); options.appendChild(row); };
    numberSetting('POSITION SNAP','#we-snap',this.snap,0.05,20,0.05,(v)=>{this.snap=Math.max(0.05,v);this.refreshStatus();});
    numberSetting('ROTATION SNAP','#we-rot',this.rotSnap,1,90,1,(v)=>{this.rotSnap=Math.max(1,v);this.refreshStatus();});
    numberSetting('CAMERA SPEED','#we-speed',this.speed,1,200,1,(v)=>{this.speed=this.THREE.MathUtils.clamp(v,1,200);this.refreshStatus();});
    const checkSetting=(label,id,checked,fn)=>{const row=document.createElement('label'); const span=document.createElement('span'); span.textContent=label; const input=document.createElement('input'); input.id=id; input.type='checkbox'; input.checked=checked; input.addEventListener('change',()=>fn(Boolean(input.checked))); row.append(span,input); options.appendChild(row);};
    checkSetting('SHOW GRID','we-grid',this.grid.visible,(v)=>{this.grid.visible=v;});
    checkSetting('SHOW BUILT-IN MAP','we-built',this.fallbackRoot.visible,(v)=>{this.fallbackRoot.visible=v;});
    checkSetting('COLLISION PREVIEW','we-collision',true,(v)=>{this.collisionPreview=v;this.refreshColliders();});

    heading('MAP');
    const mapBox=document.createElement('div'); mapBox.className='we-map-tools'; left.appendChild(mapBox);
    const mapName=document.createElement('input'); mapName.id='we-map-name'; mapName.placeholder='Map name'; mapName.value=this.mapName||'Untitled Map'; mapName.className='we-name'; mapBox.appendChild(mapName);
    const mapRow=document.createElement('div'); mapRow.className='we-grid'; mapBox.appendChild(mapRow);
    [['SAVE AS MAP','saveMapRecord'],['SET CURRENT','setCurrentMap'],['ADD TO SELECTION','addMapSelection'],['HIDE MAP','hideMap'],['DELETE MAP','deleteMap']].forEach(([label,action])=>addButton(mapRow,label,()=>this.mapAction(action)));
    const mapInfo=document.createElement('div'); mapInfo.id='we-map-info'; mapInfo.className='we-help'; mapBox.appendChild(mapInfo);

    const help=document.createElement('div'); help.className='we-help';
    help.innerHTML='<b>CAMERA</b><span>WASD move • Q/E vertical • RMB look • MMB pan • wheel speed</span><b>EDITING</b><span>Click select • Shift-click multi • Ctrl+D duplicate • Delete remove</span><span>G group • F focus • Alt+W move • Alt+E rotate • Alt+R scale</span><span>Arrow keys nudge • PageUp/PageDown vertical</span>';
    left.appendChild(help);

    const right=document.createElement('aside'); right.className='we-right';
    const h1=document.createElement('h4'); h1.textContent='HIERARCHY'; right.appendChild(h1);
    const tree=document.createElement('div'); tree.id='we-tree'; right.appendChild(tree);
    const h2=document.createElement('h4'); h2.textContent='INSPECTOR'; right.appendChild(h2);
    const inspect=document.createElement('div'); inspect.id='we-inspect'; right.appendChild(inspect);
    const h3=document.createElement('h4'); h3.textContent='STATUS'; right.appendChild(h3);
    const status=document.createElement('div'); status.id='we-status'; status.className='we-status'; right.appendChild(status);
    const file=document.createElement('input'); file.id='we-file'; file.type='file'; file.accept='application/json'; file.hidden=true; file.addEventListener('change',()=>{this.importFile(file.files?.[0]||null);file.value='';}); right.appendChild(file);
    const toast=document.createElement('div'); toast.id='we-toast'; toast.className='we-toast'; right.appendChild(toast);

    panel.append(top,left,right);
    document.body.appendChild(panel);
    this.ui=panel;
  }
  destroyUI(){ this.ui?.remove(); this.ui=null; }

  material(color=0x596872){ return new this.THREE.MeshStandardMaterial({color,roughness:.78,metalness:.16}); }

  primitive(type,name){
    const T=this.THREE; let g;
    if(type==='wall') g=new T.BoxGeometry(4,2.4,.35);
    else if(type==='floor') g=new T.BoxGeometry(6,.18,6);
    else if(type==='cylinder') g=new T.CylinderGeometry(1,1,2,24);
    else if(type==='sphere') g=new T.SphereGeometry(1.2,24,16);
    else if(type==='ramp') g=new T.BoxGeometry(4,2.2,5);
    else if(type==='worldWall') g=new T.BoxGeometry(1,10,36);
    else if(type==='spawnPoint') g=new T.CylinderGeometry(.55,.55,.12,24);
    else if(type==='enemySpawn') g=new T.CylinderGeometry(.48,.48,.12,6);
    else if(type==='pillar') g=new T.BoxGeometry(.55,4,.55);
    else if(type==='beam') g=new T.BoxGeometry(5,.35,.35);
    else g=new T.BoxGeometry(2,2,2);
    const markerMat = type==='spawnPoint' ? new T.MeshStandardMaterial({color:0x2dd4bf,emissive:0x0d8f7d,emissiveIntensity:1.5,roughness:.35,metalness:.1}) : type==='enemySpawn' ? new T.MeshStandardMaterial({color:0xff5a6b,emissive:0x8f1827,emissiveIntensity:1.5,roughness:.35,metalness:.1}) : type==='worldWall' ? new T.MeshStandardMaterial({color:0x56616a,roughness:.8,metalness:.2}) : null;
    const m=new T.Mesh(g,markerMat||this.material()); m.name=name||type.toUpperCase(); m.castShadow=true; m.receiveShadow=true;
    m.userData.editorSelectable=true; m.userData.editorSpec={type:type,color:m.material.color.getHex(),roughness:m.material.roughness,metalness:m.material.metalness,solid:type!=='sphere'&&type!=='spawnPoint'&&type!=='enemySpawn',spawnType:(type==='spawnPoint'?'player':type==='enemySpawn'?'enemy':null),worldWall:type==='worldWall'};
    if(type==='ramp') m.rotation.z=-.22; return m;
  }

  place(object){ const d=new this.THREE.Vector3(); this.camera.getWorldDirection(d); object.position.copy(this.camera.position).addScaledVector(d,8); object.position.y=Math.max(.1,object.position.y); this.snapObject(object); }
  snapObject(o){ if(!this.snap) return; o.position.x=Math.round(o.position.x/this.snap)*this.snap; o.position.y=Math.round(o.position.y/this.snap)*this.snap; o.position.z=Math.round(o.position.z/this.snap)*this.snap; }

  addPart(type){ const o=this.primitive(type); this.root.add(o); this.place(o); this.selectOnly(o); this.refreshAll(); this.toast('ADDED '+type.toUpperCase()); }

  addPrefab(type){
    const G=this.THREE.Group; const group=new G(); group.name=type.toUpperCase(); group.userData.editorSelectable=true; group.userData.editorPrefab=type;
    const add=(kind,p,s=1,r=0)=>{ const o=this.primitive(kind); o.position.set(...p); o.scale.setScalar(s); o.rotation.y=r; group.add(o); return o; };
    if(type==='room'){ add('floor',[0,0,0]); add('wall',[0,1.2,-3]); add('wall',[0,1.2,3],1,Math.PI); add('wall',[-3,1.2,0],1,Math.PI/2); add('wall',[3,1.2,0],1,Math.PI/2); }
    if(type==='warehouse'){ add('floor',[0,0,0],2); add('wall',[0,2.4,-6],2); add('wall',[0,2.4,6],2,Math.PI); add('wall',[-6,2.4,0],2,Math.PI/2); add('wall',[6,2.4,0],2,Math.PI/2); add('beam',[0,5,0],2); }
    if(type==='bunker'){ add('floor',[0,0,0],1.5); add('wall',[0,1.2,-2.2],1.4); add('wall',[-2.1,1.2,0],1.4,Math.PI/2); add('wall',[2.1,1.2,0],1.4,Math.PI/2); add('pillar',[-1.7,2.2,-1.6]); add('pillar',[1.7,2.2,-1.6]); }
    if(type==='container'){ const o=add('box',[0,1.3,0]); o.scale.set(6,1.25,1.2); for(let x=-5;x<=5;x++) add('beam',[x*.95,1.3,1.23],.75); }
    if(type==='containerStack'){ for(const y of [1.3,3.9]){ const o=add('box',[0,y,0]); o.scale.set(6,1.25,1.2); } }
    if(type==='gate'){ add('pillar',[-2.6,2.2,0]); add('pillar',[2.6,2.2,0]); add('beam',[0,4.1,0],1.1); add('wall',[0,2,.6]); }
    if(type==='tower'){ for(const p of [[-1.6,2.1,-1.6],[1.6,2.1,-1.6],[-1.6,2.1,1.6],[1.6,2.1,1.6]]) add('pillar',p); add('floor',[0,4.2,0],.8); add('box',[0,5,0],1.2); }
    if(type==='hesco'){ for(let i=-4;i<=4;i++) add('box',[i*1.1,.6,0],.7); }
    if(type==='road'){ add('floor',[0,0,0],3); for(let x=-7;x<=7;x+=3.5) add('beam',[x,.11,0],2.6); }
    if(type==='tankPad'){ add('floor',[0,0,0],2.2); add('box',[0,.45,0],1.5); add('pillar',[-4,2.3,-4],1.4); add('pillar',[4,2.3,-4],1.4); }
    if(type==='checkpoint'){ add('wall',[-3.2,1.2,0],1,Math.PI/2); add('wall',[3.2,1.2,0],1,Math.PI/2); add('beam',[0,2.8,0],1.5); add('box',[0,.55,0]); }
    if(type==='fuel'){ add('cylinder',[0,3,0],2.1,Math.PI/2); for(const p of [[-2,1.2,-2],[2,1.2,-2],[-2,1.2,2],[2,1.2,2]]) add('pillar',p); }
    this.root.add(group); this.place(group); this.selectOnly(group); this.refreshAll(); this.toast('PLACED '+type.toUpperCase());
  }

  selectOnly(o){ this.selected.clear(); if(o)this.selected.add(o); this.attachGizmo(); this.refreshAll(); }
  applySnapToSelection(){ if(!this.snap||!this.selected.size)return; for(const o of this.selected){if(this.transform==='translate')this.snapObject(o); else if(this.transform==='rotate'){const q=this.rotSnap*Math.PI/180;o.rotation.x=Math.round(o.rotation.x/q)*q;o.rotation.y=Math.round(o.rotation.y/q)*q;o.rotation.z=Math.round(o.rotation.z/q)*q;} } }
  markDirty(){this.dirty=true; this.refreshStatus();}
  toggle(o){ if(this.selected.has(o))this.selected.delete(o); else this.selected.add(o); this.attachGizmo(); this.refreshAll(); }
  clear(){ this.selected.clear(); this.gizmo.visible=false; this.transformControls.detach(); this.refreshAll(); }
  selectable(o){ while(o&&o!==this.root){ if(o.userData.editorSelectable)return o; o=o.parent; } return null; }

  onDown(e){
    if(!this.enabled||e.target?.closest?.('#warfex-editor'))return;
    if(e.button===2){this.look=true;e.preventDefault();e.stopPropagation();return;}
    if(e.button===1){this.pan=true;e.preventDefault();e.stopPropagation();return;}
    if(e.button!==0)return;
    const r=this.renderer.domElement.getBoundingClientRect();
    this.pointer.x=((e.clientX-r.left)/r.width)*2-1; this.pointer.y=-((e.clientY-r.top)/r.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hit=this.raycaster.intersectObjects(this.root.children,true).map(x=>this.selectable(x.object)).find(Boolean);
    if(!hit){this.clear();e.preventDefault();e.stopPropagation();return;}
    if(e.shiftKey){this.toggle(hit);e.preventDefault();e.stopPropagation();return;}
    if(!this.selected.has(hit))this.selectOnly(hit);
    if(this.transform==='translate' && this.selected.size===1){
      const o=hit;
      const normal=this.camera.getWorldDirection(new this.THREE.Vector3()).normalize();
      this.dragPlane.setFromNormalAndCoplanarPoint(normal,o.getWorldPosition(new this.THREE.Vector3()));
      if(this.raycaster.ray.intersectPlane(this.dragPlane,this.dragPoint)){this.dragOffset.copy(o.position).sub(this.dragPoint);this.directDragging=true;this.transformDragging=true;}
    }
    e.preventDefault();e.stopPropagation();
  }
  onMove(e){
    if(!this.enabled)return;
    if(this.directDragging && this.selected.size===1){
      const r=this.renderer.domElement.getBoundingClientRect();
      this.pointer.x=((e.clientX-r.left)/r.width)*2-1; this.pointer.y=-((e.clientY-r.top)/r.height)*2+1;
      this.raycaster.setFromCamera(this.pointer,this.camera);
      if(this.raycaster.ray.intersectPlane(this.dragPlane,this.dragPoint)){
        const o=[...this.selected][0];o.position.copy(this.dragPoint).add(this.dragOffset);this.snapObject(o);this.markDirty();this.refreshInspector();this.refreshColliders();
      }
      e.preventDefault();e.stopPropagation();return;
    }
    if(this.transformDragging)return;
    if(this.look){this.euler.setFromQuaternion(this.camera.quaternion);this.euler.y-=e.movementX*this.sensitivity;this.euler.x-=e.movementY*this.sensitivity;this.euler.x=this.THREE.MathUtils.clamp(this.euler.x,-Math.PI*.49,Math.PI*.49);this.camera.quaternion.setFromEuler(this.euler);e.preventDefault();e.stopPropagation();return;}
    if(this.pan){const right=new this.THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);const up=new this.THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);this.camera.position.addScaledVector(right,-e.movementX*.018*this.speed);this.camera.position.addScaledVector(up,e.movementY*.018*this.speed);e.preventDefault();e.stopPropagation();}
  }
  onUp(e){if(e.button===0){this.directDragging=false;this.transformDragging=false;}if(e.button===2)this.look=false;if(e.button===1)this.pan=false;}
  onWheel(e){if(!this.enabled||e.target?.closest?.('#warfex-editor'))return;this.speed=this.THREE.MathUtils.clamp(this.speed+(e.deltaY<0?2:-2),1,200);const i=this.ui?.querySelector('#we-speed');if(i)i.value=this.speed;e.preventDefault();e.stopPropagation();}

  onKeyDown(e){
    if(!this.enabled)return;
    this.keys.add(e.code);
    if(e.code==='Escape'){this.clear();e.preventDefault();e.stopPropagation();return;}
    if((e.ctrlKey||e.metaKey)&&e.code==='KeyD'){this.duplicate();e.preventDefault();e.stopPropagation();return;}
    if(e.code==='Delete'||e.code==='Backspace'){this.delete();e.preventDefault();e.stopPropagation();return;}
    if(e.code==='KeyG'){this.group();e.preventDefault();e.stopPropagation();return;}
    if(e.code==='KeyF'){this.focus();e.preventDefault();e.stopPropagation();return;}
    if(e.altKey&&e.code==='KeyW'){this.setTool('translate');e.preventDefault();e.stopPropagation();return;}
    if(e.altKey&&e.code==='KeyE'){this.setTool('rotate');e.preventDefault();e.stopPropagation();return;}
    if(e.altKey&&e.code==='KeyR'){this.setTool('scale');e.preventDefault();e.stopPropagation();return;}
    if(e.code==='ArrowUp'){this.nudge(0,this.snap,0);e.preventDefault();e.stopPropagation();return;}
    if(e.code==='ArrowDown'){this.nudge(0,-this.snap,0);e.preventDefault();e.stopPropagation();return;}
    if(e.code==='ArrowLeft'){this.nudge(-this.snap,0,0);e.preventDefault();e.stopPropagation();return;}
    if(e.code==='ArrowRight'){this.nudge(this.snap,0,0);e.preventDefault();e.stopPropagation();return;}
    if(e.code==='PageUp'){this.nudge(0,0,this.snap);e.preventDefault();e.stopPropagation();return;}
    if(e.code==='PageDown'){this.nudge(0,0,-this.snap);e.preventDefault();e.stopPropagation();return;}
    e.preventDefault();e.stopPropagation();
  }
  onKeyUp(e){if(!this.enabled)return;this.keys.delete(e.code);e.preventDefault();e.stopPropagation();}

  update(dt){
    if(!this.enabled)return;
    const T=this.THREE; const f=new T.Vector3(); this.camera.getWorldDirection(f); f.y=0; if(f.lengthSq()>.0001)f.normalize();
    const right=new T.Vector3(-f.z,0,f.x); let v=this.speed;
    if(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'))v*=4;
    if(this.keys.has('ControlLeft')||this.keys.has('ControlRight'))v*=.25;
    const d=new T.Vector3(); if(this.keys.has('KeyW'))d.add(f);if(this.keys.has('KeyS'))d.sub(f);if(this.keys.has('KeyD'))d.add(right);if(this.keys.has('KeyA'))d.sub(right);if(this.keys.has('KeyE'))d.y+=1;if(this.keys.has('KeyQ'))d.y-=1;
    if(d.lengthSq()>.001){d.normalize().multiplyScalar(v*dt);this.camera.position.add(d);}
  }

  setTool(mode){this.transform=mode;if(this.selected.size===1){this.transformControls.setMode(mode);this.attachGizmo();}this.refreshStatus();}
  attachGizmo(){if(this.selected.size===1){const o=[...this.selected][0];this.transformControls.attach(o);this.transformControls.setMode(this.transform);this.gizmo.visible=true;}else{this.transformControls.detach();this.gizmo.visible=false;}}
  nudge(dx,dy,dz){for(const o of this.selected){o.position.x+=dx;o.position.y+=dy;o.position.z+=dz;this.snapObject(o);}this.refreshAll();}
  duplicate(){const out=[];for(const o of this.selected){const c=o.clone(true);c.name=(o.name||'PART')+'_COPY';c.position.x+=this.snap;c.position.z+=this.snap;c.traverse(x=>{if(x.isMesh)x.userData.editorSelectable=true;});this.root.add(c);out.push(c);}this.selected.clear();out.forEach(x=>this.selected.add(x));this.attachGizmo();this.refreshAll();this.toast('DUPLICATED');}
  delete(){for(const o of this.selected){o.removeFromParent();}this.clear();this.toast('DELETED');}
  group(){if(this.selected.size<2){this.toast('SELECT 2+ PARTS');return;}const g=new this.THREE.Group();g.name='GROUP';g.userData.editorSelectable=true;this.root.add(g);const first=[...this.selected][0];first.getWorldPosition(g.position);for(const o of [...this.selected])g.attach(o);this.selectOnly(g);this.refreshColliders();this.toast('GROUP CREATED');}
  ungroup(){const children=[];for(const g of [...this.selected]){if(!g.isGroup||!g.children.length)continue;for(const c of [...g.children]){this.root.attach(c);children.push(c);}g.removeFromParent();}this.clear();children.forEach(c=>this.selected.add(c));this.attachGizmo();this.refreshAll();}
  focus(){if(!this.selected.size)return;const b=new this.THREE.Box3();for(const o of this.selected)b.expandByObject(o);const c=b.getCenter(new this.THREE.Vector3());const s=b.getSize(new this.THREE.Vector3());const dir=new this.THREE.Vector3(.5,.3,.8).normalize();this.camera.position.copy(c).addScaledVector(dir,Math.max(5,s.length()*.9));this.lookAt(c);}
  lookAt(t){this.camera.lookAt(t);this.euler.setFromQuaternion(this.camera.quaternion);}

  refreshColliders(){
    for(let i=this.obstacles.length-1;i>=0;i--)if(this.obstacles[i]?.userData?.editorCollider)this.obstacles.splice(i,1);
    this.root.updateMatrixWorld(true); const T=this.THREE;
    this.root.traverse(o=>{if(!o.isMesh||o.userData.editorSpec?.solid!==true||!o.visible)return;const b=new T.Box3().setFromObject(o);const s=b.getSize(new T.Vector3());const c=b.getCenter(new T.Vector3());const col=new T.Mesh(new T.BoxGeometry(Math.max(.05,s.x),Math.max(.05,s.y),Math.max(.05,s.z)));col.visible=false;col.position.copy(c);col.userData.editorCollider=true;this.obstacles.push(col);});
  }

  refreshHierarchy(){const box=this.ui?.querySelector('#we-tree');if(!box)return;box.innerHTML='';const visit=(o,d)=>{const row=document.createElement('button');row.className='we-row'+(this.selected.has(o)?' selected':'');row.style.paddingLeft=(8+d*14)+'px';row.textContent=o.name||'PART';row.onclick=e=>e.shiftKey?this.toggle(o):this.selectOnly(o);box.appendChild(row);for(const c of o.children)if(c.userData.editorSelectable||c.userData.editorSpec||c.isGroup)visit(c,d+1);};for(const c of this.root.children)visit(c,0);}
  field(parent,label,value,fn){const row=document.createElement('label');row.className='we-field';row.innerHTML='<span>'+label+'</span><input type="number" step="0.05">';const input=row.querySelector('input');input.value=Number(value.toFixed(3));input.onchange=()=>{const n=Number(input.value);if(Number.isFinite(n)){fn(n);this.refreshColliders();this.refreshInspector();}};parent.appendChild(row);}
  refreshInspector(){const panel=this.ui?.querySelector('#we-inspect');if(!panel)return;panel.innerHTML='';if(this.selected.size!==1){panel.innerHTML='<div class="we-empty">'+(this.selected.size?this.selected.size+' PARTS SELECTED':'SELECT A PART')+'</div>';return;}const o=[...this.selected][0];const name=document.createElement('input');name.className='we-name';name.value=o.name||'PART';name.onchange=()=>{o.name=name.value||'PART';this.refreshHierarchy();};panel.appendChild(name);['x','y','z'].forEach(a=>this.field(panel,'POS '+a.toUpperCase(),o.position[a],v=>o.position[a]=v));['x','y','z'].forEach(a=>this.field(panel,'ROT '+a.toUpperCase(),this.THREE.MathUtils.radToDeg(o.rotation[a]),v=>o.rotation[a]=this.THREE.MathUtils.degToRad(v)));['x','y','z'].forEach(a=>this.field(panel,'SCALE '+a.toUpperCase(),o.scale[a],v=>o.scale[a]=v));const solid=document.createElement('label');solid.className='we-check';solid.innerHTML='<input type="checkbox"> SOLID / PLAYER COLLISION';const chk=solid.querySelector('input');chk.checked=o.userData.editorSpec?.solid===true;chk.onchange=()=>{o.traverse(c=>{if(c.userData.editorSpec)c.userData.editorSpec.solid=chk.checked;});this.refreshColliders();};panel.appendChild(solid);}
  refreshStatus(){const s=this.ui?.querySelector('#we-status');if(!s)return;s.innerHTML='PARTS <b>'+this.count()+'</b><br>SELECTED <b>'+this.selected.size+'</b><br>TOOL <b>'+this.transform.toUpperCase()+'</b><br>CAM <b>'+this.speed.toFixed(1)+'</b>';}
  count(){let n=0;this.root.traverse(o=>{if(o.userData.editorSpec)n++;});return n;}
  refreshAll(){this.refreshHierarchy();this.refreshInspector();this.refreshStatus();this.refreshColliders();}

  action(a){if(a==='save')this.save();if(a==='load')this.load();if(a==='export')this.export();if(a==='import')this.ui?.querySelector('#we-file')?.click();if(a==='duplicate')this.duplicate();if(a==='group')this.group();if(a==='ungroup')this.ungroup();if(a==='delete')this.delete();if(a==='focus')this.focus();if(a==='exit')this.close();if(a==='play'){this.save();this.onPlaytest?.();}}
  serializeNode(o){return{type:o.isGroup?'group':'mesh',name:o.name,position:o.position.toArray(),rotation:[o.rotation.x,o.rotation.y,o.rotation.z],scale:o.scale.toArray(),spec:o.userData.editorSpec||null,children:o.children.filter(c=>c.userData.editorSelectable||c.userData.editorSpec||c.isGroup).map(c=>this.serializeNode(c))};}
  serializeMap(){return{version:1,savedAt:new Date().toISOString(),objects:this.root.children.map(c=>this.serializeNode(c))};}
  save(){localStorage.setItem('WARFLEX_CUSTOM_MAP',JSON.stringify(this.serializeMap()));this.toast('SAVED TO BROWSER');}
  load(){const raw=localStorage.getItem('WARFLEX_CUSTOM_MAP');if(!raw){this.toast('NO SAVED MAP');return;}try{this.loadJson(JSON.parse(raw));this.toast('MAP LOADED');}catch(e){console.error(e);this.toast('LOAD FAILED');}}
  export(){const blob=new Blob([JSON.stringify(this.serializeMap(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='WARFLEX-custom-map.json';a.click();URL.revokeObjectURL(url);this.toast('JSON EXPORTED');}
  async importFile(file){if(!file)return;try{this.loadJson(JSON.parse(await file.text()));this.toast('MAP IMPORTED');}catch(e){console.error(e);this.toast('IMPORT FAILED');}}
  deserializeNode(n){let o;if(n.type==='group'){o=new this.THREE.Group();o.userData.editorSelectable=true;}else{o=this.primitive(n.spec?.type||'box',n.name);if(n.spec?.color!==undefined)o.material.color.setHex(n.spec.color);o.userData.editorSpec=n.spec||o.userData.editorSpec;}o.name=n.name||'PART';o.position.fromArray(n.position||[0,0,0]);o.rotation.set(...(n.rotation||[0,0,0]));o.scale.fromArray(n.scale||[1,1,1]);for(const c of n.children||[])o.add(this.deserializeNode(c));return o;}
  loadJson(data){for(const c of [...this.root.children])c.removeFromParent();for(const n of data.objects||[])this.root.add(this.deserializeNode(n));this.clear();this.refreshAll();}
  broadcastMapLibrary(list){try{localStorage.setItem('WARFLEX_MAP_SYNC',JSON.stringify({version:Date.now(),maps:list}));}catch{} window.dispatchEvent(new CustomEvent('warfex-map-library-changed',{detail:list}));}
  getMapLibrary(){try{const raw=localStorage.getItem('WARFLEX_MAP_LIBRARY');const data=raw?JSON.parse(raw):[];return Array.isArray(data)?data:[];}catch{return [];}}
  setMapLibrary(list){localStorage.setItem('WARFLEX_MAP_LIBRARY',JSON.stringify(list)); this.broadcastMapLibrary(list);}
  syncCurrentMapToServer(){ /* same-origin shared state hook; hosted deployments can replace this with a backend endpoint */ }
  hasSpawn(type){let found=false;this.root.traverse(o=>{if(o.userData?.editorSpec?.spawnType===type)found=true;});return found;}
  validateMap(){const missing=[];if(!this.hasSpawn('player'))missing.push('PLAYER SPAWN');if(!this.hasSpawn('enemy'))missing.push('ENEMY SPAWN');return missing;}
  ensureRequiredSpawns(){if(!this.hasSpawn('player')){const o=this.primitive('spawnPoint','PLAYER SPAWN');o.position.set(0,.08,8);this.root.add(o);}if(!this.hasSpawn('enemy')){const o=this.primitive('enemySpawn','ENEMY SPAWN');o.position.set(0,.08,-18);this.root.add(o);}}
  mapAction(action){
    const input=this.ui?.querySelector('#we-map-name');
    const name=(input?.value||this.mapName||'Untitled Map').trim()||'Untitled Map';
    this.mapName=name;
    if(action==='saveMapRecord'){
      const missing=this.validateMap();if(missing.length){this.toast('MISSING: '+missing.join(' + '));return;}
      const list=this.getMapLibrary(); const existing=list.find(m=>m.name.toLowerCase()===name.toLowerCase());
      const record={id:existing?.id||('custom-'+Date.now()),name,hidden:existing?.hidden===true,playable:true,updatedAt:new Date().toISOString(),data:this.serializeMap()};
      if(existing) Object.assign(existing,record); else list.push(record); this.setMapLibrary(list); localStorage.setItem('WARFLEX_CUSTOM_MAP',JSON.stringify(record.data)); this.toast('MAP SAVED: '+name); this.refreshMapInfo(); return;
    }
    const list=this.getMapLibrary(); const record=list.find(m=>m.name.toLowerCase()===name.toLowerCase());
    if(!record){this.toast('SAVE MAP FIRST');return;}
    if(action==='setCurrentMap'){localStorage.setItem('WARFLEX_CURRENT_MAP',record.id);this.toast('CURRENT MAP: '+record.name);}
    if(action==='addMapSelection'){record.hidden=false;record.playable=true;this.setMapLibrary(list);this.toast('ADDED TO MAP SELECTION');}
    if(action==='hideMap'){record.hidden=true;record.playable=false;this.setMapLibrary(list);this.toast('MAP HIDDEN');}
    if(action==='deleteMap'){this.setMapLibrary(list.filter(m=>m.id!==record.id));if(localStorage.getItem('WARFLEX_CURRENT_MAP')===record.id)localStorage.removeItem('WARFLEX_CURRENT_MAP');this.toast('MAP DELETED');}
    this.refreshMapInfo();
  }
  refreshMapInfo(){const el=this.ui?.querySelector('#we-map-info');if(!el)return;const list=this.getMapLibrary();const name=(this.ui?.querySelector('#we-map-name')?.value||this.mapName||'').trim().toLowerCase();const m=list.find(x=>x.name.toLowerCase()===name);el.innerHTML=m?('ID <b>'+m.id+'</b><br>VISIBLE <b>'+(!m.hidden)+'</b><br>CURRENT <b>'+(localStorage.getItem('WARFLEX_CURRENT_MAP')===m.id)+'</b>'): 'Not saved to map library yet.';}
  getMapById(id){return this.getMapLibrary().find(m=>m.id===id)||null;}
  getCurrentMap(){const id=localStorage.getItem('WARFLEX_CURRENT_MAP');return id?this.getMapById(id):null;}
  loadMapRecord(id){const m=this.getMapById(id);if(!m?.data)return false;this.mapName=m.name;this.loadJson(m.data);return true;}
  copy(){this.clip=this.serializeMap().objects.filter((x)=>this.selected.has(this.findByName(x.name)));}
  toast(msg){const t=this.ui?.querySelector('#we-toast');if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>t.classList.remove('show'),1500);}
}

if(typeof document!=='undefined'&&new URLSearchParams(location.search).get('editor')==='WARFLEX_DEV'){
  const style=document.createElement('style');style.textContent='body.warfex-editor-active{cursor:default!important;overflow:hidden};#warfex-editor .we-map-tools{display:grid;gap:6px;margin-bottom:10px}#warfex-editor .we-map-tools .we-grid{grid-template-columns:1fr 1fr}.we-map-tools .we-name{margin:0}#warfex-editor{position:fixed;inset:0;z-index:10000;pointer-events:none;color:#e7edf0;font:12px/1.2 Arial,sans-serif}#warfex-editor .we-topbar,#warfex-editor .we-left,#warfex-editor .we-right,#warfex-editor #we-toast{pointer-events:auto}.we-topbar{position:absolute;left:10px;right:10px;top:10px;min-height:42px;display:flex;align-items:center;justify-content:space-between;padding:7px 10px;gap:10px;background:rgba(9,14,17,.95);border:1px solid #33454c}.we-topbar span{color:#7999a3;font-size:9px;letter-spacing:.12em}.we-actions{display:flex;gap:4px;flex-wrap:wrap}.we-left,.we-right{position:absolute;top:62px;bottom:10px;width:300px;overflow:auto;background:rgba(9,14,17,.95);border:1px solid #33454c;padding:10px;box-sizing:border-box}.we-left{left:10px}.we-right{right:10px}.we-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px}.we-grid button,#warfex-editor .we-actions button{background:#1b272d;border:1px solid #3c525b;color:#edf3f5;padding:7px;font-size:10px;letter-spacing:.06em;cursor:pointer}.we-grid button:hover,#warfex-editor .we-actions button:hover{background:#2a3b43}.we-options{display:grid;gap:6px;margin:8px 0 12px}.we-options label{display:flex;justify-content:space-between;color:#a9bbc0;font-size:10px}.we-options input[type=number]{width:88px;background:#10181c;border:1px solid #33454c;color:#fff;padding:5px}.we-help{display:grid;gap:4px;color:#789198;font-size:9px}.we-help b{color:#b7c7cb;margin-top:6px}.we-left h4,.we-right h4{font-size:10px;letter-spacing:.14em;color:#a7bdc3;border-bottom:1px solid #26363c;padding-bottom:5px}.we-row{display:block;width:100%;border:0;border-bottom:1px solid #1d292e;background:transparent;color:#a9bcc1;text-align:left;padding-top:7px;padding-bottom:7px;cursor:pointer}.we-row.selected{background:#29424b;color:#fff}.we-field{display:grid;grid-template-columns:55px 1fr;gap:6px;align-items:center;margin:4px 0;color:#91a5ab;font-size:10px}.we-field input,.we-name{width:100%;box-sizing:border-box;background:#10181c;border:1px solid #33454c;color:#fff;padding:6px}.we-name{margin-bottom:7px}.we-check{display:flex;gap:7px;color:#a9bbc0;font-size:10px;margin:8px 0}.we-empty{padding:10px;border:1px dashed #304149;color:#6d848b}.we-status{color:#90a6ad;line-height:1.7}.we-status b{color:#e1eaed}.we-toast{position:absolute;left:50%;bottom:22px;transform:translate(-50%,8px);opacity:0;background:#0a1013;border:1px solid #49616a;padding:9px 14px;font-size:10px;letter-spacing:.08em;transition:.15s}.we-toast.show{opacity:1;transform:translate(-50%,0)}' + `
/* Roblox Studio-inspired docking/ribbon layout */
#warfex-editor{background:transparent;pointer-events:none}
#warfex-editor .we-topbar{left:0;right:0;top:0;height:86px;padding:0 12px;display:flex;align-items:flex-end;background:#17191c;border:0;border-bottom:1px solid #34383d;box-shadow:0 2px 12px #0008}
#warfex-editor .we-topbar>div:first-child{position:absolute;left:12px;top:8px;font-size:13px;letter-spacing:.08em}
#warfex-editor .we-topbar>div:first-child span{margin-left:8px;color:#737b83}
#warfex-editor .we-actions{width:100%;padding:0 0 7px 220px;gap:2px;align-items:stretch}
#warfex-editor .we-actions button{min-width:72px;height:34px;background:#22262a;border:1px solid #3a3f44;color:#d8dde1;border-radius:2px;font-size:10px}
#warfex-editor .we-actions button:hover{background:#30353a}
#warfex-editor .we-left,#warfex-editor .we-right{top:86px;bottom:24px;background:#1b1d20;border:0;border-right:1px solid #34383d;padding:8px;border-radius:0}
#warfex-editor .we-left{left:0;width:236px}
#warfex-editor .we-right{right:0;width:318px;border-left:1px solid #34383d;border-right:0}
#warfex-editor .we-left h4,#warfex-editor .we-right h4{color:#c4cbd0;border-bottom:1px solid #34383d;margin:10px 0 7px;padding:5px 4px;font-size:10px}
#warfex-editor .we-grid{gap:3px}
#warfex-editor .we-left{box-shadow:4px 0 18px #0006}#warfex-editor .we-right{box-shadow:-4px 0 18px #0006}
#warfex-editor .we-grid button{min-height:31px;transition:background .12s,transform .08s,border-color .12s}#warfex-editor .we-grid button:active{transform:translateY(1px)}
#warfex-editor .we-topbar:before{content:'FILE   EDIT   VIEW   MODEL   TEST   MAP';position:absolute;left:12px;top:31px;color:#8e969d;font-size:9px;letter-spacing:.1em}
#warfex-editor .we-topbar>div:first-child strong{color:#f1f4f6}
#warfex-editor .we-right{background:linear-gradient(180deg,#202327,#191b1e)}#warfex-editor .we-left{background:linear-gradient(180deg,#202327,#191b1e)}
#warfex-editor .we-row.selected{box-shadow:inset 3px 0 #5eb8ff}
#warfex-editor .we-status{background:#15171a;border:1px solid #30353a;padding:8px}
#warfex-editor .we-help{padding:8px;background:#181a1d;border:1px solid #2d3237}
#warfex-editor .we-name:focus,#warfex-editor .we-field input:focus{outline:1px solid #5eb8ff;border-color:#5eb8ff}

#warfex-editor .we-grid button,#warfex-editor .we-actions button{font-family:Inter,system-ui,sans-serif}
#warfex-editor .we-grid button{background:#24282c;border:1px solid #3a3f44;border-radius:2px;padding:8px 5px}
#warfex-editor .we-row{color:#b8c0c6;padding:6px 7px;border:0;border-radius:2px}
#warfex-editor .we-row:hover{background:#282d32}
#warfex-editor .we-row.selected{background:#3b4650;color:#fff}
#warfex-editor .we-field input,#warfex-editor .we-name,#warfex-editor .we-options input[type=number]{background:#111315;border:1px solid #42474d;border-radius:2px}
#warfex-editor .we-status{font-family:ui-monospace,monospace}
#warfex-editor:after{content:'OUTPUT  |  READY';position:absolute;left:0;right:0;bottom:0;height:24px;display:flex;align-items:center;padding:0 10px;background:#17191c;border-top:1px solid #34383d;color:#7f8991;font:10px ui-monospace,monospace;letter-spacing:.08em;pointer-events:auto}
`;document.head.appendChild(style);}