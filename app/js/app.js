import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {getIdentity,saveIdentity,syncYahoo} from './runtime.js';
import {esc,norm,slotWeight,isBenchSlot,buildIndexes,playerIntel,playerTags} from './utils.js';

const PAGE=document.body.dataset.page||'team';
const params=new URLSearchParams(location.search);
const leagueId=params.get('league')||CONFIG.defaultLeagueId;
let selectedWeek=Math.max(1,Math.min(18,Number(params.get('week')||0)||1));
let selectedTeamId=params.get('team')||null;
let data=null,indexes=null,identity=null;

const $=id=>document.getElementById(id);
const starter=row=>!isBenchSlot(row.roster_slot);
const fmt=value=>value===null||value===undefined||value===''?'—':Number(value).toFixed(2);

function teamByYahoo(id){return data?.teams.find(t=>String(t.yahoo_team_key)===String(id))||null}
function teamByDb(id){return data?.teams.find(t=>String(t.id)===String(id))||null}
function rosterFor(team){return (data?.rosters||[]).filter(r=>r.league_team_id===team?.id).sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)))}
function statFor(row,week=selectedWeek){return (data?.weekStats||[]).find(s=>Number(s.week)===Number(week)&&((row.player_key&&s.player_key===row.player_key)||(row.yahoo_player_key&&String(s.yahoo_player_key)===String(row.yahoo_player_key))))||null}
function poolFor(row){return (data?.pool||[]).find(p=>(row.player_key&&p.player_key===row.player_key)||(row.yahoo_player_key&&String(p.yahoo_player_key)===String(row.yahoo_player_key)))||null}
function latestIntel(row){return playerIntel(row,indexes)[0]||null}

function inferredWeek(){
  const poolWeek=Math.max(0,...(data?.pool||[]).map(p=>Number(p.current_week)||0));
  const statsWeek=Math.max(0,...(data?.weekStats||[]).map(s=>Number(s.week)||0));
  return poolWeek||statsWeek||1;
}

function setQuery(){
  const url=new URL(location.href);url.searchParams.set('league',leagueId);if(selectedTeamId)url.searchParams.set('team',selectedTeamId);url.searchParams.set('week',String(selectedWeek));history.replaceState({},'',url);
}

function navUrl(page){return `../${page}/?league=${encodeURIComponent(leagueId)}${selectedTeamId?`&team=${encodeURIComponent(selectedTeamId)}`:''}&week=${selectedWeek}`}
function wireNav(){document.querySelectorAll('[data-nav]').forEach(a=>{a.href=navUrl(a.dataset.nav);a.classList.toggle('active',a.dataset.nav===PAGE)})}

function showNotice(message,type=''){const el=$('notice');if(!el)return;el.hidden=!message;el.className=`notice ${type}`.trim();el.textContent=message||''}

function setupWeekPicker(){
  const select=$('weekSelect');if(!select)return;
  select.innerHTML=Array.from({length:18},(_,i)=>`<option value="${i+1}">Week ${i+1}</option>`).join('');select.value=String(selectedWeek);
  select.onchange=()=>{selectedWeek=Number(select.value);setQuery();wireNav();render()};
  const prev=$('prevWeek'),next=$('nextWeek');
  if(prev)prev.onclick=()=>{selectedWeek=Math.max(1,selectedWeek-1);select.value=selectedWeek;setQuery();wireNav();render()};
  if(next)next.onclick=()=>{selectedWeek=Math.min(18,selectedWeek+1);select.value=selectedWeek;setQuery();wireNav();render()};
}

function setupTeamPicker(){
  const select=$('teamSelect');if(!select)return;
  select.innerHTML=data.teams.map(t=>`<option value="${esc(t.yahoo_team_key)}">${esc(t.team_name)}</option>`).join('');
  if(selectedTeamId&&teamByYahoo(selectedTeamId))select.value=selectedTeamId;
  select.onchange=async()=>{selectedTeamId=select.value;identity={leagueId,teamId:selectedTeamId,teamName:teamByYahoo(selectedTeamId)?.team_name||null,detectedFrom:'app'};await saveIdentity(identity);setQuery();wireNav();render()};
}

