'use strict';
/* =====================================================================
   Anki battles — modern combat driven by your Again / Hard / Good log.
   Loaded after the main script; uses its globals (S, G, ankiCall, ...).
   ===================================================================== */
const LS_BTL='imc.battle', LS_CUR='imc.revCursor', LS_WATCHED='imc.watched';
const BTL_ACTION=20;
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

/* ---------- reading Anki's answer log ---------- */
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

/* ---------- recorded battle (local to the Mac running Anki) ---------- */
function btlGet(){ try{ return JSON.parse(localStorage.getItem(LS_BTL)); }catch(e){ return null; } }
function btlSet(b){ try{ if(b) localStorage.setItem(LS_BTL, JSON.stringify(b)); else localStorage.removeItem(LS_BTL); }catch(e){} }
function openBattleStart(){
  if(localStorage.getItem(LS_ANKI)!=='1'){ toast('Battles read Anki on your Mac. Turn on "This device runs Anki" in Settings.'); return; }
  const cur=btlGet(); if(cur){ openBattleStatus(); return; }
  const sizeSel = +(localStorage.getItem('imc.btlSize')||100);
  openSheet(`<h2>Start a battle</h2><div class="note">Review in Anki as usual. Every ${BTL_ACTION} cards becomes an action; switch back here to watch it. Easy counts as Good.</div>
    <div class="field"><label>Name</label><div class="row"><input type="text" id="bt-name" value="${esc(btlName('Battle'))}" style="flex:1" maxlength="48"><button class="btn sm" data-a="bt-dice">🎲</button></div></div>
    <div class="field"><label>Size</label><div class="seg" id="bt-size">${BTL_SIZES.map(s=>`<button data-bs="${s.n}" class="${s.n===sizeSel?'on':''}">${s.label}<br><small>${s.n} cards</small></button>`).join('')}</div></div>
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
  try{ localStorage.setItem('imc.btlSize',String(size)); }catch(e){}
  const b={id:'btl-'+uid(), name, size, startTs:Date.now(), seq:'', shown:0, front:0.5};
  btlSet(b); try{ localStorage.setItem(LS_CUR, String(b.startTs)); }catch(e){}
  closeSheet(); btlRefresh(); toast(`${name} has begun. Go review — come back every ${BTL_ACTION} cards.`);
}
let btlBusy=false;
async function battleTick(force){
  const b=btlGet(); if(!b || btlBusy) return;
  if(localStorage.getItem(LS_ANKI)!=='1') return;
  btlBusy=true;
  try{
    const rev=await ankiAnswersSince(b.startTs);
    const seq=rev.map(r=>r.e).join('').slice(0,b.size);
    if(seq!==b.seq){ b.seq=seq; b.lastId=(rev[Math.min(rev.length,b.size)-1]||{}).id||b.lastId; btlSet(b); btlRefresh(); }
    const ready = (b.seq.length-b.shown>=BTL_ACTION) || (b.seq.length>=b.size && b.shown<b.size);
    if(ready && document.visibilityState==='visible' && !CUT && $('#gate').classList.contains('hidden') && (force || $('#sheetbg').classList.contains('hidden'))) await battlePlayNext();
    else if(ready){ document.title='⚔ Action ready · IM Campaign'; }
  }catch(e){ /* Anki closed */ }
  finally{ btlBusy=false; }
}
async function battlePlayNext(){
  const b=btlGet(); if(!b) return;
  closeSheet();
  const from=b.shown, to=Math.min(b.seq.length, from+BTL_ACTION, b.size);
  const chunk=b.seq.slice(from,to); if(!chunk.length) return;
  const final = to>=b.size;
  const total=Math.ceil(b.size/BTL_ACTION), idx=Math.floor(from/BTL_ACTION)+1;
  document.title='IM Campaign';
  const res=await playBattle({name:b.name, chunk, action:idx, actions:total, front:b.front, size:b.size, final, all:b.seq.slice(0,to)});
  b.shown=to; b.front=res.front; btlSet(b);
  if(final) battleFinish(b);
  renderBattleChip();
}
function battleFinish(b){
  const seq=b.seq.slice(0,b.size); if(!seq.length){ btlSet(null); renderBattleChip(); return; }
  const c=btlCounts(seq), tier=btlTier(seq);
  addEvent({id:b.id, type:'battle', name:b.name, size:b.size, seq, g:c.G, h:c.H, a:c.A, tier:tier.k, auto:false, front:b.front});
  try{ if(b.lastId) localStorage.setItem(LS_CUR, String(b.lastId)); }catch(e){}
  btlSet(null); btlRefresh();
}
async function battleEndNow(){
  const b=btlGet(); if(!b) return; closeSheet();
  await battleTick(); const nb=btlGet()||b;
  if(nb.seq.length>nb.shown){ nb.size=nb.seq.length; btlSet(nb); await battlePlayNext(); }
  else { nb.size=nb.seq.length; battleFinish(nb); }
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
  const w=watchedSet(), mac=localStorage.getItem(LS_ANKI)==='1';
  const won=list.filter(e=>btlTier(e.seq||'').f>=0.5).length, cards=list.reduce((a,e)=>a+(e.seq||'').length,0);
  const row=e=>{ const t=btlTier(e.seq||''); return `<li><span class="d">${fmtD(e.date)}</span><span><b>${esc(e.name)}</b> — <span class="${t.f>=0.5?'c-good':t.f>0?'c-warn':'c-bad'}">${t.label}</span> <span class="c-muted">· ${(e.seq||'').length} cards · ${e.g} good · ${e.h} hard · ${e.a} again</span>${w.has(e.id)?'':' <span class="pill c-warn" style="font-size:9px">new</span>'}</span><button class="btn sm" style="margin-left:auto" data-a="bt-watch" data-id="${e.id}">Watch</button></li>`; };
  return `<div class="card" style="margin-bottom:10px"><h3>The Anki front</h3>
    ${b?`<div class="big" style="font-size:22px">${esc(b.name)}</div><div class="sub">${b.seq.length} / ${b.size} cards · action every ${BTL_ACTION}</div><div class="bar"><div style="width:${Math.min(100,b.seq.length/b.size*100)}%;background:#e0705f"></div></div>
      <div class="row" style="margin-top:9px;gap:8px"><button class="btn sm" data-a="bt-status">Status</button></div>`
     :`<div class="sub">${list.length?`${list.length} battle${list.length>1?'s':''} · ${won} won · ${cards.toLocaleString()} cards fought`:'Start a battle, then review in Anki. Every 20 cards plays out here. Reviews done without a battle become skirmishes you can watch later.'}</div>
      <div class="row" style="margin-top:9px;gap:8px">${mac?`<button class="btn pri sm" data-a="bt-open">⚔ Start battle</button>`:`<span class="note">Battles are recorded on the computer that runs Anki.</span>`}</div>`}
    ${list.length?`<ul class="log" style="margin-top:10px">${list.slice(0,8).map(row).join('')}</ul>${list.length>8?`<div class="row" style="margin-top:6px"><button class="btn sm" data-a="bt-list">All battles</button></div>`:''}`:''}
  </div>`;
}

/* ---------- auto skirmishes (reviews outside a recorded battle) ---------- */
async function autoSkirmishes(){
  if(btlGet() || localStorage.getItem(LS_ANKI)!=='1') return;
  let cur=+(localStorage.getItem(LS_CUR)||0);
  if(!cur){ try{ localStorage.setItem(LS_CUR, String(Date.now())); }catch(e){} return; }
  let rev; try{ rev=await ankiAnswersSince(cur); }catch(e){ return; }
  let made=0;
  while(rev.length>=BTL_ACTION && made<60){
    const part=rev.splice(0,BTL_ACTION), seq=part.map(r=>r.e).join(''), c=btlCounts(seq), last=part[part.length-1];
    const d=new Date(last.id);
    addEvent({id:'sk-'+part[0].id, type:'battle', name:btlName('Skirmish'), size:BTL_ACTION, seq, g:c.G, h:c.H, a:c.A, tier:btlTier(seq).k, auto:true, date:ymd(d)}, true);
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
  openSheet(`<h2>Battles</h2><div class="note">Every ${BTL_ACTION} Anki cards outside a recorded battle becomes a skirmish. Tap one to watch it.</div>
    <ul class="log" style="margin-top:10px">${list.map(e=>{ const t=btlTier(e.seq||''); return `<li><span class="d">${fmtD(e.date)}</span><span><b>${esc(e.name)}</b> — <span class="${t.f>=0.5?'c-good':t.f>0?'c-warn':'c-bad'}">${t.label}</span> <span class="c-muted">· ${e.g} good · ${e.h} hard · ${e.a} again</span>${w.has(e.id)?'':' <span class="pill c-warn" style="font-size:9px">new</span>'}</span><button class="btn sm" style="margin-left:auto" data-a="bt-watch" data-id="${e.id}">Watch</button></li>`; }).join('')||'<li class="c-muted">No battles yet.</li>'}</ul>
    <div class="actions"><button class="btn pri" data-a="close">Close</button></div>`);
}
async function watchBattle(id){
  const e=liveEvents(S).find(x=>x.id===id); if(!e) return; closeSheet(); markWatched(id);
  const seq=e.seq||''; let front=0.5;
  const acts=Math.ceil(seq.length/BTL_ACTION);
  for(let i=0;i<acts;i++){ const r=await playBattle({name:e.name, chunk:seq.slice(i*BTL_ACTION,(i+1)*BTL_ACTION), action:i+1, actions:acts, front, size:seq.length, final:i===acts-1, all:seq.slice(0,(i+1)*BTL_ACTION)}); front=r.front; if(r.skipped && i<acts-1){ /* keep going */ } }
}

/* =====================================================================
   The battle scene
   ===================================================================== */
const BF_ART=['art/bf_1.webp','art/bf_2.webp','art/bf_3.webp','art/bf_4.webp'];
const BTL_LINES={
  good:['The armored column breaks through the treeline.','Forward observers walk the barrage onto their guns.','The line surges forward. Their positions collapse.','Tanks roll over the first trench.'],
  mixed:['The infantry advance under heavy fire.','Ground is taken, yard by bloody yard.','Both sides trade fire across the open field.','The push holds, but it costs us.'],
  bad:['Enemy artillery pins the line down.','Their counterattack forces us back.','We are taking heavy losses. Hold the line.','The assault stalls in the mud.']
};
function playBattle(o){
  return new Promise(resolve=>{
    const el=$('#cut');
    const bg=BF_ART[Math.floor(hash('bf'+o.name)*BF_ART.length)];
    el.innerHTML=`<div class="cstage bst" id="bstage"><div class="cbg" id="bbg" style="animation:none;inset:0;background:linear-gradient(#2a2622 0%,#4a3a2c 45%,#1a1815 60%,#0e0d0b 100%)"></div>
      <canvas class="cfx" id="bcv"></canvas>
      <div class="bhud"><div class="bname">${esc(o.name)}</div><div class="bsub">Action ${o.action} of ${o.actions}</div></div>
      <div class="bcount"><span class="c-good">✔ <b id="bcG">0</b></span><span class="c-warn">◐ <b id="bcH">0</b></span><span class="c-bad">✖ <b id="bcA">0</b></span></div>
      <div class="bfront"><div class="bobj" title="Objective"></div><div class="bmark" id="bmark"></div></div>
      <div class="bline" id="bline"></div>
      <div class="cpanel" id="bres"></div>
      <button class="cskip" id="bskip">Skip ▸▸</button></div>`;
    el.classList.add('show');
    const im=new Image(); im.onload=()=>{ const d=$('#bbg'); if(d){ d.style.background=`url("${bg}") center/cover`; artOk=true; } }; im.src=bg;
    const stage=$('#bstage'), cv=$('#bcv'), ctx=cv.getContext('2d');
    const fit=()=>{ cv.width=cv.clientWidth*devicePixelRatio; cv.height=cv.clientHeight*devicePixelRatio; };
    fit();
    const W=()=>cv.width, H=()=>cv.height, dpr=devicePixelRatio;
    const seqCounts=btlCounts(o.all.slice(0, o.all.length-o.chunk.length));
    const cnt={G:seqCounts.G,H:seqCounts.H,A:seqCounts.A};
    const setCnt=()=>{ $('#bcG').textContent=cnt.G; $('#bcH').textContent=cnt.H; $('#bcA').textContent=cnt.A; };
    setCnt();
    let front=o.front, frontShown=o.front;
    const step=0.5/Math.max(10,o.size);
    // --- scene objects
    const rows=[{y:0.70,s:0.55},{y:0.78,s:0.78},{y:0.88,s:1.05}];
    const S0=Math.min(W()/1600, H()/900)*1.55;
    const mkUnit=(side,type,row,off)=>({side,type,row,off,hp:type==='tank'?2:type==='apc'?2:1,dead:0,dmg:0,walk:Math.random()*6,born:performance.now(),flash:0,recoil:0});
    const army=side=>{
      const u=[]; const big=o.size>=100;
      u.push(mkUnit(side,'tank',1,0.10)); if(big) u.push(mkUnit(side,'tank',2,0.17));
      u.push(mkUnit(side,'apc',0,0.20)); u.push(mkUnit(side,'mg',2,0.05));
      for(let i=0;i<(big?7:5);i++) u.push(mkUnit(side,'inf',i%3,0.03+i*0.028));
      if(side===1) u.push(mkUnit(side,'arty',0,0.33));
      return u;
    };
    const units=[...army(1),...army(-1)];
    const parts=[], projs=[];
    let shake=0, flashScreen=0;
    const ux=u=>{ const r=rows[u.row]; const fx=frontShown*W(); return u.side===1 ? fx - u.off*W() - (1-r.s)*0.02*W() : fx + u.off*W() + (1-r.s)*0.02*W(); };
    const uy=u=>rows[u.row].y*H();
    const us=u=>rows[u.row].s*S0;
    // --- procedural backdrop (used until painted battlefield art is added)
    let artOk=false; const bdc=document.createElement('canvas');
    function buildBackdrop(){
      bdc.width=W(); bdc.height=H(); const b=bdc.getContext('2d'), w=W(), h=H(), R=n=>hash(o.name+n);
      const sky=b.createLinearGradient(0,0,0,h*0.62); sky.addColorStop(0,'#1d1f26'); sky.addColorStop(0.55,'#4a3b30'); sky.addColorStop(1,'#a2643a'); b.fillStyle=sky; b.fillRect(0,0,w,h);
      const sun=b.createRadialGradient(w*(0.3+R('s')*0.4),h*0.6,0,w*0.5,h*0.6,w*0.6); sun.addColorStop(0,'rgba(255,150,70,.45)'); sun.addColorStop(1,'rgba(255,150,70,0)'); b.fillStyle=sun; b.fillRect(0,0,w,h);
      const hills=(base,amp,col,seed)=>{ b.fillStyle=col; b.beginPath(); b.moveTo(0,h); for(let x=0;x<=w;x+=w/60){ const y=base*h - (Math.sin(x/w*6+R(seed)*9)*0.5+Math.sin(x/w*15+R(seed+'b')*9)*0.25+0.6)*amp*h; b.lineTo(x,y);} b.lineTo(w,h); b.fill(); };
      hills(0.6,0.07,'#2f2a27','h1'); hills(0.63,0.04,'#25221f','h2');
      // distant burning town
      for(let i=0;i<9;i++){ const x=w*(0.55+R('t'+i)*0.4), bw=w*0.012*(1+R('w'+i)), bh=h*0.03*(1+R('hh'+i)*1.5); b.fillStyle='#1c1a19'; b.fillRect(x,h*0.6-bh,bw,bh); }
      const g=b.createLinearGradient(0,h*0.6,0,h); g.addColorStop(0,'#3a3128'); g.addColorStop(0.35,'#2a241f'); g.addColorStop(1,'#141210'); b.fillStyle=g; b.fillRect(0,h*0.6,w,h*0.4);
      b.strokeStyle='rgba(0,0,0,.25)'; b.lineWidth=2*dpr; for(let i=0;i<26;i++){ const y=h*(0.64+R('l'+i)*0.34), x=w*R('x'+i); b.beginPath(); b.moveTo(x,y); b.quadraticCurveTo(x+w*0.05,y-4*dpr,x+w*(0.08+R('q'+i)*0.1),y); b.stroke(); }
      for(let i=0;i<7;i++){ const x=w*R('c'+i), y=h*(0.68+R('cy'+i)*0.26), r=w*0.02*(1+R('cr'+i)); b.fillStyle='rgba(10,9,8,.45)'; b.beginPath(); b.ellipse(x,y,r,r*0.28,0,0,6.283); b.fill(); }
      const hz=b.createLinearGradient(0,h*0.52,0,h*0.7); hz.addColorStop(0,'rgba(150,110,80,0)'); hz.addColorStop(0.5,'rgba(150,110,80,.18)'); hz.addColorStop(1,'rgba(150,110,80,0)'); b.fillStyle=hz; b.fillRect(0,h*0.5,w,h*0.22);
    }
    buildBackdrop();
    // --- drawing
    const C={sil:'#1d1f22', sil2:'#2b2e33', us:'#5b9be0', en:'#d0503f'};
    function team(u){ return u.side===1?C.us:C.en; }
    function drawTank(u,x,y,s){
      const d=u.side; ctx.save(); ctx.translate(x,y); ctx.scale(d*s,s); if(u.dead){ ctx.rotate(-0.05); }
      ctx.fillStyle=u.dead?'#0b0b0c':C.sil;
      ctx.beginPath(); ctx.roundRect(-60,-18,120,18,9); ctx.fill();            // tracks
      ctx.fillStyle=u.dead?'#0d0d0e':C.sil2; for(let i=-48;i<=48;i+=16){ ctx.beginPath(); ctx.arc(i,-9,6,0,6.283); ctx.fill(); }
      ctx.fillStyle=u.dead?'#0b0b0c':C.sil; ctx.beginPath(); ctx.moveTo(-58,-18); ctx.lineTo(-50,-34); ctx.lineTo(48,-34); ctx.lineTo(62,-20); ctx.closePath(); ctx.fill();  // hull
      ctx.beginPath(); ctx.roundRect(-26,-52,46,20,7); ctx.fill();          // turret
      ctx.save(); ctx.translate(-u.recoil*6,0); ctx.fillRect(18,-46,62,6); ctx.restore();   // barrel
      if(!u.dead){ ctx.fillStyle=team(u); ctx.fillRect(-20,-40,10,3); }
      ctx.restore();
      if(u.flash>0){ muzzle(x+d*s*84, y-43*s, s*1.4); }
    }
    function drawAPC(u,x,y,s){
      const d=u.side; ctx.save(); ctx.translate(x,y); ctx.scale(d*s,s);
      ctx.fillStyle=u.dead?'#0b0b0c':C.sil;
      ctx.beginPath(); ctx.moveTo(-52,-12); ctx.lineTo(-52,-38); ctx.lineTo(28,-38); ctx.lineTo(54,-20); ctx.lineTo(54,-12); ctx.closePath(); ctx.fill();
      ctx.fillStyle=C.sil2; for(const i of [-36,-12,12,36]){ ctx.beginPath(); ctx.arc(i,-8,9,0,6.283); ctx.fill(); }
      ctx.fillStyle=u.dead?'#0b0b0c':C.sil; ctx.fillRect(-8,-46,20,9); ctx.fillRect(10,-44,30,3);
      if(!u.dead){ ctx.fillStyle=team(u); ctx.fillRect(-40,-30,12,3); }
      ctx.restore(); if(u.flash>0) muzzle(x+d*s*42, y-43*s, s*0.8);
    }
    function drawInf(u,x,y,s){
      const d=u.side, t=performance.now()/1000+u.walk; ctx.save(); ctx.translate(x,y); ctx.scale(d*s,s);
      ctx.fillStyle=u.dead?'#0b0b0c':C.sil; ctx.strokeStyle=ctx.fillStyle; ctx.lineWidth=4; ctx.lineCap='round';
      if(u.dead){ ctx.rotate(-1.4); }
      const sw=Math.sin(t*6)*5;
      ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(-4+sw,0); ctx.moveTo(0,-20); ctx.lineTo(4-sw,0); ctx.stroke();   // legs
      ctx.beginPath(); ctx.moveTo(0,-20); ctx.lineTo(2,-38); ctx.stroke();                                    // torso
      ctx.beginPath(); ctx.arc(3,-44,5.5,0,6.283); ctx.fill();                                                 // helmet
      ctx.beginPath(); ctx.ellipse(3,-46,7,3.2,0,Math.PI,0); ctx.fill();
      ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-2,-32); ctx.lineTo(20,-34); ctx.stroke();                 // rifle
      ctx.restore(); if(u.flash>0) muzzle(x+d*s*22, y-34*s, s*0.5);
    }
    function drawMG(u,x,y,s){
      const d=u.side; ctx.save(); ctx.translate(x,y); ctx.scale(d*s,s);
      ctx.fillStyle=u.dead?'#0b0b0c':'#17171a'; for(let i=-3;i<=3;i++){ ctx.beginPath(); ctx.ellipse(i*11,-6-(3-Math.abs(i))*2.2,9,6,0,0,6.283); ctx.fill(); }
      ctx.fillStyle=C.sil; ctx.beginPath(); ctx.arc(-4,-24,6,0,6.283); ctx.fill(); ctx.fillRect(-2,-24,34,3);
      ctx.restore(); if(u.flash>0) muzzle(x+d*s*34, y-23*s, s*0.6);
    }
    function drawArty(u,x,y,s){
      const d=u.side; ctx.save(); ctx.translate(x,y); ctx.scale(d*s,s);
      ctx.fillStyle=C.sil; ctx.beginPath(); ctx.arc(0,-12,12,0,6.283); ctx.fill();
      ctx.save(); ctx.translate(0,-16); ctx.rotate(-0.55); ctx.fillRect(-14-u.recoil*8,-4,78,7); ctx.restore();
      ctx.beginPath(); ctx.moveTo(-6,-10); ctx.lineTo(-46,-2); ctx.lineTo(-44,2); ctx.lineTo(-4,-6); ctx.fill();
      ctx.restore(); if(u.flash>0) muzzle(x+d*s*58, y-50*s, s*1.8);
    }
    function muzzle(x,y,s){ const g=ctx.createRadialGradient(x,y,0,x,y,26*s*dpr); g.addColorStop(0,'rgba(255,240,190,1)'); g.addColorStop(.35,'rgba(255,170,60,.8)'); g.addColorStop(1,'rgba(255,120,20,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,26*s*dpr,0,6.283); ctx.fill(); }
    function drawUnit(u){ const x=ux(u), y=uy(u), s=us(u);
      ctx.fillStyle='rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x,y+2*s,(u.type==='inf'?12:u.type==='mg'?40:64)*s,5*s,0,0,6.283); ctx.fill();
      ({tank:drawTank,apc:drawAPC,inf:drawInf,mg:drawMG,arty:drawArty}[u.type])(u,x,y,s); }
    // --- effects
    function boom(x,y,size){
      shake=Math.max(shake, 10*size*dpr); flashScreen=Math.max(flashScreen,0.18*size);
      for(let i=0;i<26*size;i++) parts.push({k:'fire',x,y,vx:(Math.random()-.5)*7*dpr*size,vy:-Math.random()*7*dpr*size,r:(4+Math.random()*10)*dpr*size,life:0.5+Math.random()*0.4,t:0});
      for(let i=0;i<14*size;i++) parts.push({k:'smoke',x:x+(Math.random()-.5)*30*dpr,y,vx:(Math.random()-.5)*1.2*dpr,vy:-(0.6+Math.random()*1.4)*dpr,r:(10+Math.random()*18)*dpr*size,life:2.2+Math.random()*1.6,t:0});
      for(let i=0;i<10*size;i++) parts.push({k:'debris',x,y,vx:(Math.random()-.5)*9*dpr,vy:-(3+Math.random()*7)*dpr,r:(1.5+Math.random()*2.5)*dpr,life:1.2,t:0,g:0.35*dpr});
    }
    function dust(x,y){ for(let i=0;i<6;i++) parts.push({k:'smoke',x,y,vx:(Math.random()-.5)*1.5*dpr,vy:-(0.3+Math.random()*0.6)*dpr,r:(5+Math.random()*7)*dpr,life:1+Math.random(),t:0}); }
    function shoot(a,b,kind,onHit){
      a.flash=0.12; if(a.type==='tank'||a.type==='arty') a.recoil=1;
      const x0=ux(a)+a.side*us(a)*(a.type==='tank'?84:a.type==='arty'?58:22), y0=uy(a)-us(a)*(a.type==='arty'?50:a.type==='tank'?43:34);
      const tx=b?ux(b):x0+a.side*W()*0.35, ty=b?uy(b)-us(b)*20:uy(a);
      projs.push({kind,x0,y0,tx,ty,t:0,dur:kind==='shell'?0.75:kind==='round'?0.28:0.18,onHit});
    }
    function enemyArty(target,onHit){ const tx=ux(target), ty=uy(target)-10; projs.push({kind:'shell',x0:W()+40*dpr,y0:H()*0.25,tx,ty,t:0,dur:0.9,onHit}); }
    function alive(side,types){ return units.filter(u=>u.side===side && !u.dead && (!types||types.includes(u.type))); }
    function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
    function kill(u){ if(u.dead) return; u.dead=1; u.deadAt=performance.now(); const x=ux(u), y=uy(u); boom(x,y-us(u)*12, u.type==='inf'?0.5:1.2);
      setTimeout(()=>{ const i=units.indexOf(u); if(i>=0 && u.type==='inf'){ units.splice(i,1); } const nu=mkUnit(u.side,u.type,u.row,u.off); nu.off=u.off+0.25; nu.arrive=true; units.push(nu); }, u.type==='inf'?1400:2600); }
    function damage(u){ u.dmg++; const x=ux(u), y=uy(u); boom(x+(Math.random()-.5)*20*dpr,y-us(u)*20,0.45); if(u.dmg>=u.hp) kill(u); }
    // --- per-card events
    function cardEvent(c){
      cnt[c]++; setCnt();
      const us_=alive(1), en=alive(-1);
      if(c==='G'){
        const a=pick(us_.filter(u=>u.type!=='arty').length?us_.filter(u=>u.type!=='arty'):us_), b=pick(en);
        if(Math.random()<0.25){ const art=alive(1,['arty'])[0]; if(art&&b) shoot(art,b,'shell',()=>kill(b)); else if(a&&b) shoot(a,b,a.type==='tank'?'round':'tracer',()=>kill(b)); }
        else if(a&&b) shoot(a,b,a.type==='tank'||a.type==='apc'?'round':'tracer',()=> (b.type==='tank'||b.type==='apc')&&b.dmg+1<b.hp ? damage(b) : kill(b));
        front=Math.min(0.92, front+step);
      } else if(c==='H'){
        const a=pick(us_), b=pick(en), e=pick(en), t=pick(us_);
        if(a&&b) shoot(a,b,'tracer',()=>damage(b));
        setTimeout(()=>{ if(e&&t) shoot(e,t,'tracer',()=>boom(ux(t)+(Math.random()-.5)*40*dpr,uy(t)-4,0.4)); },220);
        front=Math.min(0.92, front+step*0.4);
      } else {
        const t=pick(us_.filter(u=>u.type!=='arty'))||pick(us_);
        if(t) enemyArty(t,()=>kill(t));
        const e=pick(en); if(e){ setTimeout(()=>{ const t2=pick(alive(1)); if(t2) shoot(e,t2,'tracer',null); },300); }
        front=Math.max(0.18, front-step);
      }
    }
    // --- main loop
    let last=performance.now(), raf=0, done=false, skipped=false;
    const evDelay = o.chunk.length>12 ? 560 : 720;
    const timers=[];
    function loop(now){
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      frontShown += (front-frontShown)*Math.min(1,dt*2.2);
      ctx.setTransform(1,0,0,1,0,0); ctx.clearRect(0,0,W(),H());
      if(!artOk) ctx.drawImage(bdc,0,0);
      const sx=(Math.random()-.5)*shake, sy=(Math.random()-.5)*shake; shake*=0.88; ctx.translate(sx,sy);
      // front line glow
      const fx=frontShown*W(); const lg=ctx.createLinearGradient(fx-60*dpr,0,fx+60*dpr,0); lg.addColorStop(0,'rgba(255,170,60,0)'); lg.addColorStop(.5,'rgba(255,170,60,.10)'); lg.addColorStop(1,'rgba(255,170,60,0)'); ctx.fillStyle=lg; ctx.fillRect(fx-60*dpr,H()*0.6,120*dpr,H()*0.4);
      // units by row (far first)
      for(const u of units){ if(u.arrive){ u.off=Math.max(u.off-dt*0.08, u.off>0.3?0.3:0); if(u.off<= (u.type==='arty'?0.33:0.22)) u.arrive=false; if(Math.random()<0.1) dust(ux(u),uy(u)); } u.flash=Math.max(0,u.flash-dt); u.recoil=Math.max(0,u.recoil-dt*3);
        if(u.dead && u.type!=='inf' && Math.random()<0.25) parts.push({k:'smoke',x:ux(u)+(Math.random()-.5)*20*dpr,y:uy(u)-us(u)*30,vx:0.2*dpr,vy:-(0.6+Math.random())*dpr,r:(8+Math.random()*10)*dpr*us(u)/S0,life:2.5,t:0}); }
      for(const r of [0,1,2]) for(const u of units) if(u.row===r) drawUnit(u);
      // projectiles
      for(let i=projs.length-1;i>=0;i--){ const p=projs[i]; p.t+=dt/p.dur; const k=Math.min(1,p.t);
        const x=p.x0+(p.tx-p.x0)*k, arc=p.kind==='shell'?Math.sin(k*Math.PI)*H()*0.22:0, y=p.y0+(p.ty-p.y0)*k-arc;
        if(p.kind==='tracer'){ ctx.strokeStyle='rgba(255,220,120,.95)'; ctx.lineWidth=2*dpr; ctx.beginPath(); const k2=Math.max(0,k-0.15); ctx.moveTo(p.x0+(p.tx-p.x0)*k2, p.y0+(p.ty-p.y0)*k2); ctx.lineTo(x,y); ctx.stroke(); }
        else { ctx.fillStyle='rgba(255,230,170,1)'; ctx.beginPath(); ctx.arc(x,y,(p.kind==='shell'?3.5:2.5)*dpr,0,6.283); ctx.fill(); if(p.kind==='shell' && Math.random()<0.6) parts.push({k:'smoke',x,y,vx:0,vy:-0.2*dpr,r:4*dpr,life:0.8,t:0}); }
        if(p.t>=1){ projs.splice(i,1); if(p.onHit) p.onHit(); else boom(p.tx,p.ty,0.25); }
      }
      // particles
      for(let i=parts.length-1;i>=0;i--){ const q=parts[i]; q.t+=dt; if(q.t>=q.life){ parts.splice(i,1); continue; } const f=q.t/q.life;
        q.x+=q.vx; q.y+=q.vy; if(q.g) q.vy+=q.g; if(q.k==='fire'){ q.vx*=0.92; q.vy*=0.92; }
        if(q.k==='fire'){ ctx.fillStyle=`rgba(255,${Math.round(200-150*f)},${Math.round(80-70*f)},${1-f})`; ctx.beginPath(); ctx.arc(q.x,q.y,q.r*(1+f),0,6.283); ctx.fill(); }
        else if(q.k==='smoke'){ ctx.fillStyle=`rgba(40,38,36,${0.45*(1-f)})`; ctx.beginPath(); ctx.arc(q.x,q.y,q.r*(1+f*1.5),0,6.283); ctx.fill(); }
        else { ctx.fillStyle=`rgba(20,18,16,${1-f})`; ctx.fillRect(q.x,q.y,q.r,q.r); }
      }
      ctx.setTransform(1,0,0,1,0,0);
      if(flashScreen>0.01){ ctx.fillStyle=`rgba(255,200,140,${flashScreen})`; ctx.fillRect(0,0,W(),H()); flashScreen*=0.85; }
      const m=$('#bmark'); if(m) m.style.left=(frontShown*100).toFixed(1)+'%';
      if(!done) raf=requestAnimationFrame(loop);
    }
    raf=requestAnimationFrame(loop);
    // narration line for this action
    const cc=btlCounts(o.chunk), sc=(cc.G+0.6*cc.H)/Math.max(1,o.chunk.length);
    const pool=sc>=0.82?BTL_LINES.good:sc>=0.68?BTL_LINES.mixed:BTL_LINES.bad;
    const line=$('#bline'); line.textContent=pool[Math.floor(Math.random()*pool.length)]; setTimeout(()=>line.classList.add('on'),300); setTimeout(()=>line.classList.remove('on'),4200);
    // schedule card events
    [...o.chunk].forEach((c,i)=>timers.push(setTimeout(()=>cardEvent(c), 1400+i*evDelay)));
    const endAt=1400+o.chunk.length*evDelay+1800;
    function finish(){
      if(done) return; done=true; timers.forEach(clearTimeout); cancelAnimationFrame(raf);
      if(skipped){ for(let i=0;i<o.chunk.length;i++){} front=o.front; for(const c of o.chunk){ front = c==='G'?Math.min(0.92,front+step): c==='H'?Math.min(0.92,front+step*0.4):Math.max(0.18,front-step); } }
      if(o.final){
        const tier=btlTier(o.all), c=btlCounts(o.all), took=front>=0.85;
        const res=$('#bres');
        res.innerHTML=`<h4>${esc(tier.label)}</h4><div class="note" style="font-size:15px;color:#d8cfbb">${esc(o.name)}</div>
          <div class="kv" style="max-width:260px;margin:12px auto 0"><span>Good</span><span class="c-good">${c.G}</span><span>Hard</span><span class="c-warn">${c.H}</span><span>Again</span><span class="c-bad">${c.A}</span><span>Retention</span><span>${Math.round((c.G+c.H)/Math.max(1,o.all.length)*100)}%</span></div>
          <div class="note" style="margin-top:10px">${took?'The objective is taken.':tier.f>=0.5?'Ground gained. The objective holds, for now.':tier.f>0?'The lines barely moved.':'We fell back. Regroup and go again.'}${G&&G.backlog&&tier.f>0?' The siege lines are pushed back.':''}</div>
          <div class="oathbtns"><button class="btn pri" id="bclose">Continue</button></div>`;
        res.classList.add('on'); const bc=$('.bcount'); if(bc) bc.style.display='none';
        $('#bclose').onclick=()=>{ el.classList.remove('show'); el.innerHTML=''; resolve({front, skipped}); };
      } else { el.classList.remove('show'); el.innerHTML=''; resolve({front, skipped}); }
    }
    timers.push(setTimeout(finish, endAt));
    $('#bskip').onclick=e=>{ e.stopPropagation(); skipped=true; finish(); };
  });
}

/* ---------- hooks into the main app ---------- */
document.addEventListener('click', e=>{
  const bs=e.target.closest('[data-bs]'); if(bs){ document.querySelectorAll('#bt-size button').forEach(x=>x.classList.toggle('on',x===bs)); return; }
  const b=e.target.closest('[data-a]'); if(!b) return; const a=b.dataset.a;
  if(a==='bt-open') openBattleStart();
  else if(a==='bt-dice'){ $('#bt-name').value=btlName('Battle'); }
  else if(a==='bt-go') battleStart();
  else if(a==='bt-status') openBattleStatus();
  else if(a==='bt-end'){ if(confirm('End the battle now with the cards done so far?')) battleEndNow(); }
  else if(a==='bt-play') battlePlayNext();
  else if(a==='bt-list') openBattleList();
  else if(a==='bt-watch') watchBattle(b.dataset.id);
});
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && btlGet()) setTimeout(()=>battleTick(true), 700); });
setInterval(()=>{ if(btlGet()) battleTick(false); }, 8000);
setInterval(()=>{ if(document.visibilityState==='visible') autoSkirmishes(); }, 3*60*1000);
setTimeout(()=>{ renderBattleChip(); autoSkirmishes(); }, 2500);
