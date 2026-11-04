'use strict';
/* =====================================================================
   Election HQ — Anki-driven election night.
   Press start, then every N minutes a batch of counties reports. The cards
   you did in that window (pace first, then Good/Hard/Again) decide how
   those counties vote. Realistic leans from 2024 county results.
   Loaded after battle.js; uses its globals (ankiAnswersSince, btlGet …).
   ===================================================================== */
const LS_ESES='imc.esess';
const EL_COL={
  D:{solid:'#1f63e0', lean:'#6d9ef0', light:'#c6d9fb', name:'Democrat', short:'D', party:'Democrats'},
  R:{solid:'#e3262f', lean:'#f07b80', light:'#f9cacc', name:'Republican', short:'R', party:'Republicans'},
};
const EL_NOTUP='#e4e4e4', EL_PEND='#f4f4f4';
// 2026 Senate map (Class II + Ohio and Florida specials). Party currently holding each seat.
const SEN26={ '01':'R','02':'R','05':'R','16':'R','19':'R','20':'R','21':'R','22':'R','23':'R','28':'R','30':'R','31':'R','37':'R','40':'R','45':'R','46':'R','47':'R','48':'R','54':'R','56':'R','39':'R','12':'R',
  '08':'D','10':'D','13':'D','17':'D','25':'D','26':'D','27':'D','33':'D','34':'D','35':'D','41':'D','44':'D','51':'D' };
const SEN_HOLD={D:34, R:31};   // seats not up in 2026
const MIDTERM_TURNOUT=0.72;
const LS_ECAL='imc.ecal', LS_EARROWS='imc.elArrows';
function upList(night){ return (night&&night.races)||Object.keys(SEN26); }
function isUp(night,st){ return upList(night).includes(st); }
// Seats not being contested this night. Starts from the real 2026 split, then adjusts for
// states left out (their 2026 seat stays with the incumbent) or added (one of that state's
// other seats is put up; taken from the party that carried the state in 2024 — an approximation).
function computeHold(races){
  const h={...SEN_HOLD};
  for(const st of Object.keys(SEN26)) if(!races.includes(st)) h[SEN26[st]]++;
  for(const st of races) if(!SEN26[st] && US && US.states[st]){ const v=US.states[st].v; const p=v[0]>=v[1]?'D':'R'; if(h[p]>0) h[p]--; else h[p==='D'?'R':'D']--; }
  return h;
}

/* ---------- data ---------- */
let US=null; const CNTY={};
async function elLoad(){ if(!US){ US=await (await fetch('elec/us.json')).json(); } return US; }
async function elCounties(st){ if(!CNTY[st]) CNTY[st]=await (await fetch(`elec/c/${st}.json`)).json(); return CNTY[st]; }
const logit=p=>Math.log(p/(1-p)), logistic=x=>1/(1+Math.exp(-x));
function randn(r){ let u=0,v=0; while(!u) u=r(); while(!v) v=r(); return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*v); }
function normCdf(x){ const t=1/(1+0.2316419*Math.abs(x)), d=0.3989423*Math.exp(-x*x/2); const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274)))); return x>0?1-p:p; }

/* ---------- the night (synced) ---------- */
function elNight(){ const ns=liveEvents(S).filter(e=>e.type==='enight'); return ns.length?ns[ns.length-1]:null; }
function elRaces(night){ return night?liveEvents(S).filter(e=>e.type==='erace' && e.night===night.id):[]; }
function elParty(night, side){ // side: 'you' | 'opp' -> display info
  const p = side==='you'?night.you:(night.you==='D'?'R':'D');
  if(night.mode==='custom'){ const c=night.custom||{}; return {key:p, name:side==='you'?(c.youName||'Your party'):(c.oppName||'The Hollowing'), short:(side==='you'?(c.youName||'You'):(c.oppName||'Opp'))[0].toUpperCase(), solid:side==='you'?(c.youCol||'#d8a33a'):(c.oppCol||'#6b6f86'), get lean(){ return mix(this.solid,'#ffffff',0.4); }, get light(){ return mix(this.solid,'#ffffff',0.75); }, party:side==='you'?(c.youName||'Your party'):(c.oppName||'The Hollowing')}; }
  return {key:p, ...EL_COL[p]};
}
function mix(a,b,t){ const pa=parseInt(a.slice(1),16), pb=parseInt(b.slice(1),16); const c=[16,8,0].map(s=>Math.round(((pa>>s)&255)*(1-t)+((pb>>s)&255)*t)); return '#'+c.map(x=>x.toString(16).padStart(2,'0')).join(''); }
function newNight(opts){
  const r=rng('night'+Date.now()); const big=r()<0.15; const wave=(big?8:3.2)*randn(r);
  const races=opts.races&&opts.races.length?opts.races:Object.keys(SEN26);
  return addEvent({type:'enight', id:'en-'+uid(), mode:opts.mode, you:opts.you, custom:opts.custom||null, wave:+wave.toFixed(2), races, hold:computeHold(races)});
}

/* ---------- the Anki-to-votes model ---------- */
// Swing (margin points, toward you) from one reporting window.
function windowSwing(n,g,h,a,expected){
  const r = expected>0 ? n/expected : 1;
  let s = r<1 ? 18*(r-1) : 9*Math.min(0.7,r-1);      // pace first: stalling is costly, pushing past target helps
  if(n>=3){ const q=(g+0.5*h)/n; s += 30*(q-0.82); }   // then quality
  return s;
}
function countyPlan(st, cs, nTicks, seed){
  const r=rng(seed+st); const ids=Object.keys(cs); const tot=ids.map(f=>cs[f].v[2]);
  const order=ids.map((f,i)=>({f,t:tot[i]})).sort((a,b)=>a.t-b.t); const N=order.length;
  const plan={};
  order.forEach((o,i)=>{ const rank=i/Math.max(1,N-1); const chunks = rank>0.9?3: rank>0.7?2:1;
    let first=Math.min(0.95, Math.max(0.02, 0.08+0.55*rank + (r()-0.5)*0.5));
    const ticks=[]; for(let c=0;c<chunks;c++){ const t=Math.min(nTicks-1, Math.floor((first+(1-first)*c/Math.max(1,chunks))*nTicks + (c?r()*2:0))); ticks.push(t); }
    const fr=chunks===1?[1]:chunks===2?[0.55,0.45]:[0.45,0.35,0.2];
    plan[o.f]={ticks, fr, noise:randn(r)*1.6};
  });
  return plan;
}
function baseShare(night, v){ const d=v[0], rr=v[1]; const sD=(d+0.5)/(d+rr+1); return night.you==='D'?sD:1-sD; }

