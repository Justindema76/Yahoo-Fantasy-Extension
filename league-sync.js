(() => {
  'use strict';

  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const HEAD={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const VERSION='3.4.0';
  const PAGE_SIZE=25;
  const PAGE_LIMIT=30;
  const PLAYER_POSITIONS=['O','K','DEF'];

  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,' ').replace(/\s+/g,' ').trim();
  const numeric=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const pct=v=>{const n=numeric(v);return Number.isFinite(n)?n:null};
  const isStarter=slot=>!['BN','IR','IR+','NA'].includes(String(slot||'').toUpperCase());

  let syncing=false,last=null,lastError=null,stage='READY';

  async function progress(next,extra={}){
    stage=next;
    const payload={version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};
    try{await chrome.storage.local.set({fantasyLeagueProgress:payload})}catch{}
    return payload;
  }
  async function fail(error,extra={}){
    lastError={message:error?.message||String(error),stack:error?.stack||'',version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};
    try{await chrome.storage.local.set({fantasyLeagueLastError:lastError})}catch{}
    return lastError;
  }
  async function db(path,opt={}){
    await progress(`DATABASE ${String(opt.method||'GET').toUpperCase()}`,{resource:path.split('?')[0]});
    const r=await fetch(`${SB}/rest/v1/${path}`,{...opt,headers:{...HEAD,...(opt.headers||{})}});
    const text=await r.text();
    if(!r.ok)throw new Error(`Database ${r.status} ${r.statusText}: ${text||'(empty response)'}`);
    return text?JSON.parse(text):null;
  }
  async function page(path){
    await progress('YAHOO PAGE FETCH',{yahooPath:path});
    const r=await fetch(path,{cache:'no-store',credentials:'include'});
    if(!r.ok)throw new Error(`Yahoo ${r.status} ${r.statusText}: ${path}`);
    return new DOMParser().parseFromString(await r.text(),'text/html');
  }

  function currentTeamIdFromUrl(){
    const m=location.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
    return m?.[1]||null;
  }
  async function resolveIdentity(knownTeams=[]){
    const key=`fantasyIdentity:${LEAGUE}`;
    const stored=(await chrome.storage.local.get([key,'fantasyLeagueIdentity']))[key]||(await chrome.storage.local.get(['fantasyLeagueIdentity'])).fantasyLeagueIdentity||null;
    const urlTeam=currentTeamIdFromUrl();
    const teamId=urlTeam||stored?.teamId||'6';
    const known=knownTeams.find(t=>String(t.id||t.yahoo_team_key)===String(teamId));
    const identity={leagueId:LEAGUE,teamId:String(teamId),teamName:known?.name||known?.team_name||stored?.teamName||`Yahoo Team ${teamId}`,detectedFrom:urlTeam?'yahoo-url':'stored',updatedAt:new Date().toISOString()};
    await chrome.storage.local.set({[key]:identity,fantasyLeagueIdentity:identity});
    return identity;
  }

  function teamsFrom(doc){
    const byId=new Map();
    for(const a of doc.querySelectorAll('a[href]')){
      let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}
      const m=u.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
      if(!m)continue;
      const id=m[1],name=clean(a.textContent);
      if(Number(id)<1||Number(id)>30||!name||name.length>80||/^(roster|players|matchup|edit|league|overview|research|draft)$/i.test(name))continue;
      const exact=new RegExp(`^/f1/${LEAGUE}/${id}/?$`).test(u.pathname);
      if(!byId.has(id))byId.set(id,[]);
      byId.get(id).push({id,name,exact});
    }
    return [...byId.entries()].map(([id,items])=>{
      items.sort((a,b)=>(b.exact-a.exact)||(a.name.length-b.name.length));
      return{id,name:items[0].name,alternates:[...new Set(items.map(x=>x.name))].slice(0,5)};
    }).sort((a,b)=>Number(a.id)-Number(b.id));
  }

  function playerAnchor(row){
    const links=[...row.querySelectorAll('a[href]')];
    return links.find(a=>/\/nfl\/players\/\d+|\/player\/\d+|playerId=|player_id=/i.test(a.getAttribute('href')||''))
      ||links.find(a=>{const t=clean(a.textContent);return t.length>2&&t.length<50&&/[a-z]/i.test(t)&&!/^([A-Z]{2,4}|add|drop|watch|news|stats|research)$/i.test(t)})
      ||null;
  }
  function yahooKey(a,name){
    const h=a?.getAttribute('href')||'';
    const m=h.match(/\/nfl\/players\/(\d+)|\/player\/(\d+)|[?&](?:player_id|playerId|pid)=(\d+)/i);
    return m?(m[1]||m[2]||m[3]):`name:${norm(name)}`;
  }
  function positionFromText(text){
    const t=clean(text).toUpperCase();
    let m=t.match(/\b([A-Z]{2,3})\s*[-–·]\s*(QB|RB|WR|TE|K|DEF|DST)\b/);
    if(m)return{team:m[1],position:m[2]==='DST'?'DEF':m[2]};
    m=t.match(/\b(QB|RB|WR|TE|K|DEF|DST)\s*[-–·]\s*([A-Z]{2,3})\b/);
    if(m)return{team:m[2],position:m[1]==='DST'?'DEF':m[1]};
    return{team:null,position:null};
  }
  function slotOf(row){
    const valid=['Q/W/R/T','W/R/T','W/R','QB','RB','WR','TE','K','DEF','BN','IR+','IR','NA'];
    for(const c of [...row.querySelectorAll('th,td')].slice(0,6)){
      const t=clean(c.textContent).toUpperCase().replace(/\s+/g,'');
      for(const s of valid)if(t===s.replace(/\s+/g,''))return s;
    }
    return null;
  }
  function tableHeaders(row){
    const table=row.closest('table');if(!table)return[];
    let hs=[...table.querySelectorAll('thead tr:last-child th')].map(h=>norm(h.textContent));
    if(!hs.length){const r=[...table.querySelectorAll('tr')].find(x=>x.querySelectorAll('th').length);hs=r?[...r.querySelectorAll('th')].map(h=>norm(h.textContent)):[]}
    return hs;
  }
  function cellByHeader(row,patterns){
    const cells=[...row.querySelectorAll(':scope > th,:scope > td')],headers=tableHeaders(row);
    if(!cells.length||!headers.length)return'';
    const idx=headers.findIndex(h=>patterns.some(p=>p.test(h)));
    return idx>=0&&cells[idx]?clean(cells[idx].textContent):'';
  }
  function metricByHint(row,patterns){
    for(const c of row.querySelectorAll('th,td')){
      const hint=norm([c.getAttribute('data-stat'),c.getAttribute('data-tst'),c.getAttribute('aria-label'),c.getAttribute('title'),c.className].filter(Boolean).join(' '));
      if(patterns.some(p=>p.test(hint)))return clean(c.textContent);
    }
    return'';
  }
  function opponentFrom(row){
    const direct=cellByHeader(row,[/^opp$/,/^opponent$/,/^game$/])||metricByHint(row,[/opponent/,/game/]);
    const m=(direct||clean(row.textContent)).match(/(?:@|vs\.?\s+)([A-Z]{2,3})\b/i);
    return m?m[1].toUpperCase():null;
  }
  function rowMetrics(row,mode='actual'){
    const fanText=cellByHeader(row,[/^fan pts$/,/^fantasy points$/,/^fpts$/,/^pts$/,/^points$/,/^total points$/])||metricByHint(row,[/fan.*pts/,/fantasy.*points/,/fpts/]);
    const explicitProj=cellByHeader(row,[/^proj pts$/,/^projected points$/,/^projection$/,/^proj$/,/^projected$/])||metricByHint(row,[/proj/,/projected/]);
    const rankText=cellByHeader(row,[/^rank$/,/^pre season$/,/^preseason$/,/^actual rank$/])||metricByHint(row,[/rank/]);
    const rosteredText=cellByHeader(row,[/% rostered/,/% owned/,/^rostered$/,/^owned$/])||metricByHint(row,[/rostered/,/owned/]);
    const startedText=cellByHeader(row,[/% started/,/^started$/])||metricByHint(row,[/started/]);
    const status=cellByHeader(row,[/^roster status$/,/^status$/,/^availability$/,/^owner$/])||metricByHint(row,[/roster status/,/status/,/availability/,/owner/]);
    const game=cellByHeader(row,[/^game$/,/^opp$/,/^opponent$/])||metricByHint(row,[/game/,/opponent/]);
    return{
      fantasyPoints:mode==='projection'?null:numeric(fanText),
      projectedPoints:mode==='projection'?numeric(fanText):numeric(explicitProj),
      yahooRank:numeric(rankText),
      percentRostered:pct(rosteredText),
      percentStarted:pct(startedText),
      statusText:status,
      opponent:opponentFrom(row),
      gameTime:game||null,
      gameStatus:/final/i.test(game)?'Final':/live|in progress/i.test(game)?'Live':null
    };
  }
  function yahooPlayersFrom(doc,{mode='actual',sourceStatus=null}={}){
    const out=[],seen=new Set();
    for(const tr of doc.querySelectorAll('tr')){
      const a=playerAnchor(tr);if(!a)continue;
      const name=clean(a.textContent),meta=positionFromText(tr.textContent||'');
      if(!name||!meta.position)continue;
      const key=yahooKey(a,name),identity=`${key}|${norm(name)}`;
      if(seen.has(identity))continue;
      seen.add(identity);
      out.push({name,yahooPlayerKey:key,team:meta.team,position:meta.position,sourceStatus,...rowMetrics(tr,mode),rowText:clean(tr.textContent)});
    }
    return out;
  }
  function rosterFrom(doc){
    const rows=[],debug=[];let order=0;
    for(const tr of doc.querySelectorAll('tr')){
      const a=playerAnchor(tr);if(!a)continue;
      const name=clean(a.textContent),slot=slotOf(tr);
      if(debug.length<10)debug.push({name,slot,row:clean(tr.textContent).slice(0,240)});
      if(!name||!slot||rows.some(x=>x.name===name))continue;
      const meta=positionFromText(tr.textContent||'');
      rows.push({name,slot,lineupOrder:order++,yahooKey:yahooKey(a,name),nflTeam:meta.team,position:meta.position||(['QB','RB','WR','TE','K','DEF'].includes(slot)?slot:null),...rowMetrics(tr,'actual')});
    }
    return{rows,debug,title:doc.title||'',tableRows:doc.querySelectorAll('tr').length};
  }
  function detectCurrentWeek(doc){
    const selected=[...doc.querySelectorAll('option:checked')].map(o=>clean(o.textContent)).find(t=>/^week\s+\d+/i.test(t));
    const source=selected||clean(doc.body?.innerText||'').slice(0,5000);
    const m=source.match(/\bWeek\s+(1[0-8]|[1-9])\b/i);
    return m?Number(m[1]):1;
  }

  async function fetchPlayerPages({status='ALL',week,mode,pos}){
    const players=[],seen=new Set();let pages=0;
    const stat1=mode==='projection'?`P_W_${week}`:`S_W_${week}`;
    for(let pageIndex=0;pageIndex<PAGE_LIMIT;pageIndex++){
      const offset=pageIndex*PAGE_SIZE;
      const q=new URLSearchParams({status,stat1,pos});
      if(offset)q.set('count',String(offset));
      const path=`/f1/${LEAGUE}/players?${q}`;
      const doc=await page(path);
      const rows=yahooPlayersFrom(doc,{mode,sourceStatus:status});
      let added=0;
      for(const row of rows){
        const key=String(row.yahooPlayerKey||`name:${norm(row.name)}`);
        if(seen.has(key))continue;
        seen.add(key);players.push(row);added++;
      }
      pages++;
      if(pageIndex===0&&!rows.length)throw Object.assign(new Error(`Yahoo Players returned 0 rows for status=${status}, pos=${pos}, ${stat1}.`),{context:{path,title:doc.title||'',tableRows:doc.querySelectorAll('tr').length}});
      if(added===0||rows.length<PAGE_SIZE)break;
    }
    return{players,pages};
  }
  function mergePlayerFeeds(...feeds){
    const map=new Map();
    for(const feed of feeds){
      for(const row of feed||[]){
        const key=String(row.yahooPlayerKey||`name:${norm(row.name)}`);
        const old=map.get(key)||{};
        map.set(key,{...old,...row,fantasyPoints:row.fantasyPoints??old.fantasyPoints??null,projectedPoints:row.projectedPoints??old.projectedPoints??null,yahooRank:row.yahooRank??old.yahooRank??null,percentRostered:row.percentRostered??old.percentRostered??null,percentStarted:row.percentStarted??old.percentStarted??null,statusText:row.statusText||old.statusText||'',opponent:row.opponent||old.opponent||null,gameTime:row.gameTime||old.gameTime||null,gameStatus:row.gameStatus||old.gameStatus||null});
      }
    }
    return [...map.values()];
  }
  async function fetchAllPositions(week,mode){
    const feeds=[];let pages=0;
    for(const pos of PLAYER_POSITIONS){const result=await fetchPlayerPages({status:'ALL',week,mode,pos});feeds.push(result.players);pages+=result.pages}
    return{players:mergePlayerFeeds(...feeds),pages};
  }
  async function loadYahooMasterWeek(week,{projection=true}={}){
    await progress('SYNC MASTER YAHOO PLAYERS',{week});
    const actual=await fetchAllPositions(week,'actual');
    let projected={players:[],pages:0},projectionWarning=null;
    if(projection){try{projected=await fetchAllPositions(week,'projection')}catch(e){projectionWarning=e.message}}
    return{players:mergePlayerFeeds(actual.players,projected.players),pages:actual.pages+projected.pages,projectionWarning};
  }

  function buildCatalogIndex(rows){
    const map=new Map(),add=(name,row)=>{const k=norm(name);if(k&&!map.has(k))map.set(k,row)};
    for(const p of rows||[]){add(p.yahoo_name,p);add(p.display_name,p);for(const alias of p.aliases||[])add(alias,p)}
    return map;
  }
  function buildPlayerIndex(rows){const index={byKey:new Map(),byYahoo:new Map(),byName:new Map()};for(const row of rows||[])indexPlayer(row,index);return index}
  function indexPlayer(row,index){if(row.player_key)index.byKey.set(String(row.player_key),row);if(row.yahoo_player_key)index.byYahoo.set(String(row.yahoo_player_key),row);for(const name of [row.yahoo_name,row.player_name]){const k=norm(name);if(k&&!index.byName.has(k))index.byName.set(k,row)}}
  function resolvePlayer(y,index,catalog){
    const yahooId=String(y.yahooPlayerKey||`name:${norm(y.name)}`),existing=index.byYahoo.get(yahooId)||index.byName.get(norm(y.name)),old=catalog.get(norm(y.name))||null;
    return{player_key:existing?.player_key||old?.player_key||`yahoo:${yahooId}`,player_name:y.name,team:y.team||existing?.team||old?.team||null,position:y.position||existing?.position||old?.position||null,role:existing?.role||old?.role||null,yahoo_rank:y.yahooRank??existing?.yahoo_rank??old?.yahoo_rank??null,yahoo_rank_source:'Yahoo live',yahoo_player_key:yahooId,yahoo_name:y.name,active:true,source:'Yahoo Players',yahoo_verified:true};
  }
  async function upsertFantasyPlayers(yahooPlayers,index,catalog,when,source='Yahoo Players'){
    const payload=[];
    for(const yp of yahooPlayers){const p=resolvePlayer(yp,index,catalog);p.source=source;p.yahoo_verified_at=when;p.last_seen_at=when;p.updated_at=when;payload.push(p);indexPlayer(p,index)}
    for(let i=0;i<payload.length;i+=100)await db('fantasy_players?on_conflict=player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload.slice(i,i+100))});
    return payload;
  }

  function teamMatch(team,existing){
    const keyed=existing.find(x=>String(x.yahoo_team_key||'')===String(team.id));if(keyed)return keyed;
    const names=[team.name,...team.alternates].map(norm),exact=existing.filter(x=>names.includes(norm(x.team_name)));if(exact.length===1)return exact[0];
    const fuzzy=existing.filter(x=>names.some(n=>n.includes(norm(x.team_name))||norm(x.team_name).includes(n)));return fuzzy.length===1?fuzzy[0]:null;
  }
  async function saveTeam(team,existing,index,catalog,when){
    await progress('ASSIGN TEAM ROSTER',{teamId:team.id,teamName:team.name});
    const seeded=teamMatch(team,existing);if(!seeded)throw Object.assign(new Error(`Could not match Yahoo team #${team.id}: ${team.name}`),{context:{teamId:team.id,teamName:team.name}});
    const doc=await page(`/f1/${LEAGUE}/${team.id}`),parsed=rosterFrom(doc);if(!parsed.rows.length)throw Object.assign(new Error(`0 roster players detected for ${seeded.team_name}.`),{context:{teamId:team.id,pageTitle:parsed.title,debug:parsed.debug}});
    await db(`fantasy_league_teams?id=eq.${seeded.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({yahoo_team_key:team.id,last_synced_at:when,updated_at:when})});
    const resolved=await upsertFantasyPlayers(parsed.rows.map(r=>({name:r.name,yahooPlayerKey:r.yahooKey,team:r.nflTeam,position:r.position,yahooRank:r.yahooRank})),index,catalog,when,'Yahoo roster assignment'),byYahoo=new Map(resolved.map(p=>[String(p.yahoo_player_key),p])),byName=new Map(resolved.map(p=>[norm(p.player_name),p]));
    await db(`fantasy_league_rosters?league_team_id=eq.${seeded.id}`,{method:'DELETE'});
    const payload=parsed.rows.map((r,i)=>{const p=byYahoo.get(String(r.yahooKey))||byName.get(norm(r.name));if(!p)throw new Error(`Player identity missing for ${r.name}`);return{league_team_id:seeded.id,player_key:p.player_key,yahoo_player_key:p.yahoo_player_key,yahoo_player_name:p.yahoo_name||r.name,nfl_team:p.team||r.nflTeam||null,position:p.position||r.position||null,roster_slot:r.slot,lineup_order:r.lineupOrder??i,active:true,last_synced_at:when,updated_at:when}});
    if(payload.length)await db('fantasy_league_rosters',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});
    return{total:payload.length};
  }

  function numberValues(text){return(String(text||'').match(/\b\d+\.\d{1,2}\b/g)||[]).map(Number)}
  function matchupStatus(lines){const t=lines.join(' ').toLowerCase();if(t.includes('final'))return'Final';if(t.includes('in progress')||t.includes('live'))return'Live';if(t.includes('not started'))return'Not started';return null}
  function weeklyMatchupsFrom(doc,week,teams){
    const raw=(doc.body?.innerText||'').split('\n').map(clean).filter(Boolean);let start=raw.findIndex(x=>norm(x).includes(norm(`Week ${week} Matchups`)));if(start<0)start=raw.findIndex(x=>norm(x)==='matchups');if(start<0)start=0;let end=raw.findIndex((x,i)=>i>start&&(norm(x)==='standings'||norm(x).startsWith('recent transactions')));if(end<0)end=raw.length;
    const lines=raw.slice(start,end),byName=new Map(teams.map(t=>[norm(t.team_name),t])),hits=[],seen=new Set();for(let i=0;i<lines.length;i++){const t=byName.get(norm(lines[i]));if(t&&!seen.has(t.id)){hits.push({index:i,team:t});seen.add(t.id)}}
    const out=[];for(let i=0;i+1<hits.length;i+=2){const a=hits[i],b=hits[i+1],nums=numberValues(lines.slice(a.index+1,b.index).join(' '));let ap=null,bp=null,apro=null,bpro=null;if(nums.length>=4)[ap,apro,bp,bpro]=nums.slice(0,4);else if(nums.length>=2)[ap,bp]=nums.slice(0,2);const ids=[String(a.team.yahoo_team_key||''),String(b.team.yahoo_team_key||'')].sort((x,y)=>Number(x)-Number(y));if(!ids[0]||!ids[1])continue;out.push({league_key:LEAGUE_KEY,week,matchup_key:`w${week}-t${ids[0]}-t${ids[1]}`,team_a_id:a.team.id,team_b_id:b.team.id,team_a_yahoo_key:String(a.team.yahoo_team_key),team_b_yahoo_key:String(b.team.yahoo_team_key),team_a_name:a.team.team_name,team_b_name:b.team.team_name,team_a_points:ap,team_b_points:bp,team_a_projected:apro,team_b_projected:bpro,status:matchupStatus(lines),is_playoffs:week>=15,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()})}
    return out;
  }
  async function syncAllMatchups(teams,when){
    const result={matchups:0,weeks:0,warnings:[]};
    for(let week=1;week<=18;week++){
      try{await progress('SYNC LEAGUE MATCHUPS',{week});const rows=weeklyMatchupsFrom(await page(`/f1/${LEAGUE}/?lhst=matchups&matchup_week=${week}&module=matchups`),week,teams);if(rows.length){await db(`fantasy_league_matchups?league_key=eq.${LEAGUE_KEY}&week=eq.${week}`,{method:'DELETE'});await db('fantasy_league_matchups',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows.map(r=>({...r,last_synced_at:when,updated_at:when})))});result.matchups+=rows.length}result.weeks++}
      catch(e){result.warnings.push({week,message:e.message})}
    }
    return result;
  }

  function availabilityFromPlayer(row,rosterAssignment){if(rosterAssignment)return'ROSTERED';const text=`${row.statusText||''} ${row.rowText||''}`;return/waiver|waiv|\bW\s*\(/i.test(text)?'WAIVERS':'FREE_AGENT'}
  function rosterAssignmentMap(rosters,teams){const teamById=new Map(teams.map(t=>[t.id,t])),map=new Map();for(const r of rosters||[])map.set(String(r.yahoo_player_key),{...r,team:teamById.get(r.league_team_id)||null});return map}

  async function saveCurrentPlayerPool(masterPlayers,teams,index,catalog,currentWeek,when){
    await progress('ASSIGN PLAYER OWNERSHIP',{players:masterPlayers.length});
    const resolved=await upsertFantasyPlayers(masterPlayers,index,catalog,when,'Yahoo Players master feed'),resolvedByYahoo=new Map(resolved.map(p=>[String(p.yahoo_player_key),p]));
    const rosters=await db(`fantasy_league_rosters?select=*&league_team_id=in.(${teams.map(t=>t.id).join(',')})&active=eq.true`),assignments=rosterAssignmentMap(rosters,teams),pool=[];
    for(const row of masterPlayers){const p=resolvedByYahoo.get(String(row.yahooPlayerKey)),assignment=assignments.get(String(row.yahooPlayerKey)),status=availabilityFromPlayer(row,assignment);pool.push({league_key:LEAGUE_KEY,player_key:p?.player_key||null,yahoo_player_key:String(row.yahooPlayerKey),yahoo_player_name:p?.yahoo_name||row.name,nfl_team:p?.team||row.team||null,position:p?.position||row.position||null,availability_status:status,owning_team_id:assignment?.league_team_id||null,owning_team_name:assignment?.team?.team_name||null,waiver_clear_text:status==='WAIVERS'?(row.statusText||null):null,yahoo_rank:row.yahooRank,percent_rostered:row.percentRostered,percent_started:row.percentStarted,current_week:currentWeek,fantasy_points:row.fantasyPoints,projected_points:row.projectedPoints,opponent:row.opponent,game_time:row.gameTime,game_status:row.gameStatus,last_synced_at:when,updated_at:when})}
    for(const [key,assignment] of assignments){if(pool.some(p=>p.yahoo_player_key===key))continue;pool.push({league_key:LEAGUE_KEY,player_key:assignment.player_key,yahoo_player_key:key,yahoo_player_name:assignment.yahoo_player_name,nfl_team:assignment.nfl_team,position:assignment.position,availability_status:'ROSTERED',owning_team_id:assignment.league_team_id,owning_team_name:assignment.team?.team_name||null,current_week:currentWeek,last_synced_at:when,updated_at:when})}
    await db(`fantasy_league_player_pool?league_key=eq.${LEAGUE_KEY}`,{method:'DELETE'});for(let i=0;i<pool.length;i+=100)await db('fantasy_league_player_pool?on_conflict=league_key,yahoo_player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(pool.slice(i,i+100))});
    return{total:pool.length,available:pool.filter(p=>p.availability_status!=='ROSTERED').length,waivers:pool.filter(p=>p.availability_status==='WAIVERS').length,freeAgents:pool.filter(p=>p.availability_status==='FREE_AGENT').length,rostered:pool.filter(p=>p.availability_status==='ROSTERED').length};
  }

  async function saveMasterWeekStats(week,masterPlayers,teams,index,catalog,currentWeek,when){
    await progress('SAVE MASTER WEEKLY PLAYER SCORES',{week,players:masterPlayers.length});
    const resolved=await upsertFantasyPlayers(masterPlayers,index,catalog,when,`Yahoo Players Week ${week}`),resolvedByYahoo=new Map(resolved.map(p=>[String(p.yahoo_player_key),p]));
    const rosters=await db(`fantasy_league_rosters?select=*&league_team_id=in.(${teams.map(t=>t.id).join(',')})&active=eq.true`),assignments=rosterAssignmentMap(rosters,teams),existing=await db(`fantasy_player_week_stats?select=*&league_key=eq.${LEAGUE_KEY}&week=eq.${week}`),existingByYahoo=new Map((existing||[]).map(r=>[String(r.yahoo_player_key),r]));
    const payload=masterPlayers.map(row=>{const p=resolvedByYahoo.get(String(row.yahooPlayerKey)),assignment=assignments.get(String(row.yahooPlayerKey)),old=existingByYahoo.get(String(row.yahooPlayerKey)),useOldOwner=week<currentWeek&&old?.owning_team_id,owner=useOldOwner?{league_team_id:old.owning_team_id,roster_slot:old.roster_slot,lineup_order:old.lineup_order,is_starter:old.is_starter,teamName:old.owning_team_name}:assignment;return{league_key:LEAGUE_KEY,week,player_key:p?.player_key||old?.player_key||null,yahoo_player_key:String(row.yahooPlayerKey),yahoo_player_name:p?.yahoo_name||row.name,league_team_id:owner?.league_team_id||null,roster_slot:owner?.roster_slot||null,lineup_order:owner?.lineup_order??null,is_starter:typeof owner?.is_starter==='boolean'?owner.is_starter:(owner?.roster_slot?isStarter(owner.roster_slot):false),nfl_team:p?.team||row.team||old?.nfl_team||null,position:p?.position||row.position||old?.position||null,opponent:row.opponent||old?.opponent||null,game_time:row.gameTime||old?.game_time||null,game_status:row.gameStatus||old?.game_status||null,fantasy_points:row.fantasyPoints??old?.fantasy_points??null,projected_points:row.projectedPoints??old?.projected_points??null,availability_status:availabilityFromPlayer(row,assignment),owning_team_id:owner?.league_team_id||assignment?.league_team_id||null,owning_team_name:owner?.teamName||assignment?.team?.team_name||old?.owning_team_name||null,yahoo_rank:row.yahooRank??old?.yahoo_rank??null,percent_rostered:row.percentRostered??old?.percent_rostered??null,percent_started:row.percentStarted??old?.percent_started??null,source:'Yahoo Players',last_synced_at:when,updated_at:when}});
    for(let i=0;i<payload.length;i+=100)await db('fantasy_player_week_stats?on_conflict=league_key,week,yahoo_player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload.slice(i,i+100))});
    return payload.length;
  }

  async function sync(){
    if(syncing)throw new Error('Sync already running.');syncing=true;lastError=null;const when=new Date().toISOString();
    try{
      const [teamsDoc,existingTeams,catalogRows,existingPlayers]=await Promise.all([page(`/f1/${LEAGUE}/teams`),db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}`),db('draft_player_catalog?select=player_key,yahoo_name,display_name,team,position,role,yahoo_rank,source,aliases,active&active=eq.true'),db('fantasy_players?select=*')]);
      const teams=teamsFrom(teamsDoc);if(teams.length<2)throw new Error(`Yahoo team list could not be read. Detected ${teams.length} teams.`);
      const identity=await resolveIdentity(teams),catalog=buildCatalogIndex(catalogRows||[]),index=buildPlayerIndex(existingPlayers||[]),currentWeek=detectCurrentWeek(teamsDoc),currentMaster=await loadYahooMasterWeek(currentWeek,{projection:true});
      await upsertFantasyPlayers(currentMaster.players,index,catalog,when,'Yahoo Players master feed');
      const result={version:VERSION,leagueId:LEAGUE,myTeamKey:identity.teamId,myTeamName:identity.teamName,currentWeek,teams:0,players:0,masterPlayers:currentMaster.players.length,projectedPlayers:currentMaster.players.filter(p=>p.projectedPoints!==null&&p.projectedPoints!==undefined).length,masterPages:currentMaster.pages,projectionWarning:currentMaster.projectionWarning,matchups:0,matchupWeeks:0,weekStatRows:0,playerPool:null,errors:[],warnings:[],syncedAt:when};
      if(result.projectionWarning)result.warnings.push({week:currentWeek,message:result.projectionWarning});
      for(const team of teams){try{const r=await saveTeam(team,existingTeams,index,catalog,when);result.teams++;result.players+=r.total}catch(e){result.errors.push(await fail(e,{teamId:team.id,teamName:team.name}))}}
      const refreshedTeams=await db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true`),schedule=await syncAllMatchups(refreshedTeams,when);result.matchups=schedule.matchups;result.matchupWeeks=schedule.weeks;result.warnings.push(...schedule.warnings);
      result.playerPool=await saveCurrentPlayerPool(currentMaster.players,refreshedTeams,index,catalog,currentWeek,when);
      for(let week=1;week<=currentWeek;week++){try{const master=week===currentWeek?currentMaster:await loadYahooMasterWeek(week,{projection:false});result.weekStatRows+=await saveMasterWeekStats(week,master.players,refreshedTeams,index,catalog,currentWeek,when)}catch(e){result.warnings.push({week,message:e.message})}}
      if(!result.projectedPlayers)result.warnings.push({week:currentWeek,message:'Yahoo player projections were not detected. Team projections will remain blank until player projections are captured.'});
      await progress(result.errors.length?'PARTIAL SYNC':'COMPLETE',{teams:result.teams,rosterSpots:result.players,masterPlayers:result.masterPlayers,projectedPlayers:result.projectedPlayers,matchups:result.matchups,weekStatRows:result.weekStatRows,pool:result.playerPool?.total||0});last=result;await chrome.storage.local.set({fantasyLeagueLastSync:result,fantasyLeagueLastError:result.errors.at(-1)||null});return result;
    }catch(e){await fail(e,e.context||{});throw e}finally{syncing=false}
  }

  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
    if(msg?.type==='SYNC_LEAGUE'){sync().then(result=>reply({ok:result.errors.length===0,partial:result.errors.length>0,result,error:result.errors[0]?.message||null,diagnostics:[...result.errors,...result.warnings]})).catch(async e=>reply({ok:false,error:e.message,diagnostics:[lastError||await fail(e)]}));return true}
    if(msg?.type==='LEAGUE_STATUS'){chrome.storage.local.get(['fantasyLeagueLastSync','fantasyLeagueLastError','fantasyLeagueProgress','fantasyLeagueIdentity']).then(x=>reply({ok:true,lastSync:last||x.fantasyLeagueLastSync||null,lastError:lastError||x.fantasyLeagueLastError||null,progress:x.fantasyLeagueProgress||null,identity:x.fantasyLeagueIdentity||null,syncing,stage}));return true}
  });
})();