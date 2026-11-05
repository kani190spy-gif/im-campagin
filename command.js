'use strict';
/* =====================================================================
   Command tab: the Hollowing's generals, your officers, the Chronicle
   (story chapters unlocked by work) and the weekly dispatch.
   Generals and officers are worked out in simulate() (index.html).
   ===================================================================== */
const CHAPTERS=[
  {id:'ch1', name:'First Ground',        need:'100 questions',                         ok:x=>x.q>=100},
  {id:'ch2', name:'The Letter',          need:'break your first general',              ok:x=>x.gens>=1},
  {id:'ch3', name:'The Ledger',          need:'break the Anki siege, or 400 questions', ok:x=>x.siege||x.q>=400},
  {id:'ch4', name:'The Council Divided', need:'your first CMS form, or 600 questions',  ok:x=>x.cms>=1||x.q>=600},
  {id:'ch5', name:"The Officer's Debt",  need:'break three generals',                   ok:x=>x.gens>=3},
  {id:'ch6', name:'The Eve',             need:'three CMS forms, or 900 questions',      ok:x=>x.cms>=3||x.q>=900},
];
function chapterFacts(){ return {q:G.uwDone+G.ambDone, gens:G.gensDown.length, siege:!!G.siegeEverBroken, cms:Object.keys(G.cmsDone).length}; }
function chaptersUnlocked(){ const f=chapterFacts(); const out=[]; for(const c of CHAPTERS){ if(!c.ok(f)) break; out.push(c.id); } return out; }
function chaptersSeen(){ return new Set(liveEvents(S).filter(e=>e.type==='chapter').map(e=>e.ch)); }
let chapPlaying=false;
async function chapterCheck(){
  if(!STORY){ if(typeof loadStory==='function') loadStory().then(()=>setTimeout(chapterCheck,300)); return; }
  if(chapPlaying || !G || CUT || !$('#gate').classList.contains('hidden') || !$('#sheetbg').classList.contains('hidden')) return;
  if(typeof btlPlaying!=='undefined' && btlPlaying) return;
  const seen=chaptersSeen(); const next=chaptersUnlocked().find(c=>!seen.has(c)); if(!next || !STORY.scenes[next]) return;
  chapPlaying=true;
  try{ addEvent({type:'chapter', ch:next}); await playScene(next); } finally { chapPlaying=false; }
}

/* ---------- portraits (your concept art when present, a silhouette otherwise) ---------- */
function portrait(src, label, cls){
  return `<div class="pt ${cls||''}"><img src="${src}" alt="" onerror="this.remove()"><span>${esc(label)}</span></div>`;
}
function genArt(r){ return `art/gen_${r}.webp`; }
function offArt(k){ return `art/off_${k}.webp`; }

