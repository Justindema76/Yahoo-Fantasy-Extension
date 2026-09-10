import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {esc,slotWeight,isBenchSlot,buildIndexes,playerIntel} from './utils.js';

const OWNER_TEAM_ID='6';
const params=new URLSearchParams(location.search);
const leagueId=params.get('league')||CONFIG.defaultLeagueId;
let selectedWeek=Math.max(1,Math.min(18,Number(params.get('week')||0)||1));
let data=null,indexes=null;
const $=id=>document.getElementById(id);
const fmt=v=>v===null||v===undefined||v===''?'—':Number(v).toFixed(2);
const starter=row=>typeof row?.is_starter==='boolean'?row.is_starter:!isBenchSlot(row?.roster_slot);
const teamByYahoo=id=>data?.teams.find(t=>String(t.yahoo_team_key)===String(id))||null;
const teamByDb=id=>data?.teams.find(t=>String(t.id)===String(id))||null;
const ownerTeam=()=>teamByYahoo(OWNER_TEAM_ID);

function shortName(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  if(parts.length<2)return String(name||'').toUpperCase();
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`.toUpperCase();
}
function positionLabel(row){
  const raw=String(row?.roster_slot||row?.position||'').toUpperCase();
  if(raw==='W/R/T'||raw==='W/R'||raw==='Q/W/R/T')return 'WRT';
  if(raw==='DST')return 'DEF';
  return raw;
}
function weekRosterFor(team,week=selectedWeek){
  const weekly=(data?.weekStats||[]).filter(r=>r.league_team_id===team?.id&&Number(r.week)===Number(week));
  const rows=weekly.length?weekly:(data?.rosters||[]).filter(r=>r.league_team_id===team?.id);
  return rows.sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
}
function statFor(row,week=selectedWeek){
  if(Number(row?.week)===Number(week)&&('fantasy_points' in row||'projected_points' in row))return row;
  return (data?.weekStats||[]).find(s=>Number(s.week)===Number(week)&&((row.player_key&&s.player_key===row.player_key)||(row.yahoo_player_key&&String(s.yahoo_player_key)===String(row.yahoo_player_key))))||null;
}
function latestIntel(row){return playerIntel(row,indexes)[0]||null}
function gameMeta(row){
  const st=statFor(row);const bits=[];
  if(row?.nfl_team||row?.team)bits.push(row.nfl_team||row.team);
  if(st?.game_time)bits.push(st.game_time);
  if(st?.opponent)bits.push(st.opponent);
  return bits.join(' · ');
}
function lineup(team){return weekRosterFor(team).filter(starter)}
function bench(team){return weekRosterFor(team).filter(r=>!starter(r))}
function inferWeek(){
  const current=(data?.weekStats||[]).filter(s=>s.last_synced_at).sort((a,b)=>new Date(b.last_synced_at)-new Date(a.last_synced_at));
  return Number(current[0]?.week)||1;
}
function setQuery(){const url=new URL(location.href);url.searchParams.set('league',leagueId);url.searchParams.set('week',String(selectedWeek));url.searchParams.delete('team');history.replaceState({},'',url)}
function navUrl(page){return `../${page}/?league=${encodeURIComponent(leagueId)}&week=${selectedWeek}`}
function wireNav(){document.querySelectorAll('[data-nav]').forEach(a=>{a.href=navUrl(a.dataset.nav);a.classList.toggle('active',a.dataset.nav==='matchup')});const all=$('allMatchupsLink');if(all)all.href=navUrl('league')}
function renderSyncStamp(){const stamps=[...(data?.rosters||[]),...(data?.weekStats||[])].map(r=>r.last_synced_at).filter(Boolean).sort();if(!$('syncStamp')||!stamps.length)return;const d=new Date(stamps.at(-1));$('syncStamp').textContent=`Updated ${d.toLocaleDateString(undefined,{month:'short',day:'numeric'})} ${d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}`}
function setupWeekPicker(){
  const select=$('weekSelect');select.innerHTML=Array.from({length:18},(_,i)=>`<option value="${i+1}">Week ${i+1}</option>`).join('');select.value=selectedWeek;
  const go=w=>{selectedWeek=Math.max(1,Math.min(18,w));select.value=selectedWeek;setQuery();wireNav();render()};
  select.onchange=()=>go(Number(select.value));$('prevWeek').onclick=()=>go(selectedWeek-1);$('nextWeek').onclick=()=>go(selectedWeek+1);
}
function scoreHeader(me,opp,matchup){
  const mineA=matchup.team_a_id===me.id;
  const myPts=mineA?matchup.team_a_points:matchup.team_b_points,myProj=mineA?matchup.team_a_projected:matchup.team_b_projected;
  const opPts=mineA?matchup.team_b_points:matchup.team_a_points,opProj=mineA?matchup.team_b_projected:matchup.team_a_projected;
  const total=(Number(myProj)||0)+(Number(opProj)||0);const myPct=total?Math.round((Number(myProj)||0)/total*100):50,opPct=100-myPct;
  return `<div class="matchup-score-card"><div class="score-teams"><div class="score-team"><small>HOUSE OF THE DRAGON</small><b>${esc(me.team_name)}</b><strong>${fmt(myPts)}</strong><span>${fmt(myProj)} projected</span></div><div class="score-vs">VS</div><div class="score-team right"><small>OPPONENT</small><b>${esc(opp?.team_name||'Opponent')}</b><strong>${fmt(opPts)}</strong><span>${fmt(opProj)} projected</span></div></div><div class="win-meter"><b>${myPct}%</b><div class="win-track"><div class="win-fill" style="width:${myPct}%"></div></div><b>${opPct}%</b></div></div>`;
}
function playerInfo(row,side){
  if(!row)return `<div class="matchup-player-info ${side}"><div class="matchup-player-name">—</div></div>`;
  const intel=latestIntel(row);return `<div class="matchup-player-info ${side}"><div class="matchup-player-name">${esc(shortName(row.yahoo_player_name||row.yahoo_name||row.player_name))}</div><div class="matchup-player-meta">${esc(gameMeta(row))}</div>${intel?`<span class="matchup-player-intel">${esc(String(intel.action||'INTEL').toUpperCase())}</span>`:''}</div>`;
}
function points(row){const s=row?statFor(row):null;return `<div class="matchup-player-points"><b>${fmt(s?.fantasy_points)}</b><span>${fmt(s?.projected_points)}</span></div>`}
function compareRows(me,opp){
  const left=lineup(me),right=lineup(opp),count=Math.max(left.length,right.length);let html='';
  for(let i=0;i<count;i++){
    const l=left[i]||null,r=right[i]||null,pos=positionLabel(l||r)||'—';const cls=pos.toLowerCase().replace(/[^a-z]/g,'');
    html+=`<div class="matchup-player-row">${playerInfo(l,'left')}${points(l)}<div class="matchup-position ${cls}">${esc(pos)}</div>${points(r)}${playerInfo(r,'right')}</div>`;
  }
  return html||'<div class="empty">No starters synced for this week.</div>';
}
function benchHtml(team){return bench(team).map(r=>{const s=statFor(r),intel=latestIntel(r);return `<div class="player-row"><div class="slot">${esc(r.roster_slot||'BN')}</div><div class="player-main"><b>${esc(r.yahoo_player_name||'')}</b><small>${esc(gameMeta(r))}</small>${intel?`<p><strong>${esc(intel.action)}:</strong> ${esc(intel.recommendation||intel.what_changed||'')}</p>`:''}</div><div class="points"><b>${fmt(s?.fantasy_points)}</b><span>Proj ${fmt(s?.projected_points)}</span></div></div>`}).join('')||'<div class="empty">No opponent bench players synced.</div>'}
function render(){
  setQuery();wireNav();renderSyncStamp();const me=ownerTeam();if(!me)return;
  const matchup=data.matchups.find(m=>Number(m.week)===selectedWeek&&(m.team_a_id===me.id||m.team_b_id===me.id));
  if(!matchup){$('scoreArea').innerHTML='';$('matchupBody').innerHTML='<div class="empty">No Yahoo matchup is synced for this week.</div>';return}
  const opp=teamByDb(matchup.team_a_id===me.id?matchup.team_b_id:matchup.team_a_id);
  $('scoreArea').innerHTML=scoreHeader(me,opp,matchup);$('matchupBody').innerHTML=compareRows(me,opp);$('opponentBench').innerHTML=benchHtml(opp);$('opponentBenchTitle').textContent=`${opp?.team_name||'Opponent'} Bench`;
}
async function load(){try{data=await loadLeagueData(leagueId);indexes=buildIndexes(data);if(!params.get('week'))selectedWeek=inferWeek();setupWeekPicker();render()}catch(error){$('notice').hidden=false;$('notice').className='notice error';$('notice').textContent=`Could not load Fantasy Intel: ${error.message}`}}
$('refreshButton').addEventListener('click',load);$('benchToggle').addEventListener('click',()=>{const target=$('opponentBenchWrap');target.hidden=!target.hidden;$('benchToggle').textContent=target.hidden?'SHOW OPPONENT BENCH ▼':'HIDE OPPONENT BENCH ▲'});load();
