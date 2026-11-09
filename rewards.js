'use strict';
/* =====================================================================
   Collectibles: coins (daily), ribbons (weekly), medals (one-time).
   Tasks earn XP *and* collectibles; collectibles themselves add no XP.
   Everything is derived from synced events, so all devices agree.
   Medals not earned by the season's end are lost for good.
   ===================================================================== */
const COINS={
  prayer:{n:'Prayer coin', g:'☾', c:'#9fc7e8', why:'All five prayers in a day'},
  supply:{n:'Supply coin', g:'⛭', c:'#7fd38a', why:'Anki on target (0 due or goal hit)'},
  orders:{n:'Orders coin', g:'✉', c:'#e3b54a', why:'Every daily order done'},
  march: {n:'March coin',  g:'⚑', c:'#d9c7a0', why:'Daily goal met'},
  iron:  {n:'Iron coin',   g:'⚒', c:'#b0b6c2', why:'Gym session'},
  field: {n:'Field coin',  g:'⚔', c:'#e0705f', why:'A 40-question block at 65% or better'},
};
const RIBBONS={ // weekly; stripes drawn in code (colors left→right)
  r_prayer:{n:'Week of Devotion',    s:['#1f3b5a','#9fc7e8','#f2efe6','#9fc7e8','#1f3b5a'], why:'All five prayers on 6 of 7 days'},
  r_supply:{n:'Unbroken Supply',     s:['#1d4d2b','#7fd38a','#1d4d2b','#e3b54a','#1d4d2b'], why:'Anki on target 6 of 7 days'},
  r_march: {n:'Forced March',        s:['#5a4a2a','#d9c7a0','#8a2d2d','#d9c7a0','#5a4a2a'], why:'Daily goal met 5 of 7 days'},
  r_bank:  {n:'Bank Assault',        s:['#7a1f1f','#e0705f','#f2efe6','#e0705f','#7a1f1f'], why:'250+ questions in a week'},
  r_sharp: {n:'Marksman',            s:['#2a2f3a','#e3b54a','#2a2f3a','#e3b54a','#2a2f3a'], why:'150+ questions at 70%+ in a week'},
  r_orders:{n:'Staff Commendation',  s:['#3a2a5a','#e3b54a','#f2efe6','#e3b54a','#3a2a5a'], why:'All three weekly orders done'},
  r_iron:  {n:'Iron Discipline',     s:['#3a3f4a','#b0b6c2','#e0705f','#b0b6c2','#3a3f4a'], why:'3 gym sessions in a week'},
  r_clerk: {n:'Clean Paperwork',     s:['#0d5c45','#f2efe6','#0d5c45','#f2efe6','#0d5c45'], why:'Every clerkship item due that week done on time'},
};
// Medals: one-time. sym = placeholder glyph; band = ribbon colors for the drop.
const MEDALS=[
  // CMS forms
  {k:'cms1', n:'First Assessment',  g:'Ⅰ', band:['#1f3b5a','#e3b54a','#1f3b5a'], cat:'CMS forms', why:'Complete CMS form 1', ok:()=>cmsDate(1)},
  {k:'cms2', n:'Second Assessment', g:'Ⅱ', band:['#1f3b5a','#e3b54a','#1f3b5a'], cat:'CMS forms', why:'Complete CMS form 2', ok:()=>cmsDate(2)},
  {k:'cms3', n:'Third Assessment',  g:'Ⅲ', band:['#1f3b5a','#e3b54a','#1f3b5a'], cat:'CMS forms', why:'Complete CMS form 3', ok:()=>cmsDate(3)},
  {k:'cms4', n:'Final Assessment',  g:'Ⅳ', band:['#1f3b5a','#e3b54a','#1f3b5a'], cat:'CMS forms', why:'Complete CMS form 4', ok:()=>cmsDate(4)},
  {k:'cmsH', n:'Honors Line',       g:'★', band:['#e3b54a','#1f3b5a','#e3b54a'], cat:'CMS forms', why:'Score at or above your honors line on any CMS form', ok:()=>{ const f=Object.values(G.cmsDone).filter(e=>e.pct>=S.settings.targetPct).sort((a,b)=>a.date.localeCompare(b.date))[0]; return f&&f.date; }},
  // question bank
  {k:'uw25', n:'Quarter Bank',  g:'¼', band:['#7a1f1f','#f2efe6','#7a1f1f'], cat:'Question bank', why:'25% of UWorld IM done', ok:()=>uwDate(0.25)},
  {k:'uw50', n:'Half Bank',     g:'½', band:['#7a1f1f','#f2efe6','#7a1f1f'], cat:'Question bank', why:'50% of UWorld IM done', ok:()=>uwDate(0.5)},
  {k:'uw75', n:'Three Quarters',g:'¾', band:['#7a1f1f','#f2efe6','#7a1f1f'], cat:'Question bank', why:'75% of UWorld IM done', ok:()=>uwDate(0.75)},
  {k:'uw100',n:'Bank Cleared',  g:'✦', band:['#e3b54a','#7a1f1f','#e3b54a'], cat:'Question bank', why:'All UWorld IM done', ok:()=>uwDate(1)},
  {k:'amb300',n:'Second Front', g:'A', band:['#2a4a7a','#f2efe6','#2a4a7a'], cat:'Question bank', why:'300 AMBOSS questions', ok:()=>ambDate(300)},
  // clerkship
  {k:'hp',   n:'The First Write-up', g:'✎', band:['#0d5c45','#f2efe6','#0d5c45'], cat:'Clerkship', why:'History & physical submitted', ok:()=>taskDate('hp')},
  {k:'dc',   n:'Safe Passage',       g:'⇥', band:['#0d5c45','#f2efe6','#0d5c45'], cat:'Clerkship', why:'Discharge summary submitted', ok:()=>taskDate('dc')},
  {k:'pba',  n:'Reader of Signs',    g:'⌇', band:['#0d5c45','#9fc7e8','#0d5c45'], cat:'Clerkship', why:'Both PBAs (chest X-ray and EKG)', ok:()=>bothTasks('pba','pba2')},
  {k:'ebm',  n:'Scholar\'s Seal',    g:'Ψ', band:['#0d5c45','#e3b54a','#0d5c45'], cat:'Clerkship', why:'Evidence-based medicine (Honors point)', ok:()=>taskDate('ebm')},
  {k:'oral', n:'The Voice',          g:'❝', band:['#0d5c45','#e0705f','#0d5c45'], cat:'Clerkship', why:'Oral case presentation passed', ok:()=>taskDate('oral')},
  {k:'logs', n:'Field Journal',      g:'☰', band:['#0d5c45','#d9c7a0','#0d5c45'], cat:'Clerkship', why:'All 24 diagnosis logs', ok:()=>allPrefix('dx',24)},
  {k:'wbas', n:'Under Observation',  g:'◉', band:['#0d5c45','#d9c7a0','#0d5c45'], cat:'Clerkship', why:'All 8 workplace-based assessments', ok:()=>allPrefix('wba',8)},
  {k:'aqs',  n:'Casebook',           g:'❑', band:['#0d5c45','#d9c7a0','#0d5c45'], cat:'Clerkship', why:'All 4 Aquifer cases', ok:()=>allPrefix('aq',4)},
  {k:'clean',n:'Never Late',         g:'⧗', band:['#e3b54a','#0d5c45','#e3b54a'], cat:'Clerkship', why:'Every clerkship item done on time', ok:()=>neverLate()},
  {k:'nbme', n:'The Final Battle',   g:'⚜', band:['#8a2d2d','#e3b54a','#8a2d2d'], cat:'Clerkship', why:'Sat the NBME shelf', ok:()=>taskDate('nbme')},
  // campaign
  {k:'gen1', n:'First Blood',     g:'☠', band:['#3a2a2a','#e0705f','#3a2a2a'], cat:'Campaign', why:'Break your first general', ok:()=>G.gensDown[0]&&G.gensDown[0].d},
  {k:'gen9', n:'Bane of Generals',g:'♛', band:['#e0705f','#3a2a2a','#e0705f'], cat:'Campaign', why:'Break all nine core generals', ok:()=>{ const core=G.gensDown.filter(g=>GEN_CORE.includes(g.r)); return core.length>=GEN_CORE.length && core[core.length-1].d; }},
  {k:'siege',n:'Siege Breaker',   g:'⛫', band:['#1d4d2b','#7fd38a','#1d4d2b'], cat:'Campaign', why:'Break the Anki siege', ok:()=>{ const d=Object.values(G.days).find(R=>R.siegeBroken); return d&&d.d; }},
  // streaks
  {k:'st_pray', n:'Steadfast',  g:'☾', band:['#1f3b5a','#9fc7e8','#1f3b5a'], cat:'Streaks', why:'All five prayers 14 days in a row', ok:()=>streakDate(d=>prayersOn(d).every(Boolean),14)},
  {k:'st_anki', n:'Iron Memory',g:'∞', band:['#1d4d2b','#7fd38a','#1d4d2b'], cat:'Streaks', why:'Anki on target 14 days in a row', ok:()=>streakDate(ankiOnDay,14)},
  {k:'st_goal', n:'Relentless', g:'➤', band:['#5a4a2a','#d9c7a0','#5a4a2a'], cat:'Streaks', why:'Daily goal 14 days in a row', ok:()=>streakDate(d=>!!(G.days[d]&&G.days[d].goalMet),14)},
];

