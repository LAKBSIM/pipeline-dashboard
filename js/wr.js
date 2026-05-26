// ═══════════════════════════════════════════════
//  WAR ROOM
// ═══════════════════════════════════════════════
function refreshWR(){
  const btn=document.getElementById("wr-refresh-btn");
  const icon=document.getElementById("wr-refresh-icon");
  if(btn) btn.disabled=true;
  if(icon) icon.style.animation="spin .6s linear infinite";
  loadData().then(()=>{
    buildRepoList();renderRepoPills("wr");renderWR();
    if(btn) btn.disabled=false;
    if(icon) icon.style.animation="";
  });
}

function setWRTime(i){
  wrTimeIdx=i;
  document.querySelectorAll("#wr-time-range-bar .tp").forEach((el,idx)=>el.classList.toggle("active",idx===i));
  document.getElementById("wr-time-val").textContent=TIME_RANGES[i].label;
  wrPipePage=1;wrRunPage=1;
  loadData().then(()=>{buildRepoList();renderRepoPills("wr");renderWR();});
}

function setWRBranch(b){
  wrBranch=b;
  ["br-all","br-main","br-hotfix"].forEach(id=>document.getElementById(id).classList.remove("active"));
  document.getElementById("br-"+b).classList.add("active");
  wrExpanded={};wrPipePage=1;wrRunPage=1;
  renderWR();
}

function setWRTier(tier){
  wrTierFilter=tier;
  ["all","critical","standard","monitor"].forEach(t=>{
    const el=document.getElementById("tier-"+t);
    if(el) el.classList.toggle("active",t===tier);
  });
  const labels={all:"All tiers",critical:"Critical pipelines",standard:"Standard pipelines",monitor:"Monitor pipelines"};
  const v=document.getElementById("wr-tier-val");
  if(v) v.textContent=labels[tier]||"All tiers";
  wrPipePage=1;wrRunPage=1;
  renderWR();
}

function renderActiveFailures(builds){
  const el=document.getElementById("wr-failures-panel");
  if(!el) return;
  const failed=builds.filter(b=>b.result==="failed");
  if(!failed.length){el.innerHTML="";return;}
  const byPipe=groupByPipeline(failed);
  const entries=Object.entries(byPipe)
    .map(([name,pBuilds])=>({name,pBuilds,count:pBuilds.length,last:pBuilds[0]}))
    .sort((a,b)=>{
      const ta=PIPELINE_TIER[a.name.toLowerCase()]||"monitor";
      const tb=PIPELINE_TIER[b.name.toLowerCase()]||"monitor";
      const order={critical:0,standard:1,monitor:2};
      return (order[ta]-order[tb])||b.count-a.count;
    });
  el.innerHTML=`<div class="fail-panel">
    <div class="fail-panel-hdr">
      <span class="fail-panel-title"><i class="ti ti-alert-circle" style="font-size:13px;"></i>Active failures &mdash; ${failed.length} failed run${failed.length!==1?"s":""} across ${entries.length} pipeline${entries.length!==1?"s":""}</span>
      <span style="font-size:11px;color:var(--danger);opacity:.7;">${TIME_RANGES[wrTimeIdx].label}</span>
    </div>
    ${entries.map(({name,pBuilds,count,last})=>{
      const tier=PIPELINE_TIER[name.toLowerCase()]||"monitor";
      const pipeId=last?.definition?.id||"";
      const pipeLink=pipeId?`${PIPELINE_BASE}${pipeId}`:"";
      const lastReason=last?.reason||"";
      const lastTime=last?.finishTime?new Date(last.finishTime).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"—";
      const shortName=name.length>32?name.slice(0,32)+"…":name;
      return `<div class="fail-item">
        <span class="tier-badge tier-${tier}">${tier==="critical"?"⚠ "+tier:tier}</span>
        <span class="fail-item-name" title="${name}">${shortName}</span>
        <span class="fail-item-meta">${count} failure${count!==1?"s":""}</span>
        <span class="fail-item-meta">Last: ${lastTime}</span>
        ${lastReason?`<span class="fail-reason" title="${lastReason}">${lastReason}</span>`:""}
        ${pipeLink?`<a href="${pipeLink}" target="_blank" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--info);text-decoration:none;background:var(--info-bg);padding:2px 8px;border-radius:20px;flex-shrink:0;"><i class="ti ti-external-link" style="font-size:10px;"></i>View in ADO</a>`:""}
      </div>`;
    }).join("")}
  </div>`;
}

