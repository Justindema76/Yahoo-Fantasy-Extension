import {esc,norm,playerIntel,playerTags,playerRecord} from './utils.js';

let getters={getData:()=>null,getIndexes:()=>null,getWeek:()=>1};
let installed=false;

const fmt=v=>v===null||v===undefined||v===''?'—':Number(v).toFixed(2);
const safeKey=v=>esc(String(v||''));

export function drawerAttrs(row={}){
  return `data-player-open="1" data-player-key="${safeKey(row.player_key)}" data-yahoo-player-key="${safeKey(row.yahoo_player_key)}" data-player-name="${safeKey(row.yahoo_player_name||row.yahoo_name||row.player_name)}"`;
}

function resolveRow(trigger,data){
  if(!data)return null;
  const key=trigger?.dataset?.playerKey||'';
  const yahooKey=trigger?.dataset?.yahooPlayerKey||'';
  const name=trigger?.dataset?.playerName||'';
  const lists=[data.players||[],data.pool||[],data.rosters||[],data.weekStats||[]];
  for(const list of lists){
    const found=list.find(r=>(key&&String(r.player_key||'')===String(key))||(yahooKey&&String(r.yahoo_player_key||'')===String(yahooKey))||(!key&&!yahooKey&&name&&norm(r.yahoo_player_name||r.yahoo_name||r.player_name)===norm(name)));
    if(found)return found;
  }
  return {player_key:key||null,yahoo_player_key:yahooKey||null,yahoo_player_name:name||'Player'};
}

function samePlayer(a,b){
  if(!a||!b)return false;
  if(a.player_key&&b.player_key&&String(a.player_key)===String(b.player_key))return true;
  if(a.yahoo_player_key&&b.yahoo_player_key&&String(a.yahoo_player_key)===String(b.yahoo_player_key))return true;
  return norm(a.yahoo_player_name||a.yahoo_name||a.player_name)===norm(b.yahoo_player_name||b.yahoo_name||b.player_name);
}

function weekRows(row,data){return (data.weekStats||[]).filter(r=>samePlayer(row,r)).sort((a,b)=>Number(a.week)-Number(b.week))}
function poolRow(row,data){return (data.pool||[]).find(r=>samePlayer(row,r))||null}
function rosterRow(row,data){return (data.rosters||[]).find(r=>samePlayer(row,r))||null}
function canonical(row,indexes){return playerRecord(row,indexes)||row}
function ownerFor(row,data){const rr=rosterRow(row,data);return rr?data.teams?.find(t=>t.id===rr.league_team_id)||null:null}
function selectedStat(row,data,week){return weekRows(row,data).find(r=>Number(r.week)===Number(week))||null}
function gameLabel(stat){return [stat?.game_time,stat?.opponent,stat?.game_status].filter(Boolean).join(' · ')||'No synced game detail yet.'}
function availabilityLabel(v){return String(v||'ROSTERED').replaceAll('_',' ')}
function tagsHtml(row,indexes){const tags=playerTags(row,indexes);return tags.length?`<div class="drawer-tags">${tags.map(t=>`<span>${esc(String(t).toUpperCase())}</span>`).join('')}</div>`:''}