/* ---------- helpers ---------- */
function cmsDate(f){ const e=G.cmsDone[f]; return e&&e.date; }
function uwDate(frac){ const tot=uwTotal(S); let n=0; for(const b of G.blocks){ if(b.e.type==='block'&&b.e.src==='uw'){ n+=b.n; if(n>=tot*frac) return b.d; } } return null; }
function ambDate(N){ let n=0; for(const b of G.blocks){ if(b.e.type==='block'&&b.e.src!=='uw'){ n+=b.n; if(n>=N) return b.d; } } return null; }
function taskDate(k){ const e=taskState()[k]; return e&&e.val?e.date:null; }
function bothTasks(a,b){ const x=taskDate(a), y=taskDate(b); return x&&y?(x>y?x:y):null; }
function allPrefix(pre,n){ const es=Object.values(taskState()).filter(e=>e.val&&e.k.startsWith(pre)); return es.length>=n?es.map(e=>e.date).sort().pop():null; }
function neverLate(){ const ts=taskState(); let last=null; for(const g of CLERK) for(const it of g.items){ if(it.k==='ebm') continue; const e=ts[it.k]; if(!e||!e.val||e.date>clerkDue(it.due)) return null; if(!last||e.date>last) last=e.date; } return last; }
function ankiOnDay(d){ const R=G.days[d]; if(!R) return false; const A=R.anki||G.ankiByDay[d]; return !!(A && (A.due===0 || (R.ankiGoal && A.reviewed>=R.ankiGoal))); }
function streakDate(f,N){ let run=0; for(const d of Object.keys(G.days).sort()){ if(d>today()) break; if(f(d)){ if(++run>=N) return d; } else run=0; } return null; }
function seasonDays(){ return Object.keys(G.days).sort().filter(d=>d<=today() && d<=seasonEnd()); }

