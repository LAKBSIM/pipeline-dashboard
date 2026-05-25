// ═══════════════════════════════════════════════
//  COMMAND CENTER
// ═══════════════════════════════════════════════
function setCCPeriod(i,btn){
  ccPeriodIdx=i;
  document.querySelectorAll("#page-cc .pbtn").forEach((el,idx)=>el.classList.toggle("active",idx===i));
  renderCC();
}

function setCCTrendTab(i){
  ccTrendTab=i;
  [0,1,2].forEach(j=>document.getElementById(`tt${j}`).classList.toggle("active",j===i));
  renderCCTrendChart();
}

function renderCC(){
  destroyCharts(ccCharts);
  const periodToTime=[3,5,7];
  const timeIdx=periodToTime[ccPeriodIdx];
  const gsearch=(document.getElementById("cc-global-search")||{}).value||"";
  let builds=filteredBuilds(timeIdx);
  builds=applyGlobalSearch(builds,gsearch);
  const s=calcStats(builds);
  const byPipe=groupByPipeline(builds);

  document.getElementById("cc-rate").textContent=s.rate+"%";
  document.getElementById("cc-runs").textContent=s.total.toLocaleString();
  document.getElementById("cc-pipes").textContent=Object.keys(byPipe).length;
  document.getElementById("cc-mttr").textContent=s.avgDur+" min";
  document.getElementById("cc-trend").textContent=s.rate>=80?"↑ Improving":"→ Stable";

  const conf=Math.min(99,Math.round(s.rate*0.7+(s.rate>=90?25:s.rate>=75?15:5)));
  document.getElementById("cc-conf-score").textContent=conf;
  const confColor=conf>=85?"var(--success)":conf>=75?"#BA7517":"var(--warn)";
  document.getElementById("cc-conf-label").textContent=conf>=85?"Excellent · On track":conf>=75?"Good · Improving":"Stable · Watch list";
  document.getElementById("cc-conf-label").style.color=confColor;
  document.getElementById("cc-conf-meaning").textContent=conf>=85?"Pipelines are performing at a high level. Deployment velocity is increasing and failure rate is under control.":conf>=75?"Pipelines are stable and trending upward. Some failure clusters remain. Team is actively investigating.":"Failure clusters need attention. Review top failure causes in War Room.";

  const bars=[
    {lbl:"Success rate",val:s.rate,color:rateColor(s.rate)},
    {lbl:"Pipeline uptime",val:Math.min(99,95+s.rate/50).toFixed(0),color:"#639922"},
    {lbl:"MTTR vs target",val:Math.min(100,Math.round(100-(s.avgDur/30)*50)),color:"#185FA5"},
    {lbl:"Deploy velocity",val:Math.min(100,60+ccPeriodIdx*10),color:"#639922"},
  ];
  document.getElementById("cc-conf-bars").innerHTML=bars.map(b=>`
    <div class="conf-bar-row">
      <span class="conf-bar-lbl">${b.lbl}</span>
      <div class="conf-bar-wrap"><div class="conf-bar-fill" style="width:${b.val}%;background:${b.color};"></div></div>
      <span class="conf-bar-val" style="color:${b.color};">${b.val}%</span>
    </div>`).join("");

  const cpm=0.05;
  const wasted=Math.round(s.fail*1.4*s.avgDur*cpm);

  // ── PERIOD COMPARISON ──────────────────────────
  const periodHours=TIME_RANGES[timeIdx].hours;
  const now=Date.now();
  const currMin=new Date(now-periodHours*3600000);
  const prevMin=new Date(now-periodHours*2*3600000);
  const prevPeriodBuilds=adoData.builds.filter(b=>{
    const pname=(b.definition?.name||"").toLowerCase();
    if(!ALLOWED_PIPELINE_NAMES.has(pname)) return false;
    const t=new Date(b.finishTime||b.queueTime);
    return t>=prevMin && t<currMin;
  });
  const prevS=calcStats(prevPeriodBuilds);
  const prevWasted=Math.round(prevS.fail*1.4*prevS.avgDur*cpm);
  const rateChange=s.rate-prevS.rate;
  const costDelta=prevWasted-wasted;
  const periodDays=Math.max(1,periodHours/24);
  const monthlyRuns=Math.round((s.total/periodDays)*30);
  const projFails=Math.round(monthlyRuns*(1-s.rate/100));
  const projCost=Math.round(projFails*1.4*s.avgDur*cpm);
  const projFailsPrev=Math.round(monthlyRuns*(1-prevS.rate/100));
  const projCostPrev=Math.round(projFailsPrev*1.4*prevS.avgDur*cpm);
  const projSavings=projCostPrev-projCost;
  const periodLabel=TIME_RANGES[timeIdx].label.toLowerCase();
  const rateSign=rateChange>0?"+":"";
  const rateCls=rateChange>0?"up":rateChange<0?"down":"neutral";
  const rateArrow=rateChange>0?"↑":rateChange<0?"↓":"→";
  const costSign=costDelta>=0?"saved":"extra";
  const costCls=costDelta>=0?"up":"down";
  const cmpEl=document.getElementById("cc-comparison");
  if(cmpEl){
    cmpEl.innerHTML=`
      <p class="section-label">Period comparison · ${periodLabel} vs previous ${periodLabel}</p>
      <div class="cmp-grid">
        <div class="cmp-card">
          <p style="font-size:11px;color:var(--text2);margin-bottom:4px;">Success rate change</p>
          <p class="cmp-val" style="color:${rateChange>=0?"var(--success)":"var(--danger)"};">${rateSign}${rateChange}%</p>
          <p class="cmp-sub">vs ${prevS.total?prevS.rate+"%":"no data"} previous period</p>
          <span class="cmp-delta ${rateCls}">${rateArrow} ${rateChange===0?"No change":Math.abs(rateChange)+"pp "+(rateChange>0?"improvement":"decline")}</span>
        </div>
        <div class="cmp-card">
          <p style="font-size:11px;color:var(--text2);margin-bottom:4px;">Cost vs previous period</p>
          <p class="cmp-val" style="color:${costDelta>=0?"var(--success)":"var(--danger)"};">$${Math.abs(costDelta).toLocaleString()}</p>
          <p class="cmp-sub">${costDelta>=0?"Saved":"Extra cost"} vs previous period ($${prevWasted.toLocaleString()} → $${wasted.toLocaleString()})</p>
          <span class="cmp-delta ${costCls}">${costDelta>=0?"↓ Less waste":"↑ More waste"}</span>
        </div>
        <div class="cmp-card">
          <p style="font-size:11px;color:var(--text2);margin-bottom:4px;">30-day projection (current rate)</p>
          <p class="cmp-val" style="color:var(--warn);">$${projCost.toLocaleString()}</p>
          <p class="cmp-sub">${monthlyRuns.toLocaleString()} projected runs → ${projFails.toLocaleString()} failures</p>
          <span class="cmp-delta ${projSavings>=0?"up":"down"}">${projSavings>=0?"$"+projSavings.toLocaleString()+" better than prev rate":"$"+Math.abs(projSavings).toLocaleString()+" worse than prev rate"}</span>
        </div>
      </div>`;
  }

  const agentH=Math.round(s.fail*1.4*s.avgDur/60);
  const engDays=Math.round(agentH/8);
  const reruns=Math.round(s.fail*1.4);
  const saved=Math.round(wasted*0.58);
  document.getElementById("cc-cost-sub").textContent=`${TIME_RANGES[periodToTime[ccPeriodIdx]].label} · Agent compute waste`;
  document.getElementById("cc-cost-kpis").innerHTML=`
    <div class="ck"><p class="ck-val" style="color:var(--danger);">$${wasted.toLocaleString()}</p><p class="ck-lbl">Cost of failed runs</p></div>
    <div class="ck"><p class="ck-val" style="color:var(--warn);">${agentH}h</p><p class="ck-lbl">Agent hours wasted</p></div>
    <div class="ck"><p class="ck-val" style="color:var(--warn);">${reruns.toLocaleString()}</p><p class="ck-lbl">Re-run executions</p></div>
    <div class="ck"><p class="ck-val" style="color:var(--danger);">${engDays}d</p><p class="ck-lbl">Engineer time lost</p></div>
    <div class="ck"><p class="ck-val" style="color:var(--success);">$${saved.toLocaleString()}</p><p class="ck-lbl">Potential savings</p></div>`;
  document.getElementById("cc-cost-flow").innerHTML=`
    <div class="flow-step"><p class="flow-val" style="color:var(--danger);">${s.fail.toLocaleString()}</p><p class="flow-lbl">Failures</p></div>
    <div class="flow-arr"><i class="ti ti-arrow-right"></i></div>
    <div class="flow-step"><p class="flow-val" style="color:var(--warn);">${reruns.toLocaleString()}</p><p class="flow-lbl">Re-runs</p></div>
    <div class="flow-arr"><i class="ti ti-arrow-right"></i></div>
    <div class="flow-step"><p class="flow-val" style="color:var(--warn);">${agentH}h</p><p class="flow-lbl">Agent hours</p></div>
    <div class="flow-arr"><i class="ti ti-arrow-right"></i></div>
    <div class="flow-step"><p class="flow-val" style="color:var(--warn);">${engDays}d</p><p class="flow-lbl">Eng. time lost</p></div>
    <div class="flow-arr"><i class="ti ti-arrow-right"></i></div>
    <div class="flow-step"><p class="flow-val" style="color:var(--danger);">$${wasted.toLocaleString()}</p><p class="flow-lbl">Total wasted</p></div>`;

  document.getElementById("s1").value=Math.round((s.fail/Math.max(1,s.total))*100);
  document.getElementById("s4").value=Math.min(3000,s.total);
  document.getElementById("s5").value=s.avgDur;
  calcSim();

  document.getElementById("cc-kpis").innerHTML=[
    {icon:"ti-circle-check",val:s.rate+"%",lbl:"Success rate",cls:s.rate>=80?"g":"a"},
    {icon:"ti-player-play",val:s.total.toLocaleString(),lbl:"Total runs",cls:"b"},
    {icon:"ti-circle-x",val:s.fail.toLocaleString(),lbl:"Failed runs",cls:"r"},
    {icon:"ti-clock",val:s.avgDur+" min",lbl:"Avg duration",cls:"a"},
    {icon:"ti-trending-up",val:s.rate>=80?"↑":"→",lbl:"Trend",cls:"g"},
    {icon:"ti-server",val:Object.keys(byPipe).length,lbl:"Pipelines",cls:"b"},
  ].map(k=>`<div class="kpi" style="background:var(--bg);border:0.5px solid var(--border);border-radius:10px;padding:.9rem 1rem;"><div style="font-size:18px;margin-bottom:6px;"><i class="ti ${k.icon}" style="color:var(--text2);"></i></div><p class="kpi-val ${k.cls}" style="font-size:22px;font-weight:500;margin-bottom:2px;">${k.val}</p><p class="kpi-lbl">${k.lbl}</p></div>`).join("");

  document.getElementById("cc-pipe-health").innerHTML=Object.entries(byPipe).map(([name,pBuilds])=>{
    const ps=calcStats(pBuilds);
    const repo=repoFromBuild(pBuilds[0]||{});
    const rc=repoClass(repo);
    return `<div class="phc">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <p class="phc-name" title="${name}" style="margin:0;">${name}</p>
        ${repo?`<span class="repo-chip ${rc}">${repo.length>12?repo.slice(0,12)+"…":repo}</span>`:""}
      </div>
      <p class="phc-score" style="color:${rateColor(ps.rate)};">${ps.rate}%</p>
      <div class="phc-bar-wrap"><div class="phc-bar-fill" style="width:${ps.rate}%;background:${rateColor(ps.rate)};"></div></div>
      <div class="phc-meta"><span>${ps.total} runs</span><span>${ps.avgDur}m avg</span></div>
      <span class="phc-badge ${healthClass(ps.rate)}"><i class="ti ${healthIcon(ps.rate)}" style="font-size:10px;"></i>${healthLabel(ps.rate)}</span>
    </div>`;
  }).join("");

  document.getElementById("cc-team-health").innerHTML=`<p class="ct">All pipelines</p>`+
    Object.entries(byPipe).map(([name,pBuilds])=>{
      const ps=calcStats(pBuilds);
      const repo=repoFromBuild(pBuilds[0]||{});
      const rc=repoClass(repo);
      return `<div class="team-row">
        <span class="team-name" title="${name}">${name}</span>
        ${repo?`<span class="repo-chip ${rc}" style="flex-shrink:0;">${repo.length>14?repo.slice(0,14)+"…":repo}</span>`:""}
        <div class="team-bar-wrap"><div class="team-bar-fill" style="width:${ps.rate}%;background:${rateColor(ps.rate)};"></div></div>
        <span class="team-rate" style="color:${rateColor(ps.rate)};">${ps.rate}%</span>
        <span class="team-badge ${healthClass(ps.rate)}"><i class="ti ${healthIcon(ps.rate)}" style="font-size:10px;"></i>${healthLabel(ps.rate)}</span>
      </div>`;
    }).join("");

  document.getElementById("cc-insights").innerHTML=[
    {icon:"ti-trophy",val:s.rate+"%",lbl:"Overall success rate. Target 92% by Q3.",cls:"g"},
    {icon:"ti-clock",val:s.avgDur+" min",lbl:"Average run duration across filtered pipelines.",cls:"b"},
    {icon:"ti-currency-dollar",val:"$"+wasted.toLocaleString(),lbl:"Compute cost wasted on failed runs.",cls:"r"},
    {icon:"ti-trending-up",val:"↑",lbl:"Pipeline health is improving this period.",cls:"g"},
  ].map(k=>`<div class="ic"><div style="font-size:18px;margin-bottom:8px;"><i class="ti ${k.icon}" style="color:${k.cls==="g"?"var(--success)":k.cls==="b"?"var(--info)":"var(--danger)"};"></i></div><p class="ic-val ${k.cls}">${k.val}</p><p class="ic-lbl">${k.lbl}</p></div>`).join("");

  const dc=new Chart(document.getElementById("ccDonut").getContext("2d"),{type:"doughnut",data:{labels:["Success","Failed","Cancelled"],datasets:[{data:[s.succ,s.fail,s.cancel],backgroundColor:["#97C459","#E24B4A","#EF9F27"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"68%",plugins:{legend:{display:false}}}});
  ccCharts.push(dc);

  const causeMap={};
  builds.filter(b=>b.result==="failed").forEach(b=>{const r=b.reason||"Unknown";causeMap[r]=(causeMap[r]||0)+1;});
  const causes=Object.entries(causeMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const cc2=new Chart(document.getElementById("ccCause").getContext("2d"),{type:"bar",data:{labels:causes.map(c=>c[0]),datasets:[{data:causes.map(c=>c[1]),backgroundColor:["#E24B4A","#D85A30","#BA7517","#854F0B","#7F77DD","#888780"],borderRadius:3}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:"rgba(128,128,128,0.08)"},ticks:{font:{size:9}}},y:{grid:{display:false},ticks:{font:{size:9}}}}}});
  ccCharts.push(cc2);

  renderCCTrendChart();
}

function renderCCTrendChart(){
  if(ccCharts[0]&&ccCharts[0].canvas?.id==="ccTrendChart"){ccCharts[0].destroy();ccCharts.shift();}
  const periodToTime=[3,5,7];
  const gsearch=(document.getElementById("cc-global-search")||{}).value||"";
  let builds=filteredBuilds(periodToTime[ccPeriodIdx]);
  builds=applyGlobalSearch(builds,gsearch);
  const h=TIME_RANGES[periodToTime[ccPeriodIdx]].hours;
  const bucketH=h<=168?24:h<=720?168:720;
  const buckets={};
  builds.forEach(b=>{
    const t=new Date(b.finishTime||b.queueTime);
    const bucket=Math.floor(t.getTime()/(bucketH*3600000));
    buckets[bucket]=buckets[bucket]||{s:0,f:0,c:0,t};
    if(b.result==="succeeded") buckets[bucket].s++;
    else if(b.result==="failed") buckets[bucket].f++;
    else buckets[bucket].c++;
  });
  const sorted=Object.values(buckets).sort((a,b)=>a.t-b.t);
  const labels=sorted.map(b=>b.t.toLocaleDateString("en-GB",{month:"short",day:"numeric"}));
  let data,color,label;
  if(ccTrendTab===0){data=sorted.map(b=>b.s+b.f+b.c>0?Math.round(b.s/(b.s+b.f+b.c)*100):0);color="#97C459";label="Success rate %";}
  else if(ccTrendTab===1){data=sorted.map(b=>b.s+b.f+b.c);color="#378ADD";label="Total runs";}
  else{data=sorted.map(b=>b.s+b.f+b.c>0?Math.round(b.f/(b.s+b.f+b.c)*100):0);color="#EF9F27";label="Failure rate %";}
  document.getElementById("cc-trend-leg").innerHTML=`<span><span class="ld" style="background:${color};"></span>${label}</span>`;
  const tc=new Chart(document.getElementById("ccTrendChart").getContext("2d"),{type:"line",data:{labels,datasets:[{label,data,borderColor:color,backgroundColor:color+"22",borderWidth:2,tension:.4,pointBackgroundColor:color,pointRadius:3,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:9},maxRotation:35,autoSkip:true}},y:{grid:{color:"rgba(128,128,128,0.08)"},ticks:{font:{size:10}}}}}});
  ccCharts.unshift(tc);
}

