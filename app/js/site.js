import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {esc,norm,slotWeight,isBenchSlot,buildIndexes,playerIntel,playerTags} from './utils.js';
import {installPlayerDrawer,drawerAttrs} from './player-drawer.js';

const DEFAULT_TEAM_ID='6';
const PAGE=document.body.dataset.page||'app';
const IS_ALL_MATCHUPS=PAGE==='all-matchups';
const VIEWS=['team','matchup','players','league'];
const params=new URLSearchParams(location.search);
const leagueId=params.get('league')||CONFIG.defaultLeagueId;
const hadWeek=params.has('week');
let selectedTeamId=params.get('team')||DEFAULT_TEAM_ID;
let selectedWeek=Math.max(1,Math.min(18,Number(params.get('week')||0)||1));
let activeView=VIEWS.includes(location.hash.replace('#',''))?location.hash.replace('#',''):'matchup';
let data=null;
let indexes=null;

const $=id=>document.getElementById(id);
const fmt=v=>v===null||v===undefined||v===''?'—':Number(v).toFixed(2);
const starter=row=>typeof row?.is_starter==='boolean'?row.is_starter:!isBenchSlot(row?.roster_slot);

function teamByYahoo(id){return data?.teams.find(t=>String(t.yahoo_team_key)===String(id))||null}
function teamByDb(id){return data?.teams.find(t=>String(t.id)===String(id))||null}
function ownerTeam(){return teamByYahoo(selectedTeamId)||teamByYahoo(DEFAULT_TEAM_ID)||data?.teams?.[0]||null}
function currentMatchup(week=selectedWeek){
  const me=ownerTeam();
  return data?.matchups.find(m=>Number(m.week)===Number(week)&&(m.team_a_id===me?.id||m.team_b_id===me?.id))||null;
}
function opponentFor(matchup){
  const me=ownerTeam();
  if(!me||!matchup)return null;
  return teamByDb(matchup.team_a_id===me.id?matchup.team_b_id:matchup.team_a_id);
}
function sortRows(a,b){
  const ao=Number.isFinite(Number(a?.lineup_order))?Number(a.lineup_order):999;
  const bo=Number.isFinite(Number(b?.lineup_order))?Number(b.lineup_order):999;
  if(ao!==bo)return ao-bo;
  const slotDiff=slotWeight(a?.roster_slot)-slotWeight(b?.roster_slot);
  if(slotDiff)return slotDiff;
  return String(a?.yahoo_player_name||a?.yahoo_name||'').localeCompare(String(b?.yahoo_player_name||b?.yahoo_name||''));
}
function rosterFor(team){return (data?.rosters||[]).filter(r=>r.league_team_id===team?.id).slice().sort(sortRows)}
function playerKey(row){return String(row?.yahoo_player_key||row?.player_key||'')}
function assignedWeekRows(team,week=selectedWeek){
  return (data?.weekStats||[]).filter(r=>Number(r.week)===Number(week)&&(r.league_team_id===team?.id||r.owning_team_id===team?.id));
}
function weekRowsFor(team,week=selectedWeek){
  const base=rosterFor(team),weekly=assignedWeekRows(team,week);
  if(!base.length)return weekly.slice().sort(sortRows);
  const enoughForSnapshot=weekly.length>=Math.min(base.length,9);
  if(enoughForSnapshot)return weekly.slice().sort(sortRows);
  const byYahoo=new Map(weekly.filter(r=>r.yahoo_player_key).map(r=>[String(r.yahoo_player_key),r]));
  const byPlayer=new Map(weekly.filter(r=>r.player_key).map(r=>[String(r.player_key),r]));
  return base.map(r=>{
    const st=byYahoo.get(String(r.yahoo_player_key||''))||byPlayer.get(String(r.player_key||''));
    if(!st)return r;
    return {...r,...st,league_team_id:r.league_team_id,roster_slot:st.roster_slot||r.roster_slot,lineup_order:st.lineup_order??r.lineup_order,is_starter:typeof st.is_starter==='boolean'?st.is_starter:starter(r)};
  }).sort(sortRows);
}
function statFor(row,week=selectedWeek){
  if(Number(row?.week)===Number(week)&&('fantasy_points' in row||'projected_points' in row))return row;
  return (data?.weekStats||[]).find(s=>Number(s.week)===Number(week)&&(
    (row?.player_key&&s.player_key===row.player_key)||
    (row?.yahoo_player_key&&String(s.yahoo_player_key)===String(row.yahoo_player_key))
  ))||null;
}
function poolFor(row){
  return (data?.pool||[]).find(p=>(row?.player_key&&p.player_key===row.player_key)||(row?.yahoo_player_key&&String(p.yahoo_player_key)===String(row.yahoo_player_key)))||null;
}
function currentPoolFor(row,week=selectedWeek){
  const p=poolFor(row);
  return p&&Number(p.current_week||week)===Number(week)?p:null;
}
function intelFor(row){return playerIntel(row,indexes)[0]||null}
function metricsFor(row,week=selectedWeek){
  const st=statFor(row,week),pool=currentPoolFor(row,week);
  return {actual:st?.fantasy_points??pool?.fantasy_points??null,projected:st?.projected_points??pool?.projected_points??null,opponent:st?.opponent||pool?.opponent||'',gameTime:st?.game_time||pool?.game_time||'',gameStatus:st?.game_status||pool?.game_status||''};
}
function teamScore(team,week=selectedWeek){
  const rows=weekRowsFor(team,week).filter(starter);
  if(!rows.length)return {points:null,projected:null,projectionComplete:false,starterCount:0};
  const metrics=rows.map(r=>metricsFor(r,week));
  const hasWeeklyData=rows.some(r=>Boolean(statFor(r,week)));
  const projectedValues=metrics.map(m=>m.projected).filter(v=>v!==null&&v!==undefined&&v!=='').map(Number).filter(Number.isFinite);
  const actualValues=metrics.map(m=>m.actual).filter(v=>v!==null&&v!==undefined&&v!=='').map(Number).filter(Number.isFinite);
  const projectionComplete=projectedValues.length===rows.length;
  return {
    points:hasWeeklyData?actualValues.reduce((sum,v)=>sum+v,0):null,
    projected:projectionComplete?projectedValues.reduce((sum,v)=>sum+v,0):null,
    projectionComplete,
    starterCount:rows.length
  };
}
function inferWeek(){
  const poolWeek=Math.max(0,...(data?.pool||[]).map(p=>Number(p.current_week)||0));
  const latest=[...(data?.weekStats||[])].filter(s=>s.last_synced_at).sort((a,b)=>new Date(b.last_synced_at)-new Date(a.last_synced_at))[0];
  return poolWeek||Number(latest?.week)||1;
}
function setQuery(){
  const u=new URL(location.href);
  u.searchParams.set('league',leagueId);
  u.searchParams.set('team',selectedTeamId);
  u.searchParams.set('week',String(selectedWeek));
  history.replaceState({},'',u);
}
function showNotice(message){
  const el=$('notice');if(!el)return;
  el.hidden=!message;el.textContent=message||'';
}
function renderIdentity(){
  const me=ownerTeam();if(!me)return;
  selectedTeamId=String(me.yahoo_team_key||selectedTeamId);
  if($('teamNameTitle'))$('teamNameTitle').textContent=me.team_name;
  if($('teamViewName'))$('teamViewName').textContent=me.team_name;
  if(!IS_ALL_MATCHUPS)document.title=`Fantasy Intel · ${me.team_name}`;
  setQuery();
}
function renderSyncStamp(){
  const stamps=[...(data?.rosters||[]),...(data?.weekStats||[]),...(data?.pool||[])].map(r=>r.last_synced_at).filter(Boolean).sort();
  if(!$('syncStamp')||!stamps.length)return;
  const d=new Date(stamps.at(-1));
  $('syncStamp').textContent=`Updated ${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`;
}
function setupWeekPicker(){
  const select=$('weekSelect');if(!select)return;
  select.innerHTML=Array.from({length:18},(_,i)=>`<option value="${i+1}">Week ${i+1}</option>`).join('');
  select.value=String(selectedWeek);
  const go=w=>{
    selectedWeek=Math.max(1,Math.min(18,Number(w)||1));
    select.value=String(selectedWeek);
    setQuery();updateLinks();renderAllViews();
  };
  select.onchange=()=>go(select.value);
  $('prevWeek')?.addEventListener('click',()=>go(selectedWeek-1));
  $('nextWeek')?.addEventListener('click',()=>go(selectedWeek+1));
}
function updateLinks(){
  const q=`league=${encodeURIComponent(leagueId)}&team=${encodeURIComponent(selectedTeamId)}&week=${selectedWeek}`;
  if($('allMatchupsLink'))$('allMatchupsLink').href=`./all-matchups.html?${q}`;
  if($('backToApp'))$('backToApp').href=`./?${q}#matchup`;
}
function setView(view,{updateHash=true}={}){
  if(IS_ALL_MATCHUPS)return;
  activeView=VIEWS.includes(view)?view:'matchup';
  document.querySelectorAll('[data-view-panel]').forEach(panel=>panel.hidden=panel.dataset.viewPanel!==activeView);
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===activeView));
  if(updateHash){const u=new URL(location.href);u.hash=activeView==='matchup'?'':activeView;history.replaceState({},'',u)}
}
function wireTabs(){
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  window.addEventListener('hashchange',()=>setView(location.hash.replace('#','')||'matchup',{updateHash:false}));
}
function badges(row){
  const tags=playerTags(row,indexes);if(!tags.length)return'';
  return `<div class="tags">${tags.slice(0,4).map(t=>`<span class="tag ${String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-')}">${esc(String(t).toUpperCase())}</span>`).join('')}</div>`;
}
function playerRow(row,{week=selectedWeek}={}){
  const m=metricsFor(row,week),name=row?.yahoo_player_name||row?.yahoo_name||row?.player_name||'Player';
  const game=[m.gameTime,m.opponent,m.gameStatus].filter(Boolean).join(' · ');
  return `<div class="player-row player-tappable" ${drawerAttrs(row)} tabindex="0" role="button" aria-label="Open ${esc(name)} details">
    <div class="slot">${esc(row?.roster_slot||row?.position||'')}</div>
    <div class="player-main"><b>${esc(name)}</b><small>${esc(row?.position||'')} · ${esc(row?.nfl_team||row?.team||'')}${game?` · ${esc(game)}`:''}</small>${badges(row)}</div>
    <div class="points"><b>${fmt(m.actual)}</b><span>Proj ${fmt(m.projected)}</span></div>
  </div>`;
}
function scoreHero(me,opp){
  const my=teamScore(me),op=teamScore(opp),total=(Number(my.projected)||0)+(Number(op.projected)||0);
  const pct=my.projected!==null&&op.projected!==null&&total?Math.round(Number(my.projected)/total*100):50;
  return `<div class="matchup-score-card"><div class="score-teams">
    <div class="score-team"><small>YOUR TEAM</small><b>${esc(me?.team_name||'Your Team')}</b><strong>${fmt(my.points)}</strong><span>${fmt(my.projected)} projected</span></div>
    <div class="score-vs">VS</div>
    <div class="score-team right"><small>OPPONENT</small><b>${esc(opp?.team_name||'Opponent')}</b><strong>${fmt(op.points)}</strong><span>${fmt(op.projected)} projected</span></div>
  </div><div class="win-meter"><b>${my.projected!==null&&op.projected!==null?pct:'—'}${my.projected!==null&&op.projected!==null?'%':''}</b><div class="win-track"><div class="win-fill" style="width:${pct}%"></div></div><b>${my.projected!==null&&op.projected!==null?100-pct:'—'}${my.projected!==null&&op.projected!==null?'%':''}</b></div></div>`;
}
function shortName(name){
  const p=String(name||'').trim().split(/\s+/).filter(Boolean);if(p.length<2)return String(name||'').toUpperCase();
  return `${p[0][0]}. ${p.slice(1).join(' ')}`.toUpperCase();
}
function posLabel(row){
  const s=String(row?.roster_slot||row?.position||'').toUpperCase();
  if(['W/R/T','W/R','Q/W/R/T'].includes(s))return'WRT';if(s==='DST')return'DEF';return s;
}
function matchupInfo(row,side){
  if(!row)return `<div class="matchup-player-info ${side}"><div class="matchup-player-name">—</div></div>`;
  const m=metricsFor(row),intel=intelFor(row),name=row.yahoo_player_name||row.yahoo_name||row.player_name;
  const meta=[row.nfl_team||row.team,m.gameTime,m.opponent].filter(Boolean).join(' · ');
  return `<div class="matchup-player-info ${side} player-tappable" ${drawerAttrs(row)} tabindex="0" role="button"><div class="matchup-player-name">${esc(shortName(name))}</div><div class="matchup-player-meta">${esc(meta)}</div>${intel?`<span class="matchup-player-intel">${esc(String(intel.action||'INTEL').toUpperCase())}</span>`:''}</div>`;
}
function matchupPoints(row){const m=row?metricsFor(row):{};return `<div class="matchup-player-points"><b>${fmt(m.actual)}</b><span>${fmt(m.projected)}</span></div>`}
function matchupRows(me,opp){
  const left=weekRowsFor(me).filter(starter),right=weekRowsFor(opp).filter(starter),count=Math.max(left.length,right.length);let html='';
  for(let i=0;i<count;i++){
    const l=left[i]||null,r=right[i]||null,pos=posLabel(l||r)||'—',cls=pos.toLowerCase().replace(/[^a-z]/g,'');
    html+=`<div class="matchup-player-row">${matchupInfo(l,'left')}${matchupPoints(l)}<div class="matchup-position ${cls}">${esc(pos)}</div>${matchupPoints(r)}${matchupInfo(r,'right')}</div>`;
  }
  return html||'<div class="empty">No starters synced for this week.</div>';
}
function renderMatchup(){
  if(!$('scoreArea'))return;const me=ownerTeam(),m=currentMatchup();
  if(!me||!m){$('scoreArea').innerHTML='';$('matchupBody').innerHTML='<div class="empty">No Yahoo matchup is synced for this week.</div>';return}
  const opp=opponentFor(m);$('scoreArea').innerHTML=scoreHero(me,opp);$('matchupBody').innerHTML=matchupRows(me,opp);
  const bench=weekRowsFor(opp).filter(r=>!starter(r));
  $('opponentBench').innerHTML=bench.map(r=>playerRow(r)).join('')||'<div class="empty">No opponent bench players synced.</div>';
  $('opponentBenchTitle').textContent=`${opp?.team_name||'Opponent'} · BENCH`;
}
function renderTeam(){
  if(!$('teamStarters'))return;const me=ownerTeam();if(!me)return;
  const score=teamScore(me),rows=weekRowsFor(me),starters=rows.filter(starter),bench=rows.filter(r=>!starter(r));
  if($('teamViewName'))$('teamViewName').textContent=me.team_name;
  $('teamWeekTitle').textContent=`WEEK ${selectedWeek}`;$('teamScore').textContent=fmt(score.points);$('teamProjection').textContent=fmt(score.projected);
  $('teamRosterCount').textContent=rows.length;$('teamIntelCount').textContent=rows.filter(r=>intelFor(r)).length;
  $('teamStarters').innerHTML=starters.map(r=>playerRow(r)).join('')||'<div class="empty">No starters synced.</div>';
  $('teamBench').innerHTML=bench.map(r=>playerRow(r)).join('')||'<div class="empty">No bench players synced.</div>';
}
function availability(v){return String(v||'UNKNOWN').replaceAll('_',' ')}
function renderPlayers(){
  if(!$('playerPool'))return;
  const search=norm($('playerSearch')?.value||''),pos=$('positionFilter')?.value||'',status=$('statusFilter')?.value||'AVAILABLE',sort=$('sortFilter')?.value||'INTEL';
  let rows=(data?.pool||[]).filter(p=>{const avail=['FREE_AGENT','WAIVERS'].includes(p.availability_status);return(!search||norm(p.yahoo_player_name).includes(search))&&(!pos||p.position===pos)&&(status==='ALL'||(status==='AVAILABLE'?avail:p.availability_status===status))});
  const intelRank=p=>intelFor(p)?({HIGH:3,MEDIUM:2,LOW:1}[String(intelFor(p).priority||'').toUpperCase()]||1):0;
  rows.sort((a,b)=>sort==='PROJ'?(Number(b.projected_points)||0)-(Number(a.projected_points)||0):sort==='RANK'?(Number(a.yahoo_rank)||9999)-(Number(b.yahoo_rank)||9999):intelRank(b)-intelRank(a)||(Number(b.projected_points)||0)-(Number(a.projected_points)||0));
  $('playerCount').textContent=`${rows.length} players`;
  $('playerPool').innerHTML=rows.slice(0,500).map(p=>{const fake={...p,roster_slot:p.position};return `<div class="player-row player-tappable" ${drawerAttrs(fake)} tabindex="0" role="button"><div class="slot">${esc(p.position||'')}</div><div class="player-main"><b>${esc(p.yahoo_player_name||'')}</b><small>${esc(p.nfl_team||'')} · ${esc(availability(p.availability_status))}${p.waiver_clear_text?` · ${esc(p.waiver_clear_text)}`:''}</small>${badges(fake)}</div><div class="points"><b>${fmt(p.fantasy_points)}</b><span>Proj ${fmt(p.projected_points)}</span>${p.yahoo_rank?`<em>Rank ${esc(p.yahoo_rank)}</em>`:''}</div></div>`}).join('')||'<div class="empty">No Yahoo waiver/free-agent pool has been synced yet. Run SYNC YAHOO in the extension, then refresh.</div>';
}
function renderLeague(){
  if(!$('managerSelect'))return;const select=$('managerSelect');
  if(!select.dataset.ready){select.innerHTML=(data?.teams||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.team_name)}</option>`).join('');select.value=ownerTeam()?.id||data?.teams?.[0]?.id||'';select.dataset.ready='1';select.onchange=renderLeagueTeam}
  renderLeagueTeam();
}
function renderLeagueTeam(){
  const team=teamByDb($('managerSelect')?.value)||ownerTeam();if(!team)return;const score=teamScore(team);
  $('managerRosterTitle').textContent=team.team_name.toUpperCase();$('managerScore').textContent=fmt(score.points);$('managerProjection').textContent=fmt(score.projected);
  $('managerRoster').innerHTML=weekRowsFor(team).map(r=>playerRow(r)).join('')||'<div class="empty">No current Yahoo roster synced.</div>';
}
function matchupCard(m){
  const me=ownerTeam(),a=teamByDb(m.team_a_id),b=teamByDb(m.team_b_id),mine=m.team_a_id===me?.id||m.team_b_id===me?.id;
  const one=team=>{const id=`roster-${m.id}-${team?.id}`,score=teamScore(team);return `<div class="all-matchup-team"><div class="all-matchup-team-head"><div><b>${esc(team?.team_name||'')}</b><small>${esc(team?.manager_name||'')}${team?.id===me?.id?' · YOU':''}</small><button class="roster-toggle" type="button" data-roster="${id}">PLAYERS ▼</button></div><div class="all-matchup-team-score"><strong>${fmt(score.points)}</strong><span>${fmt(score.projected)} proj</span></div></div><div id="${id}" class="inline-roster" hidden>${weekRowsFor(team).map(r=>playerRow(r)).join('')}</div></div>`};
  return `<article class="all-matchup-card ${mine?'mine':''}">${one(a)}${one(b)}</article>`;
}
function renderAllMatchups(){
  if(!$('allMatchupsList'))return;const matches=(data?.matchups||[]).filter(m=>Number(m.week)===Number(selectedWeek));
  $('allMatchupsList').innerHTML=matches.length?`<div class="all-matchups-list">${matches.map(matchupCard).join('')}</div>`:'<div class="empty">No league matchups are synced for this week.</div>';
}
function renderAllViews(){
  renderIdentity();renderSyncStamp();updateLinks();
  if(IS_ALL_MATCHUPS){renderAllMatchups();return}
  renderMatchup();renderTeam();renderPlayers();renderLeague();
}
async function load(){
  try{
    data=await loadLeagueData(leagueId);indexes=buildIndexes(data);
    const me=ownerTeam();if(me?.yahoo_team_key)selectedTeamId=String(me.yahoo_team_key);
    if(!hadWeek)selectedWeek=inferWeek();
    setupWeekPicker();renderAllViews();setView(activeView,{updateHash:false});
    installPlayerDrawer({getData:()=>data,getIndexes:()=>indexes,getWeek:()=>selectedWeek});
    const currentTeamRows=assignedWeekRows(ownerTeam(),selectedWeek),projectionCount=currentTeamRows.filter(r=>r.projected_points!==null&&r.projected_points!==undefined).length;
    showNotice(!currentTeamRows.length?'Yahoo rosters are synced. Player-level weekly scoring/projections are waiting for a completed SYNC YAHOO from the extension.':projectionCount<weekRowsFor(ownerTeam()).filter(starter).length?'Player weekly data is partial. Team projections stay blank until every starter projection is synced from Yahoo Players.':'');
  }catch(error){showNotice(`Fantasy Intel could not load: ${error.message}`)}
}
async function refresh(){
  const button=$('refreshButton');if(button){button.disabled=true;button.textContent='REFRESHING…'}
  try{data=await loadLeagueData(leagueId);indexes=buildIndexes(data);renderAllViews()}
  catch(error){showNotice(`Refresh failed: ${error.message}`)}
  finally{if(button){button.disabled=false;button.textContent='REFRESH'}}
}

wireTabs();
$('refreshButton')?.addEventListener('click',refresh);
['playerSearch','positionFilter','statusFilter','sortFilter'].forEach(id=>$(id)?.addEventListener(id==='playerSearch'?'input':'change',renderPlayers));
$('benchToggle')?.addEventListener('click',()=>{const wrap=$('opponentBenchWrap');wrap.hidden=!wrap.hidden;$('benchToggle').textContent=wrap.hidden?'SHOW OPPONENT BENCH ▼':'HIDE OPPONENT BENCH ▲'});
document.addEventListener('click',event=>{const button=event.target.closest('[data-roster]');if(!button)return;const target=document.getElementById(button.dataset.roster);if(!target)return;target.hidden=!target.hidden;button.textContent=target.hidden?'PLAYERS ▼':'PLAYERS ▲'});
load();
setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);