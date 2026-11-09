'use strict';
/* =====================================================================
   Profile: XP, 50 levels × 10 prestiges, rank insignia, and Orders
   (daily + weekly challenges). Everything is worked out from the synced
   events and the campaign simulation, so phone and Mac always agree.
   ===================================================================== */
const MAX_LEVEL=50, MAX_PRESTIGE=10;
const XP_NEXT = L => Math.round(40 + 2.2*Math.pow(L,1.4));          // XP to go from level L to L+1
const XP_TABLE = (()=>{ const t=[0,0]; for(let L=1;L<MAX_LEVEL;L++) t[L+1]=t[L]+XP_NEXT(L); return t; })(); // XP needed to reach level L
const XP_PER_PRESTIGE = XP_TABLE[MAX_LEVEL];

const RANKS=[ // spread across the 50 levels
  {t:'Recruit',i:'none'},{t:'Private',i:'c1'},{t:'Private First Class',i:'c1r'},{t:'Lance Corporal',i:'c2x'},{t:'Corporal',i:'c2'},
  {t:'Sergeant',i:'c3'},{t:'Staff Sergeant',i:'c3r1'},{t:'Sergeant First Class',i:'c3r2'},{t:'Master Sergeant',i:'c3r3'},{t:'Sergeant Major',i:'c3r3s'},
  {t:'Warrant Officer',i:'wo'},{t:'Second Lieutenant',i:'b1g'},{t:'First Lieutenant',i:'b1'},{t:'Captain',i:'b2'},{t:'Major',i:'leafg'},
  {t:'Lieutenant Colonel',i:'leaf'},{t:'Colonel',i:'eagle'},{t:'Brigadier General',i:'s1'},{t:'Major General',i:'s2'},{t:'Lieutenant General',i:'s3'},{t:'General',i:'s4'} ];
const rankOf = L => RANKS[Math.min(RANKS.length-1, Math.floor((L-1)*RANKS.length/MAX_LEVEL))];
const PRESTIGE=[ // theme and accent colour per prestige
  {n:'Unranked', c:'#8a93a3'},{n:'The Lamp', c:'#e3b54a'},{n:'Rootbound', c:'#4fbf6a'},{n:'Tidebreaker', c:'#3f8fd0'},{n:'Ironwolf', c:'#9fd4ff'},{n:'The Abyss', c:'#2fd0c8'},
  {n:'Stormforged', c:'#9a6ae0'},{n:'Clockwork', c:'#d08a3a'},{n:"Serpent's Oath", c:'#2fbf7f'},{n:'Dragonfire', c:'#ff5a2a'},{n:'Those Who Did Not Wait', c:'#fff1b8'} ];

const XP_RULES={ q:'per question: 0.5 + accuracy (a 70% block = 1.2 XP each)', anki:'0.15 per Anki review', ankiZero:40, goal:60, gym:50, diet:30, cap:15, general:250, siege:300, cms:200 };