/* ---------- the view ---------- */
function viewCommand(){
  const set=S.settings, N=set.genN||30, P=set.genPct||65;
  // generals
  const g=G.gen, down=G.gensDown;
  let active='';
  if(g){ const h=G.genHist[g.r]||[], last=h.slice(-N), acc=last.length?last.reduce((a,b)=>a+b,0)/last.length:null; const ra=G.regAcc[g.r];
    active=`<div class="gencard">${portrait(genArt(g.r), GENERALS[g.r].name.replace(/^The /,'')[0], 'big foe')}
      <div class="gbody"><div class="gname">${esc(GENERALS[g.r].name)}</div><div class="sub">${esc(GENERALS[g.r].title)} · holds <b>${esc(REG[g.r].name)}</b> · in the field since ${fmtD(g.since)}</div>
        <div class="gstats"><div><span>Questions vs this general</span><b>${Math.min(h.length,N)}/${N}</b></div><div><span>Last ${Math.min(h.length,N)||N}</span><b class="${acc==null?'':acc*100>=P?'c-good':acc>=0.5?'c-warn':'c-bad'}">${acc==null?'–':Math.round(acc*100)+'%'}</b></div><div><span>To break</span><b>${P}%+</b></div><div><span>All-time ${esc(REG[g.r].name.split(' ')[0])}</span><b>${ra&&ra.n?Math.round(ra.c/ra.n*100)+'%':'–'}</b> <small class="c-muted">${ra?ra.n:0} q</small></div></div>
        <div class="bar"><div style="width:${Math.min(100,h.length/N*100)}%;background:${acc!=null&&acc*100>=P?'var(--good)':'#e0705f'}"></div></div>
        <div class="note">Only tagged questions count: paste your UWorld results after each block so the app knows each question's system. Do ${esc(REG[g.r].name)} questions (a system-filtered block works best) until your last ${N} are at ${P}% or better.</div></div></div>`; }
  else active=`<div class="note">${down.length>=Object.keys(GENERALS).length?'Every general has fallen.':'Scouting… paste a tagged UWorld block and a general will take the field.'}</div>`;
  const lurk=Object.keys(GENERALS).filter(r=>!down.some(x=>x.r===r) && (!g||g.r!==r) && G.regAcc[r] && G.regAcc[r].n>=10).sort((a,b)=>G.regAcc[a].c/G.regAcc[a].n-G.regAcc[b].c/G.regAcc[b].n).slice(0,3);
  const genHtml=`<div class="card cmd"><h3>The Hollowing's generals</h3>${active}
    ${lurk.length?`<div class="gsub"><h4>Waiting in the wings</h4>${lurk.map(r=>`<div class="gmini">${portrait(genArt(r), GENERALS[r].name.replace(/^The /,'')[0], 'sm foe')}<div><b>${esc(GENERALS[r].name)}</b><div class="sub">${esc(REG[r].name)} · ${Math.round(G.regAcc[r].c/G.regAcc[r].n*100)}% over ${G.regAcc[r].n} q</div></div></div>`).join('')}</div>`:''}
    ${down.length?`<div class="gsub"><h4>Broken (${down.length})</h4>${down.map(x=>`<div class="gmini down">${portrait(genArt(x.r), GENERALS[x.r].name.replace(/^The /,'')[0], 'sm foe')}<div><b>${esc(GENERALS[x.r].name)}</b><div class="sub">${esc(REG[x.r].name)} · ${fmtD(x.d)} · last ${N} at ${Math.round(x.acc*100)}%</div></div></div>`).join('')}</div>`:''}</div>`;
  // officers
  const q=G.uwDone+G.ambDone, all=Object.keys(OFFICERS), have=G.officers;
  const offHtml=`<div class="card cmd"><h3>Your officers <small class="c-muted">${have.length}/${all.length}</small></h3>
    <div class="offgrid">${have.map(o=>`<div class="offc">${portrait(offArt(o.k), OFFICERS[o.k].name.split(' ').pop()[0], 'sm ally')}<div><b>${esc(OFFICERS[o.k].name)}</b><div class="sub">${esc(OFFICERS[o.k].perk)}</div><div class="note">Joined ${fmtD(o.d)} · ${esc(o.why)}</div></div></div>`).join('')}
      ${have.length<all.length?`<div class="offc locked"><div class="pt sm"><span>?</span></div><div><b>Next recruit</b><div class="sub">At ${G.nextRecruitQ} questions (${Math.max(0,G.nextRecruitQ-q)} to go), or when you break a general — whichever comes first. Who joins is a surprise.</div></div></div>`:''}</div></div>`;
  // chronicle
  const un=chaptersUnlocked(), seen=chaptersSeen();
  const chHtml=`<div class="card cmd"><h3>The Chronicle</h3><ul class="log">${CHAPTERS.map((c,i)=>{ const open=un.includes(c.id); return `<li><span class="d">${['I','II','III','IV','V','VI'][i]}</span><span>${open?`<b>${esc(c.name)}</b>${seen.has(c.id)?'':' <span class="pill c-warn" style="font-size:9px">new</span>'}`:`<span class="c-muted">Locked — ${esc(c.need)}</span>`}</span>${open?`<button class="btn sm" style="margin-left:auto" data-a="ch-play" data-ch="${c.id}">▶ Play</button>`:''}</li>`; }).join('')}
    <li><span class="d">VII</span><span class="c-muted">The final chapter is written on the 18th.</span></li></ul></div>`;
  return `<div class="cmdgrid">${genHtml}${offHtml}</div>${chHtml}${dispatchCard()}`;
}

