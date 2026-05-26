// ═══════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════
const FUNCTION_URL = "https://dmcore-pipeline-proxy-test-bfgcevedfpaeg5ha.westeurope-01.azurewebsites.net/api/PipelineDashboard";
const ORG     = "SimCorpCloud";
const PROJECT = "Project Unicorn";
const PAGE_SIZE = 50;

// ── PIPELINE CONFIG ──────────────────────────────────────────────
// Three tiers — add/remove pipelines here, names must match ADO exactly.
//   critical  — deployment chain, alert immediately on failure
//   standard  — release & infrastructure pipelines
//   monitor   — supporting / low-frequency pipelines
const PIPELINE_CONFIG = [
  { name: "tenant-gain-deployment",             tier: "critical", definitionId: 1057 },
  { name: "tenant-gain-deployment-prereq",      tier: "critical", definitionId: 2961 },
  { name: "tenant-gain-orchestrator",           tier: "critical" },
  { name: "tenant-gain-onboarding",             tier: "critical" },
  { name: "tenant-gain-environment-creation",   tier: "critical", definitionId: 6919 },
  { name: "tenant-gain-replication",            tier: "critical" },
  { name: "tenant-gain-messagepump-deployment", tier: "standard" },
  { name: "tenant-gain-Network-Topology",       tier: "monitor"  },
  { name: "tenant-gain-delete-stale-AD-groups", tier: "monitor"  },
];
const PIPELINE_TIER = Object.fromEntries(PIPELINE_CONFIG.map(p=>[p.name.toLowerCase(), p.tier]));
const ALLOWED_PIPELINE_NAMES = new Set(PIPELINE_CONFIG.map(p=>p.name.toLowerCase()));
// Definition IDs known so far — passed to Azure Function so ADO returns the right builds
const PIPELINE_DEFINITION_IDS = PIPELINE_CONFIG.filter(p=>p.definitionId).map(p=>p.definitionId);

const WIKI_URL = "https://dev.azure.com/SimCorpCloud/DevOps-IE/_wiki/wikis/DevOps-IE.wiki/131148/%F0%9F%93%96-Wiki-Guide";
const PIPELINE_BASE = "https://dev.azure.com/SimCorpCloud/Project%20Unicorn/_build?definitionId=";
const TARGET_REPOS = ["tenant-gain","tenant-onboarding","gain-scripts"];

const TIME_RANGES = [
  {label:"Last 6 hours",  hours:6},
  {label:"Last 24 hours", hours:24},
  {label:"Last 3 days",   hours:72},
  {label:"Last 7 days",   hours:168},
  {label:"Last 14 days",  hours:336},
  {label:"Last 30 days",  hours:720},
  {label:"Last 60 days",  hours:1440},
  {label:"Last 90 days",  hours:2160},
];

// ═══════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════
let adoData       = {pipelines:[],builds:[]};
let allRepos      = [];
let selectedRepos = new Set(["all"]);
let ccPeriodIdx   = 1;
let wrTimeIdx     = 3;
let wrBranch      = "all";
let wrExpanded    = {};
let wrTierFilter  = "all";
let wrRunTimeline = {};
let ccTrendTab    = 0;
let ccCharts      = [];
let wrCharts      = [];
let wrPipePage    = 1;
let wrRunPage     = 1;

// ═══════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════
function showPage(id){
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  window.scrollTo(0,0);
}
function goHome(){showPage("page-landing");}
function goCC(){
  showPage("page-cc");
  if(!adoData.builds.length) loadData().then(()=>{buildRepoList();renderRepoPills("cc");renderCC();});
  else{buildRepoList();renderRepoPills("cc");renderCC();}
}
function goWR(){
  showPage("page-wr");
  if(!adoData.builds.length) loadData().then(()=>{buildRepoList();renderRepoPills("wr");renderWR();});
  else{buildRepoList();renderRepoPills("wr");renderWR();}
}

