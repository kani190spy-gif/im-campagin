'use strict';
/* =====================================================================
   Anki battles — bird's-eye combat driven by your Again / Hard / Good log.
   Cards decide how much strength you have; orders decide where it goes.
   Loaded after the main script; uses its globals (S, G, ankiCall, ...).
   ===================================================================== */
const LS_BTL='imc.battle', LS_CUR='imc.revCursor', LS_WATCHED='imc.watched', LS_DEPLOY='imc.deploy';
const BTL_ACTION=20, ELITE_CAP=6, CMD_SECONDS=12;
const BTL_SIZES=[{n:20,label:'Skirmish'},{n:50,label:'Engagement'},{n:100,label:'Battle'},{n:150,label:'Offensive'}];

function btlTier(seq){
  const n=seq.length||1, g=[...seq].filter(c=>c==='G').length, h=[...seq].filter(c=>c==='H').length;
  const sc=(g+0.6*h)/n;
  return sc>=0.9?{k:'decisive',label:'Decisive victory',f:1}
       : sc>=0.8?{k:'victory',label:'Victory',f:0.75}
       : sc>=0.7?{k:'hard',label:'Hard-fought victory',f:0.5}
       : sc>=0.6?{k:'stalemate',label:'Stalemate',f:0.25}
       : {k:'pushed',label:'Pushed back',f:0};
}
function btlCounts(seq){ const c={G:0,H:0,A:0}; for(const x of seq) c[x]=(c[x]||0)+1; return c; }
const BTL_PLACES=['Ridge','Crossing','Heights','Gap','Bridge','Fields','Pass','Woods','Junction','Hill 112','Station','Quarry'];
function btlName(kind){
  if(!T||!T.length) return kind==='Skirmish'?'Skirmish at the Ford':'Battle of the Ridge';
  const t=T[Math.floor(Math.random()*T.length)]; const base=(G&&G.tname?G.tname(t.id):t.name).replace(/^(Citadel of|High|Port|Fort|Old|Upper|Lower|Saint|New)\s+/,'');
  const p=BTL_PLACES[Math.floor(Math.random()*BTL_PLACES.length)];
  return (kind==='Skirmish'?'Skirmish at ':'Battle of ')+base+' '+p;
}
function rng(seed){ let a=Math.floor(hash(String(seed))*4294967296)>>>0; return ()=>{ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }

/* =====================================================================
   Units
   ===================================================================== */
const UNITS={
  // basic force (always available, losses don't carry over)
  rifle:   {name:'Rifle Squad',      cls:'inf',  hp:1, pow:1, w:1},
  mg:      {name:'MG Team',          cls:'mg',   hp:1, pow:1, w:1},
  wasp:    {name:'Wasp Light Tank',  cls:'tank', hp:2, pow:2, w:2, size:0.85},
  mule:    {name:'Mule APC',         cls:'apc',  hp:2, pow:1, w:1.5},
  fieldgun:{name:'Field Gun',        cls:'arty', hp:1, barr:1, rad:0.8, w:0.25},
  // elite (bought with prestige, lost for good if destroyed)
  grenadier:{name:'Grenadiers',          cls:'inf',  hp:2, pow:1.5, w:1,   cost:120,  tier:1, blurb:'Veteran infantry. Takes two hits.'},
  pioneer:  {name:'Assault Pioneers',    cls:'inf',  hp:2, pow:1.5, w:1,   cost:150, tier:1, blurb:'Engineers. Their lane advances 15% faster.', adv:0.15},
  ranger:   {name:'Ranger Armored Car',  cls:'apc',  hp:2, pow:1.5, w:1.4, cost:150, tier:1, blurb:'Fast scout. Its lane advances 8% faster.', adv:0.08},
  lynx:     {name:'Lynx Medium Tank',    cls:'tank', hp:3, pow:3, w:2,     cost:270, tier:2, blurb:'The workhorse. Three hits to destroy.', size:1.0},
  viper:    {name:'Viper Tank Destroyer',cls:'tank', hp:3, pow:3, w:1.8,   cost:330, tier:2, blurb:'Kills enemy armor in one shot.', size:1.0, at:true},
  thunder:  {name:'Thunder Howitzer',    cls:'arty', hp:2, barr:2, rad:0.95, w:0.25, cost:360, tier:2, blurb:'Two artillery strikes every action.'},
  bulwark:  {name:'Bulwark Heavy Tank',  cls:'tank', hp:4, pow:4, w:2.2,   cost:480, tier:3, blurb:'Heavy armor. Four hits to destroy.', size:1.15},
  hail:     {name:'Hailstorm Rockets',   cls:'arty', hp:2, barr:2, rad:1.35, w:0.25, cost:450, tier:3, blurb:'Two wide rocket strikes every action.'},
  mammoth:  {name:'Mammoth Super-Heavy', cls:'tank', hp:6, pow:5, w:2.5,   cost:780, tier:4, blurb:'A moving fortress. Six hits to destroy.', size:1.35},
};
const ELITE_ORDER=['grenadier','pioneer','ranger','lynx','viper','thunder','bulwark','hail','mammoth'];
const CALLSIGNS=['Iron Wren','Old Faithful','Black Thistle','Lucky Seven','Grey Wolf','Hammerfall','Saint Jude','Ironside','Red Kestrel','Stubborn Mule','Night Owl','Last Word','Big Bertha','Northwind','Brass Knuckle','Gravedigger','Sundown','Bulldog','Harbinger','Second Wind','Keeper','Steel Rain','Ember','Thunderclap'];
function basicForce(size){ const f=['rifle','rifle','rifle','rifle','rifle','rifle','mg','wasp','wasp','mule','fieldgun']; if(size>=100) f.push('rifle','rifle','wasp'); if(size>=150) f.push('mule','rifle'); return f; }

/* ---------- the standing army, derived from synced events ---------- */
function armyState(){
  const evs=liveEvents(S); const owned=new Map(); let prestige=0, earned=0, spent=0; const fallen=[];
  for(const e of evs){
    if(e.type==='buy'){ owned.set(e.uid,{uid:e.uid, model:e.model, name:e.name, since:e.date, battles:0, kills:0}); spent+=e.cost||0; }
    else if(e.type==='battle'){
      earned+=e.prestige||0;
      for(const g of (e.gained||[])) owned.set(g.uid,{uid:g.uid, model:g.model, name:g.name, since:e.date, battles:0, kills:0, captured:true});
      for(const id of (e.deploy||[])){ const u=owned.get(id); if(u){ u.battles++; u.kills+=((e.ukills||{})[id]||0); } }
      for(const id of (e.lost||[])){ const u=owned.get(id); if(u){ fallen.push({...u, fell:e.date, at:e.name}); owned.delete(id); } }
    }
  }
  prestige=Math.round(earned-spent);
  return {prestige, earned:Math.round(earned), owned:[...owned.values()], fallen};
}
function unitTag(u){ return `${UNITS[u.model].name} <span class="c-muted">“${esc(u.name)}”</span>`; }
function openDepot(){
  const A=armyState();
  const rows=ELITE_ORDER.map(m=>{ const U=UNITS[m], ok=A.prestige>=U.cost; return `<li><span class="d">T${U.tier}</span><span><b>${U.name}</b> <span class="c-muted">· ${U.blurb}</span></span><button class="btn sm ${ok?'pri':''}" style="margin-left:auto" data-a="bt-buy" data-m="${m}" ${ok?'':'disabled'}>${U.cost} ★</button></li>`; }).join('');
  const own=A.owned.map(u=>`<li><span class="d">${u.captured?'Captured':'Since '+fmtD(u.since)}</span><span>${unitTag(u)} <span class="c-muted">· ${u.battles} battle${u.battles===1?'':'s'} · ${u.kills} kills</span></span></li>`).join('');
  const fal=A.fallen.slice(-6).reverse().map(u=>`<li><span class="d">${fmtD(u.fell)}</span><span class="c-muted">${unitTag(u)} — lost at ${esc(u.at)}</span></li>`).join('');
  openSheet(`<h2>Depot</h2><div class="note">Prestige comes from Good and Hard cards and captured objectives. Elite units you bring into battle and lose are gone for good. The basic force is always free.</div>
    <div class="big" style="margin:10px 0 4px">${A.prestige.toLocaleString()} <small>★ prestige</small></div>
    <h3 style="margin-top:14px">Your elite units (${A.owned.length})</h3><ul class="log">${own||'<li class="c-muted">None yet. Earn prestige in battle, then buy here.</li>'}</ul>
    <h3 style="margin-top:14px">Requisition</h3><ul class="log">${rows}</ul>
    ${fal?`<h3 style="margin-top:14px">Fallen</h3><ul class="log">${fal}</ul>`:''}
    <div class="actions"><button class="btn pri" data-a="close">Close</button></div>`);
}
function buyUnit(m){
  const A=armyState(), U=UNITS[m]; if(!U||!U.cost||A.prestige<U.cost) return;
  const used=new Set([...A.owned,...A.fallen].map(u=>u.name)); const free=CALLSIGNS.filter(c=>!used.has(c));
  const name=(free.length?free:CALLSIGNS)[Math.floor(Math.random()*(free.length||CALLSIGNS.length))];
  addEvent({type:'buy', uid:'u-'+uid(), model:m, name, cost:U.cost});
  toast(`${U.name} “${name}” joins your army.`); openDepot();
}

/* =====================================================================
   Maps (procedural until painted maps arrive; painted ones go in MAP_ART)
   ===================================================================== */
const MAP_ART_ON=false;   // on hold: painted maps (art/map_*.webp) — flip to true to use them
// Painted maps: lanes run bottom (our side) to top (objective), in 0..1 image coordinates.
const MAP_ART=[
  {id:'map_farmland', name:'farmland', art:'art/map_farmland.webp', theme:'farm', obj:['the Earthworks','the Village','the Windmill'],
   lanes:[[[0.11,0.99],[0.14,0.74],[0.15,0.52],[0.19,0.36],[0.27,0.30]], [[0.45,0.99],[0.455,0.74],[0.47,0.49],[0.50,0.35],[0.51,0.22]], [[0.83,0.99],[0.85,0.74],[0.83,0.49],[0.81,0.34],[0.825,0.15]]]},
];
const THEMES={
  farm:  {name:'farmland', ground:'#6f7d45', patch:['#7f8b4d','#8a8452','#647441','#9a8a58'], road:'#8b7552', tree:'#3d4a2a', bld:'#8a7a66', roof:'#7a3f32', water:'#5b7d8a'},
  snow:  {name:'snowfields', ground:'#d9dde0', patch:['#e6e9eb','#cfd4d7','#c4c9c9','#dfe1dc'], road:'#a49c90', tree:'#3a4a40', bld:'#8f8a84', roof:'#5a4e48', water:'#8aa5b4'},
  desert:{name:'desert', ground:'#c9a66b', patch:['#d3b278','#bf9a5d','#c7a46a','#b89060'], road:'#a68356', tree:'#6c7a45', bld:'#d8c4a0', roof:'#b9a27a', water:'#5d8c95'},
  autumn:{name:'autumn country', ground:'#7a6a3c', patch:['#8a7440','#93683a','#6f6a3a','#a07a44'], road:'#7d6648', tree:'#9a5a26', bld:'#8a7a66', roof:'#6a3a2a', water:'#55707a'},
  mud:   {name:'trench country', ground:'#6b5c45', patch:['#75654b','#5f5240','#7d6b4f','#6a5a44'], road:'#5a4a38', tree:'#3c3a2a', bld:'#7a7064', roof:'#4a3a32', water:'#4f6068'},
  steppe:{name:'steppe', ground:'#a39a62', patch:['#ada46a','#97905a','#b3a873','#8f8a58'], road:'#8f7b58', tree:'#56603a', bld:'#9a8e78', roof:'#6a4a3a', water:'#5f7f88'},
};
const OBJ_NAMES=['the Mill','the Church','Hill 112','the Bridge','the Crossroads','the Farmstead','the Depot','the Station','the Quarry','the Manor','the Radio Tower','the Ford','the Orchard','the Bunker','the Water Tower','the Granary'];
function mapFor(id){
  // painted maps are picked three times as often as drawn ones
  const ART=MAP_ART_ON?MAP_ART:[]; const tk=Object.keys(THEMES), slots=ART.length*3+tk.length, pick=Math.floor(hash('mapPick'+id)*slots);
  if(pick<ART.length*3){ const m=ART[pick%ART.length]; return {...m, seed:id}; }
  const r=rng('map'+id), theme=tk[pick-ART.length*3];
  const lanes=[0.2,0.5,0.8].map(x0=>{ const top=0.16+r()*0.12; const pts=[]; let x=x0+(r()-.5)*0.06; for(const y of [0.97,0.78,0.6,0.42,top]){ pts.push([Math.min(0.9,Math.max(0.1,x)),y]); x+=(r()-.5)*0.12; } return pts; });
  const pool=[...OBJ_NAMES]; const obj=[0,1,2].map(()=>pool.splice(Math.floor(r()*pool.length),1)[0]);
  const river = r()<0.55 ? {y:0.48+r()*0.12, amp:0.02+r()*0.03, ph:r()*6} : null;
  return {id:'proc', seed:id, theme, lanes, obj, river};
}
function laneGeom(map){
  return map.lanes.map(pts=>{ const P=pts.map(([x,y])=>[x*16,y*9]); const L=[0]; for(let i=1;i<P.length;i++) L.push(L[i-1]+Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1])); return {P,L,len:L[L.length-1]}; });
}
function lanePt(g,t,off){ // map units: 16 x 9
  t=Math.max(0,Math.min(1,t)); const d=t*g.len; let i=1; while(i<g.L.length-1 && g.L[i]<d) i++;
  const a=g.P[i-1], b=g.P[i], k=(d-g.L[i-1])/((g.L[i]-g.L[i-1])||1);
  const x=a[0]+(b[0]-a[0])*k, y=a[1]+(b[1]-a[1])*k, dx=b[0]-a[0], dy=b[1]-a[1], n=Math.hypot(dx,dy)||1;
  return [x+(-dy/n)*(off||0), y+(dx/n)*(off||0)];
}
const frontT = p => 0.06+Math.min(1,p)*0.86;

