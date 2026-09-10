import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {esc,norm,slotWeight,isBenchSlot,buildIndexes,playerIntel,playerTags} from './utils.js';
import {installPlayerDrawer,drawerAttrs} from './player-drawer.js';

const OWNER_TEAM_ID='6';
const PAGE=document.body.dataset.page||'matchup';
const params=new URLSearchParams(location.search);
const leagueId=params.get('league')||CONFIG.defaultLeagueId;
let selectedWeek=Math.max(1,Math.min(18,Number(params.get('week')||0)||1));
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
function sortRows(a,b){return slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name||'').localeCompare(String(b.yahoo_player_name||''))}
function rosterFor(team){return (data?.rosters||[]).filter(r=>r.league_team_id===team?.id).sort(sortRows)}
function weekRowsFor(team,week=selectedWeek){
  const weekly=(data?.weekStats||[]).filter(r=>r.league_team_id===team?.id&&Number(r.week)===Number(week));
  return (weekly.length?weekly:rosterFor(team)).slice().sort(sortRows);
}
function statFor(row,week=selectedWeek){
  if(Number(row?.week)===Number(week)&&('fantasy_points' in row||'projected_points' in row))return row;
  return (data?.weekStats||[]).find(s=>Number(s.week)===Number(week)&&(
    (row.player_key&&s.player_key===row.player_key)||
    (row.yahoo_player_key&&String(s.yahoo_player_key)===String(row.yahoo_player_key))
  ))||null;
}
function poolFor(row){
  return (data?.pool||[]).find(p=>
    (row.player_key&&p.player_key===row.player_key)||
    (row.yahoo_player_key&&String(p.yahoo_player_key)===String(row.yahoo_player_key))
  )||null;
}
function intelFor(row){return playerIntel(row,indexes)[0]||null}
function teamScore(team,week=selectedWeek){
  const m=data?.matchups.find(x=>Number(x.week)===Number(week)&&(x.team_a_id===team?.id||x.team_b_id===team?.id));
  if(!m)return {points:null,projected:null};
  if(m.team_a_id===team.id)return {points:m.team_a_points,projected:m.team_a_projected};
  return {points:m.team_b_points,projected:m.team_b_projected};
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
function pageUrl(page){
  const q=`?league=${encodeURIComponent(leagueId)}&week=${selectedWeek}`;
  const map={matchup:`./${q}`,team:`./team.html${q}`,players:`./players.html${q}`,league:`./league.html${q}`};
  return map[page]||`./${q}`;
}
function wireNav(){
  document.querySelectorAll('[data-nav]').forEach(a=>{
    a.href=pageUrl(a.dataset.nav);
    a.classList.toggle('active',a.dataset.nav===PAGE);
  });
  const all=$('allMatchupsLink');
  if(all)all.href=`./all-matchups.html?league=${encodeURIComponent(leagueId)}&week=${selectedWeek}`;
}
function setupWeekPicker(){
  const select=$('weekSelect');
  if(!select)return;
  select.innerHTML=Array.from({length:18},(_,i)=>`<option value="${i+1}">Week ${i+1}</option>`).join('');
  select.value=String(selectedWeek);
  const go=w=>{
    selectedWeek=Math.max(1,Math.min(18,Number(w)||1));
    select.value=String(selectedWeek);
    setQuery();wireNav();renderPage();
  };
  select.onchange=()=>go(select.value);
  $('prevWeek')?.addEventListener('click',()=>go(selectedWeek-1));
  $('nextWeek')?.addEventListener('click',()=>go(selectedWeek+1));
}
function renderSyncStamp(){
  const stamps=[...(data?.rosters||[]),...(data?.weekStats||[]),...(data?.pool||[])].map(r=>r.last_synced_at).filter(Boolean).sort();
  if(!$('syncStamp')||!stamps.length)return;
  const d=new Date(stamps.at(-1));
  $('syncStamp').textContent=`Updated ${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`;
}
function badges(row){
  const tags=playerTags(row,indexes);
  if(!tags.length)return '';
  return `<div class="tags">${tags.slice(0,4).map(t=>`<span class="tag ${String(t).toLowerCase().replace(/[^a-z0-9]+/g,'-')}">${esc(String(t).toUpperCase())}</span>`).join('')}</div>`;
}
function playerRow(row,{week=selectedWeek,compact=false}={}){
  const st=statFor(row,week),pool=poolFor(row);
  const actual=st?.fantasy_points??pool?.fantasy_points??null;
  const proj=st?.projected_points??pool?.projected_points??null;
  const game=[st?.game_time||pool?.game_time,st?.opponent||pool?.opponent].filter(Boolean).join(' · ');
  const name=row.yahoo_player_name||row.yahoo_name||row.player_name||'Player';
  return `<div class="player-row player-tappable ${compact?'compact':''}" ${drawerAttrs(row)} tabindex="0" role="button" aria-label="Open ${esc(name)} details">
    <div class="slot">${esc(row.roster_slot||row.position||'')}</div>
    <div class="player-main">
      <b>${esc(name)}</b>
      <small>${esc(row.position||'')} · ${esc(row.nfl_team||row.team||'')}${game?` · ${esc(game)}`:''}</small>
      ${badges(row)}
    </div>
    <div class="points"><b>${fmt(actual)}</b><span>Proj ${fmt(proj)}</span></div>
  </div>`;
}
function scoreHero(me,opp){
  const my=teamScore(me),op=teamScore(opp);
  const total=(Number(my.projected)||0)+(Number(op.projected)||0);
  const pct=total?Math.round((Number(my.projected)||0)/total*100):50;
  return `<div class="matchup-score-card">
    <div class="score-teams">
      <div class="score-team"><small>HOUSE OF THE DRAGON</small><b>${esc(me.team_name)}</b><strong>${fmt(my.points)}</strong><span>${fmt(my.projected)} projected</span></div>
      <div class="score-vs">VS</div>
      <div class="score-team right"><small>OPPONENT</small><b>${esc(opp?.team_name||'Opponent')}</b><strong>${fmt(op.points)}</strong><span>${fmt(op.projected)} projected</span></div>
    </div>
    <div class="win-meter"><b>${pct}%</b><div class="win-track"><div class="win-fill" style="width:${pct}%"></div></div><b>${100-pct}%</b></div>
  </div>`;
}
function shortName(name){
  const p=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(p.length<2)return String(name||'').toUpperCase();
  return `${p[0][0]}. ${p.slice(1).join(' ')}`.toUpperCase();
}
function posLabel(row){
  const s=String(row?.roster_slot||row?.position||'').toUpperCase();
  if(['W/R/T','W/R','Q/W/R/T'].includes(s))return 'WRT';
  if(s==='DST')return 'DEF';
  return s;
}
function gameMeta(row){
  const st=statFor(row);
  return [row?.nfl_team||row?.team,st?.game_time,st?.opponent].filter(Boolean).join(' · ');
}
function matchupInfo(row,side){
  if(!row)return `<div class="matchup-player-info ${side}"><div class="matchup-player-name">—</div></div>`;
  const intel=intelFor(row);
  return `<div class="matchup-player-info ${side} player-tappable" ${drawerAttrs(row)} tabindex="0" role="button">
    <div class="matchup-player-name">${esc(shortName(row.yahoo_player_name||row.yahoo_name||row.player_name))}</div>
    <div class="matchup-player-meta">${esc(gameMeta(row))}</div>
    ${intel?`<span class="matchup-player-intel">${esc(String(intel.action||'INTEL').toUpperCase())}</span>`:''}
  </div>`;
}
function matchupPoints(row){
  const s=row?statFor(row):null;
  return `<div class="matchup-player-points"><b>${fmt(s?.fantasy_points)}</b><span>${fmt(s?.projected_points)}</span></div>`;
}
function matchupRows(me,opp){
  const left=weekRowsFor(me).filter(starter),right=weekRowsFor(opp).filter(starter);
  const count=Math.max(left.length,right.length);
  let html='';
  for(let i=0;i<count;i++){
    const l=left[i]||null,r=right[i]||null,pos=posLabel(l||r)||'—';
    const cls=pos.toLowerCase().replace(/[^a-z]/g,'');
    html+=`<div class="matchup-player-row">${matchupInfo(l,'left')}${matchupPoints(l)}<div class="matchup-position ${cls}">${esc(pos)}</div>${matchupPoints(r)}${matchupInfo(r,'right')}</div>`;
  }
  return html||'<div class="empty">No starters synced for this week.</div>';
}
function renderMatchup(){
  const me=ownerTeam(),m=currentMatchup();
  if(!me||!m){$('scoreArea').innerHTML='';$('matchupBody').innerHTML='<div class="empty">No matchup synced for this week.</div>';return}
  const opp=opponentFor(m);
  $('scoreArea').innerHTML=scoreHero(me,opp);
  $('matchupBody').innerHTML=matchupRows(me,opp);
  const bench=weekRowsFor(opp).filter(r=>!starter(r));
  $('opponentBench').innerHTML=bench.map(r=>playerRow(r)).join('')||'<div class="empty">No opponent bench players synced.</div>';
  if($('opponentBenchTitle'))$('opponentBenchTitle').textContent=`${opp?.team_name||'Opponent'} Bench`;
}
function renderTeam(){
  const me=ownerTeam();
  if(!me)return;
  const score=teamScore(me),rows=weekRowsFor(me),starters=rows.filter(starter),bench=rows.filter(r=>!starter(r));
  $('teamWeekTitle').textContent=`Week ${selectedWeek}`;
  $('teamScore').textContent=fmt(score.points);
  $('teamProjection').textContent=fmt(score.projected);
  $('teamStarters').innerHTML=starters.map(r=>playerRow(r)).join('')||'<div class="empty">No starters synced.</div>';
  $('teamBench').innerHTML=bench.map(r=>playerRow(r)).join('')||'<div class="empty">No bench players synced.</div>';
}
function availability(v){return String(v||'UNKNOWN').replaceAll('_',' ')}
function renderPlayers(){
  const search=norm($('playerSearch')?.value||''),pos=$('positionFilter')?.value||'',status=$('statusFilter')?.value||'AVAILABLE',sort=$('sortFilter')?.value||'INTEL';
  let rows=(data?.pool||[]).filter(p=>{
    const avail=['FREE_AGENT','WAIVERS'].includes(p.availability_status);
    return (!search||norm(p.yahoo_player_name).includes(search))&&(!pos||p.position===pos)&&(status==='ALL'||(status==='AVAILABLE'?avail:p.availability_status===status));
  });
  const intelRank=p=>intelFor(p)?({HIGH:3,MEDIUM:2,LOW:1}[String(intelFor(p).priority||'').toUpperCase()]||1):0;
  rows.sort((a,b)=>sort==='PROJ'?(Number(b.projected_points)||0)-(Number(a.projected_points)||0):sort==='RANK'?(Number(a.yahoo_rank)||9999)-(Number(b.yahoo_rank)||9999):intelRank(b)-intelRank(a)||(Number(b.projected_points)||0)-(Number(a.projected_points)||0));
  $('playerCount').textContent=`${rows.length} players`;
  $('playerPool').innerHTML=rows.slice(0,500).map(p=>{
    const fake={...p,roster_slot:p.position};
    return `<div class="player-row player-tappable" ${drawerAttrs(fake)} tabindex="0" role="button">
      <div class="slot">${esc(p.position||'')}</div><div class="player-main"><b>${esc(p.yahoo_player_name)}</b><small>${esc(p.nfl_team||'')} · ${esc(availability(p.availability_status))}${p.waiver_clear_text?` · ${esc(p.waiver_clear_text)}`:''}</small>${badges(fake)}</div>
      <div class="points"><b>${fmt(p.fantasy_points)}</b><span>Proj ${fmt(p.projected_points)}</span>${p.yahoo_rank?`<em>Rank ${esc(p.yahoo_rank)}</em>`:''}</div>
    </div>`;
  }).join('')||'<div class="empty">No Yahoo player-pool data is stored yet. Run the extension sync on Yahoo, then refresh.</div>';
}
function renderLeague(){
  const select=$('managerSelect');
  if(!select.dataset.ready){
    select.innerHTML=(data?.teams||[]).map(t=>`<option value="${esc(t.id)}">${esc(t.team_name)}</option>`).join('');
    select.value=ownerTeam()?.id||data?.teams?.[0]?.id||'';
    select.dataset.ready='1';
    select.onchange=renderLeagueTeam;
  }
  renderLeagueTeam();
}
function renderLeagueTeam(){
  const team=teamByDb($('managerSelect')?.value)||ownerTeam();
  if(!team)return;
  const score=teamScore(team);
  $('managerRosterTitle').textContent=team.team_name;
  $('managerScore').textContent=fmt(score.points);
  $('managerProjection').textContent=fmt(score.projected);
  $('managerRoster').innerHTML=weekRowsFor(team).map(r=>playerRow(r)).join('')||'<div class="empty">No roster synced.</div>';
}
function matchupCard(m){
  const me=ownerTeam(),a=teamByDb(m.team_a_id),b=teamByDb(m.team_b_id);
  const one=(team,points,proj)=>{
    const id=`team-${m.id}-${team?.id}`;
    return `<div class="all-matchup-team"><div><b>${esc(team?.team_name||'')}</b><button class="roster-toggle" data-roster="${id}">PLAYERS ▼</button></div><div class="all-matchup-score"><b>${fmt(points)}</b><span>${fmt(proj)} projected</span></div></div>
      <div id="${id}" class="inline-roster" hidden>${weekRowsFor(team).map(r=>playerRow(r,{compact:true})).join('')}</div>`;
  };
  return `<article class="matchup-card ${a?.id===me?.id||b?.id===me?.id?'mine':''}">${one(a,m.team_a_points,m.team_a_projected)}<div class="versus">VS</div>${one(b,m.team_b_points,m.team_b_projected)}</article>`;
}
function renderAllMatchups(){
  const matches=(data?.matchups||[]).filter(m=>Number(m.week)===Number(selectedWeek));
  $('allMatchupsList').innerHTML=matches.map(matchupCard).join('')||'<div class="empty">No league matchups synced for this week.</div>';
  document.querySelectorAll('[data-roster]').forEach(btn=>btn.onclick=()=>{
    const target=$(btn.dataset.roster);target.hidden=!target.hidden;btn.textContent=target.hidden?'PLAYERS ▼':'PLAYERS ▲';
  });
}
function renderPage(){
  renderSyncStamp();
  wireNav();
  if(PAGE==='matchup')renderMatchup();
  if(PAGE==='team')renderTeam();
  if(PAGE==='players')renderPlayers();
  if(PAGE==='league')renderLeague();
  if(PAGE==='all-matchups')renderAllMatchups();
}
async function load(){
  try{
    data=await loadLeagueData(leagueId);
    indexes=buildIndexes(data);
    if(!params.get('week'))selectedWeek=inferWeek();
    setupWeekPicker();
    installPlayerDrawer({getData:()=>data,getIndexes:()=>indexes,getWeek:()=>selectedWeek});
    setQuery();wireNav();renderPage();
    const n=$('notice');if(n)n.hidden=true;
  }catch(error){
    const n=$('notice');if(n){n.hidden=false;n.className='notice error';n.textContent=`Could not load Fantasy Intel: ${error.message}`;}
  }
}
$('refreshButton')?.addEventListener('click',load);
['playerSearch','positionFilter','statusFilter','sortFilter'].forEach(id=>$(id)?.addEventListener(id==='playerSearch'?'input':'change',()=>PAGE==='players'&&renderPlayers()));
$('benchToggle')?.addEventListener('click',()=>{const t=$('opponentBenchWrap');t.hidden=!t.hidden;$('benchToggle').textContent=t.hidden?'SHOW OPPONENT BENCH ▼':'HIDE OPPONENT BENCH ▲';});
load();