/* ---------- live session (local to the Mac running Anki) ---------- */
function esGet(){ try{ return JSON.parse(localStorage.getItem(LS_ESES)); }catch(e){ return null; } }
function esSet(x){ try{ if(x) localStorage.setItem(LS_ESES, JSON.stringify(x)); else localStorage.removeItem(LS_ESES); }catch(e){} }
function modeBusy(){ const b=btlGet(); const e=esGet(); return b?'battle':e?'election':calGet()?'calibration':null; }
async function startSession(cfg){
  const night=elNight(); if(!night) return;
  const nTicks=Math.max(2, Math.round(cfg.minutes*60000/cfg.intMs));
  const states=[cfg.live, ...cfg.sims].filter(Boolean);
  const plan={}, stNoise={};
  const r=rng('es'+night.id+cfg.live+Date.now());
  for(const st of states){ const cs=await elCounties(st); plan[st]=countyPlan(st, cs, nTicks, night.id+':'+Date.now()); stNoise[st]=randn(r)*2.2; }
  const s={id:'es-'+uid(), night:night.id, live:cfg.live, sims:cfg.sims, intMs:cfg.intMs, nTicks, pace:cfg.pace, notify:cfg.notify||'end', startTs:Date.now(), done:0, plan, stNoise, tally:{}, windows:[], sw:{}};
  for(const st of states) s.tally[st]={};
  esSet(s); return s;
}
let esBusy=false;
async function esTick(){
  const s=esGet(); if(!s || esBusy) return; const now=Date.now();
  const due=Math.min(s.nTicks, Math.floor((now-s.startTs)/s.intMs));
  if(due<=s.done){ elLiveUpdate(); return; }
  esBusy=true;
  try{
    let revs=[]; try{ revs=await ankiAnswersSince(s.startTs); }catch(e){ if(localStorage.getItem(LS_ANKI)==='1'){ esBusy=false; elLiveUpdate('Anki not reachable — waiting to count'); return; } }
    const night=elNight(); if(!night){ esSet(null); return; }
    for(let k=s.done;k<due;k++){
      const a=s.startTs+k*s.intMs, b=a+s.intMs; const w=revs.filter(x=>x.id>a && x.id<=b).map(x=>x.e);
      const c=btlCounts(w.join('')); const expected=s.pace*s.intMs/60000; const sw=windowSwing(w.length,c.G,c.H,c.A,expected);
      s.windows.push({k, n:w.length, g:c.G, h:c.H, a:c.A, sw:+sw.toFixed(2)});
      for(const st of [s.live,...s.sims]){
        const cs=await elCounties(st), pl=s.plan[st]; const live=st===s.live;
        for(const [f,p] of Object.entries(pl)){
          p.ticks.forEach((t,i)=>{ if(t!==k) return;
            const v=cs[f].v, votes=Math.round(v[2]*MIDTERM_TURNOUT*p.fr[i]);
            const swing=(live?sw:0) + night.wave + s.stNoise[st] + p.noise;
            const share=logistic(logit(baseShare(night,v)) + swing*0.02);
            const y=Math.round(votes*share*0.985), o=Math.round(votes*(1-share)*0.985); // ~1.5% minor candidates
            const T0=s.tally[st][f]||[0,0,0]; s.tally[st][f]=[T0[0]+y, T0[1]+o, +(T0[2]+p.fr[i]).toFixed(3)];
          });
        }
      }
      s.done=k+1;
    }
    esSet(s);
    if(s.done>=s.nTicks){ await finishSession(s, revs); }
    else if(s.notify==='each'){ const cs=CNTY[s.live], sm=stateSummary(night,s.live,cs,s.tally[s.live]); const lw=s.windows[s.windows.length-1];
      notify(`Report ${s.done}/${s.nTicks} · ${US.states[s.live].n}`, `${lw.n} cards this window (${lw.sw>=0?'+':''}${lw.sw.toFixed(1)}). You ${(sm.y/Math.max(1,sm.y+sm.o)*100).toFixed(1)}% with ${Math.round(sm.pctIn*100)}% in · ${Math.round(sm.pWin*100)}% to win.`, 'tick'); }
    elRefresh();
  } finally { esBusy=false; }
}
async function finishSession(s, revs){
  const night=elNight(); if(!night) return;
  const seq=revs.filter(x=>x.id>s.startTs && x.id<=s.startTs+s.nTicks*s.intMs).map(x=>x.e).join(''); const c=btlCounts(seq);
  for(const st of [s.live,...s.sims]){
    const t=s.tally[st]; let y=0,o=0; const cv={}; for(const [f,v] of Object.entries(t)){ y+=v[0]; o+=v[1]; cv[f]=[v[0],v[1]]; }
    addEvent({id:'er-'+night.id+'-'+st, type:'erace', night:night.id, st, live:st===s.live, cv, y, o, ...(st===s.live?{cards:seq.length, g:c.G, h:c.H, a:c.A, minutes:Math.round(s.nTicks*s.intMs/60000)}:{})}, true);
  }
  commit(); esSet(null);
  const won = (()=>{ const t=s.tally[s.live]; let y=0,o=0; for(const v of Object.values(t)){ y+=v[0]; o+=v[1]; } return y>o; })();
  elToastRes = {st:s.live, won};
  if(s.notify!=='off') notify(`${US.states[s.live].n} is called`, won?'You win the seat. Session over — stop reviewing or start another.':'Seat lost. Session over.', 'end');
}
let elToastRes=null;
function endSessionNow(){ const s=esGet(); if(!s) return; if(!confirm('Stop the count now? Remaining counties report with no cards — the opponent sweeps them.')) return; s.startTs = Date.now()-s.nTicks*s.intMs-1000; esSet(s); esTick(); }
function cancelSession(){ if(!confirm('Cancel this election session? Nothing will be recorded.')) return; esSet(null); elRefresh(); }

