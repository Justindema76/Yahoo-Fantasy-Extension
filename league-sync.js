(() => {
  'use strict';

  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const HEAD={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const OWNER_TEAM='6';
  const OWNER_NAME='House of the Dragon';
  const VERSION='3.3.0';
  const PAGE_SIZE=25;
  const PAGE_LIMIT=24;

  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,' ').replace(/\s+/g,' ').trim();
  const numeric=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
  const pct=v=>{const n=numeric(v);return Number.isFinite(n)?n:null};
  const isStarter=slot=>!['BN','IR','IR+','NA'].includes(String(slot||'').toUpperCase());
  let syncing=false,last=null,lastError=null,stage='READY';

  async function progress(next,extra={}){stage=next;const payload={version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};try{await chrome.storage.local.set({fantasyLeagueProgress:payload})}catch{}return payload}
  async function fail(error,extra={}){lastError={message:error?.message||String(error),stack:error?.stack||'',version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};try{await chrome.storage.local.set({fantasyLeagueLastError:lastError})}catch{}return lastError}
  async function db(path,opt={}){await progress(`DATABASE ${String(opt.method||'GET').toUpperCase()}`,{resource:path.split('?')[0]});const r=await fetch(`${SB}/rest/v1/${path}`,{...opt,headers:{...HEAD,...(opt.headers||{})}});const text=await r.text();if(!r.ok)throw new Error(`Database ${r.status} ${r.statusText}: ${text||'(empty response)'}`);return text?JSON.parse(text):null}
  async function page(path){await progress('YAHOO PAGE FETCH',{yahooPath:path});const r=await fetch(path,{cache:'no-store',credentials:'include'});if(!r.ok)throw new Error(`Yahoo ${r.status} ${r.statusText}: ${path}`);return new DOMParser().parseFromString(await r.text(),'text/html')}

  async function resolveIdentity(knownTeams=[]){
    const known=knownTeams.find(t=>String(t.id||t.yahoo_team_key)===OWNER_TEAM);
    const identity={leagueId:LEAGUE,teamId:OWNER_TEAM,teamName:known?.name||known?.team_name||OWNER_NAME,detectedFrom:'fixed-owner',updatedAt:new Date().toISOString()};
    await chrome.storage.local.set({[`fantasyIdentity:${LEAGUE}`]:identity,fantasyLeagueIdentity:identity});
    return identity;
  }

  function teamsFrom(doc){
    const byId=new Map();
    for(const a of doc.querySelectorAll('a[href]')){
      let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}
      const m=u.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));if(!m)continue;
      const id=m[1],name=clean(a.textContent);if(Number(id)<1||Number(id)>30||!name||name.length>80||/^(roster|players|matchup|edit|league|overview|research|draft)$/i.test(name))continue;
      const exact=new RegExp(`^/f1/${LEAGUE}/${id}/?$`).test(u.pathname);if(!byId.has(id))byId.set(id,[]);byId.get(id).push({id,name,exact});
    }
    return [...byId.entries()].map(([id,items])=>{items.sort((a,b)=>(b.exact-a.exact)||(a.name.length-b.name.length));return{id,name:items[0].name,alternates:[...new Set(items.map(x=>x.name))].slice(0,5)}}).sort((a,b)=>Number(a.id)-Number(b.id));
  }
  function playerAnchor(row){const links=[...row.querySelectorAll('a[href]')];return links.find(a=>/\/nfl\/players\/\d+|\/player\/\d+|playerId=|player_id=/i.test(a.getAttribute('href')||''))||links.find(a=>{const t=clean(a.textContent);return t.length>2&&t.length<50&&/[a-z]/i.test(t)&&!/^([A-Z]{2,4}|add|drop|watch|news|stats|research)$/i.test(t)})||null}
  function yahooKey(a,name){const h=a?.getAttribute('href')||'',m=h.match(/\/nfl\/players\/(\d+)|\/player\/(\d+)|[?&](?:player_id|playerId|pid)=(\d+)/i);return m?(m[1]||m[2]||m[3]):`name:${norm(name)}`}
  function positionFromText(text){const t=clean(text).toUpperCase();let m=t.match(/\b([A-Z]{2,3})\s*[-–·]\s*(QB|RB|WR|TE|K|DEF|DST)\b/);if(m)return{team:m[1],position:m[2]==='DST'?'DEF':m[2]};m=t.match(/\b(QB|RB|WR|TE|K|DEF|DST)\s*[-–·]\s*([A-Z]{2,3})\b/);if(m)return{team:m[2],position:m[1]==='DST'?'DEF':m[1]};return{team:null,position:null}}
  function slotOf(row){const valid=['Q/W/R/T','W/R/T','W/R','QB','RB','WR','TE','K','DEF','BN','IR+','IR','NA'];for(const c of [...row.querySelectorAll('th,td')].slice(0,6)){const t=clean(c.textContent).toUpperCase().replace(/\s+/g,'');for(const s of valid)if(t===s.replace(/\s+/g,''))return s}return null}
  function tableHeaders(row){const table=row.closest('table');if(!table)return[];let hs=[...table.querySelectorAll('thead tr:last-child th')].map(h=>norm(h.textContent));if(!hs.length){const r=[...table.querySelectorAll('tr')].find(x=>x.querySelectorAll('th').length);hs=r?[...r.querySelectorAll('th')].map(h=>norm(h.textContent)):[]}return hs}
  function cellByHeader(row,patterns){const cells=[...row.querySelectorAll(':scope > th,:scope > td')],headers=tableHeaders(row);if(!cells.length||!headers.length)return'';const idx=headers.findIndex(h=>patterns.some(p=>p.test(h)));return idx>=0&&cells[idx]?clean(cells[idx].textContent):''}
  function metricByHint(row,patterns){for(const c of row.querySelectorAll('th,td')){const hint=norm([c.getAttribute('data-stat'),c.getAttribute('data-tst'),c.getAttribute('aria-label'),c.getAttribute('title'),c.className].filter(Boolean).join(' '));if(patterns.some(p=>p.test(hint)))return clean(c.textContent)}return''}
  function opponentFrom(row){const direct=cellByHeader(row,[/^opp$/,/^opponent$/,/^game$/])||metricByHint(row,[/opponent/,/game/]);const m=(direct||clean(row.textContent)).match(/(?:@|vs\.?\s+)([A-Z]{2,3})\b/i);return m?m[1].toUpperCase():null}
  function decimalFallback(row){return [...row.querySelectorAll('th,td')].map(c=>clean(c.textContent)).filter(t=>t&&!/%/.test(t)&&/^-?\d+\.\d{1,2}$/.test(t)).map(Number)}
  function rowMetrics(row){
    let actualText=cellByHeader(row,[/^fan pts$/,/^fantasy points$/,/^fpts$/,/^pts$/,/^points$/,/^total points$/])||metricByHint(row,[/fan.*pts/,/fantasy.*points/,/fpts/,/actual.*points/]);
    let projectedText=cellByHeader(row,[/^proj pts$/,/^projected points$/,/^projection$/,/^proj$/,/^projected$/])||metricByHint(row,[/proj/,/projected/]);
    let actual=numeric(actualText),projected=numeric(projectedText);const decimals=decimalFallback(row);
    if(projected===null&&decimals.length)projected=decimals.at(-1);
    if(actual===null&&decimals.length>=2)actual=decimals.at(-2);
    const rankText=cellByHeader(row,[/^rank$/,/^pre season$/,/^preseason$/,/^actual rank$/])||metricByHint(row,[/rank/]);
    const rosteredText=cellByHeader(row,[/% rostered/,/% owned/,/^rostered$/,/^owned$/])||metricByHint(row,[/rostered/,/owned/]);
    const startedText=cellByHeader(row,[/% started/,/^started$/])||metricByHint(row,[/started/]);
    const status=cellByHeader(row,[/^status$/,/^availability$/,/^owner$/])||metricByHint(row,[/status/,/availability/,/owner/]);
    const game=cellByHeader(row,[/^game$/,/^opp$/,/^opponent$/,/^status$/])||metricByHint(row,[/game/,/opponent/]);
    return{fantasyPoints:actual,projectedPoints:projected,yahooRank:numeric(rankText),percentRostered:pct(rosteredText),percentStarted:pct(startedText),statusText:status,opponent:opponentFrom(row),gameTime:game||null,gameStatus:/final/i.test(game)?'Final':/live|in progress/i.test(game)?'Live':null};
  }
  function detectCurrentWeek(doc){const selected=[...doc.querySelectorAll('option:checked')].map(o=>clean(o.textContent)).find(t=>/^week\s+\d+/i.test(t));const source=selected||clean(doc.body?.innerText||'').slice(0,5000);const m=source.match(/\bWeek\s+(1[0-8]|[1-9])\b/i);return m?Number(m[1]):1}
  function yahooPlayersFrom(doc){const out=[],seen=new Set();for(const tr of doc.querySelectorAll('tr')){const a=playerAnchor(tr);if(!a)continue;const name=clean(a.textContent),meta=positionFromText(tr.textContent||'');if(!name||!meta.position)continue;const key=yahooKey(a,name),identity=`${key}|${norm(name)}`;if(seen.has(identity))continue;seen.add(identity);out.push({name,yahooPlayerKey:key,team:meta.team,position:meta.position,...rowMetrics(tr),rowText:clean(tr.textContent)})}return out}
  function rosterFrom(doc){const rows=[],debug=[];let order=0;for(const tr of doc.querySelectorAll('tr')){const a=playerAnchor(tr);if(!a)continue;const name=clean(a.textContent),slot=slotOf(tr);if(debug.length<10)debug.push({name,slot,row:clean(tr.textContent).slice(0,240)});if(!name||!slot||rows.some(x=>x.name===name))continue;const meta=positionFromText(tr.textContent||'');rows.push({name,slot,lineupOrder:order++,yahooKey:yahooKey(a,name),nflTeam:meta.team,position:meta.position||(['QB','RB','WR','TE','K','DEF'].includes(slot)?slot:null),...rowMetrics(tr)})}return{rows,debug,title:doc.title||'',bodySample:clean(doc.body?.innerText||'').slice(0,600),tableRows:doc.querySelectorAll('tr').length}}

  async function loadYahooAvailablePool(){
    const players=[],seen=new Set();let pages=0;
    for(const status of ['A','W']){
      for(let pageIndex=0;pageIndex<PAGE_LIMIT;pageIndex++){
        const offset=pageIndex*PAGE_SIZE,q=new URLSearchParams({status});if(offset)q.set('count',String(offset));const path=`/f1/${LEAGUE}/players?${q}`;
        let doc;try{doc=await page(path)}catch(e){if(status==='W')break;throw e}
        const rows=yahooPlayersFrom(doc);let added=0;for(const row of rows){const key=String(row.yahooPlayerKey||`name:${norm(row.name)}`);if(seen.has(key))continue;seen.add(key);players.push(row);added++}pages++;
        if(status==='A'&&pageIndex===0&&!rows.length)throw Object.assign(new Error('Yahoo Players page loaded, but no player rows were detected.'),{context:{yahooPath:path,pageTitle:doc.title||'',tableRows:doc.querySelectorAll('tr').length}});
        if(added===0||rows.length<PAGE_SIZE)break;
      }
    }
    return{players,pages};
  }

  function buildCatalogIndex(rows){const map=new Map(),add=(name,row)=>{const k=norm(name);if(k&&!map.has(k))map.set(k,row)};for(const p of rows||[]){add(p.yahoo_name,p);add(p.display_name,p);for(const alias of p.aliases||[])add(alias,p)}return map}
  function buildPlayerIndex(rows){const index={byKey:new Map(),byYahoo:new Map(),byName:new Map()};for(const row of rows||[])indexPlayer(row,index);return index}
  function indexPlayer(row,index){if(row.player_key)index.byKey.set(String(row.player_key),row);if(row.yahoo_player_key)index.byYahoo.set(String(row.yahoo_player_key),row);for(const name of [row.yahoo_name,row.player_name]){const k=norm(name);if(k&&!index.byName.has(k))index.byName.set(k,row)}}
  function resolvePlayer(y,index,catalog){const yahooId=String(y.yahooPlayerKey||`name:${norm(y.name)}`),existing=index.byYahoo.get(yahooId)||index.byName.get(norm(y.name)),old=catalog.get(norm(y.name))||null;return{player_key:existing?.player_key||old?.player_key||`yahoo:${yahooId}`,player_name:y.name,team:y.team||existing?.team||old?.team||null,position:y.position||existing?.position||old?.position||null,role:existing?.role||old?.role||null,yahoo_rank:y.yahooRank??existing?.yahoo_rank??old?.yahoo_rank??null,yahoo_rank_source:'Yahoo live',yahoo_player_key:yahooId,yahoo_name:y.name,active:true,source:'Yahoo live sync',yahoo_verified:true}}
  async function upsertFantasyPlayers(yahooPlayers,index,catalog,when,source){const payload=[];for(const yp of yahooPlayers){const p=resolvePlayer(yp,index,catalog);p.source=source;p.yahoo_verified_at=when;p.last_seen_at=when;p.updated_at=when;payload.push(p);indexPlayer(p,index)}for(let i=0;i<payload.length;i+=100)await db('fantasy_players?on_conflict=player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload.slice(i,i+100))});return payload}
  function teamMatch(team,existing){const keyed=existing.find(x=>String(x.yahoo_team_key||'')===String(team.id));if(keyed)return keyed;const names=[team.name,...team.alternates].map(norm),exact=existing.filter(x=>names.includes(norm(x.team_name)));if(exact.length===1)return exact[0];const fuzzy=existing.filter(x=>names.some(n=>n.includes(norm(x.team_name))||norm(x.team_name).includes(n)));return fuzzy.length===1?fuzzy[0]:null}
  async function saveTeam(team,existing,index,catalog,when){
    await progress('SYNC CURRENT ROSTER',{teamId:team.id,teamName:team.name});const seeded=teamMatch(team,existing);if(!seeded)throw Object.assign(new Error(`Could not match Yahoo team #${team.id}: ${team.name}`),{context:{teamId:team.id,teamName:team.name}});
    const doc=await page(`/f1/${LEAGUE}/${team.id}`),parsed=rosterFrom(doc);if(!parsed.rows.length)throw Object.assign(new Error(`0 roster players detected for ${seeded.team_name}.`),{context:{teamId:team.id,pageTitle:parsed.title,debug:parsed.debug}});
    await db(`fantasy_league_teams?id=eq.${seeded.id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({yahoo_team_key:team.id,last_synced_at:when,updated_at:when})});
    const resolved=await upsertFantasyPlayers(parsed.rows.map(r=>({name:r.name,yahooPlayerKey:r.yahooKey,team:r.nflTeam,position:r.position,yahooRank:r.yahooRank})),index,catalog,when,'Yahoo roster live sync'),byYahoo=new Map(resolved.map(p=>[String(p.yahoo_player_key),p])),byName=new Map(resolved.map(p=>[norm(p.player_name),p]));
    await db(`fantasy_league_rosters?league_team_id=eq.${seeded.id}`,{method:'DELETE'});
    const payload=parsed.rows.map((r,i)=>{const p=byYahoo.get(String(r.yahooKey))||byName.get(norm(r.name));if(!p)throw new Error(`Player identity missing for ${r.name}`);return{league_team_id:seeded.id,player_key:p.player_key,yahoo_player_key:p.yahoo_player_key,yahoo_player_name:p.yahoo_name||r.name,nfl_team:p.team||r.nflTeam||null,position:p.position||r.position||null,roster_slot:r.slot,lineup_order:r.lineupOrder??i,active:true,last_synced_at:when,updated_at:when}});
    await db('fantasy_league_rosters',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(payload)});return{total:payload.length,currentWeek:detectCurrentWeek(doc)};
  }

  function numberValues(text){return(String(text||'').match(/\b\d+\.\d{1,2}\b/g)||[]).map(Number)}
  function matchupStatus(lines){const t=lines.join(' ').toLowerCase();if(t.includes('final'))return'Final';if(t.includes('in progress')||t.includes('live'))return'Live';if(t.includes('not started'))return'Not started';return null}
  function weeklyMatchupsFrom(doc,week,teams){
    const raw=(doc.body?.innerText||'').split('\n').map(clean).filter(Boolean);let start=raw.findIndex(x=>norm(x).includes(norm(`Week ${week} Matchups`)));if(start<0)start=raw.findIndex(x=>norm(x)==='matchups');if(start<0)start=0;let end=raw.findIndex((x,i)=>i>start&&(norm(x)==='standings'||norm(x).startsWith('recent transactions')));if(end<0)end=raw.length;
    const lines=raw.slice(start,end),byName=new Map(teams.map(t=>[norm(t.team_name),t])),hits=[],seen=new Set();for(let i=0;i<lines.length;i++){const t=byName.get(norm(lines[i]));if(t&&!seen.has(t.id)){hits.push({index:i,team:t});seen.add(t.id)}}
    const out=[];for(let i=0;i+1<hits.length;i+=2){const a=hits[i],b=hits[i+1],nums=numberValues(lines.slice(a.index+1,b.index).join(' '));let ap=null,bp=null,apro=null,bpro=null;if(nums.length>=4)[ap,apro,bp,bpro]=nums.slice(0,4);else if(nums.length>=2)[ap,bp]=nums.slice(0,2);const ids=[String(a.team.yahoo_team_key||''),String(b.team.yahoo_team_key||'')].sort((x,y)=>Number(x)-Number(y));if(!ids[0]||!ids[1])continue;out.push({league_key:LEAGUE_KEY,week,matchup_key:`w${week}-t${ids[0]}-t${ids[1]}`,team_a_id:a.team.id,team_b_id:b.team.id,team_a_yahoo_key:String(a.team.yahoo_team_key),team_b_yahoo_key:String(b.team.yahoo_team_key),team_a_name:a.team.team_name,team_b_name:b.team.team_name,team_a_points:ap,team_b_points:bp,team_a_projected:apro,team_b_projected:bpro,status:matchupStatus(lines),is_playoffs:week>=15,last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()})}return out;
  }
  async function syncAllMatchups(teams,when){const result={matchups:0,weeks:0,warnings:[]};for(let week=1;week<=18;week++){try{await progress('SYNC LEAGUE MATCHUPS',{week});const rows=weeklyMatchupsFrom(await page(`/f1/${LEAGUE}/?lhst=matchups&matchup_week=${week}&module=matchups`),week,teams);if(rows.length){await db(`fantasy_league_matchups?league_key=eq.${LEAGUE_KEY}&week=eq.${week}`,{method:'DELETE'});await db('fantasy_league_matchups',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows.map(r=>({...r,last_synced_at:when,updated_at:when})))});result.matchups+=rows.length}result.weeks++}catch(e){result.warnings.push({week,message:e.message})}}return result}

  function mergeMetrics(base,metrics){const byYahoo=new Map(metrics.map(r=>[String(r.yahooPlayerKey),r])),byName=new Map(metrics.map(r=>[norm(r.name),r]));return base.map(r=>{const m=byYahoo.get(String(r.yahooKey))||byName.get(norm(r.name));return m?{...r,fantasyPoints:m.fantasyPoints??r.fantasyPoints,projectedPoints:m.projectedPoints??r.projectedPoints,opponent:m.opponent||r.opponent,gameTime:m.gameTime||r.gameTime,gameStatus:m.gameStatus||r.gameStatus}:r})}
  async function syncTeamWeek(team,week,index,catalog,when){
    const rosterDoc=await page(`/f1/${LEAGUE}/${team.yahoo_team_key}?week=${week}`);let parsed=rosterFrom(rosterDoc);if(!parsed.rows.length)return 0;
    try{const matchupDoc=await page(`/f1/${LEAGUE}/${team.yahoo_team_key}/matchup?week=${week}`),metricRows=yahooPlayersFrom(matchupDoc);if(metricRows.length)parsed={...parsed,rows:mergeMetrics(parsed.rows,metricRows)}}catch{}
    const resolved=await upsertFantasyPlayers(parsed.rows.map(r=>({name:r.name,yahooPlayerKey:r.yahooKey,team:r.nflTeam,position:r.position,yahooRank:r.yahooRank})),index,catalog,when,'Yahoo weekly roster sync'),byYahoo=new Map(resolved.map(p=>[String(p.yahoo_player_key),p])),byName=new Map(resolved.map(p=>[norm(p.player_name),p]));
    const payload=parsed.rows.map((r,i)=>{const p=byYahoo.get(String(r.yahooKey))||byName.get(norm(r.name));return{league_key:LEAGUE_KEY,week,player_key:p?.player_key||null,yahoo_player_key:p?.yahoo_player_key||String(r.yahooKey),yahoo_player_name:p?.yahoo_name||r.name,league_team_id:team.id,roster_slot:r.slot,lineup_order:r.lineupOrder??i,is_starter:isStarter(r.slot),nfl_team:p?.team||r.nflTeam||null,position:p?.position||r.position||null,opponent:r.opponent,game_time:r.gameTime,game_status:r.gameStatus,fantasy_points:r.fantasyPoints,projected_points:r.projectedPoints,last_synced_at:when,updated_at:when}});
    await db(`fantasy_player_week_stats?league_key=eq.${LEAGUE_KEY}&week=eq.${week}&league_team_id=eq.${team.id}`,{method:'DELETE'});if(payload.length)await db('fantasy_player_week_stats?on_conflict=league_key,week,yahoo_player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(payload)});return payload.length;
  }
  async function syncWeeklyPlayerData(teams,matchups,currentWeek,index,catalog,when){
    const targets=new Map(),add=(team,week)=>{if(team&&week>=1&&week<=18)targets.set(`${team.id}:${week}`,{team,week})};for(const t of teams)add(t,currentWeek);
    const me=teams.find(t=>String(t.yahoo_team_key)===OWNER_TEAM);for(let week=1;week<=18;week++){const m=matchups.find(x=>Number(x.week)===week&&(x.team_a_id===me?.id||x.team_b_id===me?.id));if(!m)continue;add(me,week);add(teams.find(t=>t.id===(m.team_a_id===me.id?m.team_b_id:m.team_a_id)),week)}
    let rows=0;const warnings=[],list=[...targets.values()];for(let i=0;i<list.length;i+=3){const batch=list.slice(i,i+3),results=await Promise.all(batch.map(async x=>{try{await progress('SYNC WEEKLY PLAYER POINTS',{team:x.team.team_name,week:x.week});return await syncTeamWeek(x.team,x.week,index,catalog,when)}catch(e){warnings.push({team:x.team.team_name,week:x.week,message:e.message});return 0}}));rows+=results.reduce((a,b)=>a+b,0)}return{rows,targets:list.length,warnings};
  }
  function availabilityFromText(row){const text=`${row.statusText||''} ${row.rowText||''}`;return/waiver|waiv|\bW\s*\(/i.test(text)?'WAIVERS':'FREE_AGENT'}
  async function syncPlayerPool(available,teams,index,catalog,currentWeek,when){
    await progress('SYNC WAIVER PLAYER POOL',{available:available.length});const resolved=await upsertFantasyPlayers(available,index,catalog,when,'Yahoo available player pool'),resolvedMap=new Map(resolved.map(p=>[String(p.yahoo_player_key),p]));const rosters=await db(`fantasy_league_rosters?select=*&league_team_id=in.(${teams.map(t=>t.id).join(',')})&active=eq.true`),teamById=new Map(teams.map(t=>[t.id,t])),pool=[];
    for(const r of available){const p=resolvedMap.get(String(r.yahooPlayerKey));pool.push({league_key:LEAGUE_KEY,player_key:p?.player_key||null,yahoo_player_key:String(r.yahooPlayerKey),yahoo_player_name:p?.yahoo_name||r.name,nfl_team:p?.team||r.team||null,position:p?.position||r.position||null,availability_status:availabilityFromText(r),owning_team_id:null,owning_team_name:null,waiver_clear_text:/waiver/i.test(r.rowText||'')?r.statusText||null:null,yahoo_rank:r.yahooRank,percent_rostered:r.percentRostered,percent_started:r.percentStarted,current_week:currentWeek,fantasy_points:r.fantasyPoints,projected_points:r.projectedPoints,opponent:r.opponent,game_time:r.gameTime,game_status:r.gameStatus,last_synced_at:when,updated_at:when})}
    for(const r of rosters||[]){if(pool.some(p=>p.yahoo_player_key===String(r.yahoo_player_key)))continue;const team=teamById.get(r.league_team_id);pool.push({league_key:LEAGUE_KEY,player_key:r.player_key,yahoo_player_key:String(r.yahoo_player_key),yahoo_player_name:r.yahoo_player_name,nfl_team:r.nfl_team,position:r.position,availability_status:'ROSTERED',owning_team_id:r.league_team_id,owning_team_name:team?.team_name||null,current_week:currentWeek,last_synced_at:when,updated_at:when})}
    await db(`fantasy_league_player_pool?league_key=eq.${LEAGUE_KEY}`,{method:'DELETE'});for(let i=0;i<pool.length;i+=100)await db('fantasy_league_player_pool?on_conflict=league_key,yahoo_player_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(pool.slice(i,i+100))});return{total:pool.length,available:pool.filter(p=>p.availability_status!=='ROSTERED').length,waivers:pool.filter(p=>p.availability_status==='WAIVERS').length,freeAgents:pool.filter(p=>p.availability_status==='FREE_AGENT').length,rostered:pool.filter(p=>p.availability_status==='ROSTERED').length};
  }

  async function sync(){
    if(syncing)throw new Error('Sync already running.');syncing=true;lastError=null;const when=new Date().toISOString();
    try{
      const [teamsDoc,existingTeams,catalogRows,existingPlayers]=await Promise.all([page(`/f1/${LEAGUE}/teams`),db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}`),db('draft_player_catalog?select=player_key,yahoo_name,display_name,team,position,role,yahoo_rank,source,aliases,active&active=eq.true'),db('fantasy_players?select=*')]);
      const teams=teamsFrom(teamsDoc);if(teams.length<2)throw new Error(`Yahoo team list could not be read. Detected ${teams.length} teams.`);const identity=await resolveIdentity(teams),catalog=buildCatalogIndex(catalogRows||[]),index=buildPlayerIndex(existingPlayers||[]),currentWeek=detectCurrentWeek(teamsDoc),available=await loadYahooAvailablePool();await upsertFantasyPlayers(available.players,index,catalog,when,'Yahoo /players available pool');
      const result={version:VERSION,leagueId:LEAGUE,myTeamKey:OWNER_TEAM,myTeamName:identity.teamName,currentWeek,teams:0,players:0,matched:0,unmatched:0,yahooPlayersDetected:available.players.length,yahooPlayerPages:available.pages,errors:[],syncedAt:when};
      for(const team of teams){try{const r=await saveTeam(team,existingTeams,index,catalog,when);result.teams++;result.players+=r.total;result.matched+=r.total}catch(e){result.errors.push(await fail(e,{teamId:team.id,teamName:team.name}))}}
      const refreshedTeams=await db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true`),schedule=await syncAllMatchups(refreshedTeams,when);result.matchups=schedule.matchups;result.matchupWeeks=schedule.weeks;result.matchupWarnings=schedule.warnings;const refreshedMatchups=await db(`fantasy_league_matchups?select=*&league_key=eq.${LEAGUE_KEY}`),weekly=await syncWeeklyPlayerData(refreshedTeams,refreshedMatchups,currentWeek,index,catalog,when);result.weekStatRows=weekly.rows;result.weekStatTargets=weekly.targets;result.weekStatWarnings=weekly.warnings;const pool=await syncPlayerPool(available.players,refreshedTeams,index,catalog,currentWeek,when);result.playerPool=pool;
      await progress(result.errors.length?'PARTIAL SYNC':'COMPLETE',{teams:result.teams,rosterSpots:result.players,matchups:result.matchups,weekStatRows:result.weekStatRows,pool:pool.total});last=result;await chrome.storage.local.set({fantasyLeagueLastSync:result,fantasyLeagueLastError:result.errors.at(-1)||null});return result;
    }catch(e){await fail(e,e.context||{});throw e}finally{syncing=false}
  }

  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{if(msg?.type==='SYNC_LEAGUE'){sync().then(result=>reply({ok:result.errors.length===0,partial:result.errors.length>0,result,error:result.errors[0]?.message||null,diagnostics:[...result.errors,...(result.weekStatWarnings||[])]})).catch(async e=>reply({ok:false,error:e.message,diagnostics:[lastError||await fail(e)]}));return true}if(msg?.type==='LEAGUE_STATUS'){chrome.storage.local.get(['fantasyLeagueLastSync','fantasyLeagueLastError','fantasyLeagueProgress','fantasyLeagueIdentity']).then(x=>reply({ok:true,lastSync:last||x.fantasyLeagueLastSync||null,lastError:lastError||x.fantasyLeagueLastError||null,progress:x.fantasyLeagueProgress||null,identity:x.fantasyLeagueIdentity||null,syncing,stage}));return true}});
})();
