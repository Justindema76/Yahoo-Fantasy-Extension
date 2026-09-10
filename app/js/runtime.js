const hasExtensionRuntime=()=>typeof chrome!=='undefined'&&Boolean(chrome?.runtime?.id)&&Boolean(chrome?.storage?.local);
const identityKey=leagueId=>`fantasyIdentity:${leagueId}`;

export function runtimeMode(){
  if(hasExtensionRuntime())return 'EXTENSION';
  if(['localhost','127.0.0.1'].includes(location.hostname))return 'LOCAL DEV';
  return 'WEB APP';
}

export function queryContext(){
  const params=new URLSearchParams(location.search);
  return {leagueId:params.get('league')||null,teamId:params.get('team')||null};
}

export async function getIdentity(leagueId){
  const query=queryContext();
  if(query.teamId){
    const value={leagueId:String(leagueId),teamId:String(query.teamId),teamName:null,detectedFrom:'query'};
    await saveIdentity(value);
    return value;
  }
  if(hasExtensionRuntime()){
    const key=identityKey(leagueId);
    const data=await chrome.storage.local.get([key,'fantasyLeagueIdentity']);
    return data[key]||data.fantasyLeagueIdentity||null;
  }
  try{return JSON.parse(localStorage.getItem(identityKey(leagueId))||'null')}catch{return null}
}

export async function saveIdentity(identity){
  if(!identity?.leagueId||!identity?.teamId)return;
  const value={...identity,leagueId:String(identity.leagueId),teamId:String(identity.teamId),updatedAt:new Date().toISOString()};
  if(hasExtensionRuntime()){
    await chrome.storage.local.set({[identityKey(value.leagueId)]:value,fantasyLeagueIdentity:value});
  }else{
    localStorage.setItem(identityKey(value.leagueId),JSON.stringify(value));
  }
}

export async function openYahoo(leagueId,teamId=''){
  const url=teamId?`https://football.fantasysports.yahoo.com/f1/${leagueId}/${teamId}`:`https://football.fantasysports.yahoo.com/f1/${leagueId}`;
  if(hasExtensionRuntime()&&chrome?.tabs?.create)await chrome.tabs.create({url});
  else window.open(url,'_blank','noopener');
}

export async function syncYahoo(leagueId){
  if(!hasExtensionRuntime()||!chrome?.tabs?.query)throw new Error('Yahoo sync runs through the Chrome extension. Sync from Yahoo, then press REFRESH in this web/local app.');
  const tabs=await chrome.tabs.query({url:'https://football.fantasysports.yahoo.com/*'});
  const tab=tabs.find(t=>(t.url||'').includes(`/f1/${leagueId}`));
  if(!tab?.id)throw new Error(`Open Yahoo league ${leagueId} in another tab first.`);
  const response=await chrome.tabs.sendMessage(tab.id,{type:'SYNC_LEAGUE'});
  if(!response?.ok)throw new Error(response?.error||response?.diagnostics?.[0]?.message||'Yahoo sync failed.');
  return response.result;
}

export function setUrlIdentity(leagueId,teamId){
  const url=new URL(location.href);
  url.searchParams.set('league',leagueId);
  if(teamId)url.searchParams.set('team',teamId);else url.searchParams.delete('team');
  history.replaceState({},'',url);
}
