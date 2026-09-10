export const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const norm=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[’']/g,'').replace(/[^a-z0-9]+/g,' ').trim();
export const uniq=values=>[...new Set((values||[]).filter(Boolean).map(v=>String(v).trim()).filter(Boolean))];
export const slotWeight=slot=>({QB:1,RB:2,WR:3,TE:4,'W/R/T':5,'W/R':5,'Q/W/R/T':5,K:6,DEF:7,BN:8,IR:9,'IR+':9,NA:10}[String(slot||'').toUpperCase()]||20);
export const isBenchSlot=slot=>['BN','IR','IR+','NA'].includes(String(slot||'').toUpperCase());
export const tagClass=tag=>String(tag||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');

export function buildIndexes(data){
  const intelByName=new Map();
  for(const item of data.intel||[]){
    const key=norm(item.player_name||item.player_key);
    if(!key)continue;
    if(!intelByName.has(key))intelByName.set(key,[]);
    intelByName.get(key).push(item);
  }
  for(const items of intelByName.values())items.sort((a,b)=>new Date(b.updated_at||b.last_checked_at||0)-new Date(a.updated_at||a.last_checked_at||0));
  const plannerByKey=new Map();
  for(const row of data.planner||[])plannerByKey.set(norm(row.player_key||row.player_name),row);
  return {intelByName,plannerByKey};
}

export function playerIntel(row,indexes){return indexes.intelByName.get(norm(row.player_key||row.yahoo_player_name))||indexes.intelByName.get(norm(row.yahoo_player_name))||[]}
export function latestIntel(row,indexes){return playerIntel(row,indexes)[0]||null}
export function playerTags(row,indexes){
  const plan=indexes.plannerByKey.get(norm(row.player_key||row.yahoo_player_name));
  const latest=latestIntel(row,indexes);
  return uniq([latest?.action,...(plan?.tags||[])]).slice(0,5);
}