function buildTimelineHTML(tl,buildId){
  if(tl.loading) return `<div style="color:var(--text2);font-size:11px;padding:4px 0;"><i class="ti ti-loader" style="animation:spin .8s linear infinite;font-size:12px;vertical-align:-2px;margin-right:6px;"></i>Loading stage details...</div>`;
  if(tl.error) return `<div style="color:var(--danger);font-size:11px;">Could not load timeline: ${tl.error}</div>`;
  if(!tl.records?.length) return `<div style="color:var(--text2);font-size:11px;">No failed stage records found.</div>`;
  return tl.records.map(r=>{
    const issues=(r.issues||[]).filter(i=>i.type==="error").map(i=>`<div style="margin-top:3px;padding-left:8px;border-left:2px solid var(--danger);color:var(--danger);font-size:11px;line-height:1.5;">${i.message}</div>`).join("");
    return `<div class="tl-stage">
      <span class="badge bd" style="flex-shrink:0;align-self:flex-start;">${r.type||"Stage"}</span>
      <div style="flex:1;">
        <span class="tl-stage-name">${r.name||"—"}</span>
        <span style="color:var(--danger);font-size:11px;margin-left:8px;">${r.errorCount?r.errorCount+" error(s)":""}</span>
        ${issues}
      </div>
    </div>`;
  }).join("");
}

async function fetchRunTimeline(buildId){
  wrRunTimeline[buildId]={loading:true};
  renderWRPipeTable();renderWRRunsTable();
  try{
    const data=await fetchADO("timeline",`&buildId=${buildId}`);
    const records=(data.records||data||[]);
    const failed=records.filter(r=>r.result==="failed"&&(r.type==="Stage"||r.type==="Job"||r.type==="Task"));
    wrRunTimeline[buildId]={records:failed.length?failed:records.filter(r=>r.result==="failed")};
  }catch(e){
    wrRunTimeline[buildId]={error:e.message};
  }
  renderWRPipeTable();renderWRRunsTable();
}

