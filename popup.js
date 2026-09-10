const LEAGUE='497223';
const OWNER={leagueId:LEAGUE,teamId:'6',teamName:'House of the Dragon'};
const syncButton=document.getElementById('syncButton');
const openButton=document.getElementById('openButton');
const status=document.getElementById('status');
const statusTitle=document.getElementById('statusTitle');
const statusText=document.getElementById('statusText');
const stats=document.getElementById('stats');
const teamName=document.getElementById('teamName');
const teamKey=document.getElementById('teamKey');

function showIdentity(){teamName.textContent=OWNER.teamName;teamKey.textContent='Yahoo Team 6'}
function setStatus(title,text,type=''){status.className=`status ${type}`.trim();statusTitle.textContent=title;statusText.textContent=text}
function showStats(r){
  if(!r)return;stats.hidden=false;
  document.getElementById('teamsCount').textContent=r.teams||0;
  document.getElementById('playersCount').textContent=r.players||0;
  document.getElementById('matchedCount').textContent=r.weekStatRows||0;
  document.getElementById('unmatchedCount').textContent=r.playerPool?.available??0;
}
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab}
async function send(type){const tab=await activeTab();if(!tab?.id||!/football\.fantasysports\.yahoo\.com/.test(tab.url||''))throw new Error('Open Battle of the Kings in Yahoo Fantasy first.');return chrome.tabs.sendMessage(tab.id,{type})}

syncButton.addEventListener('click',async()=>{
  syncButton.disabled=true;syncButton.textContent='SYNCING…';
  setStatus('Syncing Yahoo','Teams, current rosters, your weekly matchups, player points/projections and waiver pool are being refreshed. Keep Yahoo open.');
  try{
    const response=await send('SYNC_LEAGUE');if(!response?.ok)throw new Error(response?.error||'Sync failed.');
    const r=response.result;showStats(r);
    const weekly=r.weekStatRows||0,pool=r.playerPool?.total||0;
    setStatus('Sync complete',`${r.teams} teams · ${r.players} roster spots · ${weekly} weekly player rows · ${pool} player-pool rows.`,'success');
  }catch(error){setStatus('Sync failed',error.message,'error')}
  finally{syncButton.disabled=false;syncButton.textContent='SYNC YAHOO'}
});

openButton.addEventListener('click',async()=>{const response=await chrome.runtime.sendMessage({type:'OPEN_APP',leagueId:LEAGUE,teamId:'6'});if(!response?.ok)setStatus('Could not open Fantasy Intel',response?.error||'Unknown error','error')});

(async()=>{
  showIdentity();await chrome.storage.local.set({fantasyLeagueIdentity:OWNER,[`fantasyIdentity:${LEAGUE}`]:OWNER});
  try{const response=await send('LEAGUE_STATUS'),r=response?.lastSync;if(r){showStats(r);const when=r.syncedAt?new Date(r.syncedAt).toLocaleString():'';setStatus('Last sync loaded',`${r.teams||0} teams · ${r.weekStatRows||0} weekly player rows${when?` · ${when}`:''}`,'success')}}catch{}
})();
