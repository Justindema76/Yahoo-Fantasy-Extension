(() => {
  'use strict';
  const VERSION=chrome.runtime.getManifest().version;
  const LEAGUE='497223';
  const TEAM_NAMES={'1':'TEAM DOG SCIENCE','6':'House of the Dragon'};
  const STORAGE_KEY=`fantasyIdentity:${LEAGUE}`;
  const ID='fantasy-intel-connection';
  if(!location.pathname.startsWith(`/f1/${LEAGUE}`)||document.getElementById(ID))return;

  let identity=null;
  function identityFromPage(){
    const match=location.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
    if(!match)return null;
    const teamId=match[1];
    return {leagueId:LEAGUE,teamId,teamName:TEAM_NAMES[teamId]||`Yahoo Team ${teamId}`,detectedFrom:'yahoo-url',updatedAt:new Date().toISOString()};
  }
  async function resolveIdentity(){
    const detected=identityFromPage();
    const stored=await chrome.storage.local.get([STORAGE_KEY,'fantasyLeagueIdentity']);
    identity=detected||stored[STORAGE_KEY]||stored.fantasyLeagueIdentity||null;
    if(identity)await chrome.storage.local.set({[STORAGE_KEY]:identity,fantasyLeagueIdentity:identity});
    return identity;
  }

  const root=document.createElement('div');root.id=ID;
  root.innerHTML=`<button id="fi-pill"><span></span>FANTASY INTEL</button><section id="fi-panel" hidden><header><div><small>FANTASY INTEL · v${VERSION}</small><b id="fi-team-name">Your Yahoo Team</b><em id="fi-team-meta">Battle of the Kings · open your team page once</em></div><button id="fi-close">×</button></header><div id="fi-state"><strong>Yahoo connected</strong><span>Ready to sync.</span></div><div id="fi-stats" hidden><div><b id="fi-teams">0</b><span>TEAMS</span></div><div><b id="fi-rosters">0</b><span>ROSTER</span></div><div><b id="fi-weekly">0</b><span>WEEKLY</span></div><div><b id="fi-pool">0</b><span>POOL</span></div></div><div class="fi-actions"><button id="fi-sync">SYNC YAHOO</button><button id="fi-open">OPEN APP</button></div><pre id="fi-error" hidden></pre></section>`;
  const style=document.createElement('style');style.textContent=`#${ID}{position:fixed;left:16px;bottom:16px;z-index:2147483647;font-family:Inter,system-ui,-apple-system,sans-serif}#${ID} *{box-sizing:border-box}#fi-pill{border:1px solid #28734d;background:#092c1d;color:#eafff4;border-radius:999px;padding:10px 14px;font-size:10px;font-weight:950;box-shadow:0 10px 28px #0005;cursor:pointer}#fi-pill span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#38d487;margin-right:7px}#fi-panel{width:350px;background:#07111f;color:#eef8ff;border:1px solid #2b4765;border-radius:16px;padding:14px;box-shadow:0 18px 50px #0007}#fi-panel header{display:flex;justify-content:space-between;gap:10px}#fi-panel header small,#fi-panel header b,#fi-panel header em{display:block}#fi-panel header small{color:#5fd8ff;font-size:9px;font-weight:900}#fi-panel header b{font-size:17px;margin-top:2px}#fi-panel header em{font-style:normal;color:#95aac1;font-size:10px;margin-top:2px}#fi-close{border:0;background:transparent;color:#9bb0c6;font-size:24px;cursor:pointer}#fi-state{border:1px solid #1d6e4b;background:#092b1d;border-radius:11px;padding:10px;margin:12px 0}#fi-state strong,#fi-state span{display:block}#fi-state strong{font-size:12px}#fi-state span{font-size:9px;color:#9ac9ae;margin-top:2px}#fi-state.syncing{border-color:#826520;background:#32270c}#fi-state.error{border-color:#a13b43;background:#3a1117}.fi-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.fi-actions button{padding:10px 7px;border-radius:9px;font-size:9px;font-weight:950;cursor:pointer}.fi-actions button:first-child{background:#42cbff;border:0;color:#06111c}.fi-actions button:last-child{background:#10263f;border:1px solid #315474;color:#e6f2ff}#fi-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}#fi-stats div{text-align:center;border:1px solid #213c59;background:#0a192b;border-radius:8px;padding:7px 3px}#fi-stats b,#fi-stats span{display:block}#fi-stats span{color:#8199b3;font-size:7px;font-weight:900}#fi-error{white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;background:#260c10;color:#ffd9dc;border:1px solid #6e2930;border-radius:9px;padding:9px;font-size:9px;margin:10px 0 0}@media(max-width:650px){#${ID}{left:10px;right:10px;bottom:10px}#fi-panel{width:100%}}`;
  document.documentElement.append(style,root);

  const pill=document.getElementById('fi-pill'),panel=document.getElementById('fi-panel'),state=document.getElementById('fi-state'),sync=document.getElementById('fi-sync'),errorBox=document.getElementById('fi-error');
  const setState=(title,text,type='')=>{state.className=type;state.querySelector('strong').textContent=title;state.querySelector('span').textContent=text};
  const showIdentity=mine=>{document.getElementById('fi-team-name').textContent=mine?.teamName||'Your Yahoo Team';document.getElementById('fi-team-meta').textContent=mine?.teamId?`Battle of the Kings · Yahoo Team ${mine.teamId}`:'Battle of the Kings · open your team page once'};
  const showResult=r=>{if(!r)return;document.getElementById('fi-stats').hidden=false;document.getElementById('fi-teams').textContent=r.teams||0;document.getElementById('fi-rosters').textContent=r.players||0;document.getElementById('fi-weekly').textContent=r.weekStatRows||0;document.getElementById('fi-pool').textContent=r.playerPool?.total||0};
  const showError=e=>{errorBox.hidden=false;errorBox.textContent=JSON.stringify(e,null,2);setState('Sync failed',e?.message||'Unknown error','error')};
  const runSync=async()=>{
    sync.disabled=true;sync.textContent='SYNCING…';errorBox.hidden=true;
    try{
      const mine=await resolveIdentity();showIdentity(mine);
      if(!mine?.teamId)throw new Error('Open your own Yahoo team page first, then click SYNC YAHOO.');
      setState('Syncing Yahoo',`${mine.teamName}: teams, rosters, weekly scoring and waiver pool…`,'syncing');
      const response=await chrome.runtime.sendMessage({type:'SYNC_CURRENT_TAB'});
      if(response?.result)showResult(response.result);
      await chrome.storage.local.set({[STORAGE_KEY]:mine,fantasyLeagueIdentity:mine});
      if(!response?.ok){showError(response?.diagnostics?.[0]||{message:response?.error||'Sync failed'});return}
      setState('Sync complete',`${mine.teamName} · ${response.result.weekStatRows||0} weekly player rows · ${response.result.playerPool?.total||0} player-pool rows.`);
    }catch(e){showError({message:e.message,stage:'OVERLAY',version:VERSION})}
    finally{sync.disabled=false;sync.textContent='SYNC YAHOO'}
  };
  const openApp=async()=>{
    const mine=await resolveIdentity();showIdentity(mine);
    if(!mine?.teamId){showError({message:'Open your own Yahoo team page once before opening Fantasy Intel.',stage:'TEAM IDENTITY',version:VERSION});return}
    chrome.runtime.sendMessage({type:'OPEN_APP',leagueId:LEAGUE,teamId:mine.teamId});
  };

  pill.onclick=()=>{pill.hidden=true;panel.hidden=false};
  document.getElementById('fi-close').onclick=()=>{panel.hidden=true;pill.hidden=false};
  sync.onclick=runSync;
  document.getElementById('fi-open').onclick=openApp;
  resolveIdentity().then(showIdentity);
  chrome.storage.local.get(['fantasyLeagueLastSync','fantasyLeagueLastError']).then(d=>{if(d.fantasyLeagueLastSync)showResult(d.fantasyLeagueLastSync);if(d.fantasyLeagueLastError)showError(d.fantasyLeagueLastError)});
})();