import {esc,isBenchSlot,latestIntel,playerTags,slotWeight,tagClass} from '../utils.js';

function playerCard(row,indexes){
  const intel=latestIntel(row,indexes);
  const tags=playerTags(row,indexes);
  const recommendation=intel?.recommendation||intel?.what_changed||'';
  return `<article class="player-card">
    <div class="pos-box">${esc(row.position||row.roster_slot||'—')}</div>
    <div>
      <div class="player-name">${esc(row.yahoo_player_name||'Unknown player')}</div>
      <div class="player-meta">${esc(row.nfl_team||'FA')} · ${esc(row.position||'—')} · ${esc(row.roster_slot||'ROSTER')}</div>
      ${tags.length?`<div class="tag-row">${tags.map(tag=>`<span class="tag ${tagClass(tag)}">${esc(tag)}</span>`).join('')}</div>`:''}
      ${recommendation?`<p class="intel-text">${intel?.action?`<b>${esc(intel.action)}:</b> `:''}${esc(recommendation)}</p>`:'<p class="intel-text">No current actionable Intel logged.</p>'}
    </div>
  </article>`;
}

function section(title,rows,indexes){
  return `<h3>${esc(title)} · ${rows.length}</h3><div class="roster-grid">${rows.length?rows.map(r=>playerCard(r,indexes)).join(''):'<div class="empty">No players in this section.</div>'}</div>`;
}

export function renderTeam({team,rows,indexes,query=''}){
  const q=query.trim().toLowerCase();
  const filtered=[...rows].filter(row=>!q||[row.yahoo_player_name,row.nfl_team,row.position,row.roster_slot,...playerTags(row,indexes),latestIntel(row,indexes)?.recommendation].join(' ').toLowerCase().includes(q)).sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
  const starters=filtered.filter(row=>!isBenchSlot(row.roster_slot));
  const bench=filtered.filter(row=>isBenchSlot(row.roster_slot));
  document.getElementById('teamMeta').textContent=team?`${rows.length} rostered · ${rows.filter(r=>!isBenchSlot(r.roster_slot)).length} starters · ${rows.filter(r=>isBenchSlot(r.roster_slot)).length} bench/IR`:'Choose your Yahoo team to load your roster.';
  document.getElementById('startersSection').innerHTML=team?section('STARTERS',starters,indexes):'<div class="empty">Choose your team above.</div>';
  document.getElementById('benchSection').innerHTML=team?section('BENCH / IR',bench,indexes):'';
}
