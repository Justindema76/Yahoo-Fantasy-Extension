import {esc} from '../utils.js';

function score(points,projected){
  if(points!==null&&points!==undefined&&Number(points)!==0)return Number(points).toFixed(2);
  if(projected!==null&&projected!==undefined)return `Proj ${Number(projected).toFixed(2)}`;
  return '';
}

function card(matchup,myTeamKey){
  const aMine=String(matchup.team_a_yahoo_key||'')===String(myTeamKey||'');
  const bMine=String(matchup.team_b_yahoo_key||'')===String(myTeamKey||'');
  const mine=aMine||bMine;
  return `<article class="matchup-card ${mine?'mine':''}">
    <div class="matchup-team ${aMine?'you':''}"><span>${esc(matchup.team_a_name)}${aMine?' · YOU':''}</span><span class="score">${esc(score(matchup.team_a_points,matchup.team_a_projected))}</span></div>
    <div class="vs">VS</div>
    <div class="matchup-team ${bMine?'you':''}"><span>${esc(matchup.team_b_name)}${bMine?' · YOU':''}</span><span class="score">${esc(score(matchup.team_b_points,matchup.team_b_projected))}</span></div>
    ${matchup.status?`<div class="matchup-meta">${esc(matchup.status)}</div>`:''}
  </article>`;
}

export function renderWeekPicker(currentWeek,onChange){
  const root=document.getElementById('weekPicker');
  root.innerHTML=[`<button data-week="all" class="${currentWeek==='all'?'active':''}">ALL</button>`,...Array.from({length:18},(_,i)=>{const week=i+1;return `<button data-week="${week}" class="${currentWeek===week?'active':''}">W${week}</button>`})].join('');
  root.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>onChange(button.dataset.week==='all'?'all':Number(button.dataset.week))));
}

export function renderMatchups({matchups,myTeamKey,currentWeek}){
  const mine=matchups.filter(m=>String(m.team_a_yahoo_key)===String(myTeamKey||'')||String(m.team_b_yahoo_key)===String(myTeamKey||''));
  const selectedMine=currentWeek==='all'?mine:mine.filter(m=>Number(m.week)===Number(currentWeek));
  const mineRoot=document.getElementById('myMatchup');
  if(!myTeamKey)mineRoot.innerHTML='<div class="empty">Choose your team to highlight your matchups.</div>';
  else if(!selectedMine.length)mineRoot.innerHTML='<div class="empty">No matchup saved for your team in this view.</div>';
  else mineRoot.innerHTML=selectedMine.map(m=>{
    const opponent=String(m.team_a_yahoo_key)===String(myTeamKey)?m.team_b_name:m.team_a_name;
    return `<article class="my-matchup-card"><small>${currentWeek==='all'?`WEEK ${m.week}`:'YOUR MATCHUP'}</small><h3>vs ${esc(opponent)}</h3>${card(m,myTeamKey)}</article>`;
  }).join('');

  const weeks=currentWeek==='all'?[...new Set(matchups.map(m=>Number(m.week)))].sort((a,b)=>a-b):[currentWeek];
  const root=document.getElementById('matchups');
  if(!matchups.length){root.innerHTML='<div class="empty">No schedule has been synced yet.</div>';return}
  root.innerHTML=weeks.map(week=>{
    const rows=matchups.filter(m=>Number(m.week)===Number(week));
    return `<section class="week-block"><h3>Week ${week} · ${rows.length} matchups</h3><div class="matchup-grid">${rows.length?rows.map(m=>card(m,myTeamKey)).join(''):'<div class="empty">No matchups saved.</div>'}</div></section>`;
  }).join('');
}