/* ---------- Orders ---------- */
function dayBlocks(d){ return G.blocks.filter(b=>b.d===d && b.e.type!=='cms'); }
function tagged(d, r){ let n=0,c=0; for(const b of dayBlocks(d)){ const e=b.e; if(!e.tags||!e.q) continue; e.tags.forEach((tg,i)=>{ if(tg.r===r && e.q[i]!=null && i<b.n){ n++; c+=e.q[i]?1:0; } }); } return {n,c}; }
const DAILY={
  weak:{ ok:R=>!!R.genR, xp:80, txt:R=>`20 ${REG[R.genR].name} questions at 65%+`, ev:(R,d)=>{ const t=tagged(d,R.genR); return {done:t.n>=20 && t.c/t.n>=0.65, p:`${t.n}/20${t.n?` · ${Math.round(t.c/t.n*100)}%`:''}`}; } },
  vol:{ ok:()=>true, xp:60, txt:R=>`Complete ${volN(R)} questions`, ev:R=>({done:R.q>=volN(R), p:`${R.q}/${volN(R)}`}) },
  anki0:{ ok:R=>!R.siege, xp:60, txt:()=>`End the day with AnKing at 0 due`, ev:R=>({done:!!(R.anki&&R.anki.due===0), p:R.anki?`${R.anki.due} due`:'no reading'}) },
  ankiGoal:{ ok:R=>R.siege, xp:70, txt:R=>`Hit today's Anki goal (${R.ankiGoal||'—'} reviews)`, ev:R=>{ const r=R.anki?R.anki.reviewed:0; return {done:!!R.ankiGoal && r>=R.ankiGoal, p:`${r}/${R.ankiGoal||'—'}`}; } },
  acc70:{ ok:()=>true, xp:50, txt:()=>`Finish a block of 20+ at 70% or better`, ev:(R,d)=>{ const b=dayBlocks(d).filter(b=>b.n>=20); const best=b.reduce((m,x)=>Math.max(m,x.acc),0); return {done:b.some(x=>x.acc>=0.7), p:b.length?`best ${Math.round(best*100)}%`:'no block yet'}; } },
  early:{ ok:()=>true, xp:40, txt:()=>`Log your first block before noon`, ev:(R,d)=>{ const b=dayBlocks(d).map(x=>x.e.ts).filter(Boolean).sort(); return {done:!!b.length && new Date(b[0]).getHours()<12 && ymd(new Date(b[0]))===d, p:b.length?`first at ${new Date(b[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'none yet'}; } },
  two:{ ok:()=>true, xp:50, txt:()=>`Do two blocks today`, ev:(R,d)=>{ const n=dayBlocks(d).length; return {done:n>=2, p:`${n}/2`}; } },
  gym:{ ok:()=>true, xp:40, txt:()=>`Get a gym session in`, ev:(R,d)=>({done:habitVal(d,'gym')===true, p:habitVal(d,'gym')===true?'logged':'not yet'}) },
  diet:{ ok:()=>true, xp:30, txt:()=>`Hold low-carb today`, ev:(R,d)=>({done:habitVal(d,'diet')===true, p:habitVal(d,'diet')===true?'logged':'not yet'}) },
};
const WEEKLY={
  gen:{ ok:w=>!!w.genR, xp:300, txt:()=>`Break a general`, ev:w=>{ const n=G.gensDown.filter(g=>g.d>=w.mon&&g.d<=w.sun).length; return {done:n>=1, p:`${n}/1`}; } },
  goal5:{ ok:()=>true, xp:250, txt:()=>`Meet your daily goal 5 days`, ev:w=>{ const n=w.days.filter(R=>R.goalMet&&!R.leave).length; return {done:n>=5, p:`${n}/5`}; } },
  qweek:{ ok:()=>true, xp:250, txt:w=>`${w.qN} questions this week`, ev:w=>{ const n=w.days.reduce((a,R)=>a+R.q,0); return {done:n>=w.qN, p:`${n}/${w.qN}`}; } },
  acc:{ ok:()=>true, xp:200, txt:()=>`150+ questions at 65%+ for the week`, ev:w=>{ const n=w.days.reduce((a,R)=>a+R.q,0), c=w.days.reduce((a,R)=>a+R.c,0); return {done:n>=150 && c/n>=0.65, p:`${n} q${n?` · ${Math.round(c/n*100)}%`:''}`}; } },
  anki6:{ ok:()=>true, xp:200, txt:()=>`Anki on target 6 days (goal hit or 0 due)`, ev:w=>{ const n=w.days.filter(R=>R.anki && ((R.anki.due===0) || (R.ankiGoal && R.anki.reviewed>=R.ankiGoal))).length; return {done:n>=6, p:`${n}/6`}; } },
  gym3:{ ok:()=>true, xp:150, txt:()=>`3 gym sessions`, ev:w=>{ const n=w.dates.filter(d=>habitVal(d,'gym')===true).length; return {done:n>=3, p:`${n}/3`}; } },
  diet5:{ ok:()=>true, xp:150, txt:()=>`Low-carb 5 days`, ev:w=>{ const n=w.dates.filter(d=>habitVal(d,'diet')===true).length; return {done:n>=5, p:`${n}/5`}; } },
};
function volN(R){ return Math.max(40, Math.round((R.quota||40)/5)*5); }
function pickN(keys, n, seed){ return keys.map(k=>({k,h:hash(seed+k)})).sort((a,b)=>a.h-b.h).slice(0,n).map(x=>x.k); }
function dailyOrders(d){
  const R=G.days[d]; if(!R || R.leave) return [];
  const study = DAILY.weak.ok(R) && hash('st'+d)<0.6 ? 'weak' : 'vol';
  const anki = R.siege ? 'ankiGoal' : 'anki0';
  const rest = pickN(['acc70','early','two','gym','diet',study==='weak'?'vol':'weak'].filter(k=>DAILY[k].ok(R)), 1, 'd'+d);
  return [study, anki, ...rest].map(k=>{ const o=DAILY[k], r=o.ev(R,d); return {k, kind:'daily', d, xp:o.xp, txt:o.txt(R), done:r.done, p:r.p}; });
}
function weekCtx(mon){
  const dates=[]; for(let i=0;i<7;i++) dates.push(addDays(mon,i));
  const days=dates.map(d=>G.days[d]).filter(Boolean);
  const first=days[0]||{}; const quota=days.reduce((a,R)=>Math.max(a,R.quota||0),0)||40;
  return {mon, sun:addDays(mon,6), dates, days, genR:first.genR||(G.gen&&G.gen.r), qN:Math.max(200, Math.round(quota*5/10)*10)};
}
function weeklyOrders(mon){
  const w=weekCtx(mon); if(!w.days.length) return [];
  const a = hash('wq'+mon)<0.5 ? 'qweek' : 'goal5';
  const b = w.genR ? 'gen' : (a==='qweek'?'goal5':'qweek');
  const c = pickN(['acc','anki6','gym3','diet5'], 1, 'w'+mon)[0];
  return [a,b,c].map(k=>{ const o=WEEKLY[k], r=o.ev(w); return {k, kind:'weekly', d:mon, xp:o.xp, txt:o.txt(w), done:r.done, p:r.p}; });
}

/* ---------- XP ledger ---------- */
function xpLedger(){
  const L=[]; const add=(d,src,xp,label)=>{ if(xp>0) L.push({d,src,xp:Math.round(xp),label}); };
  const t=today();
  for(const b of G.blocks){ const e=b.e; if(e.type==='cms'){ add(b.d,'cms',XP_RULES.cms,`CMS form ${esc(e.form||'')}`); continue; } add(b.d,'q',b.n*(0.5+b.acc),`${b.n} questions at ${Math.round(b.acc*100)}%`); }
  const weeks=new Set();
  for(const [d,R] of Object.entries(G.days)){ if(d>t) continue;
    if(R.anki) add(d,'anki',R.anki.reviewed*0.15,`${R.anki.reviewed} Anki reviews`);
    if(R.anki && R.anki.due===0) add(d,'anki',XP_RULES.ankiZero,'AnKing at 0 due');
    if(R.goalMet && !R.leave && d<t) add(d,'goal',XP_RULES.goal,'Daily goal met');
    if(habitVal(d,'gym')===true) add(d,'gym',XP_RULES.gym,'Gym session');
    if(habitVal(d,'diet')===true) add(d,'diet',XP_RULES.diet,'Low-carb day');
    if(R.caps&&R.caps.length) add(d,'cap',R.caps.length*XP_RULES.cap,`${R.caps.length} town${R.caps.length>1?'s':''} taken`);
    if(R.siegeBroken) add(d,'siege',XP_RULES.siege,'Siege broken');
    for(const o of dailyOrders(d)) if(o.done) add(d,'order',o.xp,`Order: ${o.txt}`);
    weeks.add(weekMonday(d));
  }
  for(const mon of weeks){ for(const o of weeklyOrders(mon)) if(o.done) add(o.d<=t?([...weekCtx(mon).dates].reverse().find(d=>d<=t)||mon):mon,'order',o.xp,`Weekly order: ${o.txt}`); }
  for(const g of G.gensDown) add(g.d,'general',XP_RULES.general,`${GENERALS[g.r].name} broken`);
  L.sort((a,b)=>a.d.localeCompare(b.d));
  return L;
}
function profileState(){
  const led=xpLedger(); const total=led.reduce((a,x)=>a+x.xp,0);
  const pres=liveEvents(S).filter(e=>e.type==='prestige').sort((a,b)=>(a.ord||a.ts)-(b.ord||b.ts));
  const prestige=Math.min(MAX_PRESTIGE, pres.length);
  const base=pres.length?pres[pres.length-1].base:0;
  const cur=Math.max(0,total-base);
  let lvl=1; while(lvl<MAX_LEVEL && cur>=XP_TABLE[lvl+1]) lvl++;
  const into=cur-XP_TABLE[lvl], need=lvl<MAX_LEVEL?XP_NEXT(lvl):0;
  return {led,total,prestige,lvl,cur,into,need,rank:rankOf(lvl),canPrestige:lvl>=MAX_LEVEL && prestige<MAX_PRESTIGE, maxed:lvl>=MAX_LEVEL && prestige>=MAX_PRESTIGE};
}

/* ---------- insignia (drawn in code; colour = prestige) ---------- */
// Painted emblems: add a rank number here when art/rank_NN.webp exists (and prestige numbers for art/prestige_NN.webp).
const RANK_ART=new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]), PRESTIGE_ART=new Set([1]);
function insignia(lvl, prestige, size){
  const ri=RANKS.indexOf(rankOf(lvl))+1;
  if(RANK_ART.has(ri)){ const s=size||64, P=PRESTIGE[Math.min(prestige,MAX_PRESTIGE)];
    return `<span class="insig art" style="width:${s}px;height:${s}px${prestige?`;--pc:${P.c}`:''}"><img src="art/rank_${String(ri).padStart(2,'0')}.webp" alt="${esc(rankOf(lvl).t)}">${prestige?`<i class="pmark">${PRESTIGE_ART.has(prestige)?`<img src="art/prestige_${String(prestige).padStart(2,'0')}.webp" alt="">`:prestige}</i>`:''}</span>`; }
  return insignia_drawn(lvl, prestige, size);
}
function insignia_drawn(lvl, prestige, size){
  const r=rankOf(lvl), P=PRESTIGE[Math.min(prestige,MAX_PRESTIGE)], col=prestige?P.c:'#d9c7a0', s=size||64;
  const chev=(y)=>`<path d="M14,${y} L32,${y+10} L50,${y} L50,${y+6} L32,${y+16} L14,${y+6} Z" fill="${col}"/>`;
  const rock=(y)=>`<path d="M14,${y} Q32,${y+10} 50,${y} L50,${y+5} Q32,${y+15} 14,${y+5} Z" fill="${col}"/>`;
  const star=(cx,cy,rr)=>{ let p=''; for(let i=0;i<10;i++){ const a=-Math.PI/2+i*Math.PI/5, R=i%2?rr*0.42:rr; p+=`${(cx+R*Math.cos(a)).toFixed(1)},${(cy+R*Math.sin(a)).toFixed(1)} `; } return `<polygon points="${p}" fill="${col}"/>`; };
  let g='';
  const i=r.i;
  if(i==='none') g=`<circle cx="32" cy="32" r="6" fill="none" stroke="${col}" stroke-width="2.5"/>`;
  else if(i[0]==='c'){ const n=+i[1]; for(let k=0;k<n;k++) g+=chev(14+k*9); const rk=i.includes('r')?+(i.split('r')[1]||'1').replace(/\D/g,'')||1:0; for(let k=0;k<rk;k++) g+=rock(14+n*9+4+k*7); if(i.endsWith('s')) g+=star(32,20+n*4,6); if(i==='c2x') g+=`<rect x="28" y="42" width="8" height="8" fill="${col}" transform="rotate(45 32 46)"/>`; }
  else if(i==='wo') g=`<rect x="22" y="18" width="20" height="28" rx="3" fill="none" stroke="${col}" stroke-width="3"/><rect x="29" y="22" width="6" height="20" fill="${col}"/>`;
  else if(i==='b1g'||i==='b1') g=`<rect x="26" y="14" width="12" height="36" rx="2" fill="${i==='b1g'?'#c9a34a':col}"/>`;
  else if(i==='b2') g=`<rect x="19" y="14" width="10" height="36" rx="2" fill="${col}"/><rect x="35" y="14" width="10" height="36" rx="2" fill="${col}"/>`;
  else if(i==='leafg'||i==='leaf') g=`<path d="M32,12 C44,20 46,34 32,52 C18,34 20,20 32,12 Z" fill="${i==='leafg'?'#c9a34a':col}"/><path d="M32,16 L32,50" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>`;
  else if(i==='eagle') g=`<path d="M32,20 C26,14 16,14 10,20 C18,20 22,24 24,30 C20,30 16,34 16,40 C22,36 26,38 32,46 C38,38 42,36 48,40 C48,34 44,30 40,30 C42,24 46,20 54,20 C48,14 38,14 32,20 Z" fill="${col}"/>`;
  else if(i[0]==='s'){ const n=+i[1]; const xs=n===1?[32]:n===2?[22,42]:n===3?[16,32,48]:[12,25,39,52]; xs.forEach(x=>g+=star(x,32,n>3?7:9)); }
  const frame = prestige ? `<path d="M32,2 L58,12 L58,34 C58,48 46,58 32,62 C18,58 6,48 6,34 L6,12 Z" fill="rgba(0,0,0,.35)" stroke="${P.c}" stroke-width="2.5"/>` + (prestige>=10?`<path d="M32,2 L58,12 L58,34 C58,48 46,58 32,62 C18,58 6,48 6,34 L6,12 Z" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1"/>`:'')
                         : `<circle cx="32" cy="32" r="29" fill="rgba(0,0,0,.3)" stroke="rgba(217,199,160,.35)" stroke-width="2"/>`;
  const pips = prestige ? Array.from({length:Math.min(prestige,10)},(_,k)=>`<circle cx="${32+(k-(Math.min(prestige,10)-1)/2)*4.6}" cy="58" r="1.6" fill="${P.c}"/>`).join('') : '';
  return `<svg class="insig" viewBox="0 0 64 64" width="${s}" height="${s}">${frame}<g>${g}</g>${pips}</svg>`;
}

/* ---------- views ---------- */
function orderRow(o){ return `<li class="ord ${o.done?'done':''}"><span class="ock">${o.done?'✓':''}</span><span>${esc(o.txt)}<span class="c-muted"> · ${esc(o.p)}</span></span><b class="oxp">+${o.xp} XP</b></li>`; }
function ordersCompact(){
  const t=today(); const d=dailyOrders(t); if(!d.length) return '';
  const done=d.filter(o=>o.done).length;
  return `<div class="banner orders"><b>📜 Daily orders <span class="c-muted">${done}/${d.length}</span></b><ul class="ordl">${d.map(orderRow).join('')}</ul><button class="btn sm" data-a="go-profile">Profile & weekly orders</button></div>`;
}
function viewProfile(){
  const P=profileState(), t=today(), mon=weekMonday(t);
  const pct=P.need?Math.min(100,P.into/P.need*100):100;
  const dd=dailyOrders(t), ww=weeklyOrders(mon);
  const srcName={q:'Questions',anki:'Anki',goal:'Daily goals',gym:'Gym',diet:'Diet',cap:'Towns',general:'Generals',siege:'Siege',cms:'CMS forms',order:'Orders'};
  const sum=(f)=>{ const m={}; for(const x of P.led) if(f(x)) m[x.src]=(m[x.src]||0)+x.xp; return m; };
  const todayM=sum(x=>x.d===t), weekM=sum(x=>x.d>=mon && x.d<=addDays(mon,6)), allM=sum(()=>true);
  const tot=m=>Object.values(m).reduce((a,b)=>a+b,0);
  const srcRows=Object.keys(srcName).filter(k=>allM[k]).map(k=>`<tr><td>${srcName[k]}</td><td>${todayM[k]||0}</td><td>${weekM[k]||0}</td><td>${allM[k].toLocaleString()}</td></tr>`).join('');
  const ladder=RANKS.map((r,i)=>{ const lo=Math.ceil(i*MAX_LEVEL/RANKS.length)+1; const here=rankOf(P.lvl)===r; return `<div class="rk ${here?'here':''} ${P.lvl>=lo?'got':''}">${insignia(lo,P.prestige,34)}<div><b>${r.t}</b><div class="sub">Level ${lo}</div></div></div>`; }).join('');
  const pres=PRESTIGE.slice(1).map((p,i)=>`<div class="pr ${P.prestige>=i+1?'got':''}" title="Prestige ${i+1}: ${esc(p.n)}">${PRESTIGE_ART.has(i+1)?`<img class="pimg" src="art/prestige_${String(i+1).padStart(2,'0')}.webp" alt="">`:insignia(MAX_LEVEL,i+1,56)}<span>${i+1} · ${esc(p.n)}</span></div>`).join('');
  return `<div class="card prof">
      <div class="profhead">${insignia(P.lvl,P.prestige,96)}
        <div class="pinfo"><div class="ptitle">${esc(P.rank.t)}</div><div class="sub">${P.prestige?`Prestige ${P.prestige} · ${esc(PRESTIGE[P.prestige].n)} · `:''}Level ${P.lvl} of ${MAX_LEVEL}</div>
          <div class="xpbar"><div style="width:${pct}%"></div></div>
          <div class="sub">${P.need?`${P.into.toLocaleString()} / ${P.need.toLocaleString()} XP to level ${P.lvl+1}`:P.maxed?'Master Prestige — the top of the ladder.':'Level 50 reached.'} · ${P.total.toLocaleString()} XP lifetime</div>
          ${P.canPrestige?`<button class="btn pri" data-a="prestige" style="margin-top:8px">★ Enter Prestige ${P.prestige+1}</button>`:''}</div></div></div>
    <div class="cmdgrid">
      <div class="card"><h3>Today's orders</h3><ul class="ordl">${dd.map(orderRow).join('')||'<li class="c-muted">Leave day — no orders.</li>'}</ul>
        <h3 style="margin-top:14px">This week's orders <small class="c-muted">${fmtD(mon)} – ${fmtD(addDays(mon,6))}</small></h3><ul class="ordl">${ww.map(orderRow).join('')}</ul>
        <div class="note" style="margin-top:6px">Orders change daily and weekly, and lean toward your weakest system and whatever's behind.</div></div>
      <div class="card"><h3>XP</h3><table class="xptbl"><thead><tr><th>Source</th><th>Today</th><th>Week</th><th>All</th></tr></thead><tbody>${srcRows||'<tr><td colspan="4" class="c-muted">No XP yet.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td>${tot(todayM)}</td><td>${tot(weekM)}</td><td>${tot(allM).toLocaleString()}</td></tr></tfoot></table>
        <div class="note" style="margin-top:8px">Questions: 0.5 + accuracy each · Anki: 0.15 per review, +${XP_RULES.ankiZero} at 0 due · daily goal +${XP_RULES.goal} · gym +${XP_RULES.gym} · low-carb +${XP_RULES.diet} · town +${XP_RULES.cap} · general +${XP_RULES.general} · siege broken +${XP_RULES.siege} · CMS form +${XP_RULES.cms}. Toggle gym and low-carb on the Campaign tab.</div></div></div>
    <div class="card"><h3>Ranks</h3><div class="ladder">${ladder}</div></div>
    <div class="card"><h3>Prestige</h3><div class="note">At level ${MAX_LEVEL} you can enter the next prestige: your level resets to 1, and you keep the new emblem frame for good. Each prestige is ${XP_PER_PRESTIGE.toLocaleString()} XP.</div><div class="prow">${pres}</div></div>`;
}

/* ---------- rank-up moment & header badge ---------- */
function renderRankChip(){
  if(!G) return; const P=profileState(); let el=$('#rankchip');
  if(!el){ el=document.createElement('button'); el.id='rankchip'; el.className='chip rankchip'; el.setAttribute('data-a','go-profile'); const sd=$('#syncdot'); sd.parentNode.insertBefore(el, sd); }
  el.innerHTML=`${insignia(P.lvl,P.prestige,20)}${P.prestige?`P${P.prestige} · `:''}Lv ${P.lvl}`;
  const key=`${P.prestige}:${P.lvl}`; let last=null; try{ last=localStorage.getItem('imc.rankSeen'); }catch(e){}
  if(last===null){ try{ localStorage.setItem('imc.rankSeen',key); }catch(e){} return; }
  if(last!==key && !CUT && $('#gate').classList.contains('hidden') && $('#sheetbg').classList.contains('hidden')){
    try{ localStorage.setItem('imc.rankSeen',key); }catch(e){}
    const [lp,ll]=last.split(':').map(Number); if(P.prestige<lp || (P.prestige===lp && P.lvl<ll)) return;
    const lines=['Rank is not given. It is taken, one block at a time.','The line moves because you moved it.','They will follow the one who did not wait.','Good. Now hold it.','Another stripe. Another reason not to stop.'];
    openSheet(`<div class="donebox rankup">${insignia(P.lvl,P.prestige,120)}<h2>${P.prestige>lp?`Prestige ${P.prestige}`:'Promoted'}</h2><div class="ptitle" style="font-size:22px">${esc(P.rank.t)}</div><div class="note">Level ${P.lvl}${P.prestige?` · Prestige ${P.prestige}`:''}</div>
      <div class="note" style="margin-top:12px;font-style:italic">“${lines[(P.lvl+P.prestige)%lines.length]}” — The Old General</div>
      <div class="actions" style="justify-content:center"><button class="btn pri" data-a="close">Carry on</button></div></div>`);
  }
}
document.addEventListener('click', e=>{
  const b=e.target.closest('[data-a]'); if(!b) return; const a=b.dataset.a;
  if(a==='go-profile'){ tab='profile'; document.querySelectorAll('#tabs button').forEach(x=>x.classList.toggle('on',x.dataset.t==='profile')); render(); }
  else if(a==='prestige'){ const P=profileState(); if(!P.canPrestige) return; if(confirm(`Enter Prestige ${P.prestige+1}? Your level resets to 1; your ${PRESTIGE[P.prestige+1].n} emblem frame is permanent.`)){ addEvent({type:'prestige', n:P.prestige+1, base:P.total}); try{ localStorage.setItem('imc.rankSeen',`${P.prestige}:${P.lvl}`); }catch(e){} } }
});
