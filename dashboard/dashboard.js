(() => {
  'use strict';
  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const H={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const state={identity:null,teams:[],rosters:[],matchups:[],tags:new Map(),intel:new Map(),q:'',week:1};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const myTeamKey=()=>String(state.identity?.teamId||'');
  const isMine=team=>String(team?.yahoo_team_key||'')===myTeamKey();

  async function api(path){
    const r=await fetch(`${SB}/rest/v1/${path}`,{headers:H,cache:'no-store'});
    if(!r.ok)throw new Error(await r.text()||String(r.status));
    return r.json();
  }

  async function loadIdentity(){
    const key=`fantasyIdentity:${LEAGUE}`;
    const data=await chrome.storage.local.get([key,'fantasyLeagueIdentity']);
    state.identity=data[key]||data.fantasyLeagueIdentity||null;
    $('identityLabel').textContent=state.identity?.teamId
      ? `${state.identity.teamName||`Yahoo Team ${state.identity.teamId}`} · Team ${state.identity.teamId}`
      : 'Your team has not been detected yet';
    return state.identity;
  }

  function showDashboardNotice(message,type=''){
    const el=$('dashboardNotice');
    el.textContent=message;
    el.className=`notice ${type}`.trim();
    el.hidden=!message;
  }

  async function load(){
    await loadIdentity();
    setSync('loading','LOADING');
    $('teams').innerHTML='<div class="loading">Loading league ownership…</div>';
    $('matchups').innerHTML='<div class="empty-schedule">Loading season schedule…</div>';
    try{
      const [teams,rosters,matchups,tags,intel]=await Promise.all([
        api(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true&order=yahoo_team_key.asc`),
        api('fantasy_league_rosters?select=*&active=eq.true&order=roster_slot.asc,yahoo_player_name.asc'),
        api(`fantasy_league_matchups?select=*&league_key=eq.${LEAGUE_KEY}&order=week.asc,matchup_key.asc`),
        api('planner_player_tags?select=player_key,tags,reason,last_confirmed_date'),
        api('intel_items?select=player_name,action,priority,recommendation,last_confirmed_date,updated_at&resolved_at=is.null&transfer_to_live=eq.true&order=updated_at.desc')
      ]);
      state.teams=teams||[];state.rosters=rosters||[];state.matchups=matchups||[];
      state.tags=new Map((tags||[]).map(x=>[norm(x.player_key),x]));
      state.intel=new Map();
      for(const item of intel||[]){const k=norm(item.player_name);if(k&&!state.intel.has(k))state.intel.set(k,item)}
      renderWeekPicker();renderSchedule();renderRosters();
      const last=[...state.teams.map(t=>t.last_synced_at),...state.matchups.map(m=>m.last_synced_at)].filter(Boolean).sort().at(-1)||null;
      setSync('live',state.rosters.length?'SYNCED':'WAITING',last);
      $('notice').hidden=state.rosters.length>0;
      if(!state.rosters.length)$('notice').textContent='Open Yahoo and run SYNC YAHOO to load current rosters.';
      if(!state.identity?.teamId)showDashboardNotice('Open your own Yahoo team page once so the extension can identify which team belongs to you.','error');
      else showDashboardNotice('');
    }catch(error){
      console.error(error);setSync('error','ERROR');$('teams').innerHTML='<div class="loading">League data could not load.</div>';
      $('matchups').innerHTML='<div class="empty-schedule">Schedule could not load.</div>';
      $('notice').hidden=false;$('notice').textContent=error.message;
    }
  }

  function setSync(mode,label,time=null){
    $('syncDot').className=mode==='live'?'live':mode==='error'?'error':'';
    $('syncLabel').textContent=label;
    $('syncTime').textContent=time?`Last sync ${new Date(time).toLocaleString()}`:'';
  }

  function rosterFor(team){return state.rosters.filter(r=>r.league_team_id===team.id)}
  function rowMatches(team,row){
    if(!state.q)return true;
    return [team.team_name,team.manager_name,row.yahoo_player_name,row.nfl_team,row.position,row.roster_slot].join(' ').toLowerCase().includes(state.q);
  }
  function teamMatches(team,rows){
    if(!state.q)return true;
    if([team.team_name,team.manager_name,team.yahoo_team_key].join(' ').toLowerCase().includes(state.q))return true;
    return rows.some(r=>rowMatches(team,r));
  }
  function slotWeight(slot){
    const map={QB:1,RB:2,WR:3,TE:4,'W/R/T':5,'W/R':5,'Q/W/R/T':5,K:6,DEF:7,BN:8,IR:9,'IR+':9,NA:10};
    return map[String(slot||'').toUpperCase()]||20;
  }

  function renderWeekPicker(){
    const buttons=[`<button data-week="all" class="${state.week==='all'?'active':''}">ALL WEEKS</button>`];
    for(let w=1;w<=18;w++)buttons.push(`<button data-week="${w}" class="${state.week===w?'active':''}">W${w}</button>`);
    $('weekPicker').innerHTML=buttons.join('');
    $('weekPicker').querySelectorAll('button').forEach(btn=>btn.onclick=()=>{state.week=btn.dataset.week==='all'?'all':Number(btn.dataset.week);renderWeekPicker();renderSchedule()});
  }

  function renderSchedule(){
    $('matchupCount').textContent=state.matchups.length;
    const weeks=state.week==='all'?[...new Set(state.matchups.map(m=>m.week))].sort((a,b)=>a-b):[state.week];
    if(!state.matchups.length){$('matchups').innerHTML='<div class="empty-schedule">Rosters are synced, but the weekly matchup schedule has not been imported yet. Open Yahoo and run SYNC YAHOO.</div>';return}
    const html=[];
    for(const week of weeks){
      const rows=state.matchups.filter(m=>Number(m.week)===Number(week));
      if(!rows.length){html.push(`<section class="week-block"><h3>Week ${week}</h3><div class="empty-schedule">No matchup data saved for Week ${week} yet.</div></section>`);continue}
      html.push(`<section class="week-block"><h3>Week ${week} · ${rows.length} matchups</h3><div class="matchup-grid">${rows.map(matchupCard).join('')}</div></section>`);
    }
    $('matchups').innerHTML=html.join('');
  }

  function scoreText(points,projected){
    if(points!==null&&points!==undefined&&Number(points)!==0)return Number(points).toFixed(2);
    if(projected!==null&&projected!==undefined)return `Proj ${Number(projected).toFixed(2)}`;
    return '';
  }
  function matchupCard(m){
    const mine=String(m.team_a_yahoo_key)===myTeamKey()||String(m.team_b_yahoo_key)===myTeamKey();
    const aMine=String(m.team_a_yahoo_key)===myTeamKey(),bMine=String(m.team_b_yahoo_key)===myTeamKey();
    return `<article class="matchup-card ${mine?'mine':''}">
      <div class="matchup-team ${aMine?'you':''}"><span>${esc(m.team_a_name)}${aMine?' · YOU':''}</span><span class="matchup-score">${esc(scoreText(m.team_a_points,m.team_a_projected))}</span></div>
      <div class="vs">VS</div>
      <div class="matchup-team ${bMine?'you':''}"><span>${esc(m.team_b_name)}${bMine?' · YOU':''}</span><span class="matchup-score">${esc(scoreText(m.team_b_points,m.team_b_projected))}</span></div>
      ${m.status?`<div class="matchup-meta">${esc(m.status)}</div>`:''}
    </article>`;
  }

  function renderRosters(){
    const all=state.rosters;
    $('teamCount').textContent=state.teams.length;
    $('rosterCount').textContent=all.length;
    $('matchedCount').textContent=all.filter(x=>x.player_key).length;
    $('unmatchedCount').textContent=all.filter(x=>!x.player_key).length;
    const cards=[];
    const ordered=[...state.teams].sort((a,b)=>(Number(isMine(b))-Number(isMine(a)))||Number(a.yahoo_team_key||99)-Number(b.yahoo_team_key||99));
    for(const team of ordered){
      let rows=rosterFor(team).sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
      if(!teamMatches(team,rows))continue;
      if(state.q)rows=rows.filter(r=>rowMatches(team,r)||[team.team_name,team.manager_name].join(' ').toLowerCase().includes(state.q));
      cards.push(teamCard(team,rows));
    }
    $('teams').innerHTML=cards.join('')||'<div class="loading">No teams or players match your search.</div>';
  }

  function teamCard(team,rows){
    const originalCount=rosterFor(team).length;
    const manager=team.manager_name?` · ${esc(team.manager_name)}`:'';
    const synced=team.last_synced_at?new Date(team.last_synced_at).toLocaleDateString():'';
    const mine=isMine(team);
    return `<section class="team-card ${mine?'my-team':''}">
      <header class="team-head">
        <div class="team-title"><h2>${esc(team.team_name)}</h2><p>Yahoo Team ${esc(team.yahoo_team_key||'—')}${manager}${synced?` · synced ${esc(synced)}`:''}</p></div>
        <div class="team-badges">${mine?'<span class="badge mine">YOUR TEAM</span>':''}<span class="team-count">${originalCount}</span></div>
      </header>
      <div class="roster">${rows.map(playerRow).join('')||'<div class="empty">No roster synced yet.</div>'}</div>
    </section>`;
  }

  function playerRow(row){
    const key=norm(row.player_key||row.yahoo_player_name);
    const tag=state.tags.get(key);
    const intel=state.intel.get(norm(row.yahoo_player_name));
    const tags=(tag?.tags||[]).slice(0,2);
    const action=intel?.action?String(intel.action).toLowerCase():'';
    return `<div class="player-row">
      <span class="slot">${esc(row.roster_slot||'—')}</span>
      <div class="player-main"><div class="player-name">${esc(row.yahoo_player_name)}</div><div class="player-meta">${esc(row.position||'—')} · ${esc(row.nfl_team||'—')}</div></div>
      <div class="player-right">${intel?.action?`<span class="intel ${esc(action)}">${esc(intel.action)}</span>`:''}${tags.map(t=>`<span class="intel">${esc(t)}</span>`).join('')}${!row.player_key?'<span class="unmatched">UNMATCHED</span>':''}</div>
    </div>`;
  }

  async function findYahooTab(){
    const tabs=await chrome.tabs.query({url:'https://football.fantasysports.yahoo.com/*'});
    return tabs.find(t=>(t.url||'').includes(`/f1/${LEAGUE}`))||null;
  }

  async function syncYahoo(){
    const button=$('syncButton');button.disabled=true;button.textContent='SYNCING…';showDashboardNotice('Syncing directly from your open Yahoo league tab…');
    try{
      let tab=await findYahooTab();
      if(!tab){
        const team=state.identity?.teamId||'';
        const url=team?`https://football.fantasysports.yahoo.com/f1/${LEAGUE}/${team}`:`https://football.fantasysports.yahoo.com/f1/${LEAGUE}`;
        await chrome.tabs.create({url});
        showDashboardNotice('Yahoo was not open. I opened it for you. When that page finishes loading, come back here and press SYNC YAHOO again.','error');
        return;
      }
      const response=await chrome.tabs.sendMessage(tab.id,{type:'SYNC_LEAGUE'});
      if(!response?.ok)throw new Error(response?.error||response?.diagnostics?.[0]?.message||'Yahoo sync failed.');
      if(response.result?.myTeamKey){
        state.identity={leagueId:LEAGUE,teamId:String(response.result.myTeamKey),teamName:response.result.myTeamName||`Yahoo Team ${response.result.myTeamKey}`};
        await chrome.storage.local.set({fantasyLeagueIdentity:state.identity,[`fantasyIdentity:${LEAGUE}`]:state.identity});
      }
      showDashboardNotice(`Sync complete: ${response.result.teams} teams, ${response.result.players} roster spots and ${response.result.matchups||0} matchups saved.`,'success');
      await load();
    }catch(error){
      showDashboardNotice(`SYNC ERROR: ${error.message}`,'error');
      setSync('error','ERROR');
    }finally{button.disabled=false;button.textContent='SYNC YAHOO'}
  }

  $('search').addEventListener('input',e=>{state.q=e.target.value.trim().toLowerCase();renderRosters()});
  $('refreshButton').addEventListener('click',load);
  $('syncButton').addEventListener('click',syncYahoo);
  $('openYahooButton').addEventListener('click',async()=>{await loadIdentity();const team=state.identity?.teamId||'';const url=team?`https://football.fantasysports.yahoo.com/f1/${LEAGUE}/${team}`:`https://football.fantasysports.yahoo.com/f1/${LEAGUE}`;chrome.tabs.create({url})});
  $('themeButton').addEventListener('click',()=>{
    document.documentElement.classList.toggle('light');
    $('themeButton').textContent=document.documentElement.classList.contains('light')?'🌙':'☀️';
    localStorage.setItem('fantasyLeagueTheme',document.documentElement.classList.contains('light')?'light':'dark');
  });
  if(localStorage.getItem('fantasyLeagueTheme')==='light'){document.documentElement.classList.add('light');$('themeButton').textContent='🌙'}
  load();
})();