/* =====================================================================
   Deterministic battle simulation: the cards are the truth
   ===================================================================== */
function unitPos(st,u,geo){
  if(UNITS[u.model].cls==='arty'){ const arts=st.units.filter(x=>UNITS[x.model].cls==='arty'); const i=arts.indexOf(u); return [16*(0.35+0.3*(arts.length>1?i/(arts.length-1):0.5)), 9*0.955]; }
  const mates=st.units.filter(x=>x.alive && x.lane===u.lane && UNITS[x.model].cls!=='arty'); let i=mates.indexOf(u); if(i<0) i=0;
  const row=Math.floor(i/3), col=i%3-1, ft=frontT(st.p[u.lane]);
  return lanePt(geo[u.lane], ft-0.035-row*0.055, col*0.42+(row%2)*0.2);
}
function enemyPos(st,e,geo){ const ft=frontT(st.p[e.lane]); return lanePt(geo[e.lane], Math.max(e.t, ft+0.07), ((hash(e.eid)-.5)*1.1)); }
function newEnemy(st,lane,r,t){ const x=r(); const type=x<0.5?'inf':x<0.68?'mg':x<0.9?'tank':'atg'; const e={eid:'e'+(st.nextE++), type, lane, hp:type==='tank'?2:1, alive:true, t}; st.enemy.push(e); return e; }
function btlInit(cfg){
  const r=rng(cfg.id+':init'); const st={units:[], enemy:[], p:[0,0,0], cap:[false,false,false], streak:0, nextE:1, ekills:0, reinf:0, ukills:{}};
  const models=[...basicForce(cfg.size).map(m=>({model:m})), ...(cfg.deploy||[]).map(d=>({model:d.model, uid:d.uid, name:d.name, elite:true}))];
  let k=0; for(const m of models){ const U=UNITS[m.model]; if(!U) continue; st.units.push({uid:m.uid||('b'+(k)), model:m.model, name:m.name||'', elite:!!m.elite, hp:U.hp, alive:true, lane:U.cls==='arty'?-1:(k++%3)}); }
  const per=2+Math.floor(cfg.size/50);
  for(let l=0;l<3;l++) for(let i=0;i<per;i++) newEnemy(st,l,r,0.25+r()*0.65);
  return st;
}
function autoOrders(st){ let lane=0, best=9; for(let l=0;l<3;l++) if(!st.cap[l] && st.p[l]<best){ best=st.p[l]; lane=l; } return {lane, stance:'advance', arty:[]}; }
function applyOrders(st,ord){
  let lane=ord.lane; if(st.cap[lane]){ const o=autoOrders(st); lane=o.lane; }
  const mob=st.units.filter(u=>u.alive && UNITS[u.model].cls!=='arty').sort((a,b)=>(UNITS[b.model].pow||1)-(UNITS[a.model].pow||1) || (b.elite-a.elite));
  const open=[0,1,2].filter(l=>!st.cap[l]&&l!==lane);
  const nAct=Math.ceil(mob.length*0.55);
  mob.forEach((u,i)=>{ u.lane = i<nAct || !open.length ? lane : open[(i-nAct)%open.length]; });
  return lane;
}
function simBattle(cfg, seq, orders, upto){
  const geo=laneGeom(cfg.map); const st=btlInit(cfg); const acts=[]; const size=cfg.size;
  const nActs=Math.ceil(seq.length/BTL_ACTION);
  for(let a=0;a<nActs && (upto==null || a<upto);a++){
    const r=rng(cfg.id+':a'+a);
    const ord=(orders&&orders[a])||autoOrders(st);
    const start=JSON.parse(JSON.stringify(st));
    const lane0=applyOrders(st,ord); start.ordLane=lane0; const afterOrders=JSON.parse(JSON.stringify(st));
    const evs=[]; const chunk=seq.slice(a*BTL_ACTION,(a+1)*BTL_ACTION);
    const arts=st.units.filter(u=>u.alive && UNITS[u.model].cls==='arty');
    const strikes=[]; for(const u of arts) for(let i=0;i<UNITS[u.model].barr;i++) strikes.push({u, rad:UNITS[u.model].rad});
    let si=0; const targets=(ord.arty||[]).slice(0,strikes.length);
    const stanceMul=ord.stance==='assault'?1.4:ord.stance==='hold'?0.8:1;
    for(let ci=0; ci<chunk.length; ci++){
      const c=chunk[ci]; let lane=ord.lane; if(st.cap[lane]){ lane=autoOrders(st).lane; }
      const allCap=st.cap.every(Boolean);
      const ours=st.units.filter(u=>u.alive && UNITS[u.model].cls!=='arty' && (allCap||u.lane===lane));
      const pickW=(arr,wf)=>{ const tot=arr.reduce((s,x)=>s+wf(x),0); let q=r()*tot; for(const x of arr){ q-=wf(x); if(q<=0) return x; } return arr[arr.length-1]; };
      let foes=st.enemy.filter(e=>e.alive && e.lane===lane);
      if(!foes.length && !allCap){ newEnemy(st,lane,r,frontT(st.p[lane])+0.15); newEnemy(st,lane,r,frontT(st.p[lane])+0.25); foes=st.enemy.filter(e=>e.alive && e.lane===lane); }
      const ev={c, lane, spawn:[]};
      const advMul = 1 + ours.reduce((s,u)=>s+(UNITS[u.model].adv||0),0);
      const push=(l,d)=>{ if(st.cap[l]) return; st.p[l]=Math.max(0,Math.min(1,st.p[l]+d)); if(st.p[l]>=1){ st.cap[l]=true; ev.cap=l; st.enemy.forEach(e=>{ if(e.lane===l && e.alive){ e.alive=false; } }); } };
      if(c==='G'){
        st.streak++;
        // artillery strike on the first Goods of the action
        if(si<strikes.length && (ci%3===0 || chunk.length-ci<=strikes.length-si)){
          const s=strikes[si]; const tg=targets[si] || (()=>{ const f=st.enemy.filter(e=>e.alive && e.lane===lane); if(!f.length) return null; const ps=f.map(e=>enemyPos(st,e,geo)); return {x:ps.reduce((a,p)=>a+p[0],0)/ps.length/16, y:ps.reduce((a,p)=>a+p[1],0)/ps.length/9}; })();
          si++;
          if(tg){ const kills=[]; for(const e of st.enemy){ if(!e.alive) continue; const p=enemyPos(st,e,geo); if(Math.hypot(p[0]-tg.x*16,p[1]-tg.y*9)<=s.rad && kills.length<4){ e.alive=false; kills.push(e.eid); st.ekills++; push(e.lane, 0.5/size*advMul); } }
            ev.barrage={from:s.u.uid, x:tg.x, y:tg.y, rad:s.rad, kills}; st.ukills[s.u.uid]=(st.ukills[s.u.uid]||0)+kills.length; }
        }
        const sh=ours.length?pickW(ours,u=>UNITS[u.model].pow||1):null; const tgt=foes.length?foes[Math.floor(r()*foes.length)]:null;
        if(sh && tgt){ ev.sh=sh.uid; ev.tg=tgt.eid; const U=UNITS[sh.model]; const big=(U.pow||1)>=2;
          const kill = tgt.type==='tank' ? (U.at || (big && r()<0.6) || tgt.hp<=1) : true;
          if(kill){ tgt.alive=false; st.ekills++; ev.kill=true; st.ukills[sh.uid]=(st.ukills[sh.uid]||0)+1; } else { tgt.hp--; if(tgt.hp<=0){ tgt.alive=false; st.ekills++; ev.kill=true; } }
        }
        push(lane, 3.2/size*stanceMul*advMul); for(let l=0;l<3;l++) if(l!==lane) push(l, 0.25/size);
        if(st.streak>=8){ st.streak=0; const m=r()<0.35?'wasp':'rifle'; const nu={uid:'r'+(st.reinf++), model:m, name:'', elite:false, hp:UNITS[m].hp, alive:true, lane}; st.units.push(nu); ev.spawn.push(nu.uid); }
      } else if(c==='H'){
        const sh=ours.length?pickW(ours,u=>UNITS[u.model].pow||1):null; const tgt=foes.length?foes[Math.floor(r()*foes.length)]:null;
        if(sh&&tgt){ ev.sh=sh.uid; ev.tg=tgt.eid; tgt.hp--; if(tgt.hp<=0){ tgt.alive=false; st.ekills++; ev.kill=true; st.ukills[sh.uid]=(st.ukills[sh.uid]||0)+1; } }
        const ef=st.enemy.filter(e=>e.alive && e.lane===lane); const es=ef.length?ef[Math.floor(r()*ef.length)]:null;
        const hitP=ord.stance==='assault'?0.45:ord.stance==='hold'?0.15:0.3;
        if(es && ours.length && r()<hitP){ const v=pickW(ours,u=>UNITS[u.model].w); ev.es=es.eid; ev.hit=v.uid; v.hp--; if(v.hp<=0){ v.alive=false; ev.dead=v.uid; } }
        else if(es && ours.length){ ev.es=es.eid; ev.miss=pickW(ours,u=>UNITS[u.model].w).uid; }
        push(lane, 0.6/size*stanceMul*advMul);
      } else {
        st.streak=0;
        const pool=st.units.filter(u=>u.alive && (allCap||u.lane===lane||UNITS[u.model].cls==='arty'));
        const ef=st.enemy.filter(e=>e.alive && e.lane===lane); ev.es=ef.length?ef[Math.floor(r()*ef.length)].eid:null; ev.shell=!ev.es||r()<0.5;
        const hitOne=()=>{ const live=pool.filter(u=>u.alive); if(!live.length) return null; const v=pickW(live,u=>UNITS[u.model].w); v.hp--; if(v.hp<=0) v.alive=false; return v; };
        if(ord.stance==='hold' && r()<0.32){ ev.supp=true; const live=pool.filter(u=>u.alive); if(live.length) ev.near=pickW(live,u=>UNITS[u.model].w).uid; }
        else { const v=hitOne(); if(v){ ev.hit=v.uid; if(!v.alive) ev.dead=v.uid; }
          if(ord.stance==='assault' && r()<0.35){ const v2=hitOne(); if(v2){ ev.hit2=v2.uid; if(!v2.alive) ev.dead2=v2.uid; } } }
        if(!st.cap[lane]) st.p[lane]=Math.max(0, st.p[lane]-1.0/size);
      }
      // keep the line alive: basic replenishment
      const mob=st.units.filter(u=>u.alive && UNITS[u.model].cls!=='arty');
      if(mob.length<3){ for(let i=0;i<2;i++){ const nu={uid:'r'+(st.reinf++), model:'rifle', name:'', elite:false, hp:1, alive:true, lane}; st.units.push(nu); ev.spawn.push(nu.uid); } }
      // enemy reserves
      for(let l=0;l<3;l++){ if(st.cap[l]) continue; const n=st.enemy.filter(e=>e.alive && e.lane===l).length; if(n<2){ const e=newEnemy(st,l,r,Math.min(0.97,frontT(st.p[l])+0.2+r()*0.2)); ev.espawn=(ev.espawn||[]).concat(e.eid); } }
      ev.p=st.p.slice(); ev.capd=st.cap.slice(); ev.ekAfter=st.ekills;
      ev.snap={units:JSON.parse(JSON.stringify(st.units)), enemy:JSON.parse(JSON.stringify(st.enemy))};
      evs.push(ev);
    }
    acts.push({start, afterOrders, ord:{...ord, lane:lane0}, evs, end:JSON.parse(JSON.stringify(st))});
  }
  return {acts, st, geo};
}
function btlSummary(cfg, seq, sim, auto){
  const tier=btlTier(seq), c=btlCounts(seq), st=sim.st, caps=st.cap.filter(Boolean).length;
  const lost=st.units.filter(u=>u.elite && !u.alive).map(u=>u.uid);
  let prestige=(c.G + 0.4*c.H + caps*15)*(1+0.5*tier.f); if(auto) prestige*=0.5;
  const gained=[];
  if(!auto && caps===3 && tier.f>=0.75 && seq.length>=50){ const pool=['ranger','lynx','viper','grenadier']; const m=pool[Math.floor(hash(cfg.id+'cap')*pool.length)]; gained.push({uid:'u-cap-'+cfg.id, model:m, name:CALLSIGNS[Math.floor(hash(cfg.id+'cs')*CALLSIGNS.length)]}); }
  const ukills={}; for(const [k,v] of Object.entries(st.ukills)) if(!/^[br]\d/.test(k)) ukills[k]=v;
  return {tier, c, caps, lost, prestige:Math.round(prestige), gained, ekills:st.ekills, ukills, lossesBasic:st.units.filter(u=>!u.elite && !u.alive).length};
}

