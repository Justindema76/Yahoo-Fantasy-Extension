import {CONFIG} from './config.js';
import {loadLeagueData} from './api.js';
import {getIdentity,openYahoo,queryContext,runtimeMode,saveIdentity,setUrlIdentity,syncYahoo} from './runtime.js';
import {buildIndexes,isBenchSlot,playerIntel} from './utils.js';
import {renderTeam} from './views/team.js';
import {renderMatchups,renderWeekPicker} from './views/matchups.js';
import {renderLeague} from './views/league.js';

const state={
  leagueId:String(queryContext().leagueId||CONFIG.defaultLeagueId),
  identity:null,
  data:{teams:[],rosters:[],matchups:[],planner:[],intel:[]},
  indexes:{intelByName:new Map(),plannerByKey:new Map()},
  view:'team',week:1,teamQuery:'',leagueQuery:''
};
const $=id=>document.getElementById(id);

function notice(message,type=''){
  const el=$('notice');
  el.textContent=message||'';
  el.className=`notice ${type}`.trim();
  el.hidden=!message;
}

function myTeam(){return state.data.teams.find(t=>String(t.yahoo_team_key||'')===String(state.identity?.teamId||''))||null}
function rosterFor(team){return team?state.data.rosters.filter(r=>r.league_team_id===team.id):[]}

async function canonicalizeIdentity(){
  const team=myTeam();
  if(!state.identity?.teamId||!team)return;
  if(state.identity.teamName!==team.team_name){
    state.identity={leagueId:state.leagueId,teamId:String(team.yahoo_team_key),teamName:team.team_name,detectedFrom:state.identity.detectedFrom||'app'};
    await saveIdentity(state.identity);
  }
}

function populateTeamPicker(){
  const picker=$('teamPicker');
  const teams=[...state.data.teams].sort((a,b)=>Number(a.yahoo_team_key||99)-Number(b.yahoo_team_key||99));
  picker.innerHTML='<option value="">Choose team…</option>'+teams.map(team=>`<option value="${team.yahoo_team_key}">${team.team_name}</option>`).join('');
  picker.value=state.identity?.teamId||'';
}

function renderHeader(){
  const team=myTeam();
  $('teamTitle').textContent=team?.team_name||state.identity?.teamName||'Choose Your Team';
  $('leagueLabel').textContent=`Yahoo League ${state.leagueId}`;
  $('modeLabel').textContent=runtimeMode();
  populateTeamPicker();
}

function renderSummary(){
  const rows=rosterFor(myTeam());
  $('rosterCount').textContent=rows.length;
  $('starterCount').textContent=rows.filter(r=>!isBenchSlot(r.roster_slot)).length;
  $('benchCount').textContent=rows.filter(r=>isBenchSlot(r.roster_slot)).length;
  $('intelCount').textContent=rows.reduce((sum,row)=>sum+playerIntel(row,state.indexes).length,0);
  $('leagueTeamCount').textContent=state.data.teams.length;
  $('leagueRosterCount').textContent=state.data.rosters.length;
  $('matchedCount').textContent=state.data.rosters.filter(r=>r.player_key).length;
  $('unmatchedCount').textContent=state.data.rosters.filter(r=>!r.player_key).length;
}

function wireWeekPicker(){
  renderWeekPicker(state.week,week=>{
    state.week=week;
    wireWeekPicker();
    renderMatchups({matchups:state.data.matchups,myTeamKey:state.identity?.teamId,currentWeek:state.week});
  });
}

function rerender(){
  const team=myTeam();
  const rows=rosterFor(team);
  renderHeader();
  renderSummary();
  renderTeam({team,rows,indexes:state.indexes,query:state.teamQuery});
  wireWeekPicker();
  renderMatchups({matchups:state.data.matchups,myTeamKey:state.identity?.teamId,currentWeek:state.week});
  renderLeague({teams:state.data.teams,rosters:state.data.rosters,indexes:state.indexes,myTeamKey:state.identity?.teamId,query:state.leagueQuery});
}

async function load(){
  notice('Loading Fantasy Intel…');
  try{
    state.identity=await getIdentity(state.leagueId);
    state.data=await loadLeagueData(state.leagueId);
    state.indexes=buildIndexes(state.data);
    await canonicalizeIdentity();
    rerender();
    if(!state.identity?.teamId)notice('Choose your Yahoo team above. In extension mode this is remembered automatically. In local mode you can also use ?team=6 or ?team=1.');
    else if(!myTeam())notice(`Yahoo Team ${state.identity.teamId} is not in the synced league data yet. Run SYNC YAHOO.`,'error');
    else notice('');
  }catch(error){
    console.error(error);
    notice(`DATA ERROR: ${error.message}`,'error');
  }
}

function setView(view){
  state.view=view;
  document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===`${view}View`));
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  localStorage.setItem('fantasyIntelUserView',view);
  window.scrollTo({top:0,behavior:'smooth'});
}

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('teamSearch').addEventListener('input',event=>{state.teamQuery=event.target.value.trim().toLowerCase();renderTeam({team:myTeam(),rows:rosterFor(myTeam()),indexes:state.indexes,query:state.teamQuery})});
$('leagueSearch').addEventListener('input',event=>{state.leagueQuery=event.target.value.trim().toLowerCase();renderLeague({teams:state.data.teams,rosters:state.data.rosters,indexes:state.indexes,myTeamKey:state.identity?.teamId,query:state.leagueQuery})});
$('refreshButton').addEventListener('click',load);
$('openYahooButton').addEventListener('click',()=>openYahoo(state.leagueId,state.identity?.teamId||''));
$('teamPicker').addEventListener('change',async event=>{
  const team=state.data.teams.find(t=>String(t.yahoo_team_key)===String(event.target.value));
  state.identity=team?{leagueId:state.leagueId,teamId:String(team.yahoo_team_key),teamName:team.team_name,detectedFrom:'picker'}:null;
  if(state.identity){await saveIdentity(state.identity);setUrlIdentity(state.leagueId,state.identity.teamId)}
  rerender();
});
$('syncButton').addEventListener('click',async()=>{
  const button=$('syncButton');button.disabled=true;button.textContent='SYNCING…';notice('Syncing Yahoo league…');
  try{
    const result=await syncYahoo(state.leagueId);
    if(result?.myTeamKey){
      state.identity={leagueId:state.leagueId,teamId:String(result.myTeamKey),teamName:result.myTeamName||state.identity?.teamName||null,detectedFrom:'sync'};
      await saveIdentity(state.identity);setUrlIdentity(state.leagueId,state.identity.teamId);
    }
    notice(`Yahoo sync complete: ${result?.teams||0} teams · ${result?.players||0} roster spots · ${result?.matchups||0} matchups.`,'success');
    await load();
  }catch(error){notice(error.message,'error')}
  finally{button.disabled=false;button.textContent='SYNC YAHOO'}
});
$('themeButton').addEventListener('click',()=>{
  document.documentElement.classList.toggle('light');
  localStorage.setItem('fantasyIntelTheme',document.documentElement.classList.contains('light')?'light':'dark');
});

if(localStorage.getItem('fantasyIntelTheme')==='light')document.documentElement.classList.add('light');
const savedView=localStorage.getItem('fantasyIntelUserView');
if(['team','matchups','league'].includes(savedView))state.view=savedView;
setView(state.view);
load();

setInterval(()=>{if(!document.hidden)load()},60000);
if(typeof chrome!=='undefined'&&chrome?.storage?.onChanged){
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.fantasyLeagueLastSync||changes.fantasyLeagueIdentity))load()});
}