function intelBadges(row){
  const tags=playerTags(row,indexes);if(!tags.length)return'';
  return `<div class="tags">${tags.map(t=>`<span class="tag ${String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-')}">${esc(String(t).toUpperCase())}</span>`).join('')}</div>`;
}

function rowHtml(row,{week=selectedWeek,showIntel=true,compact=false}={}){
  const stat=statFor(row,week),pool=poolFor(row),intel=latestIntel(row);
  const actual=stat?.fantasy_points??pool?.fantasy_points??null;
  const projected=stat?.projected_points??pool?.projected_points??null;
  const opponent=stat?.opponent||pool?.opponent||'';
  return `<div class="player-row ${compact?'compact':''}">
    <div class="slot">${esc(row.roster_slot||row.position||'')}</div>
    <div class="player-main"><b>${esc(row.yahoo_player_name||row.yahoo_name||row.player_name||'')}</b><small>${esc(row.position||'')} · ${esc(row.nfl_team||row.team||'')}${opponent?` · ${esc(opponent)}`:''}</small>${intelBadges(row)}${showIntel&&intel?`<p><strong>${esc(intel.action)}:</strong> ${esc(intel.recommendation||intel.what_changed||'')}</p>`:''}</div>
    <div class="points"><b>${fmt(actual)}</b><span>Proj ${fmt(projected)}</span></div>
  </div>`;
}

function renderTeam(){
  const team=teamByYahoo(selectedTeamId)||data.teams[0];if(!team)return;
  $('pageTitle').textContent=team.team_name;const rows=rosterFor(team),starters=rows.filter(starter),bench=rows.filter(r=>!starter(r));
  $('teamSummary').innerHTML=`<div><b>${rows.length}</b><span>ROSTER</span></div><div><b>${starters.length}</b><span>STARTERS</span></div><div><b>${rows.filter(r=>latestIntel(r)).length}</b><span>INTEL</span></div><div><b>${fmt(starters.reduce((sum,r)=>sum+(Number(statFor(r)?.projected_points)||0),0)||null)}</b><span>PROJ</span></div>`;
  $('starters').innerHTML=starters.map(r=>rowHtml(r)).join('')||'<div class="empty">No starters synced.</div>';
  $('bench').innerHTML=bench.map(r=>rowHtml(r)).join('')||'<div class="empty">No bench players synced.</div>';
}

function renderMatchup(){
  const me=teamByYahoo(selectedTeamId);if(!me)return;
  const matchup=data.matchups.find(m=>Number(m.week)===selectedWeek&&(m.team_a_id===me.id||m.team_b_id===me.id));
  if(!matchup){$('matchupBody').innerHTML='<div class="empty">No Yahoo matchup is synced for this week.</div>';return}
  const opponent=teamByDb(matchup.team_a_id===me.id?matchup.team_b_id:matchup.team_a_id),opponentRows=rosterFor(opponent),starters=opponentRows.filter(starter),bench=opponentRows.filter(r=>!starter(r));
  const myPoints=matchup.team_a_id===me.id?matchup.team_a_points:matchup.team_b_points,myProj=matchup.team_a_id===me.id?matchup.team_a_projected:matchup.team_b_projected,oppPoints=matchup.team_a_id===me.id?matchup.team_b_points:matchup.team_a_points,oppProj=matchup.team_a_id===me.id?matchup.team_b_projected:matchup.team_a_projected;
  $('matchupTeams').innerHTML=`<div><small>YOU</small><b>${esc(me.team_name)}</b><strong>${fmt(myPoints)} <span>/ ${fmt(myProj)}</span></strong></div><i>VS</i><div><small>OPPONENT</small><b>${esc(opponent?.team_name||'Opponent')}</b><strong>${fmt(oppPoints)} <span>/ ${fmt(oppProj)}</span></strong></div>`;
  $('opponentTitle').textContent=`${opponent?.team_name||'Opponent'} Players`;
  $('matchupBody').innerHTML=starters.map(r=>rowHtml(r,{showIntel:true})).join('')||'<div class="empty">No opponent starters synced.</div>';
  $('opponentBench').innerHTML=bench.map(r=>rowHtml(r,{showIntel:true})).join('')||'<div class="empty">No bench players.</div>';
}