/* =====================================================================
   Reading Anki's answer log
   ===================================================================== */
async function ankiAnswersSince(ts){
  const dk=(S.settings.ankiDeck||'').trim().replace(/"/g,''); const scope=dk?`deck:"${dk}" `:'';
  const days=Math.max(1, Math.min(30, Math.ceil((Date.now()-ts)/864e5)+1));
  const cards=await ankiCall('findCards',{query:scope+'rated:'+days});
  if(!cards.length) return [];
  const revs=await ankiCall('getReviewsOfCards',{cards:cards.map(String)});
  const out=[];
  for(const list of Object.values(revs||{})) for(const r of list||[]){ if(r.id>ts && r.ease>=1 && r.type!==4) out.push({id:r.id, e:r.ease===1?'A':r.ease===2?'H':'G'}); }
  return out.sort((a,b)=>a.id-b.id);
}

/* =====================================================================
   Recorded battles (local to the Mac running Anki)
   ===================================================================== */
function btlGet(){ try{ return JSON.parse(localStorage.getItem(LS_BTL)); }catch(e){ return null; } }
function btlSet(b){ try{ if(b) localStorage.setItem(LS_BTL, JSON.stringify(b)); else localStorage.removeItem(LS_BTL); }catch(e){} }
function btlCfg(b){ return {id:b.id, size:b.size, deploy:b.deploy||[], map:mapFor(b.mapSeed||b.id)}; }
function openBattleStart(){
  if(localStorage.getItem(LS_ANKI)!=='1'){ toast('Battles read Anki on your Mac. Turn on "This device runs Anki" in Settings.'); return; }
  const cur=btlGet(); if(cur){ openBattleStatus(); return; }
  if(typeof modeBusy==='function' && modeBusy()){ toast(`Your ${modeBusy()} is still running. One mode at a time.`); return; }
  const sizeSel = +(localStorage.getItem('imc.btlSize')||100);
  const A=armyState(); let prev=[]; try{ prev=JSON.parse(localStorage.getItem(LS_DEPLOY)||'[]'); }catch(e){}
  const seed='m'+uid(); const mp=mapFor(seed);
  const own=A.owned.map(u=>`<label class="dep"><input type="checkbox" data-dep="${u.uid}" ${prev.includes(u.uid)?'checked':''}> ${unitTag(u)} <span class="c-muted">· ${UNITS[u.model].hp} hp</span></label>`).join('');
  openSheet(`<h2>Start a battle</h2><div class="note">Review in Anki as usual. Every ${BTL_ACTION} cards becomes an action: give orders, then watch it play out. Easy counts as Good.</div>
    <div class="field"><label>Name</label><div class="row"><input type="text" id="bt-name" value="${esc(btlName('Battle'))}" style="flex:1" maxlength="48"><button class="btn sm" data-a="bt-dice">🎲</button></div></div>
    <div class="field"><label>Size</label><div class="seg" id="bt-size">${BTL_SIZES.map(s=>`<button data-bs="${s.n}" class="${s.n===sizeSel?'on':''}">${s.label}<br><small>${s.n} cards</small></button>`).join('')}</div></div>
    <div class="field"><label>Battlefield</label><div class="row"><span id="bt-map" data-seed="${seed}">${esc(THEMES[mp.theme]?THEMES[mp.theme].name:'Painted map')} · objectives: ${mp.obj.map(esc).join(', ')}</span><button class="btn sm" data-a="bt-remap">🎲</button></div></div>
    <div class="field"><label>Elite units to bring (up to ${ELITE_CAP})</label>
      <div class="note" style="margin-bottom:6px">The basic force always deploys: rifle squads, MG team, Wasp light tanks, a Mule APC and a field gun. Elite units hit harder, but if one is destroyed it's gone from your army.</div>
      ${own||'<div class="note">No elite units yet. Win battles for prestige, then visit the Depot.</div>'}</div>
    <div class="actions"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="bt-go">⚔ Start</button></div>`);
}
function openBattleStatus(){
  const b=btlGet(); if(!b) return;
  const n=b.seq.length, c=btlCounts(b.seq);
  openSheet(`<h2>${esc(b.name)}</h2><div class="note">${n} of ${b.size} cards · next action at ${Math.min(b.size,(Math.floor(b.shown/BTL_ACTION)+1)*BTL_ACTION)}</div>
    <div class="kv"><span>Good</span><span class="c-good">${c.G}</span><span>Hard</span><span class="c-warn">${c.H}</span><span>Again</span><span class="c-bad">${c.A}</span></div>
    <div class="actions"><button class="btn danger" data-a="bt-end">End battle now</button>${n>b.shown?`<button class="btn" data-a="bt-play">Watch next action</button>`:''}<button class="btn pri" data-a="close">Back to Anki</button></div>`);
}
async function battleStart(){
  const name=$('#bt-name').value.trim()||btlName('Battle');
  const size=+(document.querySelector('#bt-size .on')||{}).dataset?.bs||100;
  const picks=[...document.querySelectorAll('[data-dep]:checked')].map(x=>x.dataset.dep).slice(0,ELITE_CAP);
  const A=armyState(); const deploy=picks.map(id=>A.owned.find(u=>u.uid===id)).filter(Boolean).map(u=>({uid:u.uid, model:u.model, name:u.name}));
  try{ localStorage.setItem('imc.btlSize',String(size)); localStorage.setItem(LS_DEPLOY, JSON.stringify(picks)); }catch(e){}
  const b={id:'btl-'+uid(), name, size, startTs:Date.now(), seq:'', shown:0, orders:[], deploy, mapSeed:$('#bt-map').dataset.seed};
  btlSet(b); try{ localStorage.setItem(LS_CUR, String(b.startTs)); }catch(e){}
  if(typeof askNotify==='function') askNotify();
  closeSheet(); btlRefresh(); toast(`${name} has begun. Go review — come back every ${BTL_ACTION} cards.`);
}
let btlBusy=false, btlPlaying=false;
async function battleTick(force){
  const b=btlGet(); if(!b || btlBusy || btlPlaying) return;
  if(localStorage.getItem(LS_ANKI)!=='1') return;
  btlBusy=true;
  try{
    const rev=await ankiAnswersSince(b.startTs);
    const seq=rev.map(r=>r.e).join('').slice(0,b.size);
    if(seq!==b.seq){ b.seq=seq; b.lastId=(rev[Math.min(rev.length,b.size)-1]||{}).id||b.lastId; btlSet(b); btlRefresh(); }
    const ready = (b.seq.length-b.shown>=BTL_ACTION) || (b.seq.length>=b.size && b.shown<b.size);
    if(ready && document.visibilityState==='visible' && !CUT && $('#gate').classList.contains('hidden') && (force || $('#sheetbg').classList.contains('hidden'))){ btlBusy=false; await battlePlayNext(); }
    else if(ready){ document.title='⚔ Action ready · IM Campaign'; if(b.notified!==b.shown){ b.notified=b.shown; btlSet(b); if(typeof notify==='function') notify(`${b.name}: action ready`, `${b.seq.length}/${b.size} cards. Switch back to give orders.`, 'tick'); } }
  }catch(e){ /* Anki closed */ }
  finally{ btlBusy=false; }
}
async function battlePlayNext(){
  const b=btlGet(); if(!b || btlPlaying) return;
  closeSheet(); btlPlaying=true;
  try{
    const from=b.shown, to=Math.min(b.seq.length, from+BTL_ACTION, b.size);
    if(to<=from){ return; }
    const a=Math.floor(from/BTL_ACTION), total=Math.ceil(b.size/BTL_ACTION), final=to>=b.size;
    document.title='IM Campaign';
    const cfg=btlCfg(b);
    const pre=simBattle(cfg, b.seq.slice(0,to), b.orders, a); // state before this action
    const res=await playBattle({name:b.name, cfg, seqTo:b.seq.slice(0,to), orders:b.orders, action:a, actions:total, final, command:true,
      onOrders:o=>{ b.orders[a]=o; btlSet(b); }, startState:pre.st});
    b.shown=to; btlSet(b);
    if(final) battleFinish(b);
  } finally { btlPlaying=false; renderBattleChip(); }
}
function battleFinish(b){
  const seq=b.seq.slice(0,b.size); if(!seq.length){ btlSet(null); btlRefresh(); return; }
  const cfg=btlCfg(b), sim=simBattle(cfg, seq, b.orders), sm=btlSummary(cfg, seq, sim, false);
  addEvent({id:b.id, type:'battle', name:b.name, size:b.size, seq, g:sm.c.G, h:sm.c.H, a:sm.c.A, tier:sm.tier.k, auto:false,
    mapSeed:b.mapSeed, orders:b.orders, deploy:b.deploy.map(d=>d.uid), deployFull:b.deploy, lost:sm.lost, gained:sm.gained, prestige:sm.prestige, caps:sm.caps, ekills:sm.ekills, ukills:sm.ukills});
  try{ if(b.lastId) localStorage.setItem(LS_CUR, String(b.lastId)); }catch(e){}
  btlSet(null); btlRefresh();
}
async function battleEndNow(){
  const b=btlGet(); if(!b) return; closeSheet();
  await battleTick(); const nb=btlGet()||b;
  nb.size=Math.max(1,nb.seq.length); btlSet(nb);
  if(nb.seq.length>nb.shown) await battlePlayNext(); else if(nb.seq.length) battleFinish(nb); else { btlSet(null); btlRefresh(); }
}
function renderBattleChip(){
  let el=$('#btlchip'); const b=btlGet();
  if(!b){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('button'); el.id='btlchip'; el.className='chip'; el.setAttribute('data-a','bt-status'); const sd=$('#syncdot'); sd.parentNode.insertBefore(el, sd); }
  const ready=b.seq.length-b.shown>=BTL_ACTION || (b.seq.length>=b.size && b.shown<b.size);
  el.innerHTML=`<i style="background:${ready?'#ffb347':'#e0705f'}"></i>⚔ ${b.seq.length}/${b.size}${ready?' · action ready':''}`;
}
function btlRefresh(){ renderBattleChip(); if(typeof tab!=='undefined' && tab==='battles' && $('#sheetbg').classList.contains('hidden')) render(); }

function btlSection(){
  const b=btlGet(), list=liveEvents(S).filter(e=>e.type==='battle').sort((a,c)=>(c.ord||c.ts)-(a.ord||a.ts));
  const w=watchedSet(), mac=localStorage.getItem(LS_ANKI)==='1', A=armyState();
  const won=list.filter(e=>btlTier(e.seq||'').f>=0.5).length, cards=list.reduce((a,e)=>a+(e.seq||'').length,0);
  const row=e=>{ const t=btlTier(e.seq||''); return `<li><span class="d">${fmtD(e.date)}</span><span><b>${esc(e.name)}</b> — <span class="${t.f>=0.5?'c-good':t.f>0?'c-warn':'c-bad'}">${t.label}</span> <span class="c-muted">· ${(e.seq||'').length} cards${e.caps!=null&&!e.auto?` · ${e.caps}/3 objectives`:''}${e.prestige?` · +${e.prestige} ★`:''}${(e.lost||[]).length?` · <span class="c-bad">${e.lost.length} elite lost</span>`:''}</span>${w.has(e.id)?'':' <span class="pill c-warn" style="font-size:9px">new</span>'}</span><button class="btn sm" style="margin-left:auto" data-a="bt-watch" data-id="${e.id}">Watch</button></li>`; };
  return `<div class="card" style="margin-bottom:10px"><h3>The Anki front</h3>
    <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px"><div>
    ${b?`<div class="big" style="font-size:22px">${esc(b.name)}</div><div class="sub">${b.seq.length} / ${b.size} cards · action every ${BTL_ACTION}</div>`
     :`<div class="sub">${list.length?`${list.length} battle${list.length>1?'s':''} · ${won} won · ${cards.toLocaleString()} cards fought`:'Start a battle (Skirmish 20 up to Offensive 150), then review in Anki. Every 20 cards you give orders and watch it play out. Only cards done after you press start count.'}</div>`}
    <div class="sub">${A.prestige.toLocaleString()} ★ prestige · ${A.owned.length} elite unit${A.owned.length===1?'':'s'}${A.fallen.length?` · ${A.fallen.length} fallen`:''}</div></div>
    <div class="row" style="gap:8px">${b?`<button class="btn sm" data-a="bt-status">Status</button>`:mac?`<button class="btn pri sm" data-a="bt-open">⚔ Start battle</button>`:''}<button class="btn sm" data-a="bt-depot">Depot</button></div></div>
    ${b?`<div class="bar"><div style="width:${Math.min(100,b.seq.length/b.size*100)}%;background:#e0705f"></div></div>`:''}
    ${!mac&&!b?`<div class="note" style="margin-top:6px">Battles are recorded on the computer that runs Anki.</div>`:''}
    ${list.length?`<ul class="log" style="margin-top:10px">${list.slice(0,8).map(row).join('')}</ul>${list.length>8?`<div class="row" style="margin-top:6px"><button class="btn sm" data-a="bt-list">All battles</button></div>`:''}`:''}
  </div>`;
}

/* ---------- auto skirmishes (reviews outside a recorded battle) ---------- */
async function autoSkirmishes(){
  return; // retired: only cards done after pressing start count toward a mode
  if(btlGet() || localStorage.getItem(LS_ANKI)!=='1') return;
  let cur=+(localStorage.getItem(LS_CUR)||0);
  if(!cur){ try{ localStorage.setItem(LS_CUR, String(Date.now())); }catch(e){} return; }
  let rev; try{ rev=await ankiAnswersSince(cur); }catch(e){ return; }
  let made=0;
  while(rev.length>=BTL_ACTION && made<60){
    const part=rev.splice(0,BTL_ACTION), seq=part.map(r=>r.e).join(''), c=btlCounts(seq), last=part[part.length-1];
    const id='sk-'+part[0].id, cfg={id, size:BTL_ACTION, deploy:[], map:mapFor(id)}, sm=btlSummary(cfg, seq, simBattle(cfg, seq, null), true);
    addEvent({id, type:'battle', name:btlName('Skirmish'), size:BTL_ACTION, seq, g:c.G, h:c.H, a:c.A, tier:sm.tier.k, auto:true, date:ymd(new Date(last.id)), prestige:sm.prestige, caps:sm.caps, ekills:sm.ekills}, true);
    cur=last.id; made++;
  }
  try{ localStorage.setItem(LS_CUR, String(cur)); }catch(e){}
  if(made){ commit(); toast(`${made} new skirmish${made>1?'es':''} from your Anki reviews — see Battles.`); }
}
function watchedSet(){ try{ return new Set(JSON.parse(localStorage.getItem(LS_WATCHED)||'[]')); }catch(e){ return new Set(); } }
function markWatched(id){ const s=watchedSet(); s.add(id); try{ localStorage.setItem(LS_WATCHED, JSON.stringify([...s].slice(-400))); }catch(e){} }
function openBattleList(){
  const list=liveEvents(S).filter(e=>e.type==='battle').sort((a,b)=>(b.ord||b.ts)-(a.ord||a.ts)).slice(0,40);
  const w=watchedSet();
  openSheet(`<h2>Battles</h2><div class="note">Tap a battle to watch it again.</div>
    <ul class="log" style="margin-top:10px">${list.map(e=>{ const t=btlTier(e.seq||''); return `<li><span class="d">${fmtD(e.date)}</span><span><b>${esc(e.name)}</b> — <span class="${t.f>=0.5?'c-good':t.f>0?'c-warn':'c-bad'}">${t.label}</span> <span class="c-muted">· ${e.g} good · ${e.h} hard · ${e.a} again</span>${w.has(e.id)?'':' <span class="pill c-warn" style="font-size:9px">new</span>'}</span><button class="btn sm" style="margin-left:auto" data-a="bt-watch" data-id="${e.id}">Watch</button></li>`; }).join('')||'<li class="c-muted">No battles yet.</li>'}</ul>
    <div class="actions"><button class="btn pri" data-a="close">Close</button></div>`);
}
async function watchBattle(id){
  const e=liveEvents(S).find(x=>x.id===id); if(!e) return; closeSheet(); markWatched(id);
  const seq=e.seq||''; const cfg={id:e.id, size:e.size||seq.length, deploy:e.deployFull||[], map:mapFor(e.mapSeed||e.id)};
  const acts=Math.ceil(seq.length/BTL_ACTION);
  for(let a=0;a<acts;a++){
    const pre=simBattle(cfg, seq.slice(0,(a+1)*BTL_ACTION), e.orders||null, a);
    const r=await playBattle({name:e.name, cfg, seqTo:seq.slice(0,(a+1)*BTL_ACTION), orders:e.orders||null, action:a, actions:acts, final:a===acts-1, command:false, startState:pre.st, auto:!!e.auto, replay:true});
    if(r && r.quit) break;
  }
}

/* =====================================================================
   The bird's-eye battle scene
   ===================================================================== */
const BTL_LINES={
  good:['The armored column breaks through.','Forward observers walk the barrage onto their guns.','The line surges forward. Their positions collapse.','Tanks roll over the first trench.'],
  mixed:['The infantry advance under heavy fire.','Ground is taken, yard by bloody yard.','Both sides trade fire across the open field.','The push holds, but it costs us.'],
  bad:['Enemy artillery pins the line down.','Their counterattack forces us back.','We are taking heavy losses. Hold the line.','The assault stalls in the mud.']
};
/* ---------- unit sprites (painted art; drawn shapes are the fallback) ---------- */
const SPRITE_FILES={};   // on hold: painted sprites, e.g. tank:'art/u_tank_light.webp'   // by unit class for now; per-model files can be added: lynx:'art/u_tank_medium.webp'
const SPR={};
function loadSprites(){ for(const [k,f] of Object.entries(SPRITE_FILES)){ const im=new Image(); im.onload=()=>{ SPR[k]={us:im, en:tintSprite(im,'en'), dead:tintSprite(im,'dead')}; }; im.src=f; } }
function tintSprite(im,mode){ const c=document.createElement('canvas'); c.width=im.width; c.height=im.height; const x=c.getContext('2d');
  x.drawImage(im,0,0); const d=x.getImageData(0,0,c.width,c.height), p=d.data;
  for(let i=0;i<p.length;i+=4){ const g=(p[i]*0.3+p[i+1]*0.59+p[i+2]*0.11);
    if(mode==='en'){ p[i]=g*0.78+6; p[i+1]=g*0.78+4; p[i+2]=g*0.78+4; } else { p[i]=g*0.45+14; p[i+1]=g*0.37+9; p[i+2]=g*0.31+6; } }
  x.putImageData(d,0,0); return c; }
loadSprites();
const COL={us:'#5d82b3', usD:'#3b5678', usL:'#a9c4e6', en:'#a5483a', enD:'#6e2c23', enL:'#e2a091', usTeam:'rgba(70,140,235,', enTeam:'rgba(225,70,55,', gold:'#e8c36a'};
function drawBackdrop(cv, map){
  const b=cv.getContext('2d'), w=cv.width, h=cv.height, R=rng('bd'+map.seed), th=THEMES[map.theme]||THEMES.farm;
  if(map.art){ b.fillStyle='#2a2c22'; b.fillRect(0,0,w,h); return; }
  const X=x=>x/16*w, Y=y=>y/9*h, geo=laneGeom(map);
  b.fillStyle=th.ground; b.fillRect(0,0,w,h);
  // field patches
  for(let i=0;i<70;i++){ const x=R()*w, y=R()*h, pw=w*(0.05+R()*0.12), ph=h*(0.04+R()*0.1); b.save(); b.translate(x,y); b.rotate((R()-.5)*0.5); b.fillStyle=th.patch[Math.floor(R()*th.patch.length)]; b.globalAlpha=0.55; b.fillRect(-pw/2,-ph/2,pw,ph);
    if(map.theme!=='snow' && map.theme!=='desert' && R()<0.5){ b.strokeStyle='rgba(0,0,0,.08)'; b.lineWidth=1; for(let k=-pw/2;k<pw/2;k+=6) { b.beginPath(); b.moveTo(k,-ph/2); b.lineTo(k,ph/2); b.stroke(); } } b.restore(); }
  b.globalAlpha=1;
  // noise speckle
  for(let i=0;i<2500;i++){ b.fillStyle=`rgba(${R()<.5?0:255},${R()<.5?0:255},${R()<.5?0:255},0.035)`; b.fillRect(R()*w,R()*h,2,2); }
  // river
  if(map.river){ const rv=map.river; b.strokeStyle=th.water; b.lineWidth=h*0.035; b.lineCap='round'; b.beginPath(); for(let x=0;x<=w;x+=w/80){ const y=Y(rv.y*9)+Math.sin(x/w*7+rv.ph)*rv.amp*h; x?b.lineTo(x,y):b.moveTo(x,y); } b.stroke();
    b.strokeStyle='rgba(255,255,255,.12)'; b.lineWidth=h*0.006; b.stroke(); }
  // trenches (mud theme)
  if(map.theme==='mud'){ for(let k=0;k<3;k++){ const yy=h*(0.3+k*0.17); b.strokeStyle='#3d3226'; b.lineWidth=h*0.012; b.beginPath(); for(let x=0;x<=w;x+=w/30){ const y=yy+((x/(w/30))%2?1:-1)*h*0.012; x?b.lineTo(x,y):b.moveTo(x,y);} b.stroke(); } }
  // roads along lanes
  for(const g of geo){ b.strokeStyle='rgba(0,0,0,.18)'; b.lineWidth=h*0.03; b.lineCap='round'; b.lineJoin='round'; b.beginPath(); g.P.forEach(([x,y],i)=>i?b.lineTo(X(x),Y(y)):b.moveTo(X(x),Y(y))); b.stroke();
    b.strokeStyle=th.road; b.lineWidth=h*0.022; b.stroke(); b.setLineDash([h*0.01,h*0.02]); b.strokeStyle='rgba(0,0,0,.12)'; b.lineWidth=h*0.004; b.stroke(); b.setLineDash([]); }
  // bridges where roads cross the river
  if(map.river){ for(const g of geo){ for(let t=0;t<=1;t+=0.01){ const [x,y]=lanePt(g,t); const ry=map.river.y*9+Math.sin(X(x)/w*7+map.river.ph)*map.river.amp*9; if(Math.abs(y-ry)<0.08){ b.fillStyle='#8a8378'; b.fillRect(X(x)-h*0.025,Y(y)-h*0.03,h*0.05,h*0.06); b.fillStyle='rgba(0,0,0,.25)'; b.fillRect(X(x)-h*0.025,Y(y)-h*0.03,h*0.006,h*0.06); b.fillRect(X(x)+h*0.019,Y(y)-h*0.03,h*0.006,h*0.06); break; } } } }
  // tree clusters
  for(let i=0;i<34;i++){ const cx=R()*w, cy=R()*h*0.92; let near=false; for(const g of geo){ for(let t=0;t<=1;t+=0.1){ const [x,y]=lanePt(g,t); if(Math.hypot(X(x)-cx,Y(y)-cy)<h*0.06) near=true; } } if(near) continue;
    const n=5+Math.floor(R()*12); for(let k=0;k<n;k++){ const tx=cx+(R()-.5)*h*0.12, ty=cy+(R()-.5)*h*0.08, r=h*(0.01+R()*0.012); b.fillStyle='rgba(0,0,0,.25)'; b.beginPath(); b.arc(tx+r*0.4,ty+r*0.5,r,0,6.283); b.fill(); b.fillStyle=th.tree; b.beginPath(); b.arc(tx,ty,r,0,6.283); b.fill(); b.fillStyle='rgba(255,255,255,.08)'; b.beginPath(); b.arc(tx-r*0.3,ty-r*0.3,r*0.5,0,6.283); b.fill(); } }
  // craters
  for(let i=0;i<40;i++){ const x=R()*w, y=h*(0.2+R()*0.7), r=h*(0.006+R()*0.014); b.fillStyle='rgba(0,0,0,.22)'; b.beginPath(); b.ellipse(x,y,r,r*0.8,0,0,6.283); b.fill(); b.strokeStyle='rgba(255,255,255,.06)'; b.lineWidth=1; b.stroke(); }
  // objective settlements
  geo.forEach((g,l)=>{ const [ox,oy]=lanePt(g,1); for(let k=0;k<7;k++){ const bx=X(ox)+(R()-.5)*h*0.16, by=Y(oy)+(R()-.5)*h*0.1, bw=h*(0.025+R()*0.025), bh=h*(0.02+R()*0.02); b.fillStyle='rgba(0,0,0,.3)'; b.fillRect(bx+3,by+3,bw,bh); b.fillStyle=th.roof; b.fillRect(bx,by,bw,bh); b.fillStyle='rgba(255,255,255,.1)'; b.fillRect(bx,by,bw,bh/2); } });
  // our assembly area + enemy haze
  const top=b.createLinearGradient(0,0,0,h*0.25); top.addColorStop(0,'rgba(20,10,8,.35)'); top.addColorStop(1,'rgba(20,10,8,0)'); b.fillStyle=top; b.fillRect(0,0,w,h*0.25);
  const vg=b.createRadialGradient(w/2,h/2,h*0.3,w/2,h/2,w*0.7); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.45)'); b.fillStyle=vg; b.fillRect(0,0,w,h);
}

