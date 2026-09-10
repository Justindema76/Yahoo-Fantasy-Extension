(() => {
  'use strict';
  const VERSION='3.0.0';
  const LEAGUE='497223';
  const ID='fantasy-intel-connection';
  if(!location.pathname.startsWith(`/f1/${LEAGUE}`)||document.getElementById(ID))return;

  const root=document.createElement('div');
  root.id=ID;
  root.innerHTML=`
    <button id="fi-pill"><span class="fi-dot"></span><b>FANTASY INTEL</b><span id="fi-pill-status">CONNECTED</span></button>
    <section id="fi-panel">
      <div class="fi-head">
        <div><small>FANTASY INTEL · v${VERSION}</small><strong>Battle of the Kings</strong><span id="fi-team-label">Detecting your Yahoo team…</span></div>
        <button id="fi-collapse" aria-label="Collapse">×</button>
      </div>
      <div id="fi-status" class="fi-status"><span class="fi-dot"></span><div><b>Extension connected</b><small>Ready to sync Yahoo.</small></div></div>
      <div id="fi-stats" class="fi-stats" hidden>
        <div><b id="fi-teams">0</b><span>TEAMS</span></div><div><b id="fi-players">0</b><span>PLAYERS</span></div><div><b id="fi-matched">0</b><span>MATCHED</span></div><div><b id="fi-unmatched">0</b><span>UNMATCHED</span></div>
      </div>
      <div class="fi-actions"><button id="fi-sync">SYNC ALL TEAMS</button><button id="fi-open">OPEN FANTASY INTEL</button></div>
      <small id="fi-last" class="fi-last">Not synced yet</small>
    </section>
    <div id="fi-error-modal" hidden>
      <div class="fi-error-card">
        <div class="fi-error-title">FANTASY INTEL SYNC ERROR</div>
        <div class="fi-error-sub">Copy this diagnostic if the sync fails.</div>
        <div class="fi-error-grid">
          <div><span>STAGE</span><b id="fi-error-stage">—</b></div>
          <div><span>VERSION</span><b>${VERSION}</b></div>
          <div class="wide"><span>ERROR</span><b id="fi-error-message">—</b></div>
          <div class="wide"><span>TEAM / PAGE</span><b id="fi-error-team">—</b></div>
        </div>
        <pre id="fi-error-details"></pre>
        <div class="fi-error-actions"><button id="fi-copy">COPY ERROR</button><button id="fi-retry">RETRY SYNC</button><button id="fi-clear">CLEAR</button></div>
      </div>
    </div>`;

  const style=document.createElement('style');
  style.textContent=`
    #${ID}{position:fixed;left:18px;bottom:18px;z-index:2147483647;font-family:Inter,system-ui,-apple-system,sans-serif;color:#eef8ff}
    #${ID} *{box-sizing:border-box}#fi-pill{display:none;align-items:center;gap:7px;border:1px solid #1d7d50;background:#092c1d;color:#eafff4;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;box-shadow:0 10px 28px #0005}.fi-dot{width:9px;height:9px;border-radius:50%;background:#38d487;display:inline-block;box-shadow:0 0 0 4px #38d48722}#fi-pill-status{color:#8ff0bd;font-size:9px}
    #fi-panel{width:340px;border:1px solid #2b4765;background:linear-gradient(155deg,#07111f,#0d2138);border-radius:16px;padding:14px;box-shadow:0 18px 50px #0007}.fi-head{display:flex;justify-content:space-between;gap:12px}.fi-head small{color:#5fd8ff;font-size:9px;font-weight:900}.fi-head strong,.fi-head span{display:block}.fi-head strong{font-size:17px;margin-top:2px}.fi-head span{color:#95aac1;font-size:10px}.fi-head button{background:none;border:0;color:#9bb0c6;font-size:22px;cursor:pointer}
    .fi-status{display:flex;gap:10px;align-items:center;border:1px solid #1d6e4b;background:#092b1d;border-radius:11px;padding:10px;margin:12px 0}.fi-status b,.fi-status small{display:block}.fi-status b{font-size:12px}.fi-status small{font-size:9px;color:#9ac9ae}.fi-status.syncing{border-color:#826520;background:#32270c}.fi-status.syncing .fi-dot{background:#ffc84f}.fi-status.error{border-color:#a13b43;background:#3a1117}.fi-status.error .fi-dot{background:#ff6975}
    .fi-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px}.fi-stats div{border:1px solid #213c59;background:#0a192b;border-radius:8px;padding:7px 3px;text-align:center}.fi-stats b,.fi-stats span{display:block}.fi-stats span{color:#8199b3;font-size:7px;font-weight:900}.fi-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.fi-actions button{padding:9px 7px;border-radius:9px;font-size:9px;font-weight:900;cursor:pointer}.fi-actions button:first-child{background:#42cbff;border:0;color:#06111c}.fi-actions button:last-child{background:#10263f;border:1px solid #315474;color:#e6f2ff}.fi-last{display:block;text-align:center;color:#7089a2;font-size:8px;margin-top:9px}
    #fi-error-modal{position:fixed;inset:0;background:#000b;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:22px}#fi-error-modal[hidden]{display:none}.fi-error-card{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#240b0f;border:2px solid #ff6672;border-radius:18px;padding:18px;box-shadow:0 24px 80px #000}.fi-error-title{font-size:21px;font-weight:1000;color:#ff7a84}.fi-error-sub{color:#efb4b9;font-size:11px;margin:3px 0 14px}.fi-error-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.fi-error-grid div{background:#351116;border:1px solid #6e2930;border-radius:10px;padding:9px}.fi-error-grid .wide{grid-column:1/-1}.fi-error-grid span{display:block;color:#d88f95;font-size:8px;font-weight:900}.fi-error-grid b{display:block;margin-top:3px;font-size:12px;word-break:break-word}#fi-error-details{white-space:pre-wrap;word-break:break-word;background:#100406;border:1px solid #5c2228;border-radius:10px;padding:11px;max-height:280px;overflow:auto;color:#ffd9dc;font-size:10px;line-height:1.4}.fi-error-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.fi-error-actions button{padding:10px;border-radius:9px;font-weight:900;cursor:pointer}.fi-error-actions button:first-child{background:#ff6b76;border:0;color:#180205}.fi-error-actions button:nth-child(2){background:#42cbff;border:0;color:#06111c}.fi-error-actions button:last-child{background:#221014;border:1px solid #6e2930;color:#ffd4d7}
    @media(max-width:650px){#${ID}{left:10px;right:10px;bottom:10px}#fi-panel{width:100%}.fi-error-grid{grid-template-columns:1fr}.fi-error-grid .wide{grid-column:auto}.fi-error-actions{grid-template-columns:1fr}}
  `;
  document.documentElement.append(style,root);

  const panel=document.getElementById('fi-panel');
  const pill=document.getElementById('fi-pill');
  const status=document.getElementById('fi-status');
  const syncButton=document.getElementById('fi-sync');
  const modal=document.getElementById('fi-error-modal');
  let currentIdentity=null;
  let lastDiagnostic=null;
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();

  function explicitTeamId(){const match=location.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));return match?match[1]:null}
  function teamNameFromPage(teamId){
    if(!teamId)return null;
    const exact=`/f1/${LEAGUE}/${teamId}`;
    const names=[...document.querySelectorAll('a[href]')].filter(anchor=>{try{return new URL(anchor.getAttribute('href'),location.origin).pathname.replace(/\/$/,'')===exact}catch{return false}}).map(anchor=>clean(anchor.textContent)).filter(text=>text&&!/^(roster|players|matchup|edit|team)$/i.test(text));
    names.sort((a,b)=>b.length-a.length);
    return names[0]||null;
  }
  async function resolveIdentity(){
    const key=`fantasyIdentity:${LEAGUE}`;
    const data=await chrome.storage.local.get([key,'fantasyLeagueIdentity']);
    const teamId=explicitTeamId();
    if(teamId){
      currentIdentity={leagueId:LEAGUE,teamId,teamName:teamNameFromPage(teamId)||data[key]?.teamName||`Yahoo Team ${teamId}`,detectedFrom:'url',updatedAt:new Date().toISOString()};
      await chrome.storage.local.set({[key]:currentIdentity,fantasyLeagueIdentity:currentIdentity});
    }else currentIdentity=data[key]||data.fantasyLeagueIdentity||null;
    document.getElementById('fi-team-label').textContent=currentIdentity?`${currentIdentity.teamName} · Team ${currentIdentity.teamId}`:'Open your Yahoo team page once so Fantasy Intel can identify you.';
    return currentIdentity;
  }
  function collapse(){panel.style.display='none';pill.style.display='flex'}
  function expand(){panel.style.display='block';pill.style.display='none'}
  function setStatus(title,text,type=''){
    status.className=`fi-status ${type}`.trim();
    status.querySelector('b').textContent=title;
    status.querySelector('small').textContent=text;
    document.getElementById('fi-pill-status').textContent=type==='error'?'ERROR':type==='syncing'?'SYNCING':'CONNECTED';
  }
  function showResult(result){
    if(!result)return;
    if(result.myTeamKey){
      currentIdentity={leagueId:LEAGUE,teamId:String(result.myTeamKey),teamName:result.myTeamName||`Yahoo Team ${result.myTeamKey}`};
      chrome.storage.local.set({fantasyLeagueIdentity:currentIdentity,[`fantasyIdentity:${LEAGUE}`]:currentIdentity});
      document.getElementById('fi-team-label').textContent=`${currentIdentity.teamName} · Team ${currentIdentity.teamId}`;
    }
    document.getElementById('fi-stats').hidden=false;
    document.getElementById('fi-teams').textContent=result.teams||0;
    document.getElementById('fi-players').textContent=result.players||0;
    document.getElementById('fi-matched').textContent=result.matched||0;
    document.getElementById('fi-unmatched').textContent=result.unmatched||0;
    document.getElementById('fi-last').textContent=result.syncedAt?`Last sync: ${new Date(result.syncedAt).toLocaleString()}`:'Last sync complete';
  }
  function showError(diagnostic){
    lastDiagnostic=diagnostic||{message:'Unknown sync error',stage:'UNKNOWN',page:location.href,version:VERSION};
    document.getElementById('fi-error-stage').textContent=lastDiagnostic.stage||'UNKNOWN';
    document.getElementById('fi-error-message').textContent=lastDiagnostic.message||'Unknown error';
    document.getElementById('fi-error-team').textContent=[lastDiagnostic.teamName,lastDiagnostic.teamId?`Team #${lastDiagnostic.teamId}`:null,lastDiagnostic.yahooPath||lastDiagnostic.page].filter(Boolean).join(' · ');
    document.getElementById('fi-error-details').textContent=JSON.stringify(lastDiagnostic,null,2);
    modal.hidden=false;setStatus('Sync error','Diagnostic popup is open.','error');expand();
  }
  async function runSync(){
    syncButton.disabled=true;syncButton.textContent='SYNCING…';setStatus('Syncing league','Reading Yahoo teams, rosters and matchups.','syncing');
    try{
      const response=await chrome.runtime.sendMessage({type:'SYNC_CURRENT_TAB'});
      if(response?.result)showResult(response.result);
      if(!response?.ok){showError(response?.diagnostics?.[0]||{message:response?.error||'Sync failed',stage:'SYNC',version:VERSION});return}
      setStatus('Sync complete',`${response.result.teams} teams · ${response.result.players} players · ${response.result.matchups||0} matchups saved.`);
    }catch(error){showError({message:error.message,stage:'OVERLAY MESSAGE',page:location.href,version:VERSION,stack:error.stack})}
    finally{syncButton.disabled=false;syncButton.textContent='SYNC ALL TEAMS'}
  }
  async function openApp(){
    await resolveIdentity();
    const response=await chrome.runtime.sendMessage({type:'OPEN_APP',leagueId:LEAGUE,teamId:currentIdentity?.teamId||''});
    if(!response?.ok)showError({message:response?.error||'Could not open Fantasy Intel',stage:'OPEN APP',page:location.href,version:VERSION});
  }

  document.getElementById('fi-collapse').onclick=collapse;
  pill.onclick=expand;
  document.getElementById('fi-open').onclick=openApp;
  syncButton.onclick=runSync;
  document.getElementById('fi-retry').onclick=()=>{modal.hidden=true;runSync()};
  document.getElementById('fi-clear').onclick=()=>{modal.hidden=true;chrome.storage.local.remove('fantasyLeagueLastError')};
  document.getElementById('fi-copy').onclick=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(lastDiagnostic,null,2));document.getElementById('fi-copy').textContent='COPIED'}catch{document.getElementById('fi-copy').textContent='COPY FAILED'}};

  resolveIdentity();
  chrome.storage.local.get(['fantasyLeagueLastSync','fantasyLeagueLastError']).then(data=>{if(data.fantasyLeagueLastSync)showResult(data.fantasyLeagueLastSync);if(data.fantasyLeagueLastError)showError(data.fantasyLeagueLastError)});
  window.addEventListener('unhandledrejection',event=>showError({message:String(event.reason?.message||event.reason),stage:'UNHANDLED PROMISE',page:location.href,version:VERSION,stack:event.reason?.stack||''}));
  window.addEventListener('error',event=>showError({message:event.message,stage:'SCRIPT ERROR',page:location.href,version:VERSION,file:event.filename,line:event.lineno,column:event.colno}));
  setTimeout(()=>{if(modal.hidden)collapse()},8000);
})();
