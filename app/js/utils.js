export const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const norm=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export const uniq=values=>[...new Set((values||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))];
export const slotWeight=slot=>({QB:1,RB:2,WR:3,TE:4,'W/R/T':5,'W/R':5,'Q/W/R/T':5,K:6,DEF:7,BN:8,IR:9,'IR+':9,NA:10}[String(slot||'').toUpperCase()]||20);
export const isBenchSlot=slot=>['BN','IR','IR+','NA'].includes(String(slot||'').toUpperCase());
export const tagClass=tag=>String(tag||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');

function push(map,key,value){
  if(!key)return;
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(value);
}

export function buildIndexes(data){
  const playersByKey=new Map();
  const playersByYahoo=new Map();
  const playersByName=new Map();

  for(const player of data.players||[]){
    if(player.player_key)playersByKey.set(String(player.player_key),player);
    if(player.yahoo_player_key)playersByYahoo.set(String(player.yahoo_player_key),player);
    const nameKey=norm(player.yahoo_name||player.player_name);
    if(nameKey&&!playersByName.has(nameKey))playersByName.set(nameKey,player);
  }

  const intelByPlayerKey=new Map();
  const intelByYahooKey=new Map();
  const intelByName=new Map();
  for(const item of data.intel||[]){
    push(intelByPlayerKey,item.player_key?String(item.player_key):'',item);
    push(intelByYahooKey,item.yahoo_player_key?String(item.yahoo_player_key):'',item);
    push(intelByName,norm(item.player_name),item);
  }

  for(const map of [intelByPlayerKey,intelByYahooKey,intelByName]){
    for(const items of map.values())items.sort((a,b)=>new Date(b.updated_at||b.last_checked_at||0)-new Date(a.updated_at||a.last_checked_at||0));
  }

  const plannerByKey=new Map();
  for(const row of data.planner||[])if(row.player_key)plannerByKey.set(String(row.player_key),row);

  return {playersByKey,playersByYahoo,playersByName,intelByPlayerKey,intelByYahooKey,intelByName,plannerByKey};
}

export function playerRecord(row,indexes){
  return (row.player_key&&indexes.playersByKey.get(String(row.player_key)))
    ||(row.yahoo_player_key&&indexes.playersByYahoo.get(String(row.yahoo_player_key)))
    ||indexes.playersByName.get(norm(row.yahoo_player_name))
    ||null;
}

export function playerIntel(row,indexes){
  const player=playerRecord(row,indexes);
  const byPlayer=player?.player_key?indexes.intelByPlayerKey.get(String(player.player_key)):null;
  if(byPlayer?.length)return byPlayer;
  const yahooKey=player?.yahoo_player_key||row.yahoo_player_key;
  const byYahoo=yahooKey?indexes.intelByYahooKey.get(String(yahooKey)):null;
  if(byYahoo?.length)return byYahoo;
  return indexes.intelByName.get(norm(player?.yahoo_name||player?.player_name||row.yahoo_player_name))||[];
}

export function latestIntel(row,indexes){return playerIntel(row,indexes)[0]||null}

export function playerTags(row,indexes){
  const player=playerRecord(row,indexes);
  const plan=player?.player_key?indexes.plannerByKey.get(String(player.player_key)):null;
  const latest=latestIntel(row,indexes);
  return uniq([latest?.action,...(plan?.tags||[])]).slice(0,5);
}