function playBattle(o){
  return new Promise(resolve=>{
    const el=$('#cut'); const cfg=o.cfg, map=cfg.map;
    el.innerHTML=`<div class="cstage bst bev" id="bstage">
      <canvas class="cfx" id="bbg"></canvas><canvas class="cfx" id="bcv"></canvas>
      <div class="bhud"><div class="bname">${esc(o.name)}</div><div class="bsub">${o.cfg.size>BTL_ACTION?`Action ${o.action+1} of ${o.actions}`:'Skirmish'}${o.auto?' · basic force':''}</div></div>
      <div class="bcount"><span class="c-good">✔ <b id="bcG">0</b></span><span class="c-warn">◐ <b id="bcH">0</b></span><span class="c-bad">✖ <b id="bcA">0</b></span></div>
      <div class="bforce" id="bforce"></div>
      <div class="bline" id="bline"></div>
      <div class="bcmd" id="bcmd"></div>
      <div class="cpanel" id="bres"></div>
      <button class="cskip" id="bskip">Skip ▸▸</button></div>`;
    el.classList.add('show');
    const stage=$('#bstage'), bgc=$('#bbg'), cv=$('#bcv'), ctx=cv.getContext('2d');
    const dpr=devicePixelRatio||1;
    const fit=()=>{ for(const c of [bgc,cv]){ c.width=Math.round(c.clientWidth*dpr); c.height=Math.round(c.clientHeight*dpr); } };
    fit();
    const W=()=>cv.width, H=()=>cv.height, X=x=>x/16*W(), Y=y=>y/9*H(), K=()=>H()/900;
    drawBackdrop(bgc,map);
    if(map.art){ const im=new Image(); im.onload=()=>{ const b=bgc.getContext('2d'), w=bgc.width, h=bgc.height; b.drawImage(im,0,0,w,h);
      const vg=b.createRadialGradient(w/2,h*0.55,h*0.35,w/2,h/2,w*0.75); vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.35)'); b.fillStyle=vg; b.fillRect(0,0,w,h);
      const tp=b.createLinearGradient(0,0,0,h*0.18); tp.addColorStop(0,'rgba(0,0,0,.45)'); tp.addColorStop(1,'rgba(0,0,0,0)'); b.fillStyle=tp; b.fillRect(0,0,w,h*0.18); };
      im.onerror=()=>{ drawBackdrop(bgc,{...map, art:null, theme:map.theme||'farm'}); }; im.src=map.art; }
    const geo=laneGeom(map);
    // display state
    let D=JSON.parse(JSON.stringify(o.startState)); let order=null;
    const pos={}; // smoothed screen positions by id
    const seqBefore=o.seqTo.slice(0,o.action*BTL_ACTION); const chunk=o.seqTo.slice(o.action*BTL_ACTION);
    const cnt=btlCounts(seqBefore);
    const setCnt=()=>{ $('#bcG').textContent=cnt.G; $('#bcH').textContent=cnt.H; $('#bcA').textContent=cnt.A; };
    setCnt();
    const parts=[], projs=[], marks=[]; let shake=0, flash=0;
    const targetOf=(id)=>{ const u=D.units.find(x=>x.uid===id); if(u) return unitPos(D,u,geo); const e=D.enemy.find(x=>x.eid===id); if(e) return enemyPos(D,e,geo); return null; };
    function forceHud(){ const al=D.units.filter(u=>u.alive), el=al.filter(u=>u.elite).length, lostE=D.units.filter(u=>u.elite&&!u.alive).length;
      $('#bforce').innerHTML=`Force ${al.length}${el?` · <span style="color:${COL.gold}">★ ${el} elite</span>`:''}${lostE?` · <span class="c-bad">${lostE} elite lost</span>`:''} · Enemy destroyed ${D.ekills||0}`; }
    forceHud();
    // ---------- drawing units (top-down) ----------
    function rr(x,y,w,h,r){ ctx.beginPath(); ctx.roundRect(x,y,w,h,r); }
    function drawTank(x,y,s,side,u,ang){
      ctx.save(); ctx.translate(x,y); ctx.rotate(ang); const c=side>0?COL.us:COL.en, d=side>0?COL.usD:COL.enD;
      ctx.fillStyle='rgba(0,0,0,.35)'; rr(-9*s+3*s,-14*s+3*s,18*s,28*s,3*s); ctx.fill();
      ctx.fillStyle=u.dead?'#2b2a28':d; rr(-10*s,-14*s,5*s,28*s,2*s); ctx.fill(); rr(5*s,-14*s,5*s,28*s,2*s); ctx.fill();
      ctx.fillStyle=u.dead?'#3a3835':c; rr(-7*s,-12*s,14*s,24*s,3*s); ctx.fill();
      ctx.fillStyle=u.dead?'#2f2e2b':d; ctx.beginPath(); ctx.arc(0,1*s,5.5*s,0,6.283); ctx.fill();
      if(!u.dead){ ctx.fillStyle=c; ctx.beginPath(); ctx.arc(0,1*s,4.2*s,0,6.283); ctx.fill(); }
      ctx.fillStyle=u.dead?'#2b2a28':d; ctx.fillRect(-1.2*s,-(17+(u.rec||0)*-3)*s,2.4*s,14*s);
      ctx.restore();
    }
    function drawAPC(x,y,s,side,u,ang){ ctx.save(); ctx.translate(x,y); ctx.rotate(ang); const c=side>0?COL.us:COL.en, d=side>0?COL.usD:COL.enD;
      ctx.fillStyle='rgba(0,0,0,.35)'; rr(-7*s+3*s,-11*s+3*s,14*s,22*s,4*s); ctx.fill();
      ctx.fillStyle=u.dead?'#3a3835':c; rr(-7*s,-11*s,14*s,22*s,4*s); ctx.fill(); ctx.fillStyle=u.dead?'#2b2a28':d; rr(-4*s,-4*s,8*s,8*s,2*s); ctx.fill(); ctx.fillRect(-0.8*s,-10*s,1.6*s,7*s); ctx.restore(); }
    function drawInf(x,y,s,side,u,t){ const c=side>0?COL.usL:COL.enL, d=side>0?COL.usD:COL.enD; const n=u.dead?0:4;
      for(let i=0;i<(u.dead?3:n);i++){ const a=i*1.7+(hash((u.uid||u.eid)+'i'+i)*2), r=(4+i*1.6)*s; const px=x+Math.cos(a)*r+Math.sin(t*3+i)*0.6*s, py=y+Math.sin(a)*r*0.8;
        if(u.dead){ ctx.fillStyle='rgba(40,30,25,.6)'; ctx.fillRect(px-2*s,py-1*s,4*s,2*s); continue; }
        ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(px+1.2*s,py+1.2*s,2.4*s,0,6.283); ctx.fill(); ctx.fillStyle=d; ctx.beginPath(); ctx.arc(px,py,2.5*s,0,6.283); ctx.fill(); ctx.fillStyle=c; ctx.beginPath(); ctx.arc(px,py,1.6*s,0,6.283); ctx.fill(); } }
    function drawMG(x,y,s,side,u){ ctx.save(); ctx.translate(x,y); ctx.strokeStyle=u.dead?'#4a4238':'#8c7b5c'; ctx.lineWidth=4*s; ctx.lineCap='round'; ctx.beginPath(); ctx.arc(0,side>0?3*s:-3*s,8*s,side>0?3.6:0.5,side>0?5.8:2.6); ctx.stroke(); ctx.restore(); if(!u.dead) drawInf(x,y,s*0.8,side,{...u, uid:(u.uid||u.eid)+'m'},0); }
    function drawArty(x,y,s,side,u,ang){ ctx.save(); ctx.translate(x,y); ctx.rotate(ang); const d=side>0?COL.usD:COL.enD, c=side>0?COL.us:COL.en;
      ctx.fillStyle='rgba(0,0,0,.3)'; ctx.beginPath(); ctx.arc(2*s,2*s,9*s,0,6.283); ctx.fill();
      ctx.strokeStyle=u.dead?'#2b2a28':d; ctx.lineWidth=2.2*s; ctx.beginPath(); ctx.moveTo(-8*s,9*s); ctx.lineTo(0,0); ctx.lineTo(8*s,9*s); ctx.stroke();
      ctx.fillStyle=u.dead?'#3a3835':c; ctx.fillRect(-4*s,-3*s,8*s,6*s); ctx.fillStyle=u.dead?'#2b2a28':d; ctx.fillRect(-1.3*s,-(17-(u.rec||0)*3)*s,2.6*s,15*s); ctx.restore(); }
    function drawATG(x,y,s,side,u,ang){ drawArty(x,y,s*0.75,side,u,ang); }
    function drawThing(kind,x,y,s,side,u,ang,t){
      const sp=SPR[kind==='atg'?'none':kind];
      if(sp && !u.dead){ const rad=(kind==='tank'?17:kind==='apc'?14:kind==='arty'?13:11)*s; ctx.fillStyle=(side>0?COL.usTeam:COL.enTeam)+'.28)'; ctx.strokeStyle=(side>0?COL.usTeam:COL.enTeam)+'.85)'; ctx.lineWidth=1.4*s; ctx.beginPath(); ctx.ellipse(x,y+2*s,rad,rad*0.62,0,0,6.283); ctx.fill(); ctx.stroke(); }
      if(sp){ const img=u.dead?sp.dead:side>0?sp.us:sp.en, h=36*s, w=h*img.width/img.height;
        ctx.save(); ctx.translate(x,y); ctx.rotate(ang); ctx.shadowColor='rgba(0,0,0,.45)'; ctx.shadowBlur=5*s; ctx.shadowOffsetX=3*s; ctx.shadowOffsetY=3*s;
        ctx.drawImage(img,-w/2,-h/2+(u.rec||0)*2*s,w,h); ctx.restore(); return; }
      ({tank:drawTank,apc:drawAPC,inf:drawInf,mg:drawMG,arty:drawArty,atg:drawATG}[kind]||drawInf)(x,y,s,side,u,kind==='inf'?t:ang); }
    function heading(lane,t,flip){ if(lane<0||!geo[lane]) return flip?Math.PI:0; const a=lanePt(geo[lane],Math.max(0,t-0.04)), b=lanePt(geo[lane],Math.min(1,t+0.04)); return Math.atan2(X(b[0])-X(a[0]), -(Y(b[1])-Y(a[1])))+(flip?Math.PI:0); }
    function smooth(id,p,dt){ const q=pos[id]; if(!q){ pos[id]=[p[0],p[1]]; return pos[id]; } const k=Math.min(1,dt*1.8); q[0]+=(p[0]-q[0])*k; q[1]+=(p[1]-q[1])*k; return q; }
    // ---------- effects ----------
    function boom(x,y,size){ shake=Math.max(shake,6*size*dpr); flash=Math.max(flash,0.1*size);
      for(let i=0;i<20*size;i++) parts.push({k:'fire',x,y,vx:(Math.random()-.5)*5*dpr*size,vy:(Math.random()-.5)*5*dpr*size,r:(3+Math.random()*7)*dpr*size*K(),life:0.45+Math.random()*0.35,t:0});
      for(let i=0;i<10*size;i++) parts.push({k:'smoke',x:x+(Math.random()-.5)*16*dpr,y:y+(Math.random()-.5)*16*dpr,vx:(0.3+Math.random()*0.5)*dpr,vy:-(0.1+Math.random()*0.4)*dpr,r:(8+Math.random()*12)*dpr*size*K(),life:2+Math.random()*1.6,t:0});
      marks.push({x,y,r:(6+Math.random()*6)*size*dpr*K()}); if(marks.length>140) marks.shift(); }
    function shoot(fromP,toP,kind,onHit,dur){ projs.push({kind,x0:fromP[0],y0:fromP[1],tx:toP[0],ty:toP[1],t:0,dur:dur||(kind==='shell'?0.8:kind==='round'?0.3:0.2),onHit}); }
    const scr=p=>[X(p[0]),Y(p[1])];
    const dep=yPx=> map.art ? 0.55+0.5*(yPx/H()) : 1;
    // ---------- per-card animation ----------
    function applySnap(ev){ const rec={}; D.units.forEach(u=>rec[u.uid]=u.rec||0); D.units=JSON.parse(JSON.stringify(ev.snap.units)); D.units.forEach(u=>u.rec=rec[u.uid]||0); D.enemy=JSON.parse(JSON.stringify(ev.snap.enemy)); D.p=ev.p.slice(); D.cap=ev.capd.slice(); }
    function animEvent(ev){
      cnt[ev.c]++; setCnt();
      const uById=id=>D.units.find(u=>u.uid===id), eById=id=>D.enemy.find(e=>e.eid===id);
      const done=()=>{ applySnap(ev); D.ekills=ev.ekAfter; forceHud(); if(ev.cap!=null) capFx(ev.cap); };
      if(ev.barrage){ const s=uById(ev.barrage.from), sp=s?scr(unitPos(D,s,geo)):[W()/2,H()]; if(s) s.rec=1;
        const tp=[X(ev.barrage.x*16),Y(ev.barrage.y*9)];
        for(let i=0;i<5;i++){ const jx=tp[0]+(Math.random()-.5)*ev.barrage.rad/16*W()*0.9, jy=tp[1]+(Math.random()-.5)*ev.barrage.rad/9*H()*0.9; setTimeout(()=>shoot(sp,[jx,jy],'shell',()=>boom(jx,jy,0.8),0.7+i*0.05),i*90); } }
      if(ev.c==='G'){
        const s=uById(ev.sh), t=eById(ev.tg);
        if(s&&t){ const sp=scr(unitPos(D,s,geo)), tp=scr(enemyPos(D,t,geo)); s.rec=1; s.flash=0.12; const cls=UNITS[s.model].cls; shoot(sp,tp,cls==='tank'?'round':'tracer',()=>{ boom(tp[0],tp[1],ev.kill?(t.type==='tank'?1:0.6):0.35); done(); }); }
        else setTimeout(done,250);
      } else if(ev.c==='H'){
        const s=uById(ev.sh), t=eById(ev.tg), es=eById(ev.es), v=uById(ev.hit||ev.miss);
        if(s&&t){ const sp=scr(unitPos(D,s,geo)), tp=scr(enemyPos(D,t,geo)); shoot(sp,tp,'tracer',()=>boom(tp[0],tp[1],ev.kill?0.6:0.3)); }
        if(es&&v){ const ep=scr(enemyPos(D,es,geo)), vp=scr(unitPos(D,v,geo)); setTimeout(()=>shoot(ep,[vp[0]+(ev.hit?0:(Math.random()-.5)*30*dpr),vp[1]+(ev.hit?0:(Math.random()-.5)*30*dpr)],'tracer',()=>{ boom(vp[0],vp[1],ev.hit?0.5:0.25); done(); }),220); }
        else setTimeout(done,400);
      } else {
        const v=uById(ev.hit||ev.near), es=eById(ev.es);
        if(v){ const vp=scr(unitPos(D,v,geo)); const off=ev.supp?(Math.random()<.5?-1:1)*25*dpr:0;
          if(ev.shell||!es){ shoot([vp[0]+W()*0.1,-20],[vp[0]+off,vp[1]+off*0.5],'shell',()=>{ boom(vp[0]+off,vp[1]+off*0.5,ev.dead?1.2:0.8); done(); },0.85); }
          else { const ep=scr(enemyPos(D,es,geo)); shoot(ep,[vp[0]+off,vp[1]],'round',()=>{ boom(vp[0]+off,vp[1],ev.dead?1.1:0.6); done(); }); }
          if(ev.hit2){ const v2=uById(ev.hit2); if(v2){ const p2=scr(unitPos(D,v2,geo)); setTimeout(()=>shoot([p2[0]-W()*0.08,-20],p2,'shell',()=>boom(p2[0],p2[1],0.9),0.8),250); } }
        } else setTimeout(done,300);
      }
    }
    let capBanner=0, capText='';
    function capFx(l){ capBanner=2.6; capText=`${map.obj[l]} taken`; const [x,y]=lanePt(geo[l],1); for(let i=0;i<3;i++) setTimeout(()=>boom(X(x)+(Math.random()-.5)*40*dpr,Y(y)+(Math.random()-.5)*30*dpr,0.6),i*150); }
    // ---------- main loop ----------
    let last=performance.now(), raf=0, done=false, phase='intro';
    function loop(now){
      const dt=Math.min(0.05,(now-last)/1000); last=now; const t=now/1000;
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W(),H());
      const sx=(Math.random()-.5)*shake, sy=(Math.random()-.5)*shake; shake*=0.88; ctx.translate(sx,sy);
      // scorch marks
      for(const m of marks){ ctx.fillStyle='rgba(25,20,15,.35)'; ctx.beginPath(); ctx.ellipse(m.x,m.y,m.r,m.r*0.8,0,0,6.283); ctx.fill(); }
      const k=K()*dpr*1.7;
      // lane arrows + objectives
      geo.forEach((g,l)=>{
        const ft=frontT(D.p[l]); const active = order ? order.lane===l : (D.ordLane===l);
        // our arrow
        if(!D.cap[l]){ const a=lanePt(g,Math.max(0,ft-0.12)), b2=lanePt(g,Math.min(0.99,ft+(active?0.14:0.06)));
          arrow(scr(a),scr(b2), active?'rgba(80,140,230,.55)':'rgba(80,140,230,.25)', (active?22:12)*k);
          const ea=lanePt(g,Math.min(0.99,ft+0.22)), eb=lanePt(g,ft+0.1); arrow(scr(ea),scr(eb),'rgba(210,70,55,.35)',10*k); }
        // objective marker
        const [ox,oy]=lanePt(g,1), op=scr([ox,oy]);
        ctx.lineWidth=3*k; ctx.strokeStyle='rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(op[0],op[1],17*k,0,6.283); ctx.stroke();
        ctx.strokeStyle=D.cap[l]?COL.us:COL.en; ctx.lineWidth=4*k; ctx.beginPath(); ctx.arc(op[0],op[1],17*k,-Math.PI/2,-Math.PI/2+6.283*(D.cap[l]?1:Math.min(1,D.p[l]))); ctx.stroke();
        ctx.fillStyle=D.cap[l]?COL.us:COL.en; ctx.beginPath(); ctx.moveTo(op[0]-2*k,op[1]+8*k); ctx.lineTo(op[0]-2*k,op[1]-10*k); ctx.lineTo(op[0]+9*k,op[1]-6*k); ctx.lineTo(op[0]-2*k,op[1]-2*k); ctx.fill();
        ctx.font=`600 ${Math.round(12*k)}px system-ui,sans-serif`; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillText(map.obj[l],op[0]+1,op[1]+32*k+1); ctx.fillStyle='#f3ead6'; ctx.fillText(map.obj[l],op[0],op[1]+32*k);
      });
      // enemy units
      for(const e of D.enemy){ const tp=scr(enemyPos(D,e,geo)); if(!e.alive && !pos[e.eid]) continue; const p=smooth(e.eid,tp,dt);
        const ea=heading(e.lane, Math.max(e.t, frontT(D.p[e.lane])+0.07), true);
        if(!e.alive){ if(e.type==='tank') drawThing('tank',p[0],p[1],k*0.9*dep(p[1]),-1,{dead:true},ea,t); continue; }
        drawThing(e.type,p[0],p[1],k*(e.type==='tank'?0.9:1)*dep(p[1]),-1,e,ea,t); }
      // our units
      for(const u of D.units){ const U=UNITS[u.model]; const tp=scr(unitPos(D,u,geo)); const p=smooth(u.uid,tp,dt); u.rec=Math.max(0,(u.rec||0)-dt*3);
        const s=k*(U.size||1)*(u.elite?1.12:1)*dep(p[1]);
        if(!u.alive){ if(U.cls==='tank'||U.cls==='apc'){ drawThing(U.cls,p[0],p[1],s,1,{dead:true},heading(u.lane,frontT(D.p[u.lane]||0)-0.03,false),t); if(Math.random()<0.15) parts.push({k:'smoke',x:p[0],y:p[1],vx:0.3*dpr,vy:-0.3*dpr,r:6*k,life:2,t:0}); } continue; }
        const ang = U.cls==='arty' ? 0 : heading(u.lane, frontT(D.p[u.lane]||0)-0.03, false);
        if(u.elite){ ctx.strokeStyle=COL.gold; ctx.lineWidth=1.6*k; ctx.beginPath(); ctx.ellipse(p[0],p[1]+2*s,(U.cls==='tank'?21:15)*s,(U.cls==='tank'?21:15)*s*0.62,0,0,6.283); ctx.stroke(); }
        drawThing(U.cls,p[0],p[1],s,1,u,ang,t);
        if(u.elite){ ctx.font=`600 ${Math.round(10*k)}px system-ui,sans-serif`; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillText(u.name,p[0]+1,p[1]+(U.cls==='tank'?30:22)*k+1); ctx.fillStyle=COL.gold; ctx.fillText(u.name,p[0],p[1]+(U.cls==='tank'?30:22)*k);
          const hpU=U.hp; for(let i=0;i<hpU;i++){ ctx.fillStyle=i<u.hp?'#7fd38a':'rgba(255,255,255,.2)'; ctx.fillRect(p[0]-hpU*3*k+i*6*k,p[1]-(U.cls==='tank'?26:19)*k,5*k,2.5*k); } }
      }
      // artillery target markers
      if(order) for(const a of order.arty){ const p=[X(a.x*16),Y(a.y*9)]; const r=(a.rad||0.9)/16*W(); ctx.strokeStyle='rgba(255,90,60,.9)'; ctx.lineWidth=2*k; ctx.setLineDash([6*k,5*k]); ctx.beginPath(); ctx.arc(p[0],p[1],r,0,6.283); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(p[0]-r*0.4,p[1]); ctx.lineTo(p[0]+r*0.4,p[1]); ctx.moveTo(p[0],p[1]-r*0.4); ctx.lineTo(p[0],p[1]+r*0.4); ctx.stroke(); }
      // projectiles
      for(let i=projs.length-1;i>=0;i--){ const p=projs[i]; p.t+=dt/p.dur; const q=Math.min(1,p.t);
        const x=p.x0+(p.tx-p.x0)*q, y=p.y0+(p.ty-p.y0)*q-(p.kind==='shell'?Math.sin(q*Math.PI)*H()*0.12:0);
        if(p.kind==='tracer'){ ctx.strokeStyle='rgba(255,225,130,.95)'; ctx.lineWidth=1.8*dpr; ctx.beginPath(); const q2=Math.max(0,q-0.2); ctx.moveTo(p.x0+(p.tx-p.x0)*q2,p.y0+(p.ty-p.y0)*q2); ctx.lineTo(x,y); ctx.stroke(); }
        else { ctx.fillStyle='rgba(255,235,180,1)'; ctx.beginPath(); ctx.arc(x,y,(p.kind==='shell'?3.4:2.6)*dpr*K()*1.5,0,6.283); ctx.fill(); if(p.kind==='shell') parts.push({k:'smoke',x,y,vx:0,vy:0,r:3*dpr,life:0.6,t:0}); }
        if(p.t>=1){ projs.splice(i,1); if(p.onHit) p.onHit(); else boom(p.tx,p.ty,0.25); } }
      // particles
      for(let i=parts.length-1;i>=0;i--){ const q=parts[i]; q.t+=dt; if(q.t>=q.life){ parts.splice(i,1); continue; } const f=q.t/q.life; q.x+=q.vx; q.y+=q.vy; if(q.k==='fire'){ q.vx*=0.9; q.vy*=0.9; }
        if(q.k==='fire'){ ctx.fillStyle=`rgba(255,${Math.round(200-150*f)},${Math.round(80-70*f)},${1-f})`; ctx.beginPath(); ctx.arc(q.x,q.y,q.r*(1+f),0,6.283); ctx.fill(); }
        else { ctx.fillStyle=`rgba(60,56,52,${0.4*(1-f)})`; ctx.beginPath(); ctx.arc(q.x,q.y,q.r*(1+f*1.4),0,6.283); ctx.fill(); } }
      ctx.setTransform(1,0,0,1,0,0);
      if(flash>0.01){ ctx.fillStyle=`rgba(255,210,150,${flash})`; ctx.fillRect(0,0,W(),H()); flash*=0.85; }
      if(capBanner>0){ capBanner-=dt; ctx.globalAlpha=Math.min(1,capBanner); ctx.font=`700 ${Math.round(30*K()*dpr)}px Cinzel,serif`; ctx.textAlign='center'; ctx.fillStyle='rgba(0,0,0,.6)'; ctx.fillText(capText.toUpperCase(),W()/2+2,H()*0.45+2); ctx.fillStyle='#bcd6ff'; ctx.fillText(capText.toUpperCase(),W()/2,H()*0.45); ctx.globalAlpha=1; }
      if(!done) raf=requestAnimationFrame(loop);
    }
    function arrow(a,b,col,wd){ const dx=b[0]-a[0], dy=b[1]-a[1], L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, hx=b[0]-ux*wd*1.4, hy=b[1]-uy*wd*1.4;
      ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(a[0]-uy*wd*0.35,a[1]+ux*wd*0.35); ctx.lineTo(hx-uy*wd*0.5,hy+ux*wd*0.5); ctx.lineTo(hx-uy*wd,hy+ux*wd); ctx.lineTo(b[0],b[1]); ctx.lineTo(hx+uy*wd,hy-ux*wd); ctx.lineTo(hx+uy*wd*0.5,hy-ux*wd*0.5); ctx.lineTo(a[0]+uy*wd*0.35,a[1]-ux*wd*0.35); ctx.fill(); }
    raf=requestAnimationFrame(loop);

    // ---------- command phase ----------
    const prevOrd=(o.orders&&o.orders[o.action-1])||null;
    function strikesAvail(){ return D.units.filter(u=>u.alive && UNITS[u.model].cls==='arty').flatMap(u=>Array(UNITS[u.model].barr).fill(UNITS[u.model].rad)); }
    function command(){
      return new Promise(res=>{
        const def=autoOrders(D); order={lane: prevOrd && !D.cap[prevOrd.lane] ? prevOrd.lane : def.lane, stance: prevOrd?prevOrd.stance:'advance', arty:[]};
        const strikes=strikesAvail(); let left=CMD_SECONDS, timer=null;
        const box=$('#bcmd');
        const paint=()=>{ box.innerHTML=`<div class="bcmd-h">Orders <span class="c-muted">· auto in <b id="bcd">${left}</b>s</span></div>
          <div class="bcmd-r"><span>Axis</span><div class="seg sm">${[0,1,2].map(l=>`<button data-lane="${l}" class="${order.lane===l?'on':''}" ${D.cap[l]?'disabled':''}>${['◀ ','▲ ','▶ '][l]}${esc(map.obj[l])}${D.cap[l]?' ✓':''}</button>`).join('')}</div></div>
          <div class="bcmd-r"><span>Stance</span><div class="seg sm">${[['assault','Assault','more ground, more losses'],['advance','Advance','balanced'],['hold','Hold','fewer losses, slower']].map(([k,l,tt])=>`<button data-stance="${k}" class="${order.stance===k?'on':''}" title="${tt}">${l}</button>`).join('')}</div></div>
          <div class="bcmd-r"><span>Artillery</span><span class="note">${strikes.length?`Tap the map to place strikes: <b>${order.arty.length}/${strikes.length}</b>${order.arty.length?' · tap a circle to remove':' · unplaced strikes auto-target'}`:'No guns left.'}</span></div>
          <div class="bcmd-r" style="justify-content:flex-end"><button class="btn pri" id="bgo">Execute ▸</button></div>`; };
        paint();
        const reset=()=>{ left=CMD_SECONDS; const c=$('#bcd'); if(c) c.textContent=left; };
        box.onclick=e=>{ e.stopPropagation(); const l=e.target.closest('[data-lane]'), s=e.target.closest('[data-stance]');
          if(l && !l.disabled){ order.lane=+l.dataset.lane; reset(); paint(); }
          else if(s){ order.stance=s.dataset.stance; reset(); paint(); }
          else if(e.target.id==='bgo') finish(); };
        cv.style.pointerEvents='auto';
        cv.onclick=e=>{ const r=cv.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width, y=(e.clientY-r.top)/r.height;
          const hit=order.arty.findIndex(a=>Math.hypot((a.x-x)*16,(a.y-y)*9)<(a.rad||0.9)); if(hit>=0) order.arty.splice(hit,1);
          else if(order.arty.length<strikes.length) order.arty.push({x:+x.toFixed(3), y:+y.toFixed(3), rad:strikes[order.arty.length]});
          reset(); paint(); };
        box.classList.add('on');
        timer=setInterval(()=>{ left--; const c=$('#bcd'); if(c) c.textContent=left; if(left<=0) finish(); },1000);
        function finish(){ clearInterval(timer); box.classList.remove('on'); box.onclick=null; cv.onclick=null; cv.style.pointerEvents='none'; res({lane:order.lane, stance:order.stance, arty:order.arty.map(a=>({x:a.x,y:a.y}))}); }
      });
    }
    // ---------- run ----------
    const timers=[]; let finished=false;
    const lineFor=c=>{ const cc=btlCounts(c), sc=(cc.G+0.6*cc.H)/Math.max(1,c.length); const pool=sc>=0.82?BTL_LINES.good:sc>=0.68?BTL_LINES.mixed:BTL_LINES.bad; return pool[Math.floor(Math.random()*pool.length)]; };
    async function run(){
      let orders=o.orders?o.orders.slice():[];
      if(o.command){ const ord=await command(); orders[o.action]=ord; if(o.onOrders) o.onOrders(ord); }
      const sim=simBattle(o.cfg, o.seqTo, orders, o.action+1); const act=sim.acts[o.action];
      order={...act.ord, arty:(act.ord.arty||[]).map((a,i)=>({...a, rad:(strikesAvail()[i]||0.9)}))};
      // move to formation
      D=JSON.parse(JSON.stringify(act.afterOrders)); D.ordLane=act.ord.lane; D.ekills=o.startState.ekills||0;
      const line=$('#bline'); line.textContent=lineFor(chunk); setTimeout(()=>line.classList.add('on'),200); setTimeout(()=>line.classList.remove('on'),4200);
      const delay = act.evs.length>12 ? 560 : 720;
      act.evs.forEach((ev,i)=>timers.push(setTimeout(()=>{ if(!finished) animEvent(ev); }, 1200+i*delay)));
      const endAt=1200+act.evs.length*delay+1600;
      timers.push(setTimeout(()=>end(act,sim), endAt));
      $('#bskip').onclick=e=>{ e.stopPropagation(); if(finished) return; timers.forEach(clearTimeout); const lastEv=act.evs[act.evs.length-1]; if(lastEv){ applySnap(lastEv); D.ekills=lastEv.ekAfter; } for(const c of chunk) cnt[c]++; setCnt(); forceHud(); end(act,sim,true); };
    }
    function close(extra){ done=true; cancelAnimationFrame(raf); el.classList.remove('show'); el.innerHTML=''; resolve(extra||{}); }
    function end(act,sim,skipped){
      if(finished) return; finished=true; timers.forEach(clearTimeout);
      if(!o.final){ setTimeout(()=>close({skipped}), skipped?150:0); return; }
      const sm=btlSummary(o.cfg, o.seqTo, simBattle(o.cfg,o.seqTo,(o.orders||[]).map((x,i)=>i===o.action?act.ord:x)), !!o.auto);
      const lostN=sm.lost.map(id=>{ const u=sim.st.units.find(x=>x.uid===id); return u?`${UNITS[u.model].name} “${esc(u.name)}”`:''; }).filter(Boolean);
      const res=$('#bres'); const c=sm.c, n=o.seqTo.length;
      res.innerHTML=`<h4>${esc(sm.tier.label)}</h4><div class="note" style="font-size:15px;color:#d8cfbb">${esc(o.name)}</div>
        <div class="kv" style="max-width:300px;margin:12px auto 0"><span>Good / Hard / Again</span><span><span class="c-good">${c.G}</span> / <span class="c-warn">${c.H}</span> / <span class="c-bad">${c.A}</span></span>
          <span>Retention</span><span>${Math.round((c.G+c.H)/Math.max(1,n)*100)}%</span>
          <span>Objectives</span><span>${sm.caps} / 3</span><span>Enemy destroyed</span><span>${sm.ekills}</span>
          <span>Prestige</span><span style="color:${COL.gold}">+${sm.prestige} ★</span></div>
        ${lostN.length?`<div class="note c-bad" style="margin-top:10px">Lost for good: ${lostN.join(', ')}</div>`:''}
        ${sm.gained.length?`<div class="note" style="margin-top:10px;color:${COL.gold}">Captured: ${UNITS[sm.gained[0].model].name} “${esc(sm.gained[0].name)}” joins your army.</div>`:''}
        ${G&&G.backlog&&sm.tier.f>0?'<div class="note" style="margin-top:6px">The siege lines are pushed back.</div>':''}
        <div class="oathbtns"><button class="btn pri" id="bclose">Continue</button></div>`;
      res.classList.add('on'); const bc=$('.bcount'); if(bc) bc.style.display='none';
      $('#bclose').onclick=e=>{ e.stopPropagation(); close({skipped}); };
    }
    run();
  });
}