/* ---------- weekly dispatch ---------- */
function weekStats(mon){
  const days=[]; for(let i=0;i<7;i++){ const d=addDays(mon,i); if(G.days[d]) days.push(G.days[d]); }
  const sum=k=>days.reduce((a,R)=>a+(R[k]||0),0);
  const q=sum('q'), c=sum('c'), rev=days.reduce((a,R)=>a+(R.anki?R.anki.reviewed:0),0);
  const inWeek=d=>d>=mon && d<=addDays(mon,6);
  const caps=G.log.filter(x=>x.kind==='cap'&&inWeek(x.d)).length, lost=G.log.filter(x=>x.kind==='lost'&&inWeek(x.d)).length;
  const done=days.filter(R=>R.d<today() && !R.leave), met=done.filter(R=>R.goalMet).length;
  const gens=G.gensDown.filter(x=>inWeek(x.d)), offs=G.officers.filter(x=>inWeek(x.d));
  const btl=liveEvents(S).filter(e=>e.type==='battle' && !e.auto && inWeek(e.date)), el=liveEvents(S).filter(e=>e.type==='erace' && e.live && inWeek(e.date));
  const firstDue=days.find(R=>R.anki), lastDue=[...days].reverse().find(R=>R.anki);
  return {mon, days:days.length, q, c, acc:q?c/q:null, rev, net:sum('gained')-sum('lostGround'), caps, lost, met, of:done.length, gens, offs, btl, el,
    dueFrom:firstDue?firstDue.anki.due:null, dueTo:lastDue?lastDue.anki.due:null};
}
function dispatchText(w){
  const ours=G.town.filter(x=>x.owner==='us').length, end=addDays(w.mon,6);
  const lines=[
    `IM CAMPAIGN · WEEKLY DISPATCH`,
    `${fmtD(w.mon)} – ${fmtD(end)} · ${Math.max(0,daysBetween(today(),S.settings.shelf))} days to the shelf`,
    ``,
    `Questions: ${w.q}${w.acc!=null?` at ${Math.round(w.acc*100)}%`:''}`,
    `Anki reviews: ${w.rev.toLocaleString()}${w.dueFrom!=null&&w.dueTo!=null?` · due ${w.dueFrom.toLocaleString()} → ${w.dueTo.toLocaleString()}`:''}`,
    `Daily goal met: ${w.met}/${w.of} days`,
    `Ground: ${w.net>=0?'+':''}${r1(w.net)} · towns +${w.caps}${w.lost?` / −${w.lost}`:''} · holding ${ours}/${T.length}`,
    w.gens.length?`Generals broken: ${w.gens.map(x=>GENERALS[x.r].name).join(', ')}`:null,
    w.offs.length?`Officers recruited: ${w.offs.map(x=>OFFICERS[x.k].name).join(', ')}`:null,
    w.btl.length?`Battles: ${w.btl.length} (${w.btl.reduce((a,e)=>a+(e.seq||'').length,0)} cards)`:null,
    w.el.length?`Election sessions: ${w.el.length} · seats won ${w.el.filter(e=>e.y>e.o).length}/${w.el.length}`:null,
    ``,
    `Next week: ${G.remainingUW} UWorld IM questions left${G.gen?` · ${GENERALS[G.gen.r].name} holds ${REG[G.gen.r].name}`:''}${G.backlog?` · Anki siege still on`:''}.`,
  ].filter(x=>x!=null);
  return lines.join('\n');
}
function dispatchCard(){
  const mon=weekMonday(today()), last=addDays(mon,-7);
  const showLast = G.days[last] || G.days[addDays(last,6)];
  const w = weekStats(showLast?last:mon);
  const txt=dispatchText(w);
  return `<div class="card cmd"><h3>Weekly dispatch <small class="c-muted">${showLast?'last week':'this week so far'}</small></h3>
    <div class="row" style="gap:6px;margin-bottom:8px"><button class="btn sm ${showLast?'pri':''}" data-a="dp-week" data-w="${last}">Last week</button><button class="btn sm ${showLast?'':'pri'}" data-a="dp-week" data-w="${mon}">This week</button></div>
    <pre class="dispatch" id="dptext">${esc(txt)}</pre>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn pri sm" data-a="dp-copy">Copy</button>${navigator.share?'<button class="btn sm" data-a="dp-share">Share…</button>':''}<span class="note">Send it to one person each Sunday. Someone else seeing the progress keeps you going.</span></div></div>`;
}

/* ---------- hooks ---------- */
document.addEventListener('click', async e=>{
  const b=e.target.closest('[data-a]'); if(!b) return; const a=b.dataset.a;
  if(a==='ch-play'){ if(!chaptersSeen().has(b.dataset.ch)) addEvent({type:'chapter', ch:b.dataset.ch}); await playScene(b.dataset.ch); }
  else if(a==='dp-week'){ const t=$('#dptext'); if(t){ t.textContent=dispatchText(weekStats(b.dataset.w)); document.querySelectorAll('[data-a="dp-week"]').forEach(x=>x.classList.toggle('pri',x===b)); } }
  else if(a==='dp-copy'){ const t=$('#dptext').textContent; try{ await navigator.clipboard.writeText(t); toast('Dispatch copied.'); }catch(err){ toast('Copy failed — select the text and copy it.'); } }
  else if(a==='dp-share'){ try{ await navigator.share({title:'IM Campaign · weekly dispatch', text:$('#dptext').textContent}); }catch(err){} }
});
setInterval(()=>{ try{ chapterCheck(); }catch(e){} }, 4000);