function availabilityLabel(v){return String(v||'UNKNOWN').replace('_',' ')}
function renderPlayers(){
  const search=norm($('playerSearch')?.value||''),pos=$('positionFilter')?.value||'',status=$('statusFilter')?.value||'AVAILABLE',sort=$('sortFilter')?.value||'INTEL';
  let rows=(data.pool||[]).filter(p=>{
    const available=p.availability_status==='FREE_AGENT'||p.availability_status==='WAIVERS';
    return(!search||norm(p.yahoo_player_name).includes(search))&&(!pos||p.position===pos)&&(status==='ALL'||(status==='AVAILABLE'?available:p.availability_status===status));
  });
  const intelRank=p=>{const fake={player_key:p.player_key,yahoo_player_key:p.yahoo_player_key,yahoo_player_name:p.yahoo_player_name};const i=latestIntel(fake);return i?({HIGH:3,MEDIUM:2,LOW:1}[String(i.priority).toUpperCase()]||1):0};
  rows.sort((a,b)=>sort==='PROJ'?(Number(b.projected_points)||0)-(Number(a.projected_points)||0):sort==='RANK'?(Number(a.yahoo_rank)||9999)-(Number(b.yahoo_rank)||9999):intelRank(b)-intelRank(a)||(Number(b.projected_points)||0)-(Number(a.projected_points)||0));
  $('playerCount').textContent=`${rows.length} players`;
  $('playerPool').innerHTML=rows.slice(0,400).map(p=>{const fake={player_key:p.player_key,yahoo_player_key:p.yahoo_player_key,yahoo_player_name:p.yahoo_player_name,position:p.position,nfl_team:p.nfl_team,roster_slot:p.position};const intel=latestIntel(fake);return `<div class="player-row pool-row"><div class="slot">${esc(p.position||'')}</div><div class="player-main"><b>${esc(p.yahoo_player_name)}</b><small>${esc(p.nfl_team||'')} · ${esc(availabilityLabel(p.availability_status))}${p.waiver_clear_text?` · ${esc(p.waiver_clear_text)}`:''}</small>${intelBadges(fake)}${intel?`<p><strong>${esc(intel.action)}:</strong> ${esc(intel.recommendation||intel.what_changed||'')}</p>`:''}</div><div class="points"><b>${fmt(p.fantasy_points)}</b><span>Proj ${fmt(p.projected_points)}</span>${p.yahoo_rank?`<em>Rank ${esc(p.yahoo_rank)}</em>`:''}</div></div>`}).join('')||'<div class="empty">No players match these filters. Run Yahoo Sync if the pool has not been loaded yet.</div>';
}