// ═══════════════════════════════════════════════
//  REPO HELPERS
// ═══════════════════════════════════════════════
function repoFromBuild(b){
  const pipeName = (b.definition?.name || "").toLowerCase();
  if(pipeName.startsWith("tenant-gain") || pipeName.includes("gain")) return "tenant-gain";
  if(pipeName.startsWith("tenant-onboarding")) return "tenant-onboarding";
  if(pipeName.startsWith("gain-scripts")) return "gain-scripts";
  return b.repository?.name || b.triggerInfo?.["ci.sourceBranch"]?.split("/")?.[0] || "";
}

function repoClass(name){
  if(!name) return "other";
  if(name.includes("tenant-gain")) return "gain";
  if(name.includes("tenant-onboarding")) return "onboard";
  if(name.includes("gain-scripts")) return "scripts";
  return "other";
}

function buildRepoList(){
  const repoSet = new Set();
  // Only include repos from the configured pipelines — not all ADO repos
  adoData.builds
    .filter(b => ALLOWED_PIPELINE_NAMES.has((b.definition?.name||"").toLowerCase()))
    .forEach(b => { const r = repoFromBuild(b); if(r) repoSet.add(r); });
  allRepos = [...repoSet].sort((a,b)=>{
    const aT = TARGET_REPOS.some(t=>a.includes(t)) ? 0 : 1;
    const bT = TARGET_REPOS.some(t=>b.includes(t)) ? 0 : 1;
    return aT - bT || a.localeCompare(b);
  });
}

function renderRepoPills(view){
  const container = document.getElementById(`${view}-repo-pills`);
  if(!container) return;
  const pills = [
    `<button class="repo-pill all ${selectedRepos.has('all')?'active':''}" onclick="toggleRepo('all','${view}')">All repos</button>`,
    ...allRepos.map(r=>{
      const cls = repoClass(r);
      const active = selectedRepos.has(r) ? "active" : "";
      const short = r.length > 20 ? r.slice(0,20)+"…" : r;
      return `<button class="repo-pill ${cls} ${active}" onclick="toggleRepo('${r}','${view}')" title="${r}">${short}</button>`;
    })
  ];
  container.innerHTML = pills.join("");
}

function toggleRepo(repo, view){
  if(repo === "all"){
    selectedRepos = new Set(["all"]);
  } else {
    selectedRepos.delete("all");
    if(selectedRepos.has(repo)) selectedRepos.delete(repo);
    else selectedRepos.add(repo);
    if(selectedRepos.size === 0) selectedRepos = new Set(["all"]);
  }
  renderRepoPills("cc");
  renderRepoPills("wr");
  wrPipePage = 1; wrRunPage = 1;
  if(view==="cc") renderCC();
  else renderWR();
}

function buildMatchesRepoFilter(b){
  if(selectedRepos.has("all")) return true;
  const repo = (repoFromBuild(b)||"").toLowerCase().trim();
  if(!repo) return true;
  return [...selectedRepos].some(r => {
    const rLower = r.toLowerCase().trim();
    return repo === rLower || repo.includes(rLower) || rLower.includes(repo);
  });
}

// ═══════════════════════════════════════════════
//  DATA FETCHING
// ═══════════════════════════════════════════════
function showLoading(msg){document.getElementById("loadingTxt").textContent=msg;document.getElementById("loadingOverlay").style.display="flex";}
function hideLoading(){document.getElementById("loadingOverlay").style.display="none";}
function showError(msg){const b=document.getElementById("errorBanner");b.textContent="⚠ "+msg;b.style.display="block";setTimeout(()=>b.style.display="none",8000);}

function getMinTime(idx){
  return new Date(Date.now()-TIME_RANGES[idx].hours*3600*1000).toISOString();
}