function overviewHtml(row,data,indexes,week){
  const player=canonical(row,indexes),pool=poolRow(row,data),owner=ownerFor(row,data),stat=selectedStat(row,data,week),intel=playerIntel(row,indexes),latest=intel[0];
  const availability=pool?.availability_status?availabilityLabel(pool.availability_status):(owner?`ROSTERED · ${owner.team_name}`:'UNKNOWN');
  return `<div class="drawer-overview">
    <div class="drawer-kpis">
      <div><span>WEEK ${week}</span><b>${fmt(stat?.fantasy_points??pool?.fantasy_points)}</b><small>POINTS</small></div>
      <div><span>PROJ</span><b>${fmt(stat?.projected_points??pool?.projected_points)}</b><small>YAHOO</small></div>
      <div><span>RANK</span><b>${player?.yahoo_rank??pool?.yahoo_rank??'—'}</b><small>YAHOO</small></div>
    </div>
    <section class="drawer-section"><h3>Current situation</h3><div class="drawer-facts">
      <div><span>Availability</span><b>${esc(availability)}</b></div>
      <div><span>Roster slot</span><b>${esc(stat?.roster_slot||rosterRow(row,data)?.roster_slot||'—')}</b></div>
      <div><span>Role</span><b>${esc(player?.role||'—')}</b></div>
      <div><span>Game</span><b>${esc(gameLabel(stat||pool))}</b></div>
      ${pool?.percent_rostered!=null?`<div><span>Rostered</span><b>${esc(pool.percent_rostered)}%</b></div>`:''}
      ${pool?.percent_started!=null?`<div><span>Started</span><b>${esc(pool.percent_started)}%</b></div>`:''}
    </div></section>
    ${latest?`<section class="drawer-section drawer-intel-primary"><div class="drawer-section-title"><h3>Fantasy Intel</h3><span>${esc(String(latest.priority||'').toUpperCase())}</span></div>${tagsHtml(row,indexes)}
      ${latest.what_changed?`<h4>What changed</h4><p>${esc(latest.what_changed)}</p>`:''}
      ${latest.recommendation?`<h4>Recommendation</h4><p>${esc(latest.recommendation)}</p>`:''}
      ${latest.next_trigger?`<h4>What changes the call</h4><p>${esc(latest.next_trigger)}</p>`:''}
      ${latest.source_note?`<h4>Source</h4><p class="drawer-source">${esc(latest.source_note)}</p>`:''}
      ${latest.last_confirmed_date||latest.last_checked_at?`<small class="drawer-updated">Intel checked ${esc(latest.last_confirmed_date||latest.last_checked_at)}</small>`:''}
    </section>`:`<section class="drawer-section"><h3>Fantasy Intel</h3><p class="drawer-muted">No active Intel item is attached to this player yet.</p></section>`}
    ${intel.length>1?`<section class="drawer-section"><h3>Recent Intel</h3>${intel.slice(1,6).map(i=>`<article class="drawer-intel-item"><b>${esc(String(i.action||'UPDATE').toUpperCase())}</b><span>${esc(i.what_changed||i.recommendation||'')}</span></article>`).join('')}</section>`:''}
  </div>`;
}

function gameLogHtml(row,data){
  const rows=weekRows(row,data);
  if(!rows.length)return '<div class="drawer-empty">No weekly Yahoo scoring has been synced for this player yet.</div>';
  return `<div class="drawer-game-log"><div class="drawer-log-head"><span>WK</span><span>GAME</span><span>PTS</span><span>PROJ</span></div>${rows.map(r=>`<div class="drawer-log-row"><b>${esc(r.week)}</b><span>${esc([r.opponent,r.game_status].filter(Boolean).join(' · ')||'—')}</span><strong>${fmt(r.fantasy_points)}</strong><em>${fmt(r.projected_points)}</em></div>`).join('')}</div>`;
}

function statsHtml(row,data,indexes){
  const player=canonical(row,indexes),rows=weekRows(row,data),played=rows.filter(r=>r.fantasy_points!==null&&r.fantasy_points!==undefined),projs=rows.filter(r=>r.projected_points!==null&&r.projected_points!==undefined);
  const total=played.reduce((s,r)=>s+(Number(r.fantasy_points)||0),0),avg=played.length?total/played.length:0,best=played.length?played.reduce((a,b)=>(Number(b.fantasy_points)||0)>(Number(a.fantasy_points)||0)?b:a):null,projTotal=projs.reduce((s,r)=>s+(Number(r.projected_points)||0),0);
  const starts=rows.filter(r=>r.is_starter===true).length,bench=rows.filter(r=>r.is_starter===false).length;
  return `<div class="drawer-stats">
    <div class="drawer-stat-grid">
      <div><span>Fantasy points</span><b>${played.length?total.toFixed(2):'—'}</b></div>
      <div><span>Avg / game</span><b>${played.length?avg.toFixed(2):'—'}</b></div>
      <div><span>Best week</span><b>${best?`W${best.week} · ${fmt(best.fantasy_points)}`:'—'}</b></div>
      <div><span>Projection total</span><b>${projs.length?projTotal.toFixed(2):'—'}</b></div>
      <div><span>Starts synced</span><b>${starts}</b></div>
      <div><span>Bench weeks</span><b>${bench}</b></div>
      <div><span>Yahoo rank</span><b>${player?.yahoo_rank??'—'}</b></div>
      <div><span>Role</span><b>${esc(player?.role||'—')}</b></div>
    </div>
    <section class="drawer-section"><h3>Decision context</h3><p class="drawer-muted">This page summarizes the Yahoo scoring and role data currently synced for this player. The Overview tab carries the live Intel and recommendation used for weekly decisions.</p></section>
  </div>`;
}