/* ---------- compute the collection ---------- */
function collection(){
  const coins={}, coinLog=[]; for(const k in COINS) coins[k]=0;
  const give=(k,d)=>{ coins[k]++; coinLog.push({k,d}); };
  for(const d of seasonDays()){ const R=G.days[d];
    if(prayersOn(d).every(Boolean)) give('prayer',d);
    if(ankiOnDay(d)) give('supply',d);
    const ord=dailyOrders(d); if(ord.length && ord.every(o=>o.done)) give('orders',d);
    if(R.goalMet && !R.leave) give('march',d);
    if(habitVal(d,'gym')===true) give('iron',d);
  }
  for(const b of G.blocks) if(b.e.type==='block' && b.n>=40 && b.acc>=0.65 && b.d<=seasonEnd()) give('field',b.d);
  // ribbons by week
  const ribbons={}, ribLog=[]; for(const k in RIBBONS) ribbons[k]=0;
  const weeks=[...new Set(seasonDays().map(weekMonday))];
  for(const mon of weeks){ const dates=[0,1,2,3,4,5,6].map(i=>addDays(mon,i)), past=dates.filter(d=>d<=today()&&G.days[d]); const days=past.map(d=>G.days[d]);
    const award=(k,ok)=>{ if(ok){ ribbons[k]++; ribLog.push({k,d:past[past.length-1]||mon, week:mon}); } };
    award('r_prayer', past.filter(d=>prayersOn(d).every(Boolean)).length>=6);
    award('r_supply', past.filter(ankiOnDay).length>=6);
    award('r_march',  days.filter(R=>R.goalMet&&!R.leave).length>=5);
    const q=days.reduce((a,R)=>a+R.q,0), c=days.reduce((a,R)=>a+R.c,0);
    award('r_bank',  q>=250);
    award('r_sharp', q>=150 && c/q>=0.7);
    const wo=weeklyOrders(mon); award('r_orders', wo.length && wo.every(o=>o.done));
    award('r_iron',  past.filter(d=>habitVal(d,'gym')===true).length>=3);
    const ts=taskState(), due=CLERK.flatMap(g=>g.items).filter(it=>{ const dd=clerkDue(it.due); return dd>=mon && dd<=dates[6] && dd<=today(); });
    award('r_clerk', due.length>0 && due.every(it=>{ const e=ts[it.k]; return e&&e.val&&e.date<=clerkDue(it.due); }));
  }
  const medals=MEDALS.map(m=>{ let d=null; try{ d=m.ok()||null; }catch(e){} if(d && d>seasonEnd()) d=null; return {...m, d, lost:!d && seasonOver()}; });
  return {coins, coinLog, ribbons, ribLog, medals};
}

