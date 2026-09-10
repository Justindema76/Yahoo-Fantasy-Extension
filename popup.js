const LEAGUE='497223';
const TEAM_NAMES={'1':'TEAM DOG SCIENCE','6':'House of the Dragon'};
const syncButton=document.getElementById('syncButton');
const openButton=document.getElementById('openButton');
const status=document.getElementById('status');
const statusTitle=document.getElementById('statusTitle');
const statusText=document.getElementById('statusText');
const stats=document.getElementById('stats');
const teamName=document.getElementById('teamName');
const teamKey=document.getElementById('teamKey');
let identity=null;

function identityFromUrl(url){
  try{
    const u=new URL(url||'');
    const m=u.pathname.match(new RegExp(`^/f1/${LEAGUE}/(\\d+)(?:/|$)`));
    if(!m)return null;
    const teamId=m[1];
    return {leagueId:LEAGUE,teamId,teamName:TEAM_NAMES[teamId]||`Yahoo Team ${teamId}`,detectedFrom:'yahoo-url',updatedAt:new Date().toISOString()};
  }catch{return null}
}
function showIdentity(value){
  identity=value||null;
  teamName.textContent=identity?.teamName||'Open your Yahoo team page';
  teamKey.textContent=identity?.teamId?`Yahoo Team ${identity.teamId}`:'Your team will be detected from Yahoo';
}
function setStatus(title,text,type=''){status.className=`status ${type}`.trim();statusTitle.textContent=title;statusText.textContent=text}
function showStats(r){
  if(!r)return;stats.hidden=false;
  document.getElementById('teamsCount').textContent=r.teams||0;
  document.getElementById('playersCount').textContent=r.players||0;
  document.getElementById('matchedCount').textContent=r.weekStatRows||0;
  document.getElementById('unmatchedCount').textContent=r.playerPool?.available??0;
}
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab}
async function loadIdentity(){
  const tab=await activeTab();
  const detected=identityFromUrl(tab?.url);
  const key=`fantasyIdentity:${LEAGUE}`;
  const stored=(await chrome.storage.local.get([key,'fantasyLeagueIdentity']))[key]||(await chrome.storage.local.get(['fantasyLeagueIdentity'])).fantasyLeagueIdentity||null;
  const next=detected||stored||null;
  if(next)await chrome.storage.local.set({[key]:next,fantasyLeagueIdentity:next});
  showIdentity(next);
  return next;
}
async function send(type){
  const tab=await activeTab();
  if(!tab?.id||!/football\.fantasysports\.yahoo\.com/.test(tab.url||''))throw new Error('Open Battle of the Kings in Yahoo Fantasy first.');
  return chrome.tabs.sendMessage(tab.id,{type});
}

syncButton.addEventListener('click',async()=>{
  syncButton.disabled=true;syncButton.textContent='SYNCING…';
  try{
    const mine=await loadIdentity();
    if(!mine?.teamId)throw new Error('Open your own Yahoo team page first, then click SYNC YAHOO.');
    setStatus('Syncing Yahoo',`${mine.teamName}: refreshing league rosters, matchup data, player points/projections and waiver pool. Keep Yahoo open.`);
    const response=await send('SYNC_LEAGUE');if(!response?.ok)throw new Error(response?.error||'Sync failed.');
    await chrome.storage.local.set({[`fantasyIdentity:${LEAGUE}`]:mine,fantasyLeagueIdentity:mine});
    showIdentity(mine);
    const r=response.result;showStats(r);
    const weekly=r.weekStatRows||0,pool=r.playerPool?.total||0;
    setStatus('Sync complete',`${mine.teamName} · ${r.teams} teams · ${r.players} roster spots · ${weekly} weekly player rows · ${pool} player-pool rows.`,'success');
  }catch(error){setStatus('Sync failed',error.message,'error')}
  finally{syncButton.disabled=false;syncButton.textContent='SYNC YAHOO'}
});

openButton.addEventListener('click',async()=>{
  const mine=await loadIdentity();
  if(!mine?.teamId){setStatus('Team not detected','Open your own Yahoo team page once, then click OPEN FANTASY INTEL.','error');return}
  const response=await chrome.runtime.sendMessage({type:'OPEN_APP',leagueId:LEAGUE,teamId:mine.teamId});
  if(!response?.ok)setStatus('Could not open Fantasy Intel',response?.error||'Unknown error','error');
});

(async()=>{
  await loadIdentity();
  try{
    const response=await send('LEAGUE_STATUS'),r=response?.lastSync;
    if(r){showStats(r);const when=r.syncedAt?new Date(r.syncedAt).toLocaleString():'';setStatus('Last sync loaded',`${r.teams||0} teams · ${r.weekStatRows||0} weekly player rows${when?` · ${when}`:''}`,'success')}
  }catch{}
})();