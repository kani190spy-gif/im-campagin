'use strict';
/* =====================================================================
   Profile: XP, 50 levels × 10 prestiges, rank insignia, and Orders
   (daily + weekly challenges). Everything is worked out from the synced
   events and the campaign simulation, so phone and Mac always agree.
   ===================================================================== */
const MAX_LEVEL=50, MAX_PRESTIGE=10;
// The curve is scaled so that the full plan below (see PLAN) lands exactly on Prestige 10, level 50.
const XP_K = 1.196;   // = planXP() / (11 × unscaled prestige); re-check if PLAN or XP_RULES change
const XP_NEXT = L => Math.round(XP_K*(40 + 2.2*Math.pow(L,1.4)));   // XP to go from level L to L+1
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

const XP_RULES={ qBase:20, qAcc:30, ankiRev:1.5, ankiOn:200, goal:150, gym:150, gymMod:0.10, gymDays:3, pray:20, prayAll:60, cap:40, general:600, siege:1500, cms:2000, orderD:2.5, orderW:2 };
const PRAYERS=['Fajr','Dhuhr','Asr','Maghrib','Isha'];

/* ---------- clerkship checklist (MSU CHM Internal Medicine, 2026–27) ----------
   due = [week, weekday] counted from the IM start date (week 1 = the week IM starts; 1=Mon … 5=Fri). */
const CLERK=[ // due dates from the IM clerkship calendar (Nov 9 – Dec 18, 2026), including the Thanksgiving shifts
  {g:'Assignments', items:[
    {k:'tk',   t:'Things To Know: review and e-sign',      xp:100,  due:'2026-11-11'},
    {k:'hp',   t:'History & physical write-up',            xp:1200, due:'2026-11-19'},
    {k:'dc',   t:'Discharge summary',                      xp:1000, due:'2026-11-30'},
    {k:'self', t:'Mid-clerkship self-assessment',          xp:300,  due:'2026-11-30'},
    {k:'pba',  t:'PBA: chest X-ray interpretation',        xp:400,  due:'2026-12-02'},
    {k:'pba2', t:'PBA: EKG interpretation',                xp:400,  due:'2026-12-02'},
    {k:'ebm',  t:'Evidence-based medicine (Honors point)', xp:800,  due:'2026-12-03'},
    {k:'oral', t:'Oral case presentation (passing)',       xp:1500, due:'2026-12-11'},
    {k:'nbme', t:'NBME Subject Examination',               xp:2500, due:'2026-12-18'},
    {k:'evals',t:'Clerkship evaluations (end, director, 10 faculty)', xp:500, due:'2026-12-21'},
  ]},
  {g:'Lectures & reviews (attend or watch)', items:[
    {k:'lec_ekg', t:'EKG lecture (Dr. Tavera)',        xp:100, due:'2026-11-09'},
    {k:'lec_cxr', t:'Chest X-ray lecture (Dr. Baker)', xp:100, due:'2026-11-10'},
    {k:'lec_pba', t:'PBA review (Dr. Jameson)',        xp:100, due:'2026-11-25'},
    {k:'lec_nb1', t:'NBME review part 1',              xp:100, due:'2026-12-09'},
    {k:'lec_nb2', t:'NBME review part 2',              xp:100, due:'2026-12-16'},
  ]},
  {g:'Weekly preceptor list to Mindy', items:['2026-11-11','2026-11-18','2026-11-24','2026-12-02','2026-12-09','2026-12-15'].map((d,i)=>({k:'mail'+(i+1), t:`Week ${i+1}: names of interns, residents & attendings`, xp:100, due:d}))},
  {g:'Workplace-based assessments', note:'4 by Nov 30 · all 8 by Dec 16', items:['Admission','Communication / case presentation','Discharge planning','Documentation','Hand-off / sign-out','History','Physical exam (1 of 2)','Physical exam (2 of 2)'].map((t,i)=>({k:'wba'+i, t, xp:150, due:'2026-12-16'}))},
  {g:'Aquifer cases', note:'2 by Nov 30 · all 4 by Dec 16', items:['Case 8: T2DM chronic disease management','Case 18: memory problems','Case 19: anemia','Case 23: CKD'].map((t,i)=>({k:'aq'+i, t, xp:200, due:'2026-12-16'}))},
  {g:'Patient encounter logs (student role)', note:'12 by Nov 30 · all 24 by Dec 16', items:['Abdominal pain','Acute/chronic renal failure','Altered mental status','Anemia','Anticoagulation','Arrhythmia','Back pain','Chest pain/dyslipidemia','Chronic pain','Congestive heart failure','Common cancers','COPD/asthma','Cough','Diabetes','Dysuria/UTI','Fluid/electrolyte/acid-base','GI bleeding','Headache','Hypertension','Immunological disorders','Liver disease','Musculoskeletal pain','Psycho/social/impairment to care','Substance use disorder'].map((t,i)=>({k:'dx'+i, t, xp:60, due:'2026-12-16'}))},
];
const CLERK_MILESTONES=[ // mid-clerkship minimums
  {k:'m_wba', t:'4 workplace-based assessments by Nov 30', pre:'wba', n:4,  due:'2026-11-30', xp:250},
  {k:'m_aq',  t:'2 Aquifer cases by Nov 30',               pre:'aq',  n:2,  due:'2026-11-30', xp:150},
  {k:'m_dx',  t:'12 diagnosis logs by Nov 30',             pre:'dx',  n:12, due:'2026-11-30', xp:250},
];
function clerkDue(due){ if(typeof due==='string') return due; const [w,wd]=due; return addDays(S.settings.imStart, (w-1)*7 + (wd-1)); }
function taskState(){ const m={}; for(const e of liveEvents(S)) if(e.type==='task') m[e.k]=e; return m; }
function clerkXP(){ // entries {d, xp, label, late}
  const ts=taskState(), out=[];
  for(const g of CLERK) for(const it of g.items){ const e=ts[it.k]; if(!e||!e.val) continue; const due=clerkDue(it.due), late=e.date>due; out.push({d:e.date, xp:late?it.xp*0.5:it.xp, label:`${it.t}${late?' (late, half XP)':''}`}); }
  for(const m of CLERK_MILESTONES){ const due=clerkDue(m.due); const done=Object.values(ts).filter(e=>e.val && e.k.startsWith(m.pre) && e.date<=due).length; if(done>=m.n) out.push({d:due<=today()?due:today(), xp:m.xp, label:m.t}); }
  return out;
}
function prayersOn(d){ return PRAYERS.map((_,i)=>habitVal(d,'p'+(i+1))===true); }
function gymModDays(){ const set=new Set(); for(const e of liveEvents(S)) if(e.type==='habit' && e.kind==='gym' && e.val) for(let i=0;i<XP_RULES.gymDays;i++) set.add(addDays(e.date,i)); return set; }