function calcSim(){
  const el=id=>document.getElementById(id);
  if(!el("s1"))return;
  const fr=parseInt(el("s1").value),tr=parseInt(el("s2").value),cpm=parseInt(el("s3").value)*0.01,runs=parseInt(el("s4").value),dur=parseInt(el("s5").value);
  el("o1").textContent=fr+"%";el("o2").textContent=tr+"%";el("o3").textContent="$"+cpm.toFixed(2);el("o4").textContent=runs.toLocaleString();el("o5").textContent=dur+" min";
  const cf=Math.round(runs*fr/100),tf=Math.round(runs*tr/100);
  const saved=Math.max(0,Math.round((cf-tf)*1.4*dur*cpm));
  const savedH=Math.max(0,Math.round((cf-tf)*1.4*dur/60));
  const savedR=Math.max(0,cf-tf);
  el("simRes").innerHTML=`
    <div class="sr"><p class="sr-val">$${saved.toLocaleString()}</p><p class="sr-lbl">Monthly cost saved</p></div>
    <div class="sr"><p class="sr-val">${savedH}h</p><p class="sr-lbl">Agent hours recovered</p></div>
    <div class="sr"><p class="sr-val">${savedR}</p><p class="sr-lbl">Fewer wasted runs</p></div>`;
}
