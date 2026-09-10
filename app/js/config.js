export const CONFIG={
  supabaseUrl:'https://bbodmhffnqebhfksjier.supabase.co',
  anonKey:'sb_publishable_L048cgw2gZwCeWmSWpUclA_cuKCSyQn',
  defaultLeagueId:'497223',
  leagueKeys:{'497223':'battle-of-the-kings-2026'},
  season:2026
};

export function leagueKeyFor(leagueId){
  return CONFIG.leagueKeys[String(leagueId)]||`yahoo-${leagueId}-${CONFIG.season}`;
}
