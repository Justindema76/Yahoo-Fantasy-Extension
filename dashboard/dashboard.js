(() => {
  'use strict';

  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const H={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const ACTION_TAGS=new Set(['START','SIT','ADD','DROP','UPGRADE','DOWNGRADE','AVOID','HANDCUFF','STACK','DEFENSE','KICKER']);
  const state={
    identity:null,teams:[],rosters:[],matchups:[],catalog:[],planner:[],intel:[],players:[],
    intelByName:new Map(),plannerByKey:new Map(),view:'team',filter:'all',teamQuery:'',leagueQuery:'',week:1
  };

  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>window.FantasyPlayers?FantasyPlayers.normName(v):String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
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
    const name=state.identity?.teamName||'Your Team';
    $('teamTitle').textContent=name;
    $('identityLabel').textContent=state.identity?.teamId?`${name} · Yahoo Team ${state.identity.teamId}`:'Your team has not been detected yet';
    return state.identity;
  }

  function showDashboardNotice(message,type=''){
    const el=$('dashboardNotice');
    el.textContent=message||'';
    el.className=`notice ${type}`.trim();
    el.hidden=!message;
  }

  function setSync(mode,label,time=null){
    $('syncDot').className=mode==='live'?'live':mode==='error'?'error':'';
    $('syncLabel').textContent=label;
    $('syncTime').textContent=time?`Updated ${new Date(time).toLocaleString()}`:'';
  }

  function slotWeight(slot){
    const map={QB:1,RB:2,WR:3,TE:4,'W/R/T':5,'W/R':5,'Q/W/R/T':5,K:6,DEF:7,BN:8,IR:9,'IR+':9,NA:10};
    return map[String(slot||'').toUpperCase()]||20;
  }

  function rosterFor(team){return state.rosters.filter(r=>r.league_team_id===team?.id)}
  function myTeam(){return state.teams.find(isMine)||null}

  function normalizedRoster(rows){
    return [...rows]
      .sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)))
      .map((row,index)=>({
        player_key:row.player_key||row.yahoo_player_name,
        player_name:row.yahoo_player_name,
        team:row.nfl_team,
        position:row.position,
        roster_slot:row.roster_slot,
        lineup_group:['BN','IR','IR+','NA'].includes(String(row.roster_slot||'').toUpperCase())?'BENCH':'STARTER',
        display_order:index+1
      }));
  }

  function buildMyPlayers(){
    const team=myTeam();
    if(!team){state.players=[];return}
    const roster=normalizedRoster(rosterFor(team));
    state.players=FantasyPlayers.build({
      catalog:state.catalog,
      targets:[],
      planner:state.planner,
      intel:state.intel,
      suggestions:[],
      roster,
      intelApi:FantasyIntel
    }).filter(p=>p.is_rostered).sort((a,b)=>{
      const ao=Number(a.roster_display_order)||999,bo=Number(b.roster_display_order)||999;
      return ao-bo||String(a.yahoo_name||a.display_name).localeCompare(String(b.yahoo_name||b.display_name));
    });
  }

  async function load(){
    await loadIdentity();
    setSync('loading','LOADING');
    if(!$('myTeamIntel').children.length)$('myTeamIntel').innerHTML='<div class="empty-state">Loading your roster and Intel…</div>';
    try{
      const intelResult=FantasyIntel.safeLoad(api);
      const [teams,rosters,matchups,catalog,planner,intelLoad]=await Promise.all([
        api(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true&order=yahoo_team_key.asc`),
        api('fantasy_league_rosters?select=*&active=eq.true&order=roster_slot.asc,yahoo_player_name.asc'),
        api(`fantasy_league_matchups?select=*&league_key=eq.${LEAGUE_KEY}&order=week.asc,matchup_key.asc`),
        api('draft_player_catalog?select=player_key,yahoo_name,display_name,team,position,yahoo_rank,active'),
        api('planner_player_tags?select=player_key,player_name,tags,reason,last_confirmed_date,updated_at'),
        intelResult
      ]);
      state.teams=teams||[];state.rosters=rosters||[];state.matchups=matchups||[];state.catalog=catalog||[];state.planner=planner||[];state.intel=intelLoad.data||[];
      state.intelByName=FantasyIntel.groupByName(state.intel,norm);
      state.plannerByKey=new Map(state.planner.map(p=>[norm(p.player_key||p.player_name),p]));
      buildMyPlayers();
      renderAll();
      const last=[...state.teams.map(t=>t.last_synced_at),...state.rosters.map(r=>r.last_synced_at),...state.intel.map(i=>i.updated_at||i.last_checked_at)].filter(Boolean).sort().at(-1)||null;
      setSync('live','LIVE INTEL',last);
      if(!state.identity?.teamId)showDashboardNotice('Open your own Yahoo team page once so the extension knows which roster is yours.','error');
      else if(!myTeam())showDashboardNotice(`Yahoo Team ${state.identity.teamId} is not matched to a synced league team yet. Run SYNC YAHOO.`, 'error');
      else showDashboardNotice('');
    }catch(error){
      console.error(error);
      setSync('error','ERROR');
      showDashboardNotice(`DATA ERROR: ${error.message}`,'error');
      $('myTeamIntel').innerHTML='<div class="empty-state">Fantasy Intel data could not load.</div>';
    }
  }

  function renderAll(){
    renderSummary();
    renderMyTeam();
    renderWeekPicker();
    renderMatchups();
    renderLeague();
  }

  function playerIsInjury(player){return FantasyIntel.isInjuryPlayer(player)||FantasyPlayers.allTags(player).includes('INJURY')}
  function playerNeedsAction(player){return FantasyPlayers.allTags(player).some(t=>ACTION_TAGS.has(t))}
  function playerIsMonitor(player){return FantasyPlayers.allTags(player).includes('MONITOR')}

  function renderSummary(){
    const intelCount=state.players.reduce((n,p)=>n+(p.intel_items||[]).length,0);
    $('myRosterCount').textContent=state.players.length;
    $('myIntelCount').textContent=intelCount;
    $('myActionCount').textContent=state.players.filter(playerNeedsAction).length;
    $('myInjuryCount').textContent=state.players.filter(playerIsInjury).length;
    $('teamCount').textContent=state.teams.length;
    $('rosterCount').textContent=state.rosters.length;
    $('matchedCount').textContent=state.rosters.filter(r=>r.player_key).length;
    $('unmatchedCount').textContent=state.rosters.filter(r=>!r.player_key).length;
  }

  function playerMatchesFilter(player){
    if(state.filter==='action'&&!playerNeedsAction(player))return false;
    if(state.filter==='injury'&&!playerIsInjury(player))return false;
    if(state.filter==='monitor'&&!playerIsMonitor(player))return false;
    if(!state.teamQuery)return true;
    const q=state.teamQuery;
    const hay=[player.yahoo_name,player.display_name,player.team,player.position,player.roster_slot,player.planner_reason,...FantasyPlayers.allTags(player)].join(' ').toLowerCase();
    return hay.includes(q)||FantasyIntel.matchesSearch(player.intel_items||[],q);
  }

  function tagClass(tag){return String(tag||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-')}

  function playerTags(player){
    const latest=FantasyIntel.latest(player.intel_items||[]);
    return FantasyPlayers.uniq([
      latest?.action,
      ...(player.planner_tags||[]),
      ...FantasyIntel.tagsFromItems(player.intel_items||[])
    ]).slice(0,6);
  }

  function sourceHtml(note){
    const value=String(note||'').trim();
    if(!value)return '';
    const safe=esc(value).replace(/(https?:\/\/[^\s;&]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return `<div class="intel-source"><b>SOURCE:</b> ${safe}</div>`;
  }

  function checkedHtml(item){
    const stamp=item?.last_checked_at||item?.updated_at||item?.last_confirmed_date;
    if(!stamp)return '';
    const d=new Date(stamp);
    return Number.isNaN(d.getTime())?'':`<small class="checked">Checked ${esc(d.toLocaleString())}</small>`;
  }

  function intelItemHtml(item){
    return `<div class="intel-item">
      <div class="intel-item-top"><span class="intel-action">${esc(item.action||'MONITOR')}</span><span class="intel-priority">${esc(item.priority||'')}</span></div>
      ${item.what_changed?`<p class="what-changed">${esc(item.what_changed)}</p>`:''}
      ${item.recommendation?`<p class="what-to-do"><b>WHAT TO DO:</b> ${esc(item.recommendation)}</p>`:''}
      ${item.next_trigger?`<p class="what-changed"><b>NEXT TRIGGER:</b> ${esc(item.next_trigger)}</p>`:''}
      ${sourceHtml(item.source_note)}
      ${checkedHtml(item)}
    </div>`;
  }

  function playerCard(player){
    const items=FantasyIntel.sort(player.intel_items||[]);
    const newest=items[0]||null;
    const older=items.slice(1);
    const tags=playerTags(player);
    const injury=playerIsInjury(player);
    const action=playerNeedsAction(player);
    const name=player.yahoo_name||player.display_name||player.player_key;
    const plan=state.plannerByKey.get(norm(player.player_key||name));
    return `<article class="intel-card ${injury?'injury-card':''} ${action?'action-card':''}">
      <header class="intel-card-head">
        <div class="position-box">${esc(player.position||'—')}</div>
        <div class="player-title"><h3>${esc(name)}</h3><p>${esc(player.position||'—')} · ${esc(player.team||'FA')}</p></div>
        <span class="slot-badge">${esc(player.roster_slot||'ROSTER')}</span>
      </header>
      ${tags.length?`<div class="tag-strip">${tags.map(t=>`<span class="tag ${tagClass(t)}">${esc(t)}</span>`).join('')}</div>`:''}
      ${items.length?`<div class="intel-body">${intelItemHtml(newest)}${older.length?`<details class="more-intel"><summary>${older.length} MORE INTEL ${older.length===1?'ITEM':'ITEMS'}</summary>${older.map(intelItemHtml).join('')}</details>`:''}</div>`:`<div class="no-intel">${esc(plan?.reason||player.planner_reason||'No material Intel change is currently logged for this player.')}</div>`}
    </article>`;
  }

  function renderMyTeam(){
    const players=state.players.filter(playerMatchesFilter);
    const totalIntel=state.players.reduce((n,p)=>n+(p.intel_items||[]).length,0);
    $('teamMeta').textContent=`${state.players.length} roster players · ${totalIntel} current Intel items · newest information grouped by player`;
    $('myTeamIntel').innerHTML=players.map(playerCard).join('')||'<div class="empty-state">No players match this Intel filter.</div>';
  }

  function renderWeekPicker(){
    const buttons=[`<button data-week="all" class="${state.week==='all'?'active':''}">ALL WEEKS</button>`];
    for(let w=1;w<=18;w++)buttons.push(`<button data-week="${w}" class="${state.week===w?'active':''}">W${w}</button>`);
    $('weekPicker').innerHTML=buttons.join('');
    $('weekPicker').querySelectorAll('button').forEach(btn=>btn.onclick=()=>{
      state.week=btn.dataset.week==='all'?'all':Number(btn.dataset.week);
      renderWeekPicker();renderMatchups();
    });
  }

  function scoreText(points,projected){
    if(points!==null&&points!==undefined&&Number(points)!==0)return Number(points).toFixed(2);
    if(projected!==null&&projected!==undefined)return `Proj ${Number(projected).toFixed(2)}`;
    return '';
  }

  function matchupCard(m){
    const aMine=String(m.team_a_yahoo_key)===myTeamKey(),bMine=String(m.team_b_yahoo_key)===myTeamKey(),mine=aMine||bMine;
    return `<article class="matchup-card ${mine?'mine':''}">
      <div class="matchup-team ${aMine?'you':''}"><span>${esc(m.team_a_name)}${aMine?' · YOU':''}</span><span class="matchup-score">${esc(scoreText(m.team_a_points,m.team_a_projected))}</span></div>
      <div class="vs">VS</div>
      <div class="matchup-team ${bMine?'you':''}"><span>${esc(m.team_b_name)}${bMine?' · YOU':''}</span><span class="matchup-score">${esc(scoreText(m.team_b_points,m.team_b_projected))}</span></div>
      ${m.status?`<div class="matchup-meta">${esc(m.status)}</div>`:''}
    </article>`;
  }

  function renderMySchedule(){
    const rows=state.matchups.filter(m=>String(m.team_a_yahoo_key)===myTeamKey()||String(m.team_b_yahoo_key)===myTeamKey());
    const selected=state.week==='all'?rows:rows.filter(m=>Number(m.week)===Number(state.week));
    if(!selected.length){$('mySchedule').innerHTML='<div class="empty-schedule">No matchup saved for your team in this view yet.</div>';return}
    $('mySchedule').innerHTML=selected.map(m=>{
      const opponent=String(m.team_a_yahoo_key)===myTeamKey()?m.team_b_name:m.team_a_name;
      return `<article class="my-matchup-card"><span class="label">${state.week==='all'?`WEEK ${m.week}`:'YOUR MATCHUP'}</span><h3>${esc(state.identity?.teamName||'Your Team')} vs ${esc(opponent)}</h3>${matchupCard(m)}</article>`;
    }).join('');
  }

  function renderMatchups(){
    renderMySchedule();
    if(!state.matchups.length){$('matchups').innerHTML='<div class="empty-schedule">No weekly matchup schedule is saved yet. Run SYNC YAHOO.</div>';return}
    const weeks=state.week==='all'?[...new Set(state.matchups.map(m=>Number(m.week)))].sort((a,b)=>a-b):[state.week];
    $('matchups').innerHTML=weeks.map(week=>{
      const rows=state.matchups.filter(m=>Number(m.week)===Number(week));
      return `<section class="week-block"><h3>Week ${week} · ${rows.length} matchups</h3><div class="matchup-grid">${rows.map(matchupCard).join('')}</div></section>`;
    }).join('');
  }

  function latestIntelForRow(row){return FantasyIntel.latest(state.intelByName.get(norm(row.yahoo_player_name))||[])}

  function leagueRowMatches(team,row){
    if(!state.leagueQuery)return true;
    const intel=latestIntelForRow(row);
    return [team.team_name,team.manager_name,row.yahoo_player_name,row.nfl_team,row.position,row.roster_slot,intel?.action,intel?.recommendation].join(' ').toLowerCase().includes(state.leagueQuery);
  }

  function leaguePlayerRow(row){
    const intel=latestIntelForRow(row);
    const action=intel?.action||'';
    return `<div class="player-row"><span class="slot">${esc(row.roster_slot||'—')}</span><div class="player-main"><div class="player-name">${esc(row.yahoo_player_name)}</div><div class="player-meta">${esc(row.position||'—')} · ${esc(row.nfl_team||'—')}</div></div><div class="player-right">${action?`<span class="mini-tag ${tagClass(action)}">${esc(action)}</span>`:''}${!row.player_key?'<span class="unmatched">UNMATCHED</span>':''}</div></div>`;
  }

  function leagueTeamCard(team,rows){
    const mine=isMine(team),count=rosterFor(team).length;
    const synced=team.last_synced_at?new Date(team.last_synced_at).toLocaleDateString():'';
    return `<section class="team-card ${mine?'my-team':''}"><header class="team-head"><div class="team-title"><h3>${esc(team.team_name)}${mine?' · YOUR TEAM':''}</h3><p>Yahoo Team ${esc(team.yahoo_team_key||'—')}${synced?` · synced ${esc(synced)}`:''}</p></div><span class="team-count">${count}</span></header><div class="roster">${rows.map(leaguePlayerRow).join('')||'<div class="no-intel">No matching players.</div>'}</div></section>`;
  }

  function renderLeague(){
    const ordered=[...state.teams].sort((a,b)=>(Number(isMine(b))-Number(isMine(a)))||Number(a.yahoo_team_key||99)-Number(b.yahoo_team_key||99));
    const cards=[];
    for(const team of ordered){
      const original=rosterFor(team).sort((a,b)=>slotWeight(a.roster_slot)-slotWeight(b.roster_slot)||String(a.yahoo_player_name).localeCompare(String(b.yahoo_player_name)));
      const rows=state.leagueQuery?original.filter(r=>leagueRowMatches(team,r)):original;
      const teamText=[team.team_name,team.manager_name].join(' ').toLowerCase();
      if(state.leagueQuery&&!rows.length&&!teamText.includes(state.leagueQuery))continue;
      cards.push(leagueTeamCard(team,rows.length?rows:original));
    }
    $('teams').innerHTML=cards.join('')||'<div class="empty-state">No league roster matches your search.</div>';
    $('notice').hidden=state.rosters.length>0;
    if(!state.rosters.length)$('notice').textContent='Run SYNC YAHOO to populate league rosters.';
  }

  function setView(view){
    state.view=view;
    document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`${view}View`));
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    localStorage.setItem('fantasyIntelView',view);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  async function findYahooTab(){
    const tabs=await chrome.tabs.query({url:'https://football.fantasysports.yahoo.com/*'});
    return tabs.find(t=>(t.url||'').includes(`/f1/${LEAGUE}`))||null;
  }

  async function syncYahoo(){
    const button=$('syncButton');button.disabled=true;button.textContent='SYNCING…';showDashboardNotice('Syncing your Yahoo league now…');
    try{
      let tab=await findYahooTab();
      if(!tab){
        const team=state.identity?.teamId||'';
        const url=team?`https://football.fantasysports.yahoo.com/f1/${LEAGUE}/${team}`:`https://football.fantasysports.yahoo.com/f1/${LEAGUE}`;
        await chrome.tabs.create({url});
        showDashboardNotice('Yahoo was not open, so I opened it. Once it loads, come back and press SYNC YAHOO again.','error');
        return;
      }
      const response=await chrome.tabs.sendMessage(tab.id,{type:'SYNC_LEAGUE'});
      if(!response?.ok)throw new Error(response?.error||response?.diagnostics?.[0]?.message||'Yahoo sync failed.');
      if(response.result?.myTeamKey){
        state.identity={leagueId:LEAGUE,teamId:String(response.result.myTeamKey),teamName:response.result.myTeamName||`Yahoo Team ${response.result.myTeamKey}`};
        await chrome.storage.local.set({fantasyLeagueIdentity:state.identity,[`fantasyIdentity:${LEAGUE}`]:state.identity});
      }
      showDashboardNotice(`Yahoo sync complete: ${response.result.teams} teams · ${response.result.players} roster spots · ${response.result.matchups||0} matchups.`,'success');
      await load();
    }catch(error){
      showDashboardNotice(`SYNC ERROR: ${error.message}`,'error');setSync('error','ERROR');
    }finally{button.disabled=false;button.textContent='SYNC YAHOO'}
  }

  document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.view)));
  $('intelFilters').querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{
    state.filter=btn.dataset.filter;
    $('intelFilters').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
    renderMyTeam();
  }));
  $('teamSearch').addEventListener('input',e=>{state.teamQuery=e.target.value.trim().toLowerCase();renderMyTeam()});
  $('leagueSearch').addEventListener('input',e=>{state.leagueQuery=e.target.value.trim().toLowerCase();renderLeague()});
  $('refreshButton').addEventListener('click',load);
  $('syncButton').addEventListener('click',syncYahoo);
  $('openYahooButton').addEventListener('click',async()=>{await loadIdentity();const team=state.identity?.teamId||'';chrome.tabs.create({url:team?`https://football.fantasysports.yahoo.com/f1/${LEAGUE}/${team}`:`https://football.fantasysports.yahoo.com/f1/${LEAGUE}`})});
  $('themeButton').addEventListener('click',()=>{
    document.documentElement.classList.toggle('light');
    $('themeButton').textContent=document.documentElement.classList.contains('light')?'🌙':'☀️';
    localStorage.setItem('fantasyLeagueTheme',document.documentElement.classList.contains('light')?'light':'dark');
  });

  if(localStorage.getItem('fantasyLeagueTheme')==='light'){document.documentElement.classList.add('light');$('themeButton').textContent='🌙'}
  const savedView=localStorage.getItem('fantasyIntelView');
  if(['team','matchups','league'].includes(savedView))state.view=savedView;
  setView(state.view);
  load();

  setInterval(()=>{if(!document.hidden)load()},60000);
  chrome.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&(changes.fantasyLeagueLastSync||changes.fantasyLeagueIdentity))load();
  });
})();