/* ---------- drawing (placeholders until art arrives) ---------- */
const COIN_ART=new Set([]), RIBBON_ART=new Set([]), MEDAL_ART=new Set([]);
function coinHtml(k, n, size){
  const c=COINS[k], s=size||56, gold=n>=10;
  if(COIN_ART.has(k)) return `<span class="coin art" style="width:${s}px;height:${s}px"><img src="art/coin_${k}${gold?'_gold':''}.webp" alt=""></span>`;
  return `<span class="coin ${gold?'gold':''}" style="--cc:${c.c};width:${s}px;height:${s}px;font-size:${s*0.45}px">${c.g}</span>`;
}
function ribbonHtml(k, w){
  const r=RIBBONS[k]; w=w||96;
  if(RIBBON_ART.has(k)) return `<span class="ribbon art" style="width:${w}px"><img src="art/ribbon_${k.slice(2)}.webp" alt=""></span>`;
  const n=r.s.length, stops=r.s.map((col,i)=>`${col} ${i/n*100}% ${(i+1)/n*100}%`).join(',');
  return `<span class="ribbon" style="width:${w}px;height:${w*0.3}px;background:linear-gradient(90deg,${stops})"></span>`;
}
function medalHtml(m, size){
  const s=size||72;
  if(MEDAL_ART.has(m.k)) return `<span class="medal art" style="width:${s}px;height:${s*1.35}px"><img src="art/medal_${m.k}.webp" alt=""></span>`;
  const n=m.band.length, stops=m.band.map((col,i)=>`${col} ${i/n*100}% ${(i+1)/n*100}%`).join(',');
  return `<span class="medal" style="width:${s}px"><i class="band" style="background:linear-gradient(90deg,${stops})"></i><i class="disc" style="width:${s*0.78}px;height:${s*0.78}px;font-size:${s*0.32}px">${m.g}</i></span>`;
}