/* ---------- hooks into the main app ---------- */
document.addEventListener('click', e=>{
  const bs=e.target.closest('[data-bs]'); if(bs){ document.querySelectorAll('#bt-size button').forEach(x=>x.classList.toggle('on',x===bs)); return; }
  const dep=e.target.closest('[data-dep]'); if(dep){ const n=document.querySelectorAll('[data-dep]:checked').length; if(n>ELITE_CAP){ dep.checked=false; toast(`Up to ${ELITE_CAP} elite units per battle.`); } return; }
  const b=e.target.closest('[data-a]'); if(!b) return; const a=b.dataset.a;
  if(a==='bt-open') openBattleStart();
  else if(a==='bt-dice'){ $('#bt-name').value=btlName('Battle'); }
  else if(a==='bt-remap'){ const seed='m'+uid(), mp=mapFor(seed), el=$('#bt-map'); el.dataset.seed=seed; el.textContent=`${THEMES[mp.theme]?THEMES[mp.theme].name:'Painted map'} · objectives: ${mp.obj.join(', ')}`; }
  else if(a==='bt-go') battleStart();
  else if(a==='bt-status') openBattleStatus();
  else if(a==='bt-end'){ if(confirm('End the battle now with the cards done so far?')) battleEndNow(); }
  else if(a==='bt-play') battlePlayNext();
  else if(a==='bt-list') openBattleList();
  else if(a==='bt-watch') watchBattle(b.dataset.id);
  else if(a==='bt-depot') openDepot();
  else if(a==='bt-buy'){ const U=UNITS[b.dataset.m]; if(U && confirm(`Requisition ${U.name} for ${U.cost} prestige?`)) buyUnit(b.dataset.m); }
});
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && btlGet()) setTimeout(()=>battleTick(true), 700); });
setInterval(()=>{ if(btlGet()) battleTick(false); }, 8000);
setInterval(()=>{ if(document.visibilityState==='visible') autoSkirmishes(); }, 3*60*1000);
setTimeout(()=>{ renderBattleChip(); autoSkirmishes(); }, 2500);