/* ---------- state summaries & the needle ---------- */
function stateSummary(night, st, cs, tallyOrRace){
  // tallyOrRace: {fips:[y,o,frac]} (live) or race cv {fips:[y,o]} (final)
  let y=0,o=0,expT=0,repT=0,swW=0,sw=0, nRep=0, nAll=0;
  const final=!!tallyOrRace && tallyOrRace.__final;
  for(const [f,c] of Object.entries(cs)){
    nAll++; const tot=c.v[2]*MIDTERM_TURNOUT; expT+=tot;
    const t=tallyOrRace&&tallyOrRace[f]; if(!t) continue; const frac=final?1:(t[2]||0);
    y+=t[0]; o+=t[1]; repT+=tot*frac; if(frac>=0.999) nRep++;
    if(t[0]+t[1]>0){ const sh=t[0]/(t[0]+t[1]); const b=baseShare(night,c.v); const wt=(t[0]+t[1]); sw+=(logit(Math.min(0.999,Math.max(0.001,sh)))-logit(b))*wt; swW+=wt; }
  }
  const obs=swW?sw/swW:0; let py=y, po=o;
  for(const [f,c] of Object.entries(cs)){ const t=tallyOrRace&&tallyOrRace[f]; const frac=final?1:(t?t[2]:0); if(frac>=1) continue; const rem=c.v[2]*MIDTERM_TURNOUT*(1-frac)*0.985; const sh=logistic(logit(baseShare(night,c.v))+obs); py+=rem*sh; po+=rem*(1-sh); }
  const pctIn = expT?Math.min(1,repT/expT):0;
  const projM = (py-po)/Math.max(1,py+po)*100;
  const sd = final?0.01:(0.6+7*Math.pow(1-pctIn,0.7));
  const pWin = final ? (y>o?1:0) : normCdf(projM/sd);
  const baseM=(()=>{ let a=0,b=0; for(const c of Object.values(cs)){ const s=baseShare(night,c.v); a+=c.v[2]*s; b+=c.v[2]*(1-s);} return (a-b)/(a+b)*100; })();
  return {y,o,pctIn,projM,sd,pWin,obsSwingPts:obs/0.02,nRep,nAll,baseM, margin:(y+o)?(y-o)/(y+o)*100:0};
}
function needleSVG(p, sd, night, big){
  // p = P(you win); left = D, right = R in realistic mode (you on your party's side)
  const youLeft = night.mode==='custom' ? true : night.you==='D';
  const pLeft = youLeft?p:1-p;
  const L=youLeft?elParty(night,'you'):elParty(night,'opp'), Rr=youLeft?elParty(night,'opp'):elParty(night,'you');
  const jit=(Math.random()-0.5)*Math.min(0.12, sd/40);
  const ang=(-90 + 180*(1-Math.min(1,Math.max(0,pLeft+jit))))*Math.PI/180; // pLeft=1 -> -90 (pointing left)
  const W=big?260:150, H=big?150:88, cx=W/2, cy=H-10, r=H-22;
  const seg=(a0,a1,col)=>{ const p0=[cx+r*Math.cos(Math.PI+a0*Math.PI), cy+r*Math.sin(Math.PI+a0*Math.PI)], p1=[cx+r*Math.cos(Math.PI+a1*Math.PI), cy+r*Math.sin(Math.PI+a1*Math.PI)]; return `<path d="M${cx},${cy} L${p0[0].toFixed(1)},${p0[1].toFixed(1)} A${r},${r} 0 0 1 ${p1[0].toFixed(1)},${p1[1].toFixed(1)} Z" fill="${col}"/>`; };
  const bands=[[0,0.15,L.solid],[0.15,0.3,L.lean],[0.3,0.42,L.light],[0.42,0.58,'#ececec'],[0.58,0.7,Rr.light],[0.7,0.85,Rr.lean],[0.85,1,Rr.solid]];
  const nx=cx+Math.sin(ang)*(r-4), ny=cy-Math.cos(ang)*(r-4);
  const lab=p>0.5?p:1-p, who=p>=0.5?elParty(night,'you'):elParty(night,'opp');
  const word = lab>0.97?'Very likely':lab>0.85?'Likely':lab>0.6?'Leans':'Tossup';
  return `<svg class="needle" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${bands.map(b=>seg(...b)).join('')}<circle cx="${cx}" cy="${cy}" r="${r*0.42}" fill="#fff"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#111" stroke-width="${big?3:2}" stroke-linecap="round" class="ndl"/><circle cx="${cx}" cy="${cy}" r="${big?6:4}" fill="#111"/>
    ${big?`<text x="8" y="${H-2}" font-size="11" fill="${L.solid}" font-weight="700">${esc(L.short)}</text><text x="${W-8}" y="${H-2}" font-size="11" text-anchor="end" fill="${Rr.solid}" font-weight="700">${esc(Rr.short)}</text>`:''}</svg>
    <div class="nlab">${word==='Tossup'?'Tossup':`${word} <b style="color:${who.solid}">${esc(who.party)}</b>`}</div>`;
}