/* ---------- view ---------- */
function collectionCard(){
  const C=collection(), earned=C.medals.filter(m=>m.d).length;
  const coinRow=Object.keys(COINS).map(k=>`<div class="col-it ${C.coins[k]?'':'dim'}" title="${esc(COINS[k].why)}">${coinHtml(k,C.coins[k],52)}<b>×${C.coins[k]}</b><span>${esc(COINS[k].n)}${C.coins[k]>=10?' · gold':''}</span><small>${esc(COINS[k].why)}</small></div>`).join('');
  const ribRow=Object.keys(RIBBONS).map(k=>`<div class="col-it rib ${C.ribbons[k]?'':'dim'}" title="${esc(RIBBONS[k].why)}">${ribbonHtml(k,96)}<b>×${C.ribbons[k]}</b><span>${esc(RIBBONS[k].n)}</span><small>${esc(RIBBONS[k].why)}</small></div>`).join('');
  const cats=[...new Set(MEDALS.map(m=>m.cat))];
  const medRows=cats.map(cat=>`<h4>${esc(cat)}</h4><div class="col-row">${C.medals.filter(m=>m.cat===cat).map(m=>`<div class="col-it med ${m.d?'':m.lost?'lost':'dim'}" title="${esc(m.why)}">${medalHtml(m,64)}<span>${esc(m.n)}</span><small>${m.d?`Earned ${fmtD(m.d)}`:m.lost?'Lost — not earned this season':esc(m.why)}</small></div>`).join('')}</div>`).join('');
  return `<div class="card"><h3>Collection</h3>
    <div class="note">Tasks earn XP and collectibles. Coins are daily, ribbons weekly, medals once. Medals not earned by ${fmtD(seasonEnd())} are lost for good.</div>
    <h4>Coins <small class="c-muted">every 10 turns that coin gold</small></h4><div class="col-row">${coinRow}</div>
    <h4>Ribbons <small class="c-muted">weekly</small></h4><div class="col-row">${ribRow}</div>
    <h4 style="margin-top:16px">Medals <small class="c-muted">${earned}/${MEDALS.length}</small></h4>${medRows}</div>`;
}

/* ---------- "you earned" moments ---------- */
function rewardKeys(C){ const s=[]; for(const [k,n] of Object.entries(C.coins)) s.push(`c:${k}:${n}`); for(const [k,n] of Object.entries(C.ribbons)) s.push(`r:${k}:${n}`); for(const m of C.medals) if(m.d) s.push(`m:${m.k}`); return s; }
function checkRewards(){
  if(!G || CUT || !$('#gate').classList.contains('hidden') || !$('#sheetbg').classList.contains('hidden')) return;
  let C; try{ C=collection(); }catch(e){ return; }
  const now=rewardKeys(C); let seen=null; try{ seen=JSON.parse(localStorage.getItem('imc.rewardsSeen')); }catch(e){}
  try{ localStorage.setItem('imc.rewardsSeen', JSON.stringify(now)); }catch(e){}
  if(!seen) return;                      // first run: don't replay history
  const old=new Set(seen), fresh=now.filter(x=>!old.has(x)); if(!fresh.length) return;
  const items=[];
  for(const f of fresh){ const [t,k]=f.split(':');
    if(t==='m'){ const m=C.medals.find(x=>x.k===k); items.push(`<div class="col-it med">${medalHtml(m,80)}<span><b>${esc(m.n)}</b></span><small>${esc(m.why)}</small></div>`); }
    else if(t==='r'){ items.push(`<div class="col-it rib">${ribbonHtml(k,110)}<span><b>${esc(RIBBONS[k].n)}</b> ×${C.ribbons[k]}</span><small>${esc(RIBBONS[k].why)}</small></div>`); }
    else { const n=C.coins[k]; items.push(`<div class="col-it">${coinHtml(k,n,60)}<span><b>${esc(COINS[k].n)}</b> ×${n}${n===10?' · now gold':''}</span><small>${esc(COINS[k].why)}</small></div>`); }
  }
  openSheet(`<div class="donebox"><h2>${fresh.some(f=>f[0]==='m')?'Medal awarded':'Collected'}</h2><div class="col-row" style="justify-content:center">${items.slice(0,8).join('')}</div>${items.length>8?`<div class="note">+${items.length-8} more in your Collection</div>`:''}
    <div class="actions" style="justify-content:center"><button class="btn" data-a="go-profile">View collection</button><button class="btn pri" data-a="close">Carry on</button></div></div>`);
}
setInterval(()=>{ try{ checkRewards(); }catch(e){} }, 5000);
