import {CONFIG,leagueKeyFor} from './config.js';

const headers={apikey:CONFIG.anonKey,Authorization:`Bearer ${CONFIG.anonKey}`,'Content-Type':'application/json'};

export async function api(path){
  const response=await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`,{headers,cache:'no-store'});
  const text=await response.text();
  if(!response.ok)throw new Error(text||`${response.status} ${response.statusText}`);
  return text?JSON.parse(text):[];
}

function inFilter(values){return `in.(${values.map(v=>String(v)).join(',')})`}
function selectedWeek(fallback=1){
  const value=Number(new URLSearchParams(location.search).get('week'));
  return Number.isFinite(value)&&value>=1&&value<=18?value:Number(fallback)||1;
}
function weeklyIndex(rows){
  const byWeekYahoo=new Map(),byWeekPlayer=new Map();
  for(const row of rows||[]){
    const week=Number(row.week)||1;
    if(row.yahoo_player_key)byWeekYahoo.set(`${week}:${String(row.yahoo_player_key)}`,row);
    if(row.player_key)byWeekPlayer.set(`${week}:${String(row.player_key)}`,row);
  }
  return {byWeekYahoo,byWeekPlayer};
}
function overlayPoolWithWeeklyStats(pool,weekStats){
  const index=weeklyIndex(weekStats);
  return (pool||[]).map(base=>{
    const raw={...base};
    const weekly=()=>{
      const week=selectedWeek(raw.current_week||1);
      return (raw.yahoo_player_key&&index.byWeekYahoo.get(`${week}:${String(raw.yahoo_player_key)}`))
        ||(raw.player_key&&index.byWeekPlayer.get(`${week}:${String(raw.player_key)}`))
        ||null;
    };
    const out={...raw};
    for(const field of ['fantasy_points','projected_points','opponent','game_time','game_status']){
      Object.defineProperty(out,field,{enumerable:true,configurable:true,get(){
        const stat=weekly();
        return stat?.[field]??null;
      }});
    }
    return out;
  });
}

export async function loadLeagueData(leagueId){
  const leagueKey=leagueKeyFor(leagueId);
  const teams=await api(`fantasy_league_teams?select=*&league_key=eq.${leagueKey}&active=eq.true&order=yahoo_team_key.asc`);
  const teamIds=(teams||[]).map(t=>t.id).filter(Boolean);
  const rosterPath=teamIds.length?`fantasy_league_rosters?select=*&active=eq.true&league_team_id=${inFilter(teamIds)}`:'fantasy_league_rosters?select=*&id=eq.__none__';
  const [rosters,matchups,planner,intel,weekStats,pool,players]=await Promise.all([
    api(rosterPath),
    api(`fantasy_league_matchups?select=*&league_key=eq.${leagueKey}&order=week.asc,matchup_key.asc`),
    api('planner_player_tags?select=player_key,player_name,tags,reason,last_confirmed_date,updated_at'),
    api('intel_items?select=player_key,yahoo_player_key,player_name,team,position,action,priority,status,recommendation,what_changed,next_trigger,injury_related,source_note,last_confirmed_date,last_checked_at,updated_at&resolved_at=is.null&transfer_to_live=eq.true&order=updated_at.desc'),
    api(`fantasy_player_week_stats?select=*&league_key=eq.${leagueKey}&order=week.asc`),
    api(`fantasy_league_player_pool?select=*&league_key=eq.${leagueKey}&order=availability_status.asc,position.asc,yahoo_player_name.asc`),
    api('fantasy_players?select=player_key,yahoo_player_key,yahoo_name,player_name,team,position,yahoo_rank,role,active&active=eq.true')
  ]);
  return {leagueId:String(leagueId),leagueKey,teams:teams||[],rosters:rosters||[],matchups:matchups||[],planner:planner||[],intel:intel||[],weekStats:weekStats||[],pool:overlayPoolWithWeeklyStats(pool||[],weekStats||[]),players:players||[]};
}