function teamDropdownHtml(team,matchupId){const id=`roster-${matchupId}-${team.id}`;return `<button class="roster-toggle" data-roster="${id}">PLAYERS ▼</button><div id="${id}" class="inline-roster" hidden>${rosterFor(team).map(r=>rowHtml(r,{showIntel:false,compact:true})).join('')}</div>`}
function renderLeague(){
  const me=teamByYahoo(selectedTeamId),matches=data.matchups.filter(m=>Number(m.week)===selectedWeek);
  $('leagueMatchups').innerHTML=matches.map(m=>{const a=teamByDb(m.team_a_id),b=teamByDb(m.team_b_id),mine=a?.id===me?.id||b?.id===me?.id;return `<article class="matchup-card ${mine?'mine':''}"><div class="match-team"><div><b>${esc(a?.team_name||m.team_a_name)}</b>${teamDropdownHtml(a,m.id)}</div><div class="match-score"><b>${fmt(m.team_a_points)}</b><span>Proj ${fmt(m.team_a_projected)}</span></div></div><div class="versus">VS</div><div class="match-team"><div><b>${esc(b?.team_name||m.team_b_name)}</b>${teamDropdownHtml(b,m.id)}</div><div class="match-score"><b>${fmt(m.team_b_points)}</b><span>Proj ${fmt(m.team_b_projected)}</span></div></div></article>`}).join('')||'<div class="empty">No league matchups synced for this week.</div>';
  document.querySelectorAll('.roster-toggle').forEach(btn=>btn.onclick=()=>{const target=$(btn.dataset.roster),open=target.hidden;target.hidden=!open;btn.textContent=open?'PLAYERS ▲':'PLAYERS ▼'});
  const select=$('managerSelect');if(select&&!select.dataset.ready){select.innerHTML=data.teams.map(t=>`<option value="${esc(t.id)}">${esc(t.team_name)}</option>`).join('');select.value=me?.id||data.teams[0]?.id||'';select.dataset.ready='1';select.onchange=renderManagerRoster}
  renderManagerRoster();
}

function renderManagerRoster(){const select=$('managerSelect'),team=teamByDb(select?.value)||teamByYahoo(selectedTeamId)||data.teams[0];if(!$('managerRoster')||!team)return;$('managerRosterTitle').textContent=team.team_name;$('managerRoster').innerHTML=rosterFor(team).map(r=>rowHtml(r,{showIntel:true})).join('')}

function render(){
  setQuery();wireNav();
  if($('weekLabel'))$('weekLabel').textContent=`Week ${selectedWeek}`;
  if(PAGE==='team')renderTeam();else if(PAGE==='matchup')renderMatchup();else if(PAGE==='players')renderPlayers();else if(PAGE==='league')renderLeague();
}

async function doSync(){const button=$('syncButton');if(button){button.disabled=true;button.textContent='SYNCING…'}showNotice('Syncing Yahoo teams, current rosters, all matchups, your weekly opponents, points/projections and available players…');try{const result=await syncYahoo(leagueId);showNotice(`Sync complete: ${result.teams} teams · ${result.players} roster spots · ${result.weekStatRows||0} weekly player rows · ${result.playerPool?.available||0} available players.`,'success');await load()}catch(error){showNotice(error.message,'error')}finally{if(button){button.disabled=false;button.textContent='SYNC YAHOO'}}}

async function load(){
  try{
    data=await loadLeagueData(leagueId);indexes=buildIndexes(data);identity=await getIdentity(leagueId);
    selectedTeamId=selectedTeamId||identity?.teamId||String(data.teams.find(t=>t.is_my_team)?.yahoo_team_key||'6');
    if(!params.get('week'))selectedWeek=inferredWeek();
    if(selectedTeamId){await saveIdentity({leagueId,teamId:selectedTeamId,teamName:teamByYahoo(selectedTeamId)?.team_name||null,detectedFrom:'app'})}
    setupTeamPicker();setupWeekPicker();wireNav();render();showNotice('');
  }catch(error){showNotice(`Could not load Fantasy Intel: ${error.message}`,'error')}
}

$('refreshButton')?.addEventListener('click',load);$('syncButton')?.addEventListener('click',doSync);
['playerSearch','positionFilter','statusFilter','sortFilter'].forEach(id=>$(id)?.addEventListener(id==='playerSearch'?'input':'change',()=>PAGE==='players'&&renderPlayers()));
$('benchToggle')?.addEventListener('click',()=>{const target=$('opponentBench');target.hidden=!target.hidden;$('benchToggle').textContent=target.hidden?'SHOW OPPONENT BENCH ▼':'HIDE OPPONENT BENCH ▲'});
load();