function renderWR(){
  destroyCharts(wrCharts);
  const gsearch=(document.getElementById("wr-global-search")||{}).value||"";
  let builds=filteredBuilds(wrTimeIdx,wrBranch);
  builds=applyGlobalSearch(builds,gsearch);
  builds=filterByTier(builds,wrTierFilter);
  const s=calcStats(builds);
  const byPipe=groupByPipeline(builds);

  document.getElementById("wr-kpis").innerHTML=[
    {val:s.total,lbl:"Total runs",cls:"b",sub:TIME_RANGES[wrTimeIdx].label},
    {val:s.succ,lbl:"Successful",cls:"g",sub:"Completed clean"},
    {val:s.fail,lbl:"Failed",cls:"r",sub:"Needs attention"},
    {val:s.cancel,lbl:"Cancelled",cls:"a",sub:""},
    {val:s.rate+"%",lbl:"Success rate",cls:s.rate>=80?"g":s.rate>=65?"a":"r",sub:""},
    {val:Math.round(s.fail*1.4),lbl:"Re-runs",cls:"a",sub:"~1.4x per fail"},
  ].map(k=>`<div class="mc"><p class="mc-val" style="color:var(--${k.cls==="g"?"success":k.cls==="r"?"danger":k.cls==="a"?"warn":"info"})">${typeof k.val==="number"?k.val.toLocaleString():k.val}</p><p class="mc-lbl">${k.lbl}</p>${k.sub?`<p style="font-size:10px;color:var(--text3);">${k.sub}</p>`:""}</div>`).join("");

  const sorted=Object.entries(byPipe).sort((a,b)=>calcStats(a[1]).rate-calcStats(b[1]).rate);
  const worst=sorted[0];
  const worstRate=worst?calcStats(worst[1]).rate:0;
  document.getElementById("wr-insight-txt").textContent=worst?
    `${worst[0]} is the weakest pipeline at ${worstRate}% success rate. ${s.fail} total failures in ${TIME_RANGES[wrTimeIdx].label.toLowerCase()}. ${selectedRepos.has("all")?"Showing all repos.":"Filtered to: "+[...selectedRepos].join(", ")+"."} Use repo filter or search to drill down further.`:
    "No builds found for current filters.";

  const h=TIME_RANGES[wrTimeIdx].hours;
  const bucketH=h<=24?2:h<=72?8:h<=168?24:h<=336?48:168;
  const buckets={};
  builds.forEach(b=>{
    const t=new Date(b.finishTime||b.queueTime);
    const bucket=Math.floor(t.getTime()/(bucketH*3600000));
    buckets[bucket]=buckets[bucket]||{s:0,f:0,c:0,t};
    if(b.result==="succeeded") buckets[bucket].s++;
    else if(b.result==="failed") buckets[bucket].f++;
    else buckets[bucket].c++;
  });
  const bkts=Object.values(buckets).sort((a,b)=>a.t-b.t);
  const tLabels=bkts.map(b=>b.t.toLocaleDateString("en-GB",{month:"short",day:"numeric"}));
  const tc=new Chart(document.getElementById("wrTrend").getContext("2d"),{type:"bar",data:{labels:tLabels,datasets:[{label:"Success",data:bkts.map(b=>b.s),backgroundColor:"#97C459",stack:"r"},{label:"Failed",data:bkts.map(b=>b.f),backgroundColor:"#E24B4A",stack:"r"},{label:"Cancelled",data:bkts.map(b=>b.c),backgroundColor:"#EF9F27",stack:"r"}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{mode:"index"}},scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:9},maxRotation:35,autoSkip:true}},y:{stacked:true,ticks:{font:{size:10}},grid:{color:"rgba(128,128,128,0.08)"}}}}});
  wrCharts.push(tc);

  const causeMap={};
  builds.filter(b=>b.result==="failed").forEach(b=>{const r=b.reason||"Unknown";causeMap[r]=(causeMap[r]||0)+1;});
  const causes=Object.entries(causeMap).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const cc=new Chart(document.getElementById("wrCause").getContext("2d"),{type:"bar",data:{labels:causes.map(c=>c[0]),datasets:[{data:causes.map(c=>c[1]),backgroundColor:"#E24B4A",borderRadius:3}]},options:{indexAxis:"y",responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{color:"rgba(128,128,128,0.08)"},ticks:{font:{size:9}}},y:{grid:{display:false},ticks:{font:{size:9}}}}}});
  wrCharts.push(cc);

  if(wrBranch==="all"){
    const mainB=builds.filter(b=>branchType(parseBranch(b.sourceBranch))==="main");
    const hotfixB=builds.filter(b=>branchType(parseBranch(b.sourceBranch))==="hotfix");
    const ms=calcStats(mainB);const hs=calcStats(hotfixB);
    const bPipeHTML=blds=>{
      const bp=groupByPipeline(blds);
      return Object.entries(bp).map(([name,pb])=>{
        const ps=calcStats(pb);
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:11px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;" title="${name}">${name}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <div class="pb-wrap" style="width:48px;"><div class="pb-fill" style="width:${ps.rate}%;background:${rateColor(ps.rate)};"></div></div>
            <span style="color:${rateColor(ps.rate)};font-weight:500;width:28px;text-align:right;">${ps.rate}%</span>
          </div>
        </div>`;
      }).join("");
    };
    document.getElementById("wr-branch-section").innerHTML=`
      <div class="branch-split">
        <div class="bc main-bc">
          <p class="bc-title"><span class="bp main">main</span> branch</p>
          <div class="bc-kpis"><div class="bc-k"><p class="bc-kv b">${ms.total}</p><p class="bc-kl">Runs</p></div><div class="bc-k"><p class="bc-kv g">${ms.succ}</p><p class="bc-kl">Success</p></div><div class="bc-k"><p class="bc-kv r">${ms.fail}</p><p class="bc-kl">Failed</p></div></div>
          <p class="pb-lbl"><span>Success rate</span><span style="color:${rateColor(ms.rate)};font-weight:500;">${ms.rate}%</span></p>
          <div class="pb-wrap" style="width:100%;"><div class="pb-fill" style="width:${ms.rate}%;background:${rateColor(ms.rate)};"></div></div>
          <div style="margin-top:10px;">${bPipeHTML(mainB)}</div>
        </div>
        <div class="bc hotfix-bc">
          <p class="bc-title"><span class="bp hotfix">hotfix/*</span> branch</p>
          <div class="bc-kpis"><div class="bc-k"><p class="bc-kv b">${hs.total}</p><p class="bc-kl">Runs</p></div><div class="bc-k"><p class="bc-kv g">${hs.succ}</p><p class="bc-kl">Success</p></div><div class="bc-k"><p class="bc-kv r">${hs.fail}</p><p class="bc-kl">Failed</p></div></div>
          <p class="pb-lbl"><span>Success rate</span><span style="color:${rateColor(hs.rate)};font-weight:500;">${hs.rate}%</span></p>
          <div class="pb-wrap" style="width:100%;"><div class="pb-fill" style="width:${hs.rate}%;background:${rateColor(hs.rate)};"></div></div>
          <div style="margin-top:10px;">${bPipeHTML(hotfixB)}</div>
        </div>
      </div>`;
  } else {
    document.getElementById("wr-branch-section").innerHTML="";
  }

  renderActiveFailures(builds);
  renderWRPipeTable(builds,byPipe);
  renderWRRunsTable(builds);
}

function renderWRPipeTable(builds,byPipe){
  if(!builds){
    const gsearch=(document.getElementById("wr-global-search")||{}).value||"";
    let b=filteredBuilds(wrTimeIdx,wrBranch);
    b=applyGlobalSearch(b,gsearch);
    b=filterByTier(b,wrTierFilter);
    byPipe=groupByPipeline(b);
    builds=b;
  }
  const pipeSearch=(document.getElementById("wr-pipe-search")||{}).value||"";
  let entries=Object.entries(byPipe);
  if(pipeSearch){
    const q=pipeSearch.toLowerCase();
    entries=entries.filter(([name,pBuilds])=>{
      const repo=repoFromBuild(pBuilds[0]||{});
      return name.toLowerCase().includes(q)||repo.toLowerCase().includes(q);
    });
  }
  const total=entries.length;
  document.getElementById("wr-pipe-meta").textContent=`${total} pipeline${total!==1?"s":""}`;

  const start=(wrPipePage-1)*PAGE_SIZE;
  const pageEntries=entries.slice(start,start+PAGE_SIZE);

  let html="";
  pageEntries.forEach(([name,pBuilds])=>{
    const ps=calcStats(pBuilds);
    const branches=[...new Set(pBuilds.map(b=>parseBranch(b.sourceBranch)))];
    const repo=repoFromBuild(pBuilds[0]||{});
    const rc=repoClass(repo);
    const eid="e_"+name.replace(/[^a-z0-9]/gi,"_");
    const isOpen=!!wrExpanded[eid];
    const last=pBuilds[0];
    const pipeId=pBuilds[0]?.definition?.id||"";
    const pipeLink=pipeId?`${PIPELINE_BASE}${pipeId}`:"";
    const pipeTier=PIPELINE_TIER[name.toLowerCase()]||"monitor";
    html+=`<tr style="cursor:pointer;" onclick="toggleWRExp('${eid}')">
      <td><button class="exp-btn"><i class="ti ti-chevron-${isOpen?"down":"right"}" style="font-size:12px;"></i></button></td>
      <td><div style="display:flex;flex-direction:column;gap:3px;"><span style="font-weight:500;">${name}</span><span class="tier-badge tier-${pipeTier}" style="font-size:9px;padding:1px 6px;align-self:flex-start;">${pipeTier==="critical"?"⚠ "+pipeTier:pipeTier}</span></div></td>
      <td style="white-space:nowrap;">
        ${pipeLink?`<a href="${pipeLink}" target="_blank" onclick="event.stopPropagation()" title="Open pipeline in Azure DevOps" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--info);text-decoration:none;background:var(--info-bg);padding:2px 7px;border-radius:20px;"><i class="ti ti-external-link" style="font-size:11px;"></i>Pipeline</a>`:""}
        <a href="${WIKI_URL}" target="_blank" onclick="event.stopPropagation()" title="Open Wiki guide" style="display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--success);text-decoration:none;background:var(--success-bg);padding:2px 7px;border-radius:20px;margin-left:4px;"><i class="ti ti-book" style="font-size:11px;"></i>Wiki</a>
      </td>
      <td>${repo?`<span class="repo-chip ${rc}">${repo}</span>`:""}</td>
      <td style="max-width:200px;"><div style="display:flex;flex-wrap:wrap;gap:4px;">${branches.map(b=>`<span class="bp ${branchClass(b)}">${b}</span>`).join("")}</div></td>
      <td>${ps.total}</td>
      <td><div style="display:flex;align-items:center;gap:6px;"><div class="pb-wrap" style="width:56px;"><div class="pb-fill" style="width:${ps.rate}%;background:${rateColor(ps.rate)};"></div></div><span style="font-size:11px;font-weight:500;color:${rateColor(ps.rate)};">${ps.rate}%</span></div></td>
      <td style="color:var(--danger);">${ps.fail}</td>
      <td style="color:var(--text2);">${ps.avgDur}m</td>
      <td><span class="badge ${resultClass(last?.result)}">${resultLabel(last?.result)}</span></td>
    </tr>`;
    if(isOpen){
      const byBranch=pBuilds.reduce((acc,b)=>{const br=parseBranch(b.sourceBranch);(acc[br]=acc[br]||[]).push(b);return acc;},{});
      Object.entries(byBranch).forEach(([br,bBlds])=>{
        const bs=calcStats(bBlds);
        const lastRun=bBlds[0];
        const isBranchFailed=lastRun?.result==="failed";
        const failReason=isBranchFailed&&lastRun?.reason?lastRun.reason:"";
        const brTl=isBranchFailed?wrRunTimeline[lastRun.id]:null;
        const stageBtn=isBranchFailed?`<button class="tl-expand-btn" style="margin-left:4px;" onclick="event.stopPropagation();${brTl?`delete wrRunTimeline[${lastRun.id}];renderWRPipeTable()`:`fetchRunTimeline(${lastRun.id})`}">${brTl?"▲ Hide stages":"▼ Stage details"}</button>`:"";
        html+=`<tr class="exp-inner">
          <td></td>
          <td><i class="ti ti-corner-down-right" style="font-size:10px;color:var(--text2);margin-right:4px;"></i></td>
          <td colspan="2"><div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;">
            <span class="bp ${branchClass(br)}">${br}</span>
            ${failReason?`<span class="fail-reason" title="${failReason}">${failReason}</span>`:""}
            ${stageBtn}
          </div>
          ${brTl?`<div style="margin-top:6px;">${buildTimelineHTML(brTl,lastRun.id)}</div>`:""}
          </td>
          <td>${bs.total}</td>
          <td><div style="display:flex;align-items:center;gap:6px;"><div class="pb-wrap" style="width:56px;"><div class="pb-fill" style="width:${bs.rate}%;background:${rateColor(bs.rate)};"></div></div><span style="font-size:11px;color:${rateColor(bs.rate)};font-weight:500;">${bs.rate}%</span></div></td>
          <td style="color:var(--danger);">${bs.fail}</td><td>—</td>
          <td><span class="badge ${resultClass(lastRun?.result)}">${resultLabel(lastRun?.result)}</span></td>
        </tr>`;
      });
    }
  });
  document.getElementById("wr-pipe-tbody").innerHTML=html;
  document.getElementById("wr-pipe-pg").innerHTML=makePagination(total,wrPipePage,PAGE_SIZE,"p=>{ window.wrPipePage=p; renderWRPipeTable(); }");
}

function renderWRRunsTable(builds){
  if(!builds){
    const gsearch=(document.getElementById("wr-global-search")||{}).value||"";
    let b=filteredBuilds(wrTimeIdx,wrBranch);
    b=applyGlobalSearch(b,gsearch);
    builds=filterByTier(b,wrTierFilter);
  }
  const runSearch=(document.getElementById("wr-run-search")||{}).value||"";
  let runs=[...builds];
  if(runSearch){
    const q=runSearch.toLowerCase();
    runs=runs.filter(b=>{
      const pipe=(b.definition?.name||"").toLowerCase();
      const repo=(repoFromBuild(b)||"").toLowerCase();
      const branch=parseBranch(b.sourceBranch||"").toLowerCase();
      const by=(b.requestedFor?.displayName||"").toLowerCase();
      const reason=(b.reason||"").toLowerCase();
      const result=resultLabel(b.result||"").toLowerCase();
      return pipe.includes(q)||repo.includes(q)||branch.includes(q)||by.includes(q)||reason.includes(q)||result.includes(q);
    });
  }
  const total=runs.length;
  document.getElementById("wr-run-meta").textContent=`${total.toLocaleString()} run${total!==1?"s":""}`;

  const start=(wrRunPage-1)*PAGE_SIZE;
  const pageRuns=runs.slice(start,start+PAGE_SIZE);

  const rows=[];
  pageRuns.forEach(b=>{
    const br=parseBranch(b.sourceBranch);
    const repo=repoFromBuild(b);
    const rc=repoClass(repo);
    const dur=b.durationMin?b.durationMin+"m":"—";
    const runPipeId=b.definition?.id||"";
    const runPipeLink=runPipeId?`${PIPELINE_BASE}${runPipeId}`:"";
    const isFailed=b.result==="failed";
    const tl=wrRunTimeline[b.id];
    const expandCell=isFailed?`<td><button class="tl-expand-btn" onclick="event.stopPropagation();${tl?`delete wrRunTimeline[${b.id}];renderWRRunsTable()`:`fetchRunTimeline(${b.id})`}">${tl?"▲ Hide":"▼ Stage"}</button></td>`:`<td></td>`;
    rows.push(`<tr>
      ${expandCell}
      <td style="font-family:monospace;font-size:11px;font-weight:500;">#${b.id}</td>
      <td style="font-size:11px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.definition?.name||""}">${b.definition?.name||"—"}</td>
      <td style="white-space:nowrap;">
        ${runPipeLink?`<a href="${runPipeLink}" target="_blank" title="Open in Azure DevOps" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--info);text-decoration:none;background:var(--info-bg);padding:2px 6px;border-radius:20px;"><i class="ti ti-external-link" style="font-size:10px;"></i>Pipeline</a>`:""}
        <a href="${WIKI_URL}" target="_blank" title="Open Wiki guide" style="display:inline-flex;align-items:center;gap:3px;font-size:10px;color:var(--success);text-decoration:none;background:var(--success-bg);padding:2px 6px;border-radius:20px;margin-left:3px;"><i class="ti ti-book" style="font-size:10px;"></i>Wiki</a>
      </td>
      <td>${repo?`<span class="repo-chip ${rc}">${repo}</span>`:""}</td>
      <td><span class="bp ${branchClass(br)}">${br}</span></td>
      <td style="color:var(--text2);font-size:11px;">${b.requestedFor?.displayName||"—"}</td>
      <td style="color:var(--text2);font-size:11px;">${dur}</td>
      <td><span class="badge ${resultClass(b.result)}">${resultLabel(b.result)}</span></td>
      <td style="color:${b.reason?"var(--danger)":"var(--text2)"};font-size:11px;">${b.reason||"—"}</td>
    </tr>`);
    if(isFailed&&tl){
      rows.push(`<tr class="tl-row"><td colspan="10"><div style="font-size:11px;font-weight:500;color:var(--text2);margin-bottom:6px;"><i class="ti ti-git-branch" style="font-size:11px;vertical-align:-1px;margin-right:4px;"></i>Stage details · Run #${b.id} · ${b.definition?.name||""} · <span class="bp ${branchClass(parseBranch(b.sourceBranch))}">${parseBranch(b.sourceBranch)}</span></div>${buildTimelineHTML(tl,b.id)}</td></tr>`);
    }
  });
  document.getElementById("wr-recent-tbody").innerHTML=rows.join("");
  document.getElementById("wr-run-pg").innerHTML=makePagination(total,wrRunPage,PAGE_SIZE,"p=>{ window.wrRunPage=p; renderWRRunsTable(); }");
}

function toggleWRExp(eid){wrExpanded[eid]=!wrExpanded[eid];renderWRPipeTable();}
