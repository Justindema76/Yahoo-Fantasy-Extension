import {esc,latestIntel,slotWeight,tagClass} from '../utils.js';

function playerRow(row,indexes){
  const intel=latestIntel(row,indexes);
  return `<div class="league-player">
    <span class="slot">${esc(row.roster_slot||'—')}</span>
    <div><b>${esc(row.yahoo_player_name||'Unknown')}</b><small>${esc(row.position||'—')} · ${esc(row.nfl_team||'—')}</small></div>
    <div>${intel?.action?`<span class="tag ${tagClass(intel.action)}">${esc(intel.action)}</span>`:''}${!row.player_key?'<span class="unmatched">UNMATCHED</span>':''}</div>
  </div>`;
}

export function renderLeague({teams,rosters,indexes,myTeamKey,query=''}){
  const q=query.trim().toLowerCase();
  const root=document.getElementById('leagueTeams');
  const ordered=[...teams].sort((a,b)=>(String(b.yahoo_team_key)===String(myTeamKey))-(String(a.yahoo_team_key)===String(myTeamKey))||Number(a.yahoo_team_key||99)-Number(b.yahoo_team_key||99));
  const cards=[];
  for(const team of ordered){
    const original=rosters.filter(r=>r.league_team_id===team.id).sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
    const rows=q?original.filter(row=>[team.team_name,team.manager_name,row.yahoo_player_name,row.position,row.nfl_team,row.roster_slot,latestIntel(row,indexes)?.action].join(' ').toLowerCase().includes(q)):original;
    if(q&&!rows.length&&![team.team_name,team.manager_name].join(' ').toLowerCase().includes(q))continue;
    const mine=String(team.yahoo_team_key)===String(myTeamKey||'');
    cards.push(`<section class="team-card ${mine?'mine':''}">
      <header class="team-head"><div><h3>${esc(team.team_name)}${mine?' · YOUR TEAM':''}</h3><p>Yahoo Team ${esc(team.yahoo_team_key||'—')}${team.manager_name?` · ${esc(team.manager_name)}`:''}</p></div><span class="team-count">${original.length}</span></header>
      <div class="league-roster">${(rows.length?rows:original).map(row=>playerRow(row,indexes)).join('')||'<div class="empty">No roster synced.</div>'}</div>
    </section>`);
  }
  root.innerHTML=cards.join('')||'<div class="empty">No teams or players match your search.</div>';
}
