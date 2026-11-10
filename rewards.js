'use strict';
/* =====================================================================
   Collectibles: coins (daily), ribbons (weekly), medals (one-time).
   Tasks earn XP *and* collectibles; collectibles themselves add no XP.
   Everything is derived from synced events, so all devices agree.
   Medals not earned by the season's end are lost for good.
   ===================================================================== */
const METALS=['nickel','iron','copper','bronze','silver','gold','obsidian'];   // obsidian: prayer coin only (all five)
const METAL_COL={nickel:'#c8ccd2', iron:'#7d8088', copper:'#c87a4a', bronze:'#b08a4a', silver:'#e6e9ef', gold:'#e3b54a', obsidian:'#7a5ab8'};
// Each family is one coin design; the metal shows how far you went that day (or that week, for gym).
// Participant coin designs, rarity 1 (common) → 10 (rarest). One is drawn at random each completed day.
const DUTY_VARIANTS=[
  {k:'clipboard', n:'Clipboard',              r:1,  g:'📋'},
  {k:'vessel',    n:'Aortic Tree',            r:2,  g:'⟟'},
  {k:'rbc',       n:'Red Cell',               r:3,  g:'◍'},
  {k:'dua',       n:'Hands in Dua',           r:4,  g:'🤲'},
  {k:'kidneys',   n:'Kidneys, Aorta & IVC',   r:5,  g:'⫶'},
  {k:'dendritic', n:'Dendritic Cell',         r:6,  g:'✺'},
  {k:'lungs',     n:'Lungs',                  r:7,  g:'🫁'},
  {k:'brain',     n:'Brain',                  r:8,  g:'🧠'},
  {k:'gut',       n:'Stomach & Intestines',   r:9,  g:'∾'},
  {k:'heart',     n:'Vascularized Heart',     r:10, g:'❤'},
];
const DUTY_W=[12,10,8.5,7,5.5,4.2,3,2,1.2,0.6];   // draw weights by rarity 1→10 (heart ≈ 1 in 90)
function dutyDraw(d){ const tot=DUTY_W.reduce((a,b)=>a+b,0); let x=hash('duty:'+d)*tot; for(let i=0;i<DUTY_VARIANTS.length;i++){ x-=DUTY_W[i]; if(x<0) return DUTY_VARIANTS[i]; } return DUTY_VARIANTS[0]; }
const COINS={
  prayer:{n:'Vigil coin',   g:'☾', why:'Prayers in a day', tiers:'1 nickel · 2 bronze · 3 silver · 4 gold · all 5 obsidian'},
  duty:  {n:'Participant coin', g:'✚', why:'Daily clinical activities completed', tiers:'a random design each day: collect all 10, rarer ones are harder to find'},
  iron:  {n:'Forge coin',   g:'⚒', why:'Every gym session (metal by session # that week)', tiers:'1st nickel · 2nd copper · 3rd silver · 4th+ gold'},
  supply:{n:'Supply coin',  g:'⛭', why:'Anki each day', tiers:'½ goal nickel · ¾ goal copper · goal hit silver · 0 due gold'},
  field: {n:'Field coin',   g:'⚔', why:'Each 40-question block, or every 40 questions pooled from smaller sets that day (metal by accuracy)', tiers:'50% nickel · 55% iron · 60% copper · 65% bronze · 70% silver · 75% gold'},
  march: {n:'March coin',   g:'⚑', why:'Daily question goal', tiers:'½ nickel · ¾ copper · 100% silver · 125% gold'},
  orders:{n:'Command coin', g:'✉', why:'Daily orders done', tiers:'1 bronze · 2 silver · all 3 gold'},
};
const RIBBONS={ // weekly; stripes drawn in code (colors left→right)
  r_prayer:{n:'Week of Devotion',    s:['#1f3b5a','#9fc7e8','#f2efe6','#9fc7e8','#1f3b5a'], d:'☾', why:'All five prayers on 6 of 7 days'},
  r_supply:{n:'Unbroken Supply',     s:['#1d4d2b','#7fd38a','#1d4d2b','#e3b54a','#1d4d2b'], d:'⛭', why:'Anki on target 6 of 7 days'},
  r_march: {n:'Forced March',        s:['#5a4a2a','#d9c7a0','#8a2d2d','#d9c7a0','#5a4a2a'], d:'⚑', why:'Daily goal met 5 of 7 days'},
  r_bank:  {n:'Bank Assault',        s:['#7a1f1f','#e0705f','#f2efe6','#e0705f','#7a1f1f'], d:'♜', why:'250+ questions in a week'},
  r_sharp: {n:'Marksman',            s:['#2a2f3a','#e3b54a','#2a2f3a','#e3b54a','#2a2f3a'], d:'◎', why:'150+ questions at 70%+ in a week'},
  r_orders:{n:'Staff Commendation',  s:['#3a2a5a','#e3b54a','#f2efe6','#e3b54a','#3a2a5a'], d:'✉', why:'All three weekly orders done'},
  r_iron:  {n:'Iron Discipline',     s:['#3a3f4a','#b0b6c2','#e0705f','#b0b6c2','#3a3f4a'], d:'⚒', why:'3 gym sessions in a week'},
  r_clerk: {n:'Clean Paperwork',     s:['#0d5c45','#f2efe6','#0d5c45','#f2efe6','#0d5c45'], d:'✚', why:'Every clerkship item due that week done on time'},
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
  {k:'block40', n:'Full Block', g:'⓸', band:['#7a1f1f','#e3b54a','#7a1f1f'], cat:'Question bank', why:'Complete a 40-question block in one day', ok:()=>{ const b=G.blocks.find(b=>b.e.type==='block'&&b.n>=40); return b&&b.d; }},
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
  {k:'siege',n:'Siegebreaker',    g:'⛫', band:['#1d4d2b','#7fd38a','#1d4d2b'], cat:'Campaign', why:'Break your first Anki siege', ok:()=>{ const d=Object.values(G.days).find(R=>R.siegeBroken); return d&&d.d; }},
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
function ankiOnDay(d){ const R=G.days[d]; if(!R) return false; const A=R.anki||G.ankiByDay[d]; return !!(A && (a0(A) || (R.ankiGoal && A.reviewed>=R.ankiGoal))); }
function streakDate(f,N){ let run=0; for(const d of Object.keys(G.days).sort()){ if(d>today()) break; if(f(d)){ if(++run>=N) return d; } else run=0; } return null; }
function seasonDays(){ return Object.keys(G.days).sort().filter(d=>d<=today() && d<=seasonEnd()); }

/* ---------- compute the collection ---------- */
function collection(){
  const coins={}, coinLog=[]; for(const k in COINS){ coins[k]={total:0}; for(const m of METALS) coins[k][m]=0; }
  const duty={}, dutyLog=[];
  const give=(k,m,d)=>{ if(!m) return; coins[k][m]++; coins[k].total++; coinLog.push({k,m,d}); };
  const gymWeek={};
  for(const d of seasonDays()){ const R=G.days[d];
    const np=prayersOn(d).filter(Boolean).length; give('prayer',[null,'nickel','bronze','silver','gold','obsidian'][np],d);
    if(habitVal(d,'duty')==='done'){ const v=dutyDraw(d); give('duty','nickel',d); duty[v.k]=(duty[v.k]||0)+1; dutyLog.push({k:v.k,d}); }
    if(habitVal(d,'gym')===true){ const w=weekMonday(d); gymWeek[w]=(gymWeek[w]||0)+1; give('iron',[null,'nickel','copper','silver','gold'][Math.min(4,gymWeek[w])],d); }
    const A=R.anki||G.ankiByDay[d]; if(A){ const goal=R.ankiGoal||S.settings.ankiGoal, f=goal?A.reviewed/goal:0; give('supply', a0(A)?'gold': f>=1?'silver': f>=0.75?'copper': f>=0.5?'nickel':null, d); }
    if(!R.leave && R.quota){ const f=R.q/R.quota; give('march', f>=1.25?'gold': f>=1?'silver': f>=0.75?'copper': f>=0.5?'nickel':null, d); }
    const od=dailyOrders(d).filter(o=>o.done).length; give('orders',[null,'bronze','silver','gold'][Math.min(3,od)],d);
  }
  const fieldM=a=> a>=0.75?'gold': a>=0.7?'silver': a>=0.65?'bronze': a>=0.6?'copper': a>=0.55?'iron': a>=0.5?'nickel':null;
  const pool={};
  for(const b of G.blocks) if(b.e.type==='block' && b.d<=seasonEnd()){
    if(b.n>=40) give('field', fieldM(b.acc), b.d);
    else { const p=pool[b.d]||(pool[b.d]={n:0,c:0}); p.n+=b.n; p.c+=b.c; }
  }
  // partial sets on the same day pool: each full 40 earns a Field coin at the pooled accuracy
  for(const d in pool){ const p=pool[d]; for(let i=0;i<Math.floor(p.n/40);i++) give('field', fieldM(p.c/p.n), d); }
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
  return {coins, coinLog, ribbons, ribLog, medals, duty, dutyLog};
}

/* ---------- drawing (placeholders until art arrives) ---------- */
// Per-level coin art: add '<coin>_<metal>' when art/coin_<coin>_<metal>.webp exists. (prayer tiers are interim tints of your nickel Vigil coin)
const COIN_FILES=new Set(['prayer_nickel','prayer_bronze','prayer_silver','prayer_gold','prayer_obsidian','supply_nickel','supply_copper','supply_silver','supply_gold','field_nickel']);
const COIN_ART=new Set([]), RIBBON_ART=new Set([]), MEDAL_ART=new Set([]);
function coinHtml(k, metal, size){
  const c=COINS[k], s=size||56, col=METAL_COL[metal]||'#888';
  if(metal==='obsidian' && COIN_ART.has(k+'_obsidian')) return `<span class="coin art" style="width:${s}px;height:${s}px"><img src="art/coin_${k}_obsidian.webp" alt=""></span>`;
  if(COIN_FILES.has(k+'_'+metal)) return `<span class="coin art" style="width:${s}px;height:${s}px"><img src="art/coin_${k}_${metal}.webp" alt=""></span>`;
  if(COIN_ART.has(k)) return `<span class="coin art m-${metal}" style="width:${s}px;height:${s}px"><img src="art/coin_${k}.webp" alt=""></span>`;
  return `<span class="coin m-${metal}" style="--cc:${col};width:${s}px;height:${s}px;font-size:${s*0.45}px">${c.g}</span>`;
}
const DUTY_ART=new Set(['clipboard','vessel','rbc','dua','kidneys','dendritic','lungs','brain','gut','heart']);   // add variant keys when art/coin_duty_<key>.webp exists
function dutyCoinHtml(v,size,hidden){ const s=size||56;
  if(DUTY_ART.has(v.k) && !hidden) return `<span class="coin art" style="width:${s}px;height:${s}px"><img src="art/coin_duty_${v.k}.webp" alt=""></span>`;
  const col=v.r>=9?'#e3b54a':v.r>=7?'#e8d29a':v.r>=4?'#e6e9ef':'#c8ccd2';
  return `<span class="coin r${v.r}" style="--cc:${col};width:${s}px;height:${s}px;font-size:${s*0.42}px">${hidden?'?':v.g}</span>`; }
function ribbonHtml(k, w){
  const r=RIBBONS[k]; w=w||96;
  if(RIBBON_ART.has(k)) return `<span class="ribbon art" style="width:${w}px"><img src="art/ribbon_${k.slice(2)}.webp" alt=""></span>`;
  const n=r.s.length, stops=r.s.map((col,i)=>`${col} ${i/n*100}% ${(i+1)/n*100}%`).join(',');
  return `<span class="ribbon" style="width:${w}px;height:${w*0.3}px;background:linear-gradient(90deg,${stops})"><i class="dev" style="width:${w*0.24}px;height:${w*0.24}px;font-size:${w*0.15}px">${r.d||'✦'}</i></span>`;
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
  const coinRow=Object.keys(COINS).map(k=>{ const cc=C.coins[k], best=[...METALS].reverse().find(m=>cc[m])||'nickel';
    return `<div class="col-it coinfam ${cc.total?'':'dim'}" title="${esc(COINS[k].tiers)}">${coinHtml(k,best,52)}<b>×${cc.total}</b><span>${esc(COINS[k].n)}</span><small>${esc(COINS[k].why)}</small>
      <div class="mtl">${METALS.filter(m=>m!=='obsidian'||k==='prayer').map(m=>`<i class="${cc[m]?'':'z'}" style="--mc:${METAL_COL[m]}" title="${m}">${cc[m]}</i>`).join('')}</div><small class="tiers">${esc(COINS[k].tiers)}</small></div>`; }).join('');
  const ribRow=Object.keys(RIBBONS).map(k=>`<div class="col-it rib ${C.ribbons[k]?'':'dim'}" title="${esc(RIBBONS[k].why)}">${ribbonHtml(k,96)}<b>×${C.ribbons[k]}</b><span>${esc(RIBBONS[k].n)}</span><small>${esc(RIBBONS[k].why)}</small></div>`).join('');
  const cats=[...new Set(MEDALS.map(m=>m.cat))];
  const medRows=cats.map(cat=>`<h4>${esc(cat)}</h4><div class="col-row">${C.medals.filter(m=>m.cat===cat).map(m=>`<div class="col-it med ${m.d?'':m.lost?'lost':'dim'}" title="${esc(m.why)}">${medalHtml(m,64)}<span>${esc(m.n)}</span><small>${m.d?`Earned ${fmtD(m.d)}`:m.lost?'Lost — not earned this season':esc(m.why)}</small></div>`).join('')}</div>`).join('');
  return `<div class="card"><h3>Collection</h3>
    <div class="note">Tasks earn XP and collectibles. Coins are daily, ribbons weekly, medals once. Medals not earned by ${fmtD(seasonEnd())} are lost for good.</div>
    <h4>Coins <small class="c-muted">the metal shows how far you went: nickel → iron → copper → bronze → silver → gold (→ obsidian for all five prayers)</small></h4><div class="col-row">${coinRow}</div>
    <h4>Participant coins <small class="c-muted">${Object.keys(C.duty).length}/${DUTY_VARIANTS.length} designs found · rarity 1–10</small></h4><div class="col-row">${DUTY_VARIANTS.map(v=>{ const n=C.duty[v.k]||0; return `<div class="col-it ${n?'':'dim'}">${dutyCoinHtml(v,52,!n)}<b>${n?'×'+n:'?'}</b><span>${n?esc(v.n):'Undiscovered'}</span><small>Rarity ${v.r}/10</small></div>`; }).join('')}</div>
    <h4>Ribbons <small class="c-muted">weekly</small></h4><div class="col-row">${ribRow}</div>
    <h4 style="margin-top:16px">Medals <small class="c-muted">${earned}/${MEDALS.length}</small></h4>${medRows}</div>`;
}

/* ---------- "you earned" moments ---------- */
function rewardKeys(C){ const s=[]; for(const [k,cc] of Object.entries(C.coins)) for(const m of METALS) if(cc[m]) s.push(`c:${k}:${m}:${cc[m]}`); for(const [k,n] of Object.entries(C.ribbons)) s.push(`r:${k}:${n}`); for(const m of C.medals) if(m.d) s.push(`m:${m.k}`); return s; }
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
    else if(k==='duty'){ const last=C.dutyLog[C.dutyLog.length-1], v=DUTY_VARIANTS.find(x=>x.k===last.k); items.push(`<div class="col-it">${dutyCoinHtml(v,64)}<span><b>Participant coin: ${esc(v.n)}</b></span><small>Rarity ${v.r}/10${C.duty[v.k]===1?' · new design!':''}</small></div>`); }
    else { const m=f.split(':')[2]; items.push(`<div class="col-it">${coinHtml(k,m,60)}<span><b>${esc(COINS[k].n)}</b> · ${m}</span><small>${esc(COINS[k].why)}</small></div>`); }
  }
  openSheet(`<div class="donebox"><h2>${fresh.some(f=>f[0]==='m')?'Medal awarded':'Collected'}</h2><div class="col-row" style="justify-content:center">${items.slice(0,8).join('')}</div>${items.length>8?`<div class="note">+${items.length-8} more in your Collection</div>`:''}
    <div class="actions" style="justify-content:center"><button class="btn" data-a="go-profile">View collection</button><button class="btn pri" data-a="close">Carry on</button></div></div>`);
}
setInterval(()=>{ try{ checkRewards(); }catch(e){} }, 5000);
