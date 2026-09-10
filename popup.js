const SITE_URL='https://2026-fantasy-football.vercel.app/league';
const syncButton=document.getElementById('syncButton');
const openButton=document.getElementById('openButton');
const status=document.getElementById('status');
const statusTitle=document.getElementById('statusTitle');
const statusText=document.getElementById('statusText');
const stats=document.getElementById('stats');

function setStatus(title,text,type=''){
  status.className=`status ${type}`.trim();
  statusTitle.textContent=title;
  statusText.textContent=text;
}
function showStats(r){
  if(!r)return;
  stats.hidden=false;
  document.getElementById('teamsCount').textContent=r.teams||0;
  document.getElementById('playersCount').textContent=r.players||0;
  document.getElementById('matchedCount').textContent=r.matched||0;
  document.getElementById('unmatchedCount').textContent=r.unmatched||0;
}
async function activeTab(){const [tab]=await chrome.tabs.query({active:true,currentWindow:true});return tab}
async function send(type){
  const tab=await activeTab();
  if(!tab?.id||!/football\.fantasysports\.yahoo\.com/.test(tab.url||''))throw new Error('Open your Yahoo fantasy league in this tab first.');
  return chrome.tabs.sendMessage(tab.id,{type});
}

syncButton.addEventListener('click',async()=>{
  syncButton.disabled=true;syncButton.textContent='SYNCING…';
  setStatus('Syncing Yahoo league','Reading all fantasy teams and their current rosters. Keep this Yahoo tab open.');
  try{
    const response=await send('SYNC_LEAGUE');
    if(!response?.ok)throw new Error(response?.error||'Sync failed.');
    const r=response.result;
    showStats(r);
    setStatus('Sync complete',`${r.teams} teams, ${r.players} roster spots and ${r.matchups||0} weekly matchups saved. ${r.matched} players matched.${r.unmatched?` ${r.unmatched} still need name matching.`:''}`,'success');
  }catch(error){setStatus('Sync failed',error.message,'error')}
  finally{syncButton.disabled=false;syncButton.textContent='SYNC ALL TEAMS'}
});
openButton.addEventListener('click',()=>chrome.tabs.create({url:SITE_URL}));

(async()=>{
  try{
    const response=await send('LEAGUE_STATUS');
    const r=response?.lastSync;
    if(r){
      showStats(r);
      const when=r.syncedAt?new Date(r.syncedAt).toLocaleString():'';
      setStatus('Last sync loaded',`${r.teams} teams · ${r.players} players${when?` · ${when}`:''}`,'success');
    }
  }catch(_e){}
})();