function ensureDrawer(){
  if(document.getElementById('playerDrawer'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="playerDrawer" class="player-drawer" hidden><div class="player-drawer-shade" data-drawer-close="1"></div><section class="player-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="playerDrawerTitle"><header class="player-drawer-head"><div><h2 id="playerDrawerTitle">Player</h2><p id="playerDrawerMeta"></p></div><button type="button" class="player-drawer-close" data-drawer-close="1" aria-label="Close">×</button></header><nav class="player-drawer-tabs"><button type="button" data-drawer-tab="overview" class="active">OVERVIEW</button><button type="button" data-drawer-tab="gamelog">GAME LOG</button><button type="button" data-drawer-tab="stats">STATS</button></nav><div id="playerDrawerBody" class="player-drawer-body"></div></section></div>`);
}

function renderTab(tab,row){
  const data=getters.getData(),indexes=getters.getIndexes(),week=getters.getWeek();if(!data||!indexes)return;
  document.querySelectorAll('[data-drawer-tab]').forEach(b=>b.classList.toggle('active',b.dataset.drawerTab===tab));
  const body=document.getElementById('playerDrawerBody');
  body.innerHTML=tab==='gamelog'?gameLogHtml(row,data):tab==='stats'?statsHtml(row,data,indexes):overviewHtml(row,data,indexes,week);
  body.scrollTop=0;
}

function openDrawer(trigger){
  const data=getters.getData(),indexes=getters.getIndexes();if(!data||!indexes)return;
  const row=resolveRow(trigger,data),player=canonical(row,indexes),pool=poolRow(row,data);
  ensureDrawer();
  const drawer=document.getElementById('playerDrawer');drawer._activePlayer=row;
  document.getElementById('playerDrawerTitle').textContent=player?.yahoo_name||player?.player_name||row.yahoo_player_name||'Player';
  document.getElementById('playerDrawerMeta').textContent=[player?.position||row.position,player?.team||row.nfl_team,pool?.availability_status?availabilityLabel(pool.availability_status):''].filter(Boolean).join(' · ');
  drawer.hidden=false;document.documentElement.classList.add('drawer-open');renderTab('overview',row);
}
function closeDrawer(){const d=document.getElementById('playerDrawer');if(d)d.hidden=true;document.documentElement.classList.remove('drawer-open')}

export function installPlayerDrawer(options={}){
  getters={...getters,...options};if(installed)return;installed=true;
  const link=document.createElement('link');link.rel='stylesheet';link.href='../css/player-drawer.css';document.head.appendChild(link);ensureDrawer();
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-drawer-close]');if(close){closeDrawer();return}
    const tab=e.target.closest('[data-drawer-tab]');if(tab){const d=document.getElementById('playerDrawer');if(d?._activePlayer)renderTab(tab.dataset.drawerTab,d._activePlayer);return}
    const trigger=e.target.closest('[data-player-open]');if(trigger)openDrawer(trigger);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();if((e.key==='Enter'||e.key===' ')&&e.target.closest('[data-player-open]')){e.preventDefault();openDrawer(e.target.closest('[data-player-open]'))}});
}