/* ---------- view ---------- */
let elSel=null, elArrows=(()=>{ try{ return localStorage.getItem(LS_EARROWS)!=='0'; }catch(e){ return true; } })();
function viewElection(){
  return `<div class="nbc" id="elroot"><div class="nbc-load">Loading election map…</div></div>`;
}
async function afterElectionRender(){
  await elLoad(); elDraw();
}
function racesState(night){
  const res={}; for(const r of elRaces(night)) res[r.st]=r; return res;
}
function seatCount(night){
  const res=racesState(night); let y=0,o=0;
  for(const r of Object.values(res)){ if(r.y>r.o) y++; else o++; }
  const H=night.hold||SEN_HOLD; const youHold=H[night.you], oppHold=H[night.you==='D'?'R':'D'];
  return {y,o,youHold,oppHold, open:upList(night).length-Object.keys(res).length};
}
async function elDraw(){
  const root=$('#elroot'); if(!root||!US) return;
  const night=elNight();
  if(!night){ root.innerHTML=newNightHtml(); holdNote(); return; }
  const s=esGet() && esGet().night===night.id ? esGet() : null;
  const res=racesState(night);
  const sc=seatCount(night), Y=elParty(night,'you'), O=elParty(night,'opp');
  const leftYou = night.mode==='custom' || night.you==='D';
  const L = leftYou?{p:Y,hold:sc.youHold,won:sc.y}:{p:O,hold:sc.oppHold,won:sc.o};
  const Rt= leftYou?{p:O,hold:sc.oppHold,won:sc.o}:{p:Y,hold:sc.youHold,won:sc.y};
  const pct=n=>(n/100*100).toFixed(2)+'%';
  // live leaders (uncalled, reporting)
  const sums={}; if(s){ for(const st of [s.live,...s.sims]){ const cs=CNTY[st]||await elCounties(st); sums[st]=stateSummary(night,st,cs,s.tally[st]); } }
  const bar=`<div class="bop">
    <div class="bop-h"><div style="color:${L.p.solid}"><b>${L.hold+L.won}</b><span>${esc(L.p.party)}</span></div><div class="bop-mid">51 for majority</div><div style="color:${Rt.p.solid};text-align:right"><b>${Rt.hold+Rt.won}</b><span>${esc(Rt.p.party)}</span></div></div>
    <div class="bop-bar"><i style="width:${pct(L.hold)};background:${L.p.lean}" title="Not up"></i><i style="width:${pct(L.won)};background:${L.p.solid}"></i><i style="flex:1;background:#d9d9d9"></i><i style="width:${pct(Rt.won)};background:${Rt.p.solid}"></i><i style="width:${pct(Rt.hold)};background:${Rt.p.lean}" title="Not up"></i><em style="left:51%"></em></div>
    <div class="bop-f"><span>${L.hold} not up · ${L.won} won</span><span>${sc.open} races uncalled</span><span>${Rt.won} won · ${Rt.hold} not up</span></div></div>`;
  // state map
  const fillFor=st=>{
    if(!isUp(night,st)) return EL_NOTUP;
    const r=res[st]; if(r){ return r.y>r.o?Y.solid:O.solid; }
    const sm=sums[st]; if(sm && sm.pctIn>0){ const called=(sm.pWin>0.995||sm.pWin<0.005)&&sm.pctIn>0.35; const lead=sm.y>=sm.o?Y:O; return called?lead.solid:lead.light; }
    return EL_PEND;
  };
  const hatch=`<pattern id="elh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f2f2f2"/><line x1="0" y1="0" x2="0" y2="6" stroke="#d2d2d2" stroke-width="2"/></pattern>`;
  let mapSvg;
  if(elSel){
    const cs=await elCounties(elSel); const r=res[elSel]; const tally = r? Object.assign({__final:true},r.cv) : (s && s.tally[elSel]) || null;
    let minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    let paths=''; let arrows='';
    for(const [f,c] of Object.entries(cs)){
      const t=tally&&tally[f]; let fill='url(#elh)';
      if(t && (t[0]+t[1])>0){ const m=(t[0]-t[1])/(t[0]+t[1]); const P=m>=0?Y:O, a=Math.abs(m); fill = a>0.3?P.solid : a>0.15?mix(P.solid,'#ffffff',0.25) : a>0.05?P.lean : P.light; if(!r && (t[2]||0)<0.999) fill=mix(fill,'#ffffff',0.35); }
      paths+=`<path d="${c.d}" fill="${fill}" data-cf="${f}"/>`;
      for(const m of c.d.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)){ const x=+m[1], y=+m[2]; if(x<minx)minx=x; if(y<miny)miny=y; if(x>maxx)maxx=x; if(y>maxy)maxy=y; }
      if(elArrows && t && (t[0]+t[1])>0){ const sh=t[0]/(t[0]+t[1]), b=baseShare(night,c.v); const swing=(sh-b)*200; // margin pts toward you
        const pts=[...c.d.matchAll(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g)].map(m=>[+m[1],+m[2]]); const cx=pts.reduce((a,p)=>a+p[0],0)/pts.length, cy=pts.reduce((a,p)=>a+p[1],0)/pts.length;
        const towardLeft = leftYou ? swing>0 : swing<0; const len=Math.min(16, Math.abs(swing)*0.7); if(len>1.5){ const col=(swing>0?Y:O).solid; const dx=towardLeft?-len:len; arrows+=`<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${(cx+dx).toFixed(1)}" y2="${(cy-len*0.55).toFixed(1)}" stroke="${col}" stroke-width="1.4" marker-end="url(#ah${swing>0?'y':'o'})" vector-effect="non-scaling-stroke"/>`; } }
    }
    const pad=8, w=maxx-minx+pad*2, h=maxy-miny+pad*2;
    mapSvg=`<svg viewBox="${(minx-pad).toFixed(1)} ${(miny-pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" class="elmap cty"><defs>${hatch}<marker id="ahy" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6Z" fill="${Y.solid}"/></marker><marker id="aho" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0L6,3L0,6Z" fill="${O.solid}"/></marker></defs>
      <g stroke="#fff" stroke-width="0.6" vector-effect="non-scaling-stroke">${paths}</g><g>${arrows}</g></svg>`;
  } else {
    let paths='', labels='', stArrows='';
    for(const [st,x] of Object.entries(US.states)){ if(st==='11') continue; const live=s&&s.live===st;
      paths+=`<path d="${x.d}" fill="${fillFor(st)}" data-st="${st}" class="${isUp(night,st)?'up':''}${live?' live':''}"/>`;
      if(elArrows && isUp(night,st)){ let yv=0,ov=0; const r=res[st]; if(r){ yv=r.y; ov=r.o; } else if(sums[st]){ yv=sums[st].y; ov=sums[st].o; }
        if(yv+ov>0){ const v=x.v, sD=v[0]/(v[0]+v[1]), b=night.you==='D'?sD:1-sD; const swing=(yv/(yv+ov)-b)*200; const len=Math.min(40, 10+Math.abs(swing)*1.6);
          if(Math.abs(swing)>0.8){ const towardLeft=leftYou?swing>0:swing<0; const col=(swing>0?Y:O).solid; const dx=towardLeft?-len:len; const ln=`x1="${x.c[0]}" y1="${x.c[1]+10}" x2="${(x.c[0]+dx).toFixed(1)}" y2="${(x.c[1]+10-len*0.45).toFixed(1)}"`; stArrows+=`<line ${ln} stroke="#fff" stroke-width="5.5" stroke-linecap="round" marker-end="url(#sahw)"/><line ${ln} stroke="${col}" stroke-width="2.4" stroke-linecap="round" marker-end="url(#sah${swing>0?'y':'o'})"/>`; } } }
      if(isUp(night,st) && !['10','44','34','33','25','09','24','50'].includes(st)) labels+=`<text x="${x.c[0]}" y="${x.c[1]}" class="stl" fill="${res[st]||(sums[st]&&sums[st].pctIn>0.35&&(sums[st].pWin>0.995||sums[st].pWin<0.005))?'#fff':'#333'}">${x.a}</text>`; }
    const mk=(id,c)=>`<marker id="${id}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0L6,3L0,6Z" fill="${c}"/></marker>`;
    mapSvg=`<svg viewBox="0 0 975 610" class="elmap"><defs>${hatch}${mk('sahy',Y.solid)}${mk('saho',O.solid)}<marker id="sahw" viewBox="0 0 6 6" refX="4.2" refY="3" markerWidth="2.6" markerHeight="2.6" orient="auto"><path d="M0,0L6,3L0,6Z" fill="#fff"/></marker></defs><g stroke="#fff" stroke-width="1">${paths}</g><g>${labels}</g><g>${stArrows}</g></svg>`;
  }
  // race cards
  const raceCard=(st,live)=>{
    const cs=CNTY[st]; const r=res[st]; const nm=US.states[st].n;
    const sm = r ? stateSummary(night,st,cs,Object.assign({__final:true},r.cv)) : sums[st]; if(!sm) return '';
    const called = r || ((sm.pWin>0.995||sm.pWin<0.005) && sm.pctIn>0.35);
    const lead = sm.y>=sm.o?Y:O; const tv=Math.max(1,sm.y+sm.o);
    const row=(P,v,you)=>`<div class="cand ${called&&P===lead?'win':''}"><i style="background:${P.solid}"></i><span class="nm">${esc(P.name)}${you?' <em>You</em>':''}${called&&P===lead?' <b class="chk" style="background:${P.solid}">✓</b>':''}</span><span class="pc">${(v/tv*100).toFixed(1)}%</span><span class="vt">${Math.round(v).toLocaleString()}</span></div>`;
    return `<div class="race ${live?'livecard':''}" data-st="${st}">
      <div class="race-h"><b>${esc(nm)}</b><span>${r?'Final':`${Math.round(sm.pctIn*100)}% expected vote in`}</span></div>
      <div class="race-b"><div class="race-c">${row(Y,sm.y,true)}${row(O,sm.o,false)}
        <div class="race-f">${called?`<span class="proj" style="color:${lead.solid}">${r?'Winner':'Projected winner'}: ${esc(lead.party)}</span>`:''} ${sm.nRep}/${sm.nAll} counties fully in · 2024: ${sm.baseM>=0?'You':'Opp'} +${Math.abs(sm.baseM).toFixed(1)}</div></div>
        ${r?'':`<div class="race-n">${needleSVG(sm.pWin, sm.sd, night, live)}</div>`}</div></div>`;
  };
  const liveBox = s ? (()=>{ const left=Math.max(0, s.startTs+s.nTicks*s.intMs-Date.now()); const nextIn=Math.max(0, s.startTs+(s.done+1)*s.intMs-Date.now()); const lastW=s.windows[s.windows.length-1];
    return `<div class="elclock"><div><span class="lbl">Next report</span><b id="elnext">${fmtMS(nextIn)}</b></div><div><span class="lbl">Report</span><b>${s.done}/${s.nTicks}</b></div><div><span class="lbl">Time left</span><b id="elleft">${fmtMS(left)}</b></div><div><span class="lbl">Target pace</span><b>${s.pace}/min</b></div>
      <div><span class="lbl">Last window</span><b>${lastW?`${lastW.n} cards · <span style="color:${lastW.sw>=0?Y.solid:O.solid}">${lastW.sw>=0?'+':''}${lastW.sw.toFixed(1)}</span>`:'—'}</b></div>
      <div class="elclock-a"><button class="btn sm" data-a="el-stop">Stop count</button><button class="btn sm" data-a="el-cancel">Cancel</button></div></div>
      <div class="elmsg" id="elmsg"></div>`; })() : '';
  const allDone = Object.keys(res).length>=upList(night).length;
  const final = allDone ? (()=>{ const yT=sc.youHold+sc.y, oT=sc.oppHold+sc.o; const ctl=yT>=51?Y:oT>=51?O:null; return `<div class="elfinal"><h3>${ctl?`${esc(ctl.party)} win the Senate`:'50–50 Senate'}</h3><div>${yT}–${oT}. ${ctl===Y?'You took the chamber.':ctl===O?'The chamber is lost.':'Deadlocked.'}</div><button class="btn pri sm" data-a="el-new">New election night</button></div>`; })() : '';
  const pendingUp=upList(night).filter(st=>!res[st]).sort((a,b)=>US.states[a].n.localeCompare(US.states[b].n));
  root.innerHTML=`${bar}
    <div class="elhead"><div><h2>${night.mode==='custom'?'Election Night':'Senate Election Night'}</h2><div class="sub">${night.mode==='custom'?'Custom parties':'Realistic mode'} · ${(()=>{ const r=upList(night); const std=r.length===35&&r.every(st=>SEN26[st]); return std?'2026 Senate map':r.length===50?'all 50 states':`${r.length} chosen states`; })()} · county leans from 2024 · you run as <b style="color:${Y.solid}">${esc(Y.party)}</b></div></div>
      <div class="row" style="gap:8px">${s?'':(!allDone?`<button class="btn pri" data-a="el-setup">▶ Start a session</button>`:'')}<button class="btn sm" data-a="el-cal">⏱ Calibrate pace${S.settings.elPace?` (${S.settings.elPace.v}/min)`:''}</button><button class="btn sm" data-a="el-newask">New night</button></div></div>
    ${final}${liveBox}
    <div class="elgrid"><div class="elmapwrap"><div class="elback">${elSel?`<button class="btn sm" data-a="el-back">◀ US map</button> <b>${esc(US.states[elSel].n)}</b>`:'<b>Senate map</b>'} <label class="tg"><input type="checkbox" data-a="el-arrows" ${elArrows?'checked':''}> Shift arrows vs 2024</label></div>${mapSvg}
      <div class="ellegend"><span><i style="background:${Y.solid}"></i>${esc(Y.short)} won</span><span><i style="background:${Y.light}"></i>${esc(Y.short)} leading</span><span><i style="background:${O.light}"></i>${esc(O.short)} leading</span><span><i style="background:${O.solid}"></i>${esc(O.short)} won</span><span><i style="background:${EL_PEND};border:1px solid #ccc"></i>No results</span><span><i style="background:${EL_NOTUP}"></i>Not up</span></div>
      <div class="eltip" id="eltip"></div></div>
      <div class="elside">${s?raceCard(s.live,true)+s.sims.map(st=>raceCard(st,false)).join(''):''}
        ${elSel&&!s?raceCard(elSel,false):''}
        <h4>Called races</h4>${Object.keys(res).length?Object.values(res).sort((a,b)=>US.states[a.st].n.localeCompare(US.states[b.st].n)).map(r=>{ const P=r.y>r.o?Y:O; const m=(r.y-r.o)/(r.y+r.o)*100; return `<div class="callrow" data-st="${r.st}"><i style="background:${P.solid}"></i>${esc(US.states[r.st].n)}<span>${esc(P.short)} +${Math.abs(m).toFixed(1)}${r.live?' · fought':' · simulated'}</span></div>`; }).join(''):'<div class="sub">None yet.</div>'}
        <h4>Still to vote (${pendingUp.length})</h4><div class="sub">${pendingUp.map(st=>US.states[st].a).join(' · ')||'—'}</div>
      </div></div>`;
  bindElMap();
  if(elToastRes){ const t=elToastRes; elToastRes=null; toast(`${US.states[t.st].n}: ${t.won?'you win the seat.':'seat lost.'}`); }
}
function fmtMS(ms){ const s=Math.ceil(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function bindElMap(){
  const tip=$('#eltip');
  document.querySelectorAll('.elmap path[data-st]').forEach(p=>{ p.onclick=()=>{ if(!isUp(elNight(),p.dataset.st)) return; elSel=p.dataset.st; elDraw(); }; });
  document.querySelectorAll('.elmap path[data-cf]').forEach(p=>{
    p.onmousemove=e=>{ const st=elSel, c=CNTY[st][p.dataset.cf]; const night=elNight(); const r=racesState(night)[st]; const s=esGet(); const t=r?r.cv[p.dataset.cf]:(s&&s.tally[st]?s.tally[st][p.dataset.cf]:null);
      const Y=elParty(night,'you'), O=elParty(night,'opp'); const tot=t?(t[0]+t[1]):0;
      tip.innerHTML=`<b>${esc(c.n)}</b>${t&&tot?`<div><i style="background:${Y.solid}"></i>${esc(Y.short)} ${(t[0]/tot*100).toFixed(1)}% · ${t[0].toLocaleString()}</div><div><i style="background:${O.solid}"></i>${esc(O.short)} ${(t[1]/tot*100).toFixed(1)}% · ${t[1].toLocaleString()}</div><div class="sub">${r?'Final':Math.round(Math.min(1,t[2]||0)*100)+'% in'}</div>`:'<div class="sub">No votes reported</div>'}<div class="sub">2024: ${(()=>{ const b=baseShare(night,c.v); const m=(2*b-1)*100; return (m>=0?Y.short:O.short)+' +'+Math.abs(m).toFixed(1); })()}</div>`;
      const r2=$('.elmapwrap').getBoundingClientRect(); tip.style.left=(e.clientX-r2.left+12)+'px'; tip.style.top=(e.clientY-r2.top+12)+'px'; tip.style.display='block'; };
    p.onmouseleave=()=>{ tip.style.display='none'; };
    p.onclick=p.onmousemove;
  });
}
function elLiveUpdate(msg){
  const s=esGet(); if(!s) return;
  const a=$('#elnext'), b=$('#elleft'); if(a) a.textContent=fmtMS(Math.max(0, s.startTs+(s.done+1)*s.intMs-Date.now())); if(b) b.textContent=fmtMS(Math.max(0, s.startTs+s.nTicks*s.intMs-Date.now()));
  const m=$('#elmsg'); if(m && msg) m.textContent=msg;
  // jitter needles a little
  document.querySelectorAll('.needle .ndl').forEach(l=>{ l.style.transform=`rotate(${((Math.random()-.5)*1.6).toFixed(2)}deg)`; });
  if(typeof tab!=='undefined' && tab!=='election'){ const c=$('#elchip'); if(c) c.querySelector('em').textContent=fmtMS(Math.max(0, s.startTs+(s.done+1)*s.intMs-Date.now())); }
}
function elRefresh(){ renderElChip(); if(typeof tab!=='undefined' && tab==='election' && $('#elroot')) elDraw(); }
function renderElChip(){
  let el=$('#elchip'); const s=esGet();
  if(!s){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('button'); el.id='elchip'; el.className='chip'; el.setAttribute('data-a','el-go'); const sd=$('#syncdot'); sd.parentNode.insertBefore(el, sd); }
  el.innerHTML=`<i style="background:#1f63e0"></i>🗳 ${US&&US.states[s.live]?US.states[s.live].a:''} ${s.done}/${s.nTicks} · <em>${fmtMS(Math.max(0, s.startTs+(s.done+1)*s.intMs-Date.now()))}</em>`;
}

/* ---------- setup sheets ---------- */
function newNightHtml(){
  return `<div class="elhead"><div><h2>Election HQ</h2><div class="sub">Every session is a race night. Press start, review in Anki, and every few minutes a batch of counties reports. Your pace sets the swing; Good, Hard and Again fine-tune it. Stall, and the other side sweeps the counties that report.</div></div></div>
    <div class="elnew"><h3>Start an election night</h3>
      <div class="field"><label>Mode</label><div class="seg" id="el-mode"><button data-em="real" class="on">Realistic (D vs R)</button><button data-em="custom">Custom parties</button></div></div>
      <div class="field"><label>You run as</label><div class="seg" id="el-you"><button data-ey="D" class="on">Democrat</button><button data-ey="R">Republican</button></div><div class="note">In custom mode your party takes this side's seats and county leans.</div></div>
      <div class="field" id="el-custom" style="display:none"><label>Custom parties</label><div class="row" style="gap:8px;flex-wrap:wrap"><input type="text" id="el-yn" value="The Honors Party" style="flex:1;min-width:140px"><input type="color" id="el-yc" value="#d8a33a"><input type="text" id="el-on" value="The Hollowing" style="flex:1;min-width:140px"><input type="color" id="el-oc" value="#6b6f86"></div></div>
      <div class="field"><label>Races</label><div class="seg" id="el-set"><button data-es="2026" class="on">2026 Senate map (35)</button><button data-es="all">All 50 states</button><button data-es="pick">Pick states</button></div>
        <div id="el-pick" class="simgrid" style="display:none;margin-top:8px">${Object.entries(US.states).filter(([st])=>st!=='11').sort((a,b)=>a[1].a.localeCompare(b[1].a)).map(([st,x])=>`<label class="dep"><input type="checkbox" data-pk="${st}" ${SEN26[st]?'checked':''}> ${x.a}</label>`).join('')}</div>
        <div class="note" id="el-holdnote"></div></div>
      <div class="note">One seat is contested in each state you include; the rest of the 100 seats hold over. A hidden national environment is drawn for the night — usually small, occasionally a wave.</div>
      <div class="row" style="margin-top:12px"><button class="btn pri" data-a="el-create">Create election night</button></div></div>`;
}
async function openSetup(){
  const busy=modeBusy(); if(busy==='battle'){ toast('A battle is running. Finish or end it first — one mode at a time.'); return; }
  if(localStorage.getItem(LS_ANKI)!=='1'){ toast('Election sessions read Anki on your Mac. Turn on "This device runs Anki" in Settings.'); return; }
  const night=elNight(); const res=racesState(night); const open=upList(night).filter(st=>!res[st]).sort((a,b)=>US.states[a].n.localeCompare(US.states[b].n));
  const pace = S.settings.elPace ? {v:S.settings.elPace.v, why:`Calibrated ${fmtD(S.settings.elPace.date)}: ${S.settings.elPace.n} cards in ${S.settings.elPace.min} min.`} : await measurePace();
  const opt=st=>{ const x=US.states[st], v=x.v; const m=(night.you==='D'?(v[0]-v[1]):(v[1]-v[0]))/(v[0]+v[1])*100; return `<option value="${st}" ${st===(elSel&&open.includes(elSel)?elSel:'26')?'selected':''}>${esc(x.n)} (2024: ${m>=0?'you':'opp'} +${Math.abs(m).toFixed(1)})</option>`; };
  openSheet(`<h2>Start a session</h2><div class="note">Pick the race you'll fight with Anki. You can also simulate other races on the same clock — they follow the national environment only. Nothing counts until you press start.</div>
    <div class="field"><label>Your race</label><select id="es-live">${open.map(opt).join('')}</select></div>
    <div id="es-info" class="note"></div>
    <div class="field"><label>Simulate alongside (optional)</label><div class="simgrid">${open.map(st=>`<label class="dep"><input type="checkbox" data-sim="${st}"> ${US.states[st].a}</label>`).join('')}</div><div class="row" style="gap:6px;margin-top:4px"><button class="btn sm" data-a="es-simall">All others</button><button class="btn sm" data-a="es-simnone">None</button></div></div>
    <div class="field"><label>Report every</label><div class="seg" id="es-int">${[1,2,3,5].map(m=>`<button data-ei="${m}" class="${m===2?'on':''}">${m} min</button>`).join('')}</div></div>
    <div class="field"><label>Session length</label><div class="seg" id="es-len">${[20,30,40,60].map(m=>`<button data-el="${m}" class="${m===30?'on':''}">${m} min</button>`).join('')}</div></div>
    <div class="field"><label>Target pace (cards / minute)</label><div class="row"><input type="number" id="es-pace" min="1" max="15" step="0.5" value="${pace.v}" style="width:90px"><span class="note">${esc(pace.why)}</span><button class="btn sm" data-a="el-cal">Calibrate</button></div></div>
    <div class="field"><label>Notify me</label><div class="seg" id="es-ntf"><button data-en="each">Every report</button><button data-en="end" class="on">When it's called</button><button data-en="off">Off</button></div><div class="note">One start runs the whole session — every report comes in on its own. Notifications and a chime let you stay in Anki.</div></div>
    <div class="actions"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="es-start">▶ Start the clock</button></div>`);
  showRaceInfo();
}
async function showRaceInfo(){
  const sel=$('#es-live'); if(!sel) return; const st=sel.value, night=elNight(); const cs=await elCounties(st);
  const big=Object.entries(cs).sort((a,b)=>b[1].v[2]-a[1].v[2]).slice(0,5);
  const mm=v=>{ const b=baseShare(night,v); const m=(2*b-1)*100; return `${m>=0?'you':'opp'} +${Math.abs(m).toFixed(1)}`; };
  const tot=Object.values(cs).reduce((a,c)=>a+c.v[2],0);
  const info=$('#es-info'); if(info) info.innerHTML=`${Object.keys(cs).length} counties · ~${Math.round(tot*MIDTERM_TURNOUT/1000).toLocaleString()}k expected votes. ${SEN26[st]?`Seat held by <b>${SEN26[st]==='D'?'Democrats':'Republicans'}</b>.`:'Not a regular 2026 race (added for this night).'}<br>Biggest counties: ${big.map(([f,c])=>`${esc(c.n)} (${mm(c.v)})`).join(', ')}. Small rural counties report first; the big ones come in late.`;
}
async function measurePace(){
  try{
    const dk=(S.settings.ankiDeck||'').trim().replace(/"/g,''); const scope=dk?`deck:"${dk}" `:'';
    const cards=await ankiCall('findCards',{query:scope+'rated:3'}); if(!cards.length) throw 0;
    const revs=await ankiCall('getReviewsOfCards',{cards:cards.slice(0,800).map(String)});
    const ts=[]; for(const l of Object.values(revs||{})) for(const r of l||[]) if(r.id>Date.now()-3*864e5 && r.time>0) ts.push(Math.min(60000,r.time));
    if(ts.length<40) throw 0; ts.sort((a,b)=>a-b); const med=ts[Math.floor(ts.length/2)]/1000;
    const v=Math.max(1.5, Math.round(60/(med*1.25)*2)/2);
    return {v, why:`From your last 3 days: median ${med.toFixed(1)} s per card.`};
  }catch(e){ return {v:4, why:'Default — not enough recent reviews to measure.'}; }
}

function pickedRaces(){ const m=(document.querySelector('#el-set .on')||{}).dataset; const mode=m?m.es:'2026';
  if(mode==='all') return Object.keys(US.states).filter(st=>st!=='11');
  if(mode==='pick') return [...document.querySelectorAll('[data-pk]:checked')].map(x=>x.dataset.pk);
  return Object.keys(SEN26); }
function holdNote(){ const el=$('#el-holdnote'); if(!el) return; const r=pickedRaces(), h=computeHold(r); el.textContent=`${r.length} race${r.length===1?'':'s'} · holding over: D ${h.D}, R ${h.R}${(h.D+h.R+r.length)!==100?'':''}. ${r.some(st=>!SEN26[st])?'States outside the 2026 map use their 2024 winner to decide whose held seat goes up (approximate).':''}`; }

/* ---------- notifications (so you can stay in Anki) ---------- */
function askNotify(){ try{ if('Notification' in window && Notification.permission==='default') Notification.requestPermission(); }catch(e){} }
function chime(kind){ try{ const C=window.AudioContext||window.webkitAudioContext; if(!C) return; const ac=chime.ac||(chime.ac=new C()); const t=ac.currentTime;
  const notes=kind==='end'?[660,880,1320]:[880]; notes.forEach((f,i)=>{ const o=ac.createOscillator(), g=ac.createGain(); o.frequency.value=f; o.type='sine'; g.gain.setValueAtTime(0.0001,t+i*0.16); g.gain.exponentialRampToValueAtTime(0.18,t+i*0.16+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+i*0.16+0.35); o.connect(g).connect(ac.destination); o.start(t+i*0.16); o.stop(t+i*0.16+0.4); }); }catch(e){} }
function notify(title, body, kind){
  chime(kind);
  try{ if('Notification' in window && Notification.permission==='granted'){ const n=new Notification(title,{body, tag:'imc-'+(kind||'x'), silent:true}); n.onclick=()=>{ window.focus(); n.close(); }; } }catch(e){}
}

/* ---------- pace calibration ---------- */
function calGet(){ try{ return JSON.parse(localStorage.getItem(LS_ECAL)); }catch(e){ return null; } }
function calSet(x){ try{ if(x) localStorage.setItem(LS_ECAL, JSON.stringify(x)); else localStorage.removeItem(LS_ECAL); }catch(e){} }
function openCalibrate(){
  if(modeBusy()){ toast('Another mode is running. One at a time.'); return; }
  if(localStorage.getItem(LS_ANKI)!=='1'){ toast('Calibration reads Anki on your Mac. Turn on "This device runs Anki" in Settings.'); return; }
  const p=S.settings.elPace;
  openSheet(`<h2>Calibrate your pace</h2><div class="note">A short focused run: press start, then review in Anki at your normal, honest pace — not a sprint. When the timer ends, your cards per minute become the target pace for election sessions.${p?` Current: <b>${p.v}/min</b> (set ${fmtD(p.date)}).`:''}</div>
    <div class="field"><label>Length</label><div class="seg" id="cal-len">${[3,4,5].map(m=>`<button data-cl="${m}" class="${m===4?'on':''}">${m} min</button>`).join('')}</div></div>
    <div class="actions"><button class="btn" data-a="close">Cancel</button><button class="btn pri" data-a="cal-start">▶ Start calibration</button></div>`);
}
async function calTick(){
  const c=calGet(); if(!c) return; const end=c.startTs+c.min*60000, now=Date.now();
  let n=null; try{ const revs=await ankiAnswersSince(c.startTs); n=revs.filter(x=>x.id<=end).length; }catch(e){}
  if(n!=null){ c.n=n; calSet(c); }
  if(now>=end && n!=null){
    const v=Math.max(1, Math.round(n/c.min*2)/2);
    S.settings.elPace={v, date:today(), min:c.min, n}; touchSettings(); calSet(null);
    toast(`Calibrated: ${n} cards in ${c.min} min → target pace ${v}/min.`); notify('Calibration done', `${n} cards in ${c.min} min → ${v} cards/min.`, 'end'); renderCalChip(); elRefresh(); return;
  }
  renderCalChip();
}
function renderCalChip(){
  let el=$('#calchip'); const c=calGet();
  if(!c){ if(el) el.remove(); return; }
  if(!el){ el=document.createElement('button'); el.id='calchip'; el.className='chip'; el.setAttribute('data-a','cal-cancel'); el.title='Tap to cancel calibration'; const sd=$('#syncdot'); sd.parentNode.insertBefore(el, sd); }
  el.innerHTML=`<i style="background:#ffb347"></i>⏱ Calibrating · ${c.n||0} cards · ${fmtMS(Math.max(0,c.startTs+c.min*60000-Date.now()))}`;
}
setInterval(()=>{ if(calGet()) renderCalChip(); }, 1000);
setInterval(()=>{ if(calGet()) calTick(); }, 5000);
setTimeout(()=>{ if(calGet()) calTick(); }, 2200);

/* ---------- hooks ---------- */
document.addEventListener('click', async e=>{
  const em=e.target.closest('[data-em]'); if(em){ document.querySelectorAll('#el-mode button').forEach(x=>x.classList.toggle('on',x===em)); $('#el-custom').style.display=em.dataset.em==='custom'?'':'none'; return; }
  const es=e.target.closest('[data-es]'); if(es){ document.querySelectorAll('#el-set button').forEach(x=>x.classList.toggle('on',x===es)); $('#el-pick').style.display=es.dataset.es==='pick'?'':'none'; holdNote(); return; }
  if(e.target.closest('[data-pk]')){ holdNote(); return; }
  const ey=e.target.closest('[data-ey]'); if(ey){ document.querySelectorAll('#el-you button').forEach(x=>x.classList.toggle('on',x===ey)); return; }
  const en=e.target.closest('[data-en]'); if(en){ document.querySelectorAll('#es-ntf button').forEach(x=>x.classList.toggle('on',x===en)); return; }
  const cl=e.target.closest('[data-cl]'); if(cl){ document.querySelectorAll('#cal-len button').forEach(x=>x.classList.toggle('on',x===cl)); return; }
  const ei=e.target.closest('[data-ei]'); if(ei){ document.querySelectorAll('#es-int button').forEach(x=>x.classList.toggle('on',x===ei)); return; }
  const el=e.target.closest('[data-el]'); if(el){ document.querySelectorAll('#es-len button').forEach(x=>x.classList.toggle('on',x===el)); return; }
  const cr=e.target.closest('.callrow,.race'); if(cr && !e.target.closest('button') && cr.dataset.st && $('#elroot')){ elSel=cr.dataset.st; elDraw(); return; }
  const b=e.target.closest('[data-a]'); if(!b) return; const a=b.dataset.a;
  if(a==='el-create'){ const mode=document.querySelector('#el-mode .on').dataset.em, you=document.querySelector('#el-you .on').dataset.ey;
    const races=pickedRaces(); if(!races.length){ toast('Pick at least one state.'); return; }
    newNight({mode, you, races, custom: mode==='custom'?{youName:$('#el-yn').value.trim()||'Your party', youCol:$('#el-yc').value, oppName:$('#el-on').value.trim()||'The Hollowing', oppCol:$('#el-oc').value}:null}); elSel=null; elDraw(); }
  else if(a==='el-newask' || a==='el-new'){ if(esGet()){ toast('Finish or cancel the running session first.'); return; } if(a==='el-new' || confirm('Start a new election night? The current one stays in your history but the map resets.')){ const root=$('#elroot'); if(root){ root.innerHTML=newNightHtml(); holdNote(); } } }
  else if(a==='el-setup') openSetup();
  else if(a==='es-simall'){ const live=$('#es-live').value; document.querySelectorAll('[data-sim]').forEach(x=>x.checked=x.dataset.sim!==live); }
  else if(a==='es-simnone'){ document.querySelectorAll('[data-sim]').forEach(x=>x.checked=false); }
  else if(a==='es-start'){
    if(modeBusy()){ toast('Another mode is running.'); return; }
    const live=$('#es-live').value; const sims=[...document.querySelectorAll('[data-sim]:checked')].map(x=>x.dataset.sim).filter(x=>x!==live);
    const intMin=+document.querySelector('#es-int .on').dataset.ei, minutes=+document.querySelector('#es-len .on').dataset.el, pace=Math.max(1,+$('#es-pace').value||4);
    const notifyMode=(document.querySelector('#es-ntf .on')||{dataset:{en:'end'}}).dataset.en; if(notifyMode!=='off') askNotify(); chime('tick');
    closeSheet(); await startSession({notify:notifyMode, live, sims, intMs:(window.EL_TEST_MS||intMin*60000), minutes:(window.EL_TEST_MS?minutes*window.EL_TEST_MS/ (intMin*60000)*1:minutes), pace});
    elSel=live; tab='election'; render(); toast(`The clock is running. First counties report in ${intMin} min — go review.`);
  }
  else if(a==='el-cal') openCalibrate();
  else if(a==='cal-start'){ if(modeBusy()){ toast('Another mode is running.'); return; } const min=+document.querySelector('#cal-len .on').dataset.cl; calSet({startTs:Date.now(), min, n:0}); askNotify(); chime('tick'); closeSheet(); renderCalChip(); toast(`Calibration started: ${min} minutes. Go review at your normal pace.`); }
  else if(a==='cal-cancel'){ if(confirm('Cancel calibration?')){ calSet(null); renderCalChip(); } }
  else if(a==='el-stop') endSessionNow();
  else if(a==='el-cancel') cancelSession();
  else if(a==='el-back'){ elSel=null; elDraw(); }
  else if(a==='el-arrows'){ elArrows=b.checked; try{ localStorage.setItem(LS_EARROWS, elArrows?'1':'0'); }catch(e){} elDraw(); }
  else if(a==='el-go'){ tab='election'; const s=esGet(); if(s) elSel=s.live; render(); }
});
document.addEventListener('change', e=>{ if(e.target.id==='es-live'){ showRaceInfo(); document.querySelectorAll('[data-sim]').forEach(x=>{ if(x.dataset.sim===e.target.value) x.checked=false; }); } });
setInterval(()=>{ if(esGet()){ elLiveUpdate(); renderElChip(); } }, 1000);
setInterval(()=>{ if(esGet()) esTick(); }, 5000);
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible' && esGet()) esTick(); });
setTimeout(async ()=>{ if(esGet()){ await elLoad(); renderElChip(); esTick(); } }, 2000);
