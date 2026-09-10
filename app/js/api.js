import {CONFIG,leagueKeyFor} from './config.js';

const headers={apikey:CONFIG.anonKey,Authorization:`Bearer ${CONFIG.anonKey}`,'Content-Type':'application/json'};

export async function api(path){
  const response=await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`,{headers,cache:'no-store'});
  const text=await response.text();
  if(!response.ok)throw new Error(text||`${response.status} ${response.statusText}`);
  return text?JSON.parse(text):[];
}

function inFilter(values){return `in.(${values.map(v=>String(v)).join(',')})`}

export async function loadLeagueData(leagueId){
  const leagueKey=leagueKeyFor(leagueId);
  const teams=await api(`fantasy_league_teams?select=*&league_key=eq.${leagueKey}&active=eq.true&order=yahoo_team_key.asc`);
  const teamIds=(teams||[]).map(t=>t.id).filter(Boolean);
  const rosterPath=teamIds.length
    ?`fantasy_league_rosters?select=*&active=eq.true&league_team_id=${inFilter(teamIds)}&order=roster_slot.asc,yahoo_player_name.asc`
    :'fantasy_league_rosters?select=*&id=eq.__none__';
  const [rosters,matchups,planner,intel]=await Promise.all([
    api(rosterPath),
    api(`fantasy_league_matchups?select=*&league_key=eq.${leagueKey}&order=week.asc,matchup_key.asc`),
    api('planner_player_tags?select=player_key,player_name,tags,reason,last_confirmed_date,updated_at'),
    api('intel_items?select=player_name,player_key,action,priority,recommendation,what_changed,next_trigger,injury_related,source_note,last_confirmed_date,last_checked_at,updated_at&resolved_at=is.null&transfer_to_live=eq.true&order=updated_at.desc')
  ]);
  return {leagueId:String(leagueId),leagueKey,teams:teams||[],rosters:rosters||[],matchups:matchups||[],planner:planner||[],intel:intel||[]};
}
