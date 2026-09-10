(() => {
  'use strict';

  const SB='https://bbodmhffnqebhfksjier.supabase.co';
  const KEY='sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn';
  const HEAD={apikey:KEY,Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'};
  const LEAGUE='497223';
  const LEAGUE_KEY='battle-of-the-kings-2026';
  const VERSION='3.1.0';
  const PLAYER_PAGE_SIZE=25;
  const PLAYER_PAGE_LIMIT=20;

  const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
  const norm=v=>clean(v).toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(jr|sr|ii|iii|iv)\b/g,' ').replace(/\s+/g,' ').trim();

  let syncing=false;
  let last=null;
  let lastError=null;
  let stage='READY';

  function explicitTeamIdFromUrl(){
    const m=location.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
    return m?m[1]:null;
  }

  function teamNameFromPage(teamId){
    if(!teamId)return null;
    const exactPath=`/f1/${LEAGUE}/${teamId}`;
    const candidates=[...document.querySelectorAll('a[href]')]
      .filter(a=>{try{return new URL(a.getAttribute('href'),location.origin).pathname.replace(/\/$/,'')===exactPath}catch{return false}})
      .map(a=>clean(a.textContent))
      .filter(t=>t&&!/^(roster|players|matchup|edit|team)$/i.test(t));
    candidates.sort((a,b)=>b.length-a.length);
    return candidates[0]||null;
  }

  async function resolveIdentity(knownTeams=[]){
    const key=`fantasyIdentity:${LEAGUE}`;
    const stored=(await chrome.storage.local.get([key]))[key]||null;
    const explicitId=explicitTeamIdFromUrl();
    if(explicitId){
      const known=knownTeams.find(t=>String(t.id||t.yahoo_team_key||'')===String(explicitId));
      const identity={
        leagueId:LEAGUE,
        teamId:String(explicitId),
        teamName:known?.name||known?.team_name||teamNameFromPage(explicitId)||stored?.teamName||`Yahoo Team ${explicitId}`,
        detectedFrom:'url',
        updatedAt:new Date().toISOString()
      };
      await chrome.storage.local.set({[key]:identity,fantasyLeagueIdentity:identity});
      return identity;
    }
    if(stored){
      await chrome.storage.local.set({fantasyLeagueIdentity:stored});
      return stored;
    }
    return null;
  }

  async function progress(next,extra={}){
    stage=next;
    const payload={version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};
    try{await chrome.storage.local.set({fantasyLeagueProgress:payload})}catch(_e){}
    return payload;
  }

  async function fail(error,extra={}){
    lastError={message:error?.message||String(error),stack:error?.stack||'',version:VERSION,stage,page:location.href,leagueId:LEAGUE,time:new Date().toISOString(),...extra};
    try{await chrome.storage.local.set({fantasyLeagueLastError:lastError})}catch(_e){}
    return lastError;
  }

  async function db(path,opt={}){
    await progress(`DATABASE ${String(opt.method||'GET').toUpperCase()}`,{resource:path.split('?')[0]});
    const response=await fetch(`${SB}/rest/v1/${path}`,{...opt,headers:{...HEAD,...(opt.headers||{})}});
    const text=await response.text();
    if(!response.ok)throw Error(`Database ${response.status} ${response.statusText}: ${text||'(empty response)'}`);
    return text?JSON.parse(text):null;
  }

  async function page(path){
    await progress('YAHOO PAGE FETCH',{yahooPath:path});
    const response=await fetch(path,{cache:'no-store',credentials:'include'});
    if(!response.ok)throw Error(`Yahoo ${response.status} ${response.statusText}: ${path}`);
    const html=await response.text();
    return new DOMParser().parseFromString(html,'text/html');
  }

  function teamsFrom(doc){
    const byId=new Map();
    for(const a of doc.querySelectorAll('a[href]')){
      let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}
      const m=u.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
      if(!m)continue;
      const id=m[1];
      const name=clean(a.textContent);
      if(Number(id)<1||Number(id)>30||!name||name.length>80||/^(roster|players|matchup|edit|league|overview|research|draft)$/i.test(name))continue;
      const exact=new RegExp(`^/f1/${LEAGUE}/${id}/?$`).test(u.pathname);
      if(!byId.has(id))byId.set(id,[]);
      byId.get(id).push({id,name,exact});
    }
    return [...byId.entries()].map(([id,items])=>{
      items.sort((a,b)=>(b.exact-a.exact)||(a.name.length-b.name.length));
      return {id,name:items[0].name,alternates:[...new Set(items.map(x=>x.name))].slice(0,5)};
    }).sort((a,b)=>Number(a.id)-Number(b.id));
  }

  function playerAnchor(tr){
    const links=[...tr.querySelectorAll('a[href]')];
    return links.find(a=>/\/nfl\/players\/\d+|\/player\/\d+|playerId=|player_id=/i.test(a.getAttribute('href')||''))||
      links.find(a=>{
        const t=clean(a.textContent);
        return t.length>2&&t.length<50&&/[a-z]/i.test(t)&&!/^([A-Z]{2,4}|add|drop|watch|news|stats|research)$/i.test(t);
      })||null;
  }

  function yahooKey(a,name){
    const href=a?.getAttribute('href')||'';
    const m=href.match(/\/nfl\/players\/(\d+)|\/player\/(\d+)|[?&](?:player_id|playerId|pid)=(\d+)/i);
    return m?(m[1]||m[2]||m[3]):`name:${norm(name)}`;
  }

  function positionFromText(text){
    const t=clean(text).toUpperCase();
    let m=t.match(/\b([A-Z]{2,3})\s*[-–·]\s*(QB|RB|WR|TE|K|DEF)\b/);
    if(m)return {team:m[1],position:m[2]};
    m=t.match(/\b(QB|RB|WR|TE|K|DEF)\s*[-–·]\s*([A-Z]{2,3})\b/);
    if(m)return {team:m[2],position:m[1]};
    return {team:null,position:null};
  }

  function slotOf(tr){
    const valid=['Q/W/R/T','W/R/T','W/R','QB','RB','WR','TE','K','DEF','BN','IR+','IR','NA'];
    for(const cell of [...tr.querySelectorAll('th,td')].slice(0,5)){
      const t=clean(cell.textContent).toUpperCase().replace(/\s+/g,'');
      for(const slot of valid)if(t===slot.replace(/\s+/g,''))return slot;
    }
    return null;
  }

  function yahooPlayersFrom(doc){
    const out=[];
    const seen=new Set();
    for(const tr of doc.querySelectorAll('tr')){
      const a=playerAnchor(tr);
      if(!a)continue;
      const name=clean(a.textContent);
      const meta=positionFromText(tr.textContent||'');
      if(!name||!meta.position)continue;
      const key=yahooKey(a,name);
      const identity=`${key}|${norm(name)}`;
      if(seen.has(identity))continue;
      seen.add(identity);
      out.push({name,yahooPlayerKey:key,team:meta.team,position:meta.position});
    }
    return out;
  }

  async function loadYahooPlayerPool(){
    const all=[];
    const seen=new Set();
    let pages=0;
    for(let pageIndex=0;pageIndex<PLAYER_PAGE_LIMIT;pageIndex++){
      const offset=pageIndex*PLAYER_PAGE_SIZE;
      const path=offset?`/f1/${LEAGUE}/players?count=${offset}`:`/f1/${LEAGUE}/players`;
      const doc=await page(path);
      const rows=yahooPlayersFrom(doc);
      let added=0;
      for(const row of rows){
        const id=row.yahooPlayerKey||`name:${norm(row.name)}`;
        if(seen.has(id))continue;
        seen.add(id);
        all.push(row);
        added++;
      }
      pages++;
      if(pageIndex===0&&!rows.length){
        throw Object.assign(Error('Yahoo Players page loaded, but no player rows were detected.'),{context:{yahooPath:path,pageTitle:doc.title||'',tableRows:doc.querySelectorAll('tr').length}});
      }
      if(added===0||rows.length<PLAYER_PAGE_SIZE)break;
    }
    return {players:all,pages};
  }

  function rosterFrom(doc){
    const rows=[];
    const debug=[];
    for(const tr of doc.querySelectorAll('tr')){
      const a=playerAnchor(tr);
      if(!a)continue;
      const name=clean(a.textContent);
      const slot=slotOf(tr);
      if(debug.length<8)debug.push({name,slot,row:clean(tr.textContent).slice(0,180)});
      if(!name||!slot||rows.some(x=>x.name===name))continue;
      const meta=positionFromText(tr.textContent||'');
      rows.push({name,slot,yahooKey:yahooKey(a,name),nflTeam:meta.team,position:meta.position||(['QB','RB','WR','TE','K','DEF'].includes(slot)?slot:null)});
    }
    return {rows,debug,title:doc.title||'',bodySample:clean(doc.body?.innerText||'').slice(0,500),tableRows:doc.querySelectorAll('tr').length};
  }

  function catalogIndex(catalog){
    const byName=new Map();
    const add=(name,row)=>{
      const key=norm(name);
      if(key&&!byName.has(key))byName.set(key,row);
    };
    for(const row of catalog||[]){
      add(row.yahoo_name,row);
      add(row.display_name,row);
      for(const alias of row.aliases||[])add(alias,row);
    }
    return byName;
  }

  function fantasyPlayerIndex(players){
    const byKey=new Map();
    const byYahoo=new Map();
    const byName=new Map();
    for(const row of players||[]){
      if(row.player_key)byKey.set(String(row.player_key),row);
      if(row.yahoo_player_key)byYahoo.set(String(row.yahoo_player_key),row);
      for(const name of [row.yahoo_name,row.player_name]){
        const key=norm(name);
        if(key&&!byName.has(key))byName.set(key,row);
      }
    }
    return {byKey,byYahoo,byName};
  }

  function resolvePlayerIdentity(yahooPlayer,players,catalog){
    const yahooId=String(yahooPlayer.yahooPlayerKey||`name:${norm(yahooPlayer.name)}`);
    const existing=players.byYahoo.get(yahooId)||players.byName.get(norm(yahooPlayer.name));
    const catalogRow=catalog.get(norm(yahooPlayer.name))||null;
    const playerKey=existing?.player_key||catalogRow?.player_key||`yahoo:${yahooId}`;
    return {
      player_key:playerKey,
      player_name:yahooPlayer.name,
      team:yahooPlayer.team||existing?.team||catalogRow?.team||null,
      position:yahooPlayer.position||existing?.position||catalogRow?.position||null,
      role:existing?.role||catalogRow?.role||null,
      yahoo_rank:existing?.yahoo_rank??catalogRow?.yahoo_rank??null,
      yahoo_rank_source:existing?.yahoo_rank_source||catalogRow?.source||'Yahoo',
      yahoo_player_key:yahooId,
      yahoo_name:yahooPlayer.name,
      active:true,
      source:'Yahoo live sync',
      yahoo_verified:true
    };
  }

  function indexFantasyPlayer(row,index){
    if(row.player_key)index.byKey.set(String(row.player_key),row);
    if(row.yahoo_player_key)index.byYahoo.set(String(row.yahoo_player_key),row);
    for(const name of [row.yahoo_name,row.player_name]){
      const key=norm(name);
      if(key&&!index.byName.has(key))index.byName.set(key,row);
    }
  }

  async function upsertFantasyPlayers(yahooPlayers,playerIndex,catalog,when,source){
    const payload=[];
    for(const yahooPlayer of yahooPlayers){
      const row=resolvePlayerIdentity(yahooPlayer,playerIndex,catalog);
      row.source=source;
      row.yahoo_verified_at=when;
      row.last_seen_at=when;
      row.updated_at=when;
      payload.push(row);
      indexFantasyPlayer(row,playerIndex);
    }

    for(let i=0;i<payload.length;i+=100){
      const batch=payload.slice(i,i+100);
      await db('fantasy_players?on_conflict=player_key',{
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
        body:JSON.stringify(batch)
      });
    }
    return payload;
  }

  function teamMatch(team,existing){
    const byKey=existing.find(x=>String(x.yahoo_team_key||'')===String(team.id));
    if(byKey)return byKey;
    const names=[team.name,...team.alternates].map(norm);
    const exact=existing.filter(x=>names.includes(norm(x.team_name)));
    if(exact.length===1)return exact[0];
    const fuzzy=existing.filter(x=>names.some(n=>n.includes(norm(x.team_name))||norm(x.team_name).includes(n)));
    return fuzzy.length===1?fuzzy[0]:null;
  }

  async function saveTeam(team,existingTeams,players,catalog,when){
    await progress('MATCH TEAM',{teamId:team.id,teamName:team.name});
    const seeded=teamMatch(team,existingTeams);
    if(!seeded){
      throw Object.assign(Error(`Could not match Yahoo team #${team.id}: ${team.name}`),{context:{teamId:team.id,teamName:team.name,alternates:team.alternates,databaseTeams:existingTeams.map(x=>x.team_name)}});
    }

    await db(`fantasy_league_teams?id=eq.${seeded.id}&select=*`,{
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({yahoo_team_key:team.id,last_synced_at:when,updated_at:when})
    });

    await progress('PARSE ROSTER',{teamId:team.id,teamName:seeded.team_name});
    const parsed=rosterFrom(await page(`/f1/${LEAGUE}/${team.id}`));
    if(!parsed.rows.length){
      throw Object.assign(Error(`0 roster players detected for ${seeded.team_name}. Yahoo page loaded but the roster table was not readable.`),{context:{teamId:team.id,teamName:seeded.team_name,pageTitle:parsed.title,tableRows:parsed.tableRows,playerRowSamples:parsed.debug,bodySample:parsed.bodySample}});
    }

    const rosterYahooPlayers=parsed.rows.map(row=>({name:row.name,yahooPlayerKey:row.yahooKey,team:row.nflTeam,position:row.position}));
    const resolved=await upsertFantasyPlayers(rosterYahooPlayers,players,catalog,when,'Yahoo roster live sync');
    const resolvedByYahoo=new Map(resolved.map(row=>[String(row.yahoo_player_key),row]));
    const resolvedByName=new Map(resolved.map(row=>[norm(row.player_name),row]));

    await db(`fantasy_league_rosters?league_team_id=eq.${seeded.id}`,{method:'DELETE'});

    const payload=parsed.rows.map(row=>{
      const player=resolvedByYahoo.get(String(row.yahooKey))||resolvedByName.get(norm(row.name));
      return {
        league_team_id:seeded.id,
        player_key:player.player_key,
        yahoo_player_key:player.yahoo_player_key,
        yahoo_player_name:player.yahoo_name||row.name,
        nfl_team:player.team||row.nflTeam||null,
        position:player.position||row.position||null,
        roster_slot:row.slot,
        active:true,
        last_synced_at:when,
        updated_at:when
      };
    });

    await db('fantasy_league_rosters',{
      method:'POST',
      headers:{Prefer:'return=minimal'},
      body:JSON.stringify(payload)
    });

    return {
      teamName:seeded.team_name,
      yahooTeamKey:team.id,
      total:payload.length,
      matched:payload.length,
      unmatched:0,
      playerSource:'fantasy_players / Yahoo'
    };
  }

  function numberValues(text){
    return (String(text||'').match(/\b\d+\.\d{1,2}\b/g)||[]).map(Number);
  }

  function matchupStatus(lines){
    const text=lines.join(' ').toLowerCase();
    if(text.includes('final results')||text.includes('final'))return 'Final';
    if(text.includes('in progress')||text.includes('live'))return 'Live';
    if(text.includes('not started'))return 'Not started';
    return null;
  }

  function weeklyMatchupsFrom(doc,week,teams){
    const raw=(doc.body?.innerText||'').split('\n').map(clean).filter(Boolean);
    let start=raw.findIndex(x=>norm(x)===norm(`Week ${week} Matchups`)||norm(x).includes(norm(`Week ${week} Matchups`)));
    if(start<0)start=raw.findIndex(x=>norm(x)==='matchups');
    if(start<0)start=0;
    let end=raw.findIndex((x,i)=>i>start&&(norm(x)==='standings'||norm(x).startsWith('recent transactions')));
    if(end<0)end=raw.length;
    const lines=raw.slice(start,end);

    const byName=new Map();
    for(const team of teams)byName.set(norm(team.team_name),team);

    const hits=[];
    const seen=new Set();
    for(let i=0;i<lines.length;i++){
      const team=byName.get(norm(lines[i]));
      if(team&&!seen.has(team.id)){
        hits.push({index:i,team});
        seen.add(team.id);
      }
    }

    const out=[];
    for(let i=0;i+1<hits.length;i+=2){
      const a=hits[i];
      const b=hits[i+1];
      const between=lines.slice(a.index+1,b.index);
      const nums=numberValues(between.join(' '));
      let aPoints=null,bPoints=null,aProjected=null,bProjected=null;
      if(nums.length>=4)[aPoints,aProjected,bPoints,bProjected]=nums.slice(0,4);
      else if(nums.length>=2)[aPoints,bPoints]=nums.slice(0,2);

      const ids=[String(a.team.yahoo_team_key||''),String(b.team.yahoo_team_key||'')].sort((x,y)=>Number(x)-Number(y));
      if(!ids[0]||!ids[1])continue;
      out.push({
        league_key:LEAGUE_KEY,
        week,
        matchup_key:`w${week}-t${ids[0]}-t${ids[1]}`,
        team_a_id:a.team.id,
        team_b_id:b.team.id,
        team_a_yahoo_key:String(a.team.yahoo_team_key),
        team_b_yahoo_key:String(b.team.yahoo_team_key),
        team_a_name:a.team.team_name,
        team_b_name:b.team.team_name,
        team_a_points:aPoints,
        team_b_points:bPoints,
        team_a_projected:aProjected,
        team_b_projected:bProjected,
        status:matchupStatus(lines),
        is_playoffs:week>=15,
        last_synced_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      });
    }

    return {rows:out,debug:{pageTitle:doc.title||'',startLine:start,endLine:end,teamHits:hits.map(h=>({team:h.team.team_name,yahooTeamKey:h.team.yahoo_team_key,line:h.index})),sample:lines.slice(0,80)}};
  }

  async function syncAllMatchups(existingTeams,when){
    const result={matchups:0,weeks:0,weekResults:[],warnings:[]};
    for(let week=1;week<=18;week++){
      await progress('SYNC MATCHUPS',{week});
      try{
        const doc=await page(`/f1/${LEAGUE}/?lhst=matchups&matchup_week=${week}&module=matchups`);
        const parsed=weeklyMatchupsFrom(doc,week,existingTeams);
        await db(`fantasy_league_matchups?league_key=eq.${LEAGUE_KEY}&week=eq.${week}`,{method:'DELETE'});
        if(parsed.rows.length){
          const rows=parsed.rows.map(row=>({...row,last_synced_at:when,updated_at:when}));
          await db('fantasy_league_matchups',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(rows)});
        }
        result.weeks++;
        result.matchups+=parsed.rows.length;
        result.weekResults.push({week,matchups:parsed.rows.length});
        if(parsed.rows.length===0)result.warnings.push({week,message:`No matchup pairs detected for Week ${week}.`,debug:parsed.debug});
      }catch(error){
        result.warnings.push({week,message:error.message});
      }
    }
    return result;
  }

  async function sync(){
    if(syncing)throw Error('Sync already running.');
    syncing=true;
    lastError=null;
    const when=new Date().toISOString();

    try{
      await progress('LOAD LEAGUE');
      const [teamsDoc,existingTeams,catalog,existingPlayers]=await Promise.all([
        page(`/f1/${LEAGUE}/teams`),
        db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}`),
        db('draft_player_catalog?select=player_key,yahoo_name,display_name,team,position,role,yahoo_rank,yahoo_verified,source,aliases,active&active=eq.true'),
        db('fantasy_players?select=*')
      ]);

      await progress('PARSE TEAM LIST');
      const teams=teamsFrom(teamsDoc);
      if(teams.length<2)throw Object.assign(Error(`Yahoo team list could not be read. Detected ${teams.length} teams.`),{context:{teamsFound:teams}});

      const identity=await resolveIdentity(teams);
      const catalog=catalogIndex(catalog);
      const players=fantasyPlayerIndex(existingPlayers||[]);

      await progress('SYNC YAHOO PLAYER POOL');
      const yahooPool=await loadYahooPlayerPool();
      await upsertFantasyPlayers(yahooPool.players,players,catalog,when,'Yahoo /players live sync');

      const result={
        leagueId:LEAGUE,
        myTeamKey:identity?.teamId||null,
        myTeamName:identity?.teamName||null,
        playerSource:'Yahoo /players + Yahoo team rosters -> fantasy_players',
        yahooPlayersDetected:yahooPool.players.length,
        yahooPlayerPages:yahooPool.pages,
        teams:0,
        players:0,
        matched:0,
        unmatched:0,
        errors:[],
        teamResults:[],
        syncedAt:when
      };

      for(const team of teams){
        try{
          const row=await saveTeam(team,existingTeams,players,catalog,when);
          result.teamResults.push(row);
          result.teams++;
          result.players+=row.total;
          result.matched+=row.matched;
          result.unmatched+=row.unmatched;
        }catch(error){
          const diagnostic=await fail(error,error.context||{teamId:team.id,teamName:team.name});
          result.errors.push(diagnostic);
          result.teamResults.push({teamName:team.name,yahooTeamKey:team.id,error:diagnostic.message,total:0,matched:0,unmatched:0});
        }
      }

      const refreshedTeams=await db(`fantasy_league_teams?select=*&league_key=eq.${LEAGUE_KEY}&active=eq.true`);
      const schedule=await syncAllMatchups(refreshedTeams,when);
      result.matchups=schedule.matchups;
      result.matchupWeeks=schedule.weeks;
      result.matchupWarnings=schedule.warnings;
      result.weekResults=schedule.weekResults;

      await progress(result.errors.length?'PARTIAL SYNC':'COMPLETE',{
        errors:result.errors.length,
        yahooPlayersDetected:result.yahooPlayersDetected,
        matchups:result.matchups,
        matchupWarnings:result.matchupWarnings.length
      });

      last=result;
      await chrome.storage.local.set({fantasyLeagueLastSync:result,fantasyLeagueLastError:result.errors.at(-1)||null});
      return result;
    }catch(error){
      await fail(error,error.context||{});
      throw error;
    }finally{
      syncing=false;
    }
  }

  chrome.runtime.onMessage.addListener((msg,_sender,reply)=>{
    if(msg?.type==='SYNC_LEAGUE'){
      sync()
        .then(result=>reply({ok:result.errors.length===0,partial:result.errors.length>0,result,error:result.errors[0]?.message||null,diagnostics:result.errors}))
        .catch(async error=>reply({ok:false,error:error.message,diagnostics:[lastError||await fail(error)]}));
      return true;
    }

    if(msg?.type==='LEAGUE_STATUS'){
      chrome.storage.local.get(['fantasyLeagueLastSync','fantasyLeagueLastError','fantasyLeagueProgress','fantasyLeagueIdentity'])
        .then(data=>reply({ok:true,lastSync:last||data.fantasyLeagueLastSync||null,lastError:lastError||data.fantasyLeagueLastError||null,progress:data.fantasyLeagueProgress||null,identity:data.fantasyLeagueIdentity||null,syncing,stage}));
      return true;
    }
  });
})();