/* ---------- Orders ---------- */
function dayBlocks(d){ return G.blocks.filter(b=>b.d===d && b.e.type!=='cms'); }
function tagged(d, r){ let n=0,c=0; for(const b of dayBlocks(d)){ const e=b.e; if(!e.tags||!e.q) continue; e.tags.forEach((tg,i)=>{ if(tg.r===r && e.q[i]!=null && i<b.n){ n++; c+=e.q[i]?1:0; } }); } return {n,c}; }
const DAILY={
  weak:{ ok:R=>!!R.genR, xp:80, txt:R=>`20 ${REG[R.genR].name} questions at 65%+`, ev:(R,d)=>{ const t=tagged(d,R.genR); return {done:t.n>=20 && t.c/t.n>=0.65, p:`${t.n}/20${t.n?` · ${Math.round(t.c/t.n*100)}%`:''}`}; } },
  vol:{ ok:()=>true, xp:60, txt:R=>`Complete ${volN(R)} questions`, ev:R=>({done:R.q>=volN(R), p:`${R.q}/${volN(R)}`}) },
  anki0:{ ok:R=>!R.siege, xp:60, txt:()=>`End the day with AnKing at 0 due`, ev:(R,d)=>{ const A=R.anki||G.ankiByDay[d]; return {done:!!(A&&A.due===0), p:A?`${A.due} due`:'no reading'}; } },
  ankiGoal:{ ok:R=>R.siege, xp:70, txt:R=>`Hit today's Anki goal (${R.ankiGoal||'—'} reviews)`, ev:(R,d)=>{ const A=R.anki||G.ankiByDay[d]; const r=A?A.reviewed:0; return {done:!!R.ankiGoal && r>=R.ankiGoal, p:`${r}/${R.ankiGoal||'—'}`}; } },
  acc70:{ ok:()=>true, xp:50, txt:()=>`Finish a block of 20+ at 70% or better`, ev:(R,d)=>{ const b=dayBlocks(d).filter(b=>b.n>=20); const best=b.reduce((m,x)=>Math.max(m,x.acc),0); return {done:b.some(x=>x.acc>=0.7), p:b.length?`best ${Math.round(best*100)}%`:'no block yet'}; } },
  early:{ ok:()=>true, xp:40, txt:()=>`Log your first block before noon`, ev:(R,d)=>{ const b=dayBlocks(d).map(x=>x.e.ts).filter(Boolean).sort(); return {done:!!b.length && new Date(b[0]).getHours()<12 && ymd(new Date(b[0]))===d, p:b.length?`first at ${new Date(b[0]).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:'none yet'}; } },
  two:{ ok:()=>true, xp:50, txt:()=>`Do two blocks today`, ev:(R,d)=>{ const n=dayBlocks(d).length; return {done:n>=2, p:`${n}/2`}; } },
  gym:{ ok:()=>true, xp:40, txt:()=>`Get a gym session in`, ev:(R,d)=>({done:habitVal(d,'gym')===true, p:habitVal(d,'gym')===true?'logged':'not yet'}) },
};
const WEEKLY={
  gen:{ ok:w=>!!w.genR, xp:300, txt:()=>`Break a general`, ev:w=>{ const n=G.gensDown.filter(g=>g.d>=w.mon&&g.d<=w.sun).length; return {done:n>=1, p:`${n}/1`}; } },
  goal5:{ ok:()=>true, xp:250, txt:()=>`Meet your daily goal 5 days`, ev:w=>{ const n=w.days.filter(R=>R.goalMet&&!R.leave).length; return {done:n>=5, p:`${n}/5`}; } },
  qweek:{ ok:()=>true, xp:250, txt:w=>`${w.qN} questions this week`, ev:w=>{ const n=w.days.reduce((a,R)=>a+R.q,0); return {done:n>=w.qN, p:`${n}/${w.qN}`}; } },
  acc:{ ok:()=>true, xp:200, txt:()=>`150+ questions at 65%+ for the week`, ev:w=>{ const n=w.days.reduce((a,R)=>a+R.q,0), c=w.days.reduce((a,R)=>a+R.c,0); return {done:n>=150 && c/n>=0.65, p:`${n} q${n?` · ${Math.round(c/n*100)}%`:''}`}; } },
  anki6:{ ok:()=>true, xp:200, txt:()=>`Anki on target 6 days (goal hit or 0 due)`, ev:w=>{ const n=w.days.filter(R=>R.anki && ((R.anki.due===0) || (R.ankiGoal && R.anki.reviewed>=R.ankiGoal))).length; return {done:n>=6, p:`${n}/6`}; } },
  gym3:{ ok:()=>true, xp:150, txt:()=>`3 gym sessions`, ev:w=>{ const n=w.dates.filter(d=>habitVal(d,'gym')===true).length; return {done:n>=3, p:`${n}/3`}; } },
};
function volN(R){ return Math.max(40, Math.round((R.quota||40)/5)*5); }
function pickN(keys, n, seed){ return keys.map(k=>({k,h:hash(seed+k)})).sort((a,b)=>a.h-b.h).slice(0,n).map(x=>x.k); }
function dailyOrders(d){
  const R=G.days[d]; if(!R || R.leave) return [];
  const study = DAILY.weak.ok(R) && hash('st'+d)<0.6 ? 'weak' : 'vol';
  const anki = R.siege ? 'ankiGoal' : 'anki0';
  const rest = pickN(['acc70','early','two','gym',study==='weak'?'vol':'weak'].filter(k=>DAILY[k].ok(R)), 1, 'd'+d);
  return [study, anki, ...rest].map(k=>{ const o=DAILY[k], r=o.ev(R,d); return {k, kind:'daily', d, xp:Math.round(o.xp*XP_RULES.orderD), txt:o.txt(R), done:r.done, p:r.p}; });
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
  const c = pickN(['acc','anki6','gym3'], 1, 'w'+mon)[0];
  return [a,b,c].map(k=>{ const o=WEEKLY[k], r=o.ev(w); return {k, kind:'weekly', d:mon, xp:Math.round(o.xp*XP_RULES.orderW), txt:o.txt(w), done:r.done, p:r.p}; });
}

/* ---------- XP ledger ---------- */
function seasonEnd(){ return S.settings.seasonEnd || '2026-12-21'; }   // clerkship evaluations deadline
function seasonOver(){ return today()>seasonEnd(); }
function xpLedger(){
  const L=[]; const END=seasonEnd(); const add=(d,src,xp,label)=>{ if(xp>0 && d<=END) L.push({d,src,xp,label}); };
  const t=today(), R_=XP_RULES;
  for(const b of G.blocks){ const e=b.e; if(e.type==='cms'){ add(b.d,'cms',R_.cms,`CMS form ${esc(e.form||'')} (${e.pct}%)`); continue; } add(b.d,'q',b.n*(R_.qBase+R_.qAcc*b.acc),`${b.n} questions at ${Math.round(b.acc*100)}%`); }
  const weeks=new Set();
  for(const [d,R] of Object.entries(G.days)){ if(d>t) continue;
    const A=R.anki||G.ankiByDay[d];
    if(A) add(d,'anki',A.reviewed*R_.ankiRev,`${A.reviewed} Anki reviews`);
    if(A && (A.due===0 || (R.ankiGoal && A.reviewed>=R.ankiGoal))) add(d,'anki',R_.ankiOn,'Anki on target');
    if(R.goalMet && !R.leave && d<t) add(d,'goal',R_.goal,'Daily goal met');
    if(habitVal(d,'gym')===true) add(d,'gym',R_.gym,'Gym session');
    const pr=prayersOn(d), np=pr.filter(Boolean).length; if(np) add(d,'pray',np*R_.pray+(np===5?R_.prayAll:0),`${np}/5 prayers${np===5?' (all five)':''}`);
    if(R.caps&&R.caps.length) add(d,'cap',R.caps.length*R_.cap,`${R.caps.length} town${R.caps.length>1?'s':''} taken`);
    if(R.siegeBroken) add(d,'siege',R_.siege,'Siege broken');
    for(const o of dailyOrders(d)) if(o.done) add(d,'order',o.xp,`Order: ${o.txt}`);
    weeks.add(weekMonday(d));
  }
  for(const mon of weeks){ for(const o of weeklyOrders(mon)) if(o.done) add(o.d<=t?([...weekCtx(mon).dates].reverse().find(d=>d<=t)||mon):mon,'order',o.xp,`Weekly order: ${o.txt}`); }
  for(const g of G.gensDown) add(g.d,'general',R_.general,`${GENERALS[g.r].name} broken`);
  for(const c of clerkXP()) add(c.d,'clerk',c.xp,c.label);
  const mod=gymModDays();
  for(const x of L){ if(x.src!=='gym' && mod.has(x.d)){ x.xp*=1+R_.gymMod; x.mod=true; } x.xp=Math.round(x.xp); }
  L.sort((a,b)=>a.d.localeCompare(b.d));
  return L;
}
/* ---------- the plan: doing all of this should land exactly on Prestige 10, level 50 ---------- */
const PLAN={ uw:1092, amb:300, acc:0.65, ankiPerDay:250, ankiOnRate:0.97, cms:4, goalRate:0.95, prayRate:0.9, gymPerWeek:3, towns:60, generals:9, ordersDaily:0.7, ordersWeekly:0.67 };
function planXP(){
  const set=S.settings, R_=XP_RULES, days=Math.max(1,daysBetween(set.campaignStart,set.shelf)+1), weeks=days/7;
  const clerk=CLERK.reduce((a,g)=>a+g.items.reduce((b,i)=>b+i.xp,0),0)+CLERK_MILESTONES.reduce((a,m)=>a+m.xp,0);
  const base = (PLAN.uw+PLAN.amb)*(R_.qBase+R_.qAcc*PLAN.acc) + days*PLAN.ankiPerDay*R_.ankiRev + days*PLAN.ankiOnRate*R_.ankiOn
    + PLAN.cms*R_.cms + days*PLAN.goalRate*R_.goal + days*PLAN.prayRate*(5*R_.pray+R_.prayAll)
    + PLAN.towns*R_.cap + PLAN.generals*R_.general + R_.siege + clerk
    + days*3*65*R_.orderD*PLAN.ordersDaily + weeks*3*230*R_.orderW*PLAN.ordersWeekly;
  const modCover=Math.min(1, PLAN.gymPerWeek*R_.gymDays/7);
  return {total: Math.round(base*(1+R_.gymMod*modCover) + weeks*PLAN.gymPerWeek*R_.gym), days};
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
const RANK_ART=new Set([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]), PRESTIGE_ART=new Set([1,2,3,4,5,6,7,8,9,10]);
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
  const srcName={q:'Questions',anki:'Anki',cms:'CMS forms',clerk:'Clerkship',order:'Orders',goal:'Daily goals',pray:'Prayers',gym:'Gym',cap:'Towns',general:'Generals',siege:'Siege'};
  const sum=(f)=>{ const m={}; for(const x of P.led) if(f(x)) m[x.src]=(m[x.src]||0)+x.xp; return m; };
  const todayM=sum(x=>x.d===t), weekM=sum(x=>x.d>=mon && x.d<=addDays(mon,6)), allM=sum(()=>true);
  const tot=m=>Object.values(m).reduce((a,b)=>a+b,0);
  const srcRows=Object.keys(srcName).filter(k=>allM[k]).map(k=>`<tr><td>${srcName[k]}</td><td>${todayM[k]||0}</td><td>${weekM[k]||0}</td><td>${allM[k].toLocaleString()}</td></tr>`).join('');
  const ladder=RANKS.map((r,i)=>{ const lo=Math.ceil(i*MAX_LEVEL/RANKS.length)+1; const here=rankOf(P.lvl)===r; return `<div class="rk ${here?'here':''} ${P.lvl>=lo?'got':''}">${insignia(lo,P.prestige,34)}<div><b>${r.t}</b><div class="sub">Level ${lo}</div></div></div>`; }).join('');
  const over=seasonOver();
  const pres=PRESTIGE.slice(1).map((p,i)=>`<div class="pr ${P.prestige>=i+1?'got':over?'lost':''}" title="Prestige ${i+1}: ${esc(p.n)}${P.prestige<i+1&&over?' — not earned this season':''}">${PRESTIGE_ART.has(i+1)?`<img class="pimg" src="art/prestige_${String(i+1).padStart(2,'0')}.webp" alt="">`:insignia(MAX_LEVEL,i+1,56)}<span>${i+1} · ${esc(p.n)}</span></div>`).join('');
  return `<div class="card prof">
      <div class="profhead">${insignia(P.lvl,P.prestige,96)}
        <div class="pinfo"><div class="ptitle">${esc(P.rank.t)}</div><div class="sub">${P.prestige?`Prestige ${P.prestige} · ${esc(PRESTIGE[P.prestige].n)} · `:''}Level ${P.lvl} of ${MAX_LEVEL}</div>
          <div class="xpbar"><div style="width:${pct}%"></div></div>
          <div class="sub">${P.need?`${P.into.toLocaleString()} / ${P.need.toLocaleString()} XP to level ${P.lvl+1}`:P.maxed?'Master Prestige — the top of the ladder.':'Level 50 reached.'} · ${P.total.toLocaleString()} XP lifetime</div>
          ${P.canPrestige?`<button class="btn pri" data-a="prestige" style="margin-top:8px">★ Enter Prestige ${P.prestige+1}</button>`:''}</div></div></div>
    ${paceCard(P)}
    <div class="cmdgrid">
      <div class="card"><h3>Today's orders</h3><ul class="ordl">${dd.map(orderRow).join('')||'<li class="c-muted">Leave day — no orders.</li>'}</ul>
        <h3 style="margin-top:14px">This week's orders <small class="c-muted">${fmtD(mon)} – ${fmtD(addDays(mon,6))}</small></h3><ul class="ordl">${ww.map(orderRow).join('')}</ul>
        <div class="note" style="margin-top:6px">Orders change daily and weekly, and lean toward your weakest system and whatever's behind.</div></div>
      <div class="card"><h3>XP</h3><table class="xptbl"><thead><tr><th>Source</th><th>Today</th><th>Week</th><th>All</th></tr></thead><tbody>${srcRows||'<tr><td colspan="4" class="c-muted">No XP yet.</td></tr>'}</tbody>
        <tfoot><tr><td>Total</td><td>${tot(todayM)}</td><td>${tot(weekM)}</td><td>${tot(allM).toLocaleString()}</td></tr></tfoot></table>
        <div class="note" style="margin-top:8px">${xpRulesText()}</div></div></div></div>
    ${clerkCard()}
    ${typeof collectionCard==='function'?collectionCard():''}
    <div class="card"><h3>Ranks</h3><div class="ladder">${ladder}</div></div>
    <div class="card"><h3>Prestige</h3><div class="note">At level ${MAX_LEVEL} you can enter the next prestige: your level resets to 1, and you keep the new emblem frame for good. Each prestige is ${XP_PER_PRESTIGE.toLocaleString()} XP.</div><div class="prow">${pres}</div></div>`;
}

function xpRulesText(){ const R=XP_RULES;
  return `Each question: ${R.qBase} + ${R.qAcc}×accuracy (65% = ${Math.round(R.qBase+R.qAcc*0.65)} XP) · Anki: ${R.ankiRev}/review, +${R.ankiOn} on target (0 due or goal hit) · CMS form +${R.cms} · daily goal +${R.goal} · prayers ${R.pray} each, +${R.prayAll} for all five · gym +${R.gym} and <b>+${Math.round(R.gymMod*100)}% on all XP</b> that day and the next ${R.gymDays-1} · town +${R.cap} · general +${R.general} · siege +${R.siege} · clerkship tasks 60–2,500 (half XP if checked off after the due date) · orders as listed.`; }
function paceCard(P){
  const pl=planXP(), set=S.settings, el=Math.min(pl.days, Math.max(1,daysBetween(set.campaignStart,today())+1));
  const goal=XP_PER_PRESTIGE*(MAX_PRESTIGE+1), toDate=goal*el/pl.days, pct=P.total/goal*100, diff=P.total-toDate;
  return `<div class="card"><h3>Road to Prestige 10 · General</h3>
    <div class="xpbar big"><div style="width:${Math.min(100,pct)}%"></div><i style="left:${Math.min(100,toDate/goal*100)}%" title="Where the plan says you should be today"></i></div>
    <div class="sub"><b>${P.total.toLocaleString()}</b> / ${goal.toLocaleString()} XP (${pct.toFixed(1)}%) · day ${el} of ${pl.days} · <span class="${diff>=0?'c-good':'c-warn'}">${diff>=0?`${Math.round(diff).toLocaleString()} XP ahead of plan`:`${Math.round(-diff).toLocaleString()} XP behind plan`}</span></div>
    <div class="note" style="margin-top:6px">The plan: all ${PLAN.uw.toLocaleString()} UWorld IM + ${PLAN.amb} AMBOSS at ~${Math.round(PLAN.acc*100)}%, Anki on target ${Math.round(PLAN.ankiOnRate*100)}% of days, all ${PLAN.cms} CMS forms, every clerkship task on time, all five prayers most days, gym ${PLAN.gymPerWeek}×/week, and most orders. Hit that and you finish as a Prestige 10 General.</div></div>`;
}
function clerkCard(){
  const ts=taskState(), t=today();
  const row=it=>{ const e=ts[it.k], on=!!(e&&e.val), due=clerkDue(it.due), late=on?e.date>due:t>due;
    return `<li class="ord ${on?'done':''}"><button class="ock tk" data-a="task" data-k="${it.k}" aria-label="Toggle">${on?'✓':''}</button><span>${esc(it.t)}<span class="c-muted"> · due ${fmtDow(due)}${!on&&late?' · <b class="c-bad">overdue</b>':''}${on&&late?' · late':''}</span></span><b class="oxp">${on&&late?'+'+Math.round(it.xp/2):'+'+it.xp} XP</b></li>`; };
  const allItems=CLERK.flatMap(g=>g.items), done=allItems.filter(i=>ts[i.k]&&ts[i.k].val).length;
  return `<div class="card"><h3>IM clerkship checklist <small class="c-muted">${done}/${allItems.length}</small></h3>
    <div class="note">Tick items as you finish them. On time = full XP, late = half. Due dates follow the clerkship calendar, including the Thanksgiving changes.</div>
    ${CLERK.map(g=>{ const n=g.items.filter(i=>ts[i.k]&&ts[i.k].val).length; return `<details class="clerkg" ${g.items.some(i=>!(ts[i.k]&&ts[i.k].val) && daysBetween(t,clerkDue(i.due))<=7)?'open':''}><summary><b>${esc(g.g)}</b> <span class="c-muted">${n}/${g.items.length}${g.note?` · ${esc(g.note)}`:''}</span></summary><ul class="ordl">${g.items.map(row).join('')}</ul></details>`; }).join('')}
    <div class="note" style="margin-top:6px">Week-3 minimum bonuses: ${CLERK_MILESTONES.map(m=>`${esc(m.t)} (+${m.xp})`).join(' · ')}.</div></div>`;
}
function prayersRow(){
  const t=today(), on=prayersOn(t), n=on.filter(Boolean).length;
  return `<div class="toggle pray"><div><div>Prayers <span class="c-muted">${n}/5${n===5?' · all five':''}</span></div></div><div class="prow5">${PRAYERS.map((p,i)=>`<button class="pbtn ${on[i]?'on':''}" data-a="habit" data-k="p${i+1}" title="${p}">${p}</button>`).join('')}</div></div>`;
}

/* ---------- corner rank widget ---------- */
function renderRankCorner(){
  if(!G) return; const P=profileState(); let el=$('#rankcorner');
  if(!el){ el=document.createElement('button'); el.id='rankcorner'; el.setAttribute('data-a','go-profile'); document.body.appendChild(el); }
  const mod=gymModDays(), t=today(), on=mod.has(t); let until=null; if(on){ let d=t; while(mod.has(addDays(d,1))) d=addDays(d,1); until=d; }
  const pct=P.need?Math.min(100,P.into/P.need*100):100;
  el.innerHTML=`${insignia(P.lvl,P.prestige,58)}<div class="rcb"><div class="rct">${esc(P.rank.t)}</div><div class="rcs">${P.prestige?`P${P.prestige} · `:''}Lv ${P.lvl}${P.need?` · ${(P.need-P.into).toLocaleString()} XP to go`:''}</div><div class="xpbar sm"><div style="width:${pct}%"></div></div>${on?`<div class="rcm">💪 Gym +${Math.round(XP_RULES.gymMod*100)}% XP · through ${until===t?'today':fmtDow(until).split(',')[0]}</div>`:''}</div>`;
}

/* ---------- rank-up moment & header badge ---------- */
function renderRankChip(){
  if(!G) return; try{ renderRankCorner(); }catch(e){} const P=profileState(); let el=$('#rankchip');
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
  else if(a==='task'){ const k=b.dataset.k, cur=taskState()[k]; addEvent({id:'task-'+k, type:'task', k, val:!(cur&&cur.val), date:today()}); }
  else if(a==='prestige'){ const P=profileState(); if(!P.canPrestige) return; if(confirm(`Enter Prestige ${P.prestige+1}? Your level resets to 1; your ${PRESTIGE[P.prestige+1].n} emblem frame is permanent.`)){ addEvent({type:'prestige', n:P.prestige+1, base:P.total}); try{ localStorage.setItem('imc.rankSeen',`${P.prestige}:${P.lvl}`); }catch(e){} } }
});
