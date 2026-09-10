(() => {
  'use strict';

  const LEAGUE='497223';
  const TEAM_NAMES={'1':'TEAM DOG SCIENCE','6':'House of the Dragon'};
  const STORAGE_KEY=`fantasyIdentity:${LEAGUE}`;

  function clean(v){return String(v||'').replace(/\s+/g,' ').trim()}
  function teamIdFromPath(pathname=location.pathname){
    const m=String(pathname||'').match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
    return m?.[1]||null;
  }
  function teamIdFromMyTeamLink(){
    for(const a of document.querySelectorAll('a[href]')){
      const label=clean(`${a.textContent||''} ${a.getAttribute('aria-label')||''} ${a.getAttribute('title')||''}`);
      if(!/\bmy team\b/i.test(label))continue;
      let u;try{u=new URL(a.getAttribute('href'),location.origin)}catch{continue}
      const id=teamIdFromPath(u.pathname);
      if(id)return id;
    }
    return null;
  }
  async function detectAndStore(){
    const teamId=teamIdFromPath()||teamIdFromMyTeamLink();
    if(!teamId)return false;
    const identity={
      leagueId:LEAGUE,
      teamId:String(teamId),
      teamName:TEAM_NAMES[teamId]||`Yahoo Team ${teamId}`,
      detectedFrom:teamIdFromPath()?'yahoo-url':'yahoo-my-team-link',
      updatedAt:new Date().toISOString()
    };
    await chrome.storage.local.set({[STORAGE_KEY]:identity,fantasyLeagueIdentity:identity});
    return true;
  }

  detectAndStore().then(found=>{
    if(found)return;
    const observer=new MutationObserver(async()=>{
      if(await detectAndStore())observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),15000);
  });
})();