async function fetchADO(endpoint,extra=""){
  const minTime=getMinTime(wrTimeIdx);
  const url=`${FUNCTION_URL}?endpoint=${endpoint}&minTime=${minTime}${extra}`;
  const res=await fetch(url);
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadData(){
  showLoading("Fetching live data from Simcorp DMCore · Azure DevOps...");
  try{
    const defIds=PIPELINE_DEFINITION_IDS.length?`&definitionIds=${PIPELINE_DEFINITION_IDS.join(",")}`:"";
    const summary=await fetchADO("summary",defIds);
    adoData.pipelines=summary.pipelines||[];
    adoData.builds=summary.builds||[];
    if(adoData.builds.length > 0){
      const repoSet = new Set(adoData.builds.map(b=>b.repository?.name||"unknown"));
      const pipeMap = {};
      adoData.builds.forEach(b=>{ pipeMap[b.definition?.name||"unknown"]=b.repository?.name||"unknown"; });
      console.log("Total builds:", adoData.builds.length);
      console.log("Unique repos:", [...repoSet]);
      console.log("Pipeline → Repo mapping:", JSON.stringify(pipeMap, null, 2));
    }
    adoData.pipelines.slice(0,5).forEach((p,i)=>{
      const el=document.getElementById(`svgP${i+1}`);
      if(el) el.textContent=p.name||"";
    });
  }catch(e){
    showError("Could not reach Azure DevOps. Showing demo data. Error: "+e.message);
    adoData=getDemoData();
  }finally{hideLoading();}
}

function getDemoData(){
  const pipes=["tenant-gain-deployment","tenant-gain-deployment-prereq","tenant-gain-orchestrator","tenant-gain-onboarding","tenant-gain-environment-creation","tenant-gain-messagepump-deployment","tenant-gain-delete-stale-AD-groups"];
  const branches=["main","main","hotfix/fix-1","hotfix/fix-2"];
  const results=["succeeded","succeeded","succeeded","failed","cancelled"];
  const reasons=["","","","Test failures","Build errors","Infra timeout","Auth expired",""];
  const builds=[];
  let id=5000;
  const now=Date.now();
  for(let i=0;i<300;i++){
    const pi=Math.floor(Math.random()*pipes.length);
    const branch=branches[Math.floor(Math.random()*branches.length)];
    const result=results[Math.floor(Math.random()*results.length)];
    const daysAgo=Math.random()*90;
    const dur=Math.round(4+Math.random()*20);
    builds.push({
      id:id++,buildNumber:`${id}`,
      definition:{name:pipes[pi]},
      repository:{name:"tenant-gain"},
      sourceBranch:`refs/heads/${branch}`,
      result,status:"completed",
      finishTime:new Date(now-daysAgo*86400000).toISOString(),
      requestedFor:{displayName:["CI Trigger","Rahul S.","Priya M.","Amit K.","Scheduled"][Math.floor(Math.random()*5)]},
      reason:result==="failed"?reasons[Math.floor(Math.random()*reasons.length)]||"Unknown":"",
      durationMin:dur,
    });
  }
  return{
    pipelines:pipes.map((n,i)=>({id:i+1,name:n})),
    builds:builds.sort((a,b)=>new Date(b.finishTime)-new Date(a.finishTime)),
  };
}

// ═══════════════════════════════════════════════
//  DATA HELPERS
// ═══════════════════════════════════════════════
function parseBranch(ref){return(ref||"").replace("refs/heads/","");}
function branchType(b){if(b==="main"||b==="master")return"main";if(b.startsWith("hotfix/"))return"hotfix";return"feature";}
function branchClass(b){const t=branchType(b);return t==="main"?"main":t==="hotfix"?"hotfix":"feat";}
function rateColor(r){return r>=90?"#639922":r>=75?"#BA7517":"#E24B4A";}
function healthLabel(r){return r>=90?"Healthy":r>=75?"Degraded":"Critical";}
function healthClass(r){return r>=90?"bs":r>=75?"bw":"bd";}
function healthIcon(r){return r>=90?"ti-circle-check":r>=75?"ti-alert-triangle":"ti-circle-x";}
function resultClass(r){if(r==="succeeded")return"bs";if(r==="failed")return"bd";return"bw";}
function resultLabel(r){if(r==="succeeded")return"success";if(r==="failed")return"failed";return"cancelled";}
function destroyCharts(arr){arr.forEach(c=>{try{c.destroy();}catch(e){}});arr.length=0;}

function calcStats(builds){
  const total=builds.length;
  const succ=builds.filter(b=>b.result==="succeeded").length;
  const fail=builds.filter(b=>b.result==="failed").length;
  const cancel=builds.filter(b=>b.result==="cancelled").length;
  const rate=total?Math.round(succ/total*100):0;
  const avgDur=total?Math.round(builds.reduce((a,b)=>a+(b.durationMin||0),0)/total):0;
  return{total,succ,fail,cancel,rate,avgDur};
}

function groupByPipeline(builds){
  return builds.reduce((acc,b)=>{
    const name=b.definition?.name||"unknown";
    (acc[name]=acc[name]||[]).push(b);
    return acc;
  },{});
}

function filteredBuilds(timeIdx,branch="all"){
  const minTime=new Date(Date.now()-TIME_RANGES[timeIdx].hours*3600000);
  return adoData.builds.filter(b=>{
    const pname=(b.definition?.name||"").toLowerCase();
    if(!ALLOWED_PIPELINE_NAMES.has(pname)) return false;
    if(!buildMatchesRepoFilter(b)) return false;
    const inTime=new Date(b.finishTime||b.queueTime)>=minTime;
    if(!inTime) return false;
    if(branch==="all") return true;
    const br=parseBranch(b.sourceBranch);
    if(branch==="main") return branchType(br)==="main";
    if(branch==="hotfix") return branchType(br)==="hotfix";
    return true;
  });
}

function applyGlobalSearch(builds,searchTerm){
  if(!searchTerm) return builds;
  const q=searchTerm.toLowerCase();
  return builds.filter(b=>{
    const pipe=(b.definition?.name||"").toLowerCase();
    const repo=(repoFromBuild(b)||"").toLowerCase();
    const branch=parseBranch(b.sourceBranch||"").toLowerCase();
    const by=(b.requestedFor?.displayName||"").toLowerCase();
    const reason=(b.reason||"").toLowerCase();
    return pipe.includes(q)||repo.includes(q)||branch.includes(q)||by.includes(q)||reason.includes(q);
  });
}

function filterByTier(builds,tier){
  if(tier==="all") return builds;
  return builds.filter(b=>(PIPELINE_TIER[(b.definition?.name||"").toLowerCase()]||"monitor")===tier);
}

function makePagination(total,page,pageSize,onPage){
  if(total<=pageSize) return "";
  const totalPages=Math.ceil(total/pageSize);
  const pages=[];
  pages.push(`<button class="pg-btn" onclick="(${onPage})(1)" ${page===1?"disabled":""}>«</button>`);
  pages.push(`<button class="pg-btn" onclick="(${onPage})(${Math.max(1,page-1)})" ${page===1?"disabled":""}>‹</button>`);
  const start=Math.max(1,page-2);
  const end=Math.min(totalPages,page+2);
  for(let i=start;i<=end;i++) pages.push(`<button class="pg-btn ${i===page?"active":""}" onclick="(${onPage})(${i})">${i}</button>`);
  pages.push(`<button class="pg-btn" onclick="(${onPage})(${Math.min(totalPages,page+1)})" ${page===totalPages?"disabled":""}>›</button>`);
  pages.push(`<button class="pg-btn" onclick="(${onPage})(${totalPages})" ${page===totalPages?"disabled":""}>»</button>`);
  pages.push(`<span class="pg-info">Page ${page} of ${totalPages} · ${total} records</span>`);
  return pages.join("");
}

window.wrPipePage=1;
window.wrRunPage=1;
Object.defineProperty(window,"wrPipePage",{get:()=>wrPipePage,set:v=>{wrPipePage=v;}});
Object.defineProperty(window,"wrRunPage",{get:()=>wrRunPage,set:v=>{wrRunPage=v;}});
