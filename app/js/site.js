import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {esc,norm,slotWeight,isBenchSlot,buildIndexes,playerIntel,playerTags} from './utils.js';
import {installPlayerDrawer,drawerAttrs} from './player-drawer.js';

const OWNER_TEAM_ID='6';
const PAGE=document.body.dataset.page||'app';
const IS_ALL_MATCHUPS=PAGE==='all-matchups';
const VIEWS=['team','matchup','players','league'];
const params=new URLSearchParams(location.search);
const leagueId=params.get('league')||CONFIG.defaultLeagueId;
const hadWeek=params.has('week');
let selectedWeek=Math.max(1,Math.min(18,Number(params.get('week')||0)||1));
let activeView=VIEWS.includes(location.hash.replace('#',''))?location.hash.replace('#',''):'matchup';
let data=null;
let indexes=null;

const $=id=>document.getElementById(id);
const fmt=v=>v===null||v===undefined||v===''?'—':Number(v).toFixed(2);
const starter=row=>typeof row?.is_starter==='boolean'?row.is_starter:!isBenchSlot(row?.roster_slot);

function teamByYahoo(id){return data?.teams.find(t=>String(t.yahoo_team_key)===String(id))||null}
function teamByDb(id){return data?.teams.find(t=>String(t.id)===String(id))||null}
function ownerTeam(){return teamByYahoo(OWNER_TEAM_ID)}
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
function weekRowsFor(team,week=selectedWeek){
  const weekly=(data?.weekStats||[]).filter(r=>r.league_team_id===team?.id&&Number(r.week)===Number(week));
  return (weekly.length?weekly:rosterFor(team)).slice().sort(sortRows);
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
function teamScore(team,week=selectedWeek){
  const m=data?.matchups.find(x=>Number(x.week)===Number(week)&&(x.team_a_id===team?.id||x.team_b_id===team?.id));
  if(!m)return {points:null,projected:null};
  return m.team_a_id===team.id?{points:m.team_a_points,projected:m.team_a_projected}:{points:m.team_b_points,projected:m.team_b_projected};
}
function inferWeek(){
  const poolWeek=Math.max(0,...(data?.pool||[]).map(p=>Number(p.current_week)||0));
  const latest=[...(data?.weekStats||[])].filter(s=>s.last_synced_at).sort((a,b)=>new Date(b.last_synced_at)-new Date(a.last_synced_at))[0];
  return poolWeek||Number(latest?.week)||1;
}
function setQuery(){
  const u=new URL(location.href);
  u.searchParams.set('league',leagueId);
  u.searchParams.set('week',String(selectedWeek));
  u.searchParams.delete('team');
  history.replaceState({},'',u);
}
function showNotice(message){
  const el=$('notice');if(!el)return;
  el.hidden=!message;el.textContent=message||'';
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
    setQuery();updateLinks();renderCurrent();
  };
  select.onchange=()=>go(select.value);
  $('prevWeek')?.addEventListener('click',()=>go(selectedWeek-1));
  $('nextWeek')?.addEventListener('click',()=>go(selectedWeek+1));
}
function updateLinks(){
  if($('allMatchupsLink'))$('allMatchupsLink').href=`./all-matchups.html?league=${encodeURIComponent(leagueId)}&week=${selectedWeek}`;
  if($('backToApp'))$('backToApp').href=`./?league=${encodeURIComponent(leagueId)}&week=${selectedWeek}#matchup`;
}
function setView(view,{updateHash=true}={}){
  if(IS_ALL_MATCHUPS)return;
  activeView=VIEWS.includes(view)?view:'matchup';
  document.querySelectorAll('[data-view-panel]').forEach(panel=>panel.hidden=panel.dataset.viewPanel!==activeView);
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===activeView));
  if(updateHash){const u=new URL(location.href);u.hash=activeView==='matchup'?'':activeView;history.replaceState({},'',u)}
  renderCurrent();
}
function wireTabs(){
  document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
  window.addEventListener('hashchange',()=>setView(location.hash.replace('#','')||'matchup',{updateHash:false}));
}
function badges(row){
  const tags=playerTags(row,indexes);if(!tags.length)return'';
  return `<div class="tags">${tags.slice(0,4).map(t=>`<span class="tag ${String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-')}">${esc(String(t).toUpperCase())}</span>`).join('')}</div>`;
}
function metricsFor(row,week=selectedWeek){
  const st=statFor(row,week),pool=currentPoolFor(row,week);
  return {actual:st?.fantasy_points??pool?.fantasy_points??null,projected:st?.projected_points??pool?.projected_points??null,opponent:st?.opponent||pool?.opponent||'',gameTime:st?.game_time||pool?.game_time||'',gameStatus:st?.game_status||pool?.game_status||''};
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
  const pct=total?Math.round((Number(my.projected)||0)/total*100):50;
  return `<div class="matchup-score-card"><div class="score-teams">
    <div class="score-team"><small>HOUSE OF THE DRAGON</small><b>${esc(me?.team_name||'House of the Dragon')}</b><strong>${fmt(my.points)}</strong><span>${fmt(my.projected)} projected</span></div>
    <div class="score-vs">VS</div>
    <div class="score-team right"><small>OPPONENT</small><b>${esc(opp?.team_name||'Opponent')}</b><strong>${fmt(op.points)}</strong><span>${fmt(op.projected)} projected</span></div>
  </div><div class="win-meter"><b>${pct}%</b><div class="win-track"><div class="win-fill" style="width:${pct}%"></div></div><b>${100-pct}%</b></div></div>`;
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
  const one=(team,points,proj)=>{const id=`roster-${m.id}-${team?.id}`;return `<div class="all-matchup-team"><div class="all-matchup-team-head"><div><b>${esc(team?.team_name||'')}</b><small>${esc(team?.manager_name||'')}${team?.id===me?.id?' · YOU':''}</small><button class="roster-toggle" type="button" data-roster="${id}">PLAYERS ▼</button></div><div class="all-matchup-team-score"><strong>${fmt(points)}</strong><span>${fmt(proj)} proj</span></div></div><div id="${id}" class="inline-roster" hidden>${weekRowsFor(team).map(r=>playerRow(r)).join('')}</div></div>`};
  return `<article class="all-matchup-card ${mine?'mine':''}">${one(a,m.team_a_points,m.team_a_projected)}${one(b,m.team_b_points,m.team_b_projected)}</article>`;
}
function renderAllMatchups(){
  if(!$('allMatchupsList'))return;const matches=(data?.matchups||[]).filter(m=>Number(m.week)===Number(selectedWeek));
  $('allMatchupsList').innerHTML=matches.length?`<div class="all-matchups-list">${matches.map(matchupCard).join('')}</div>`:'<div class="empty">No league matchups are synced for this week.</div>';
}
function renderCurrent(){
  renderSyncStamp();updateLinks();
  if(IS_ALL_MATCHUPS){renderAllMatchups();return}
  if(activeView==='matchup')renderMatchup();
  else if(activeView==='team')renderTeam();
  else if(activeView==='players')renderPlayers();
  else if(activeView==='league')renderLeague();
}
async function load(){
  try{
    data=await loadLeagueData(leagueId);indexes=buildIndexes(data);
    if(!hadWeek)selectedWeek=inferWeek();
    setupWeekPicker();updateLinks();
    if(!IS_ALL_MATCHUPS)setView(activeView,{updateHash:false});else renderCurrent();
    installPlayerDrawer({getData:()=>data,getIndexes:()=>indexes,getWeek:()=>selectedWeek});
    const missingWeekRows=(data.weekStats||[]).length===0;
    showNotice(missingWeekRows?'Yahoo team and matchup totals are synced. Individual weekly player points/projections still need one completed SYNC YAHOO from extension v3.3.0.':'');
  }catch(error){showNotice(`Fantasy Intel could not load: ${error.message}`)}
}
async function refresh(){
  const button=$('refreshButton');if(button){button.disabled=true;button.textContent='REFRESHING…'}
  try{data=await loadLeagueData(leagueId);indexes=buildIndexes(data);renderCurrent();showNotice((data.weekStats||[]).length?'':'Individual weekly Yahoo player rows are still waiting for a completed extension sync.')}
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
