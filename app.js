(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const stage=Number(window.PR11_SITE_STAGE||3), stage2=stage===2;
  const matches=[...(window.PR11_SITE_DATA||[])].sort((a,b)=>String(b.match_date||'').localeCompare(String(a.match_date||'')));
  let profileData=window.PR11_PROFILE_DATA||null;
  const profileDataUrl=window.PR11_PROFILE_DATA_URL||null;
  const HISTORY_PRIOR_ATTEMPTS=20;
  let playerHistory=stage2?[]:profileData?buildArtifactPlayerHistory(profileData,matches):[];
  let playerHistoryReady=stage2||!!profileData,playerHistoryPromise=null;
  const index=window.PR11_REPLAY_DATA||{}, cache=new Map(), matchDetailIndex=window.PR11_MATCH_DETAIL_DATA||{}, matchDetailCache=new Map(), analysisIndex=window.PR11_MATCH_ANALYSIS_DATA||{}, analysisCache=new Map(), timelineIndex=window.PR11_TIMELINE_DATA||{}, NS='http://www.w3.org/2000/svg';
  let drawingLayer=null;
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const state={map:null,pitchScale:9,recentEvents:[],feedKey:'',match:null,time:0,playing:false,rate:1,event:null,filter:'all',player:'all',profileId:null,view:'replay',tracks:[],territoryTracks:new Map(),bounds:null,territoryCache:{matchId:null,positionKey:null,paths:null,teams:[],uncertain:false,matchMs:null,updatedAt:0},visiblePlayers:[],loaded:false,generation:0,sort:'touches',descending:true};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const checked=id=>$('#'+id)?.checked??false;
  const fmt=x=>x===null||x===undefined?'—':typeof x==='number'?x.toLocaleString('ja-JP'):String(x);
  function clock(ms,detail=true){ms=Math.max(0,Math.floor(ms||0));return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${detail?'.'+String(ms%1000).padStart(3,'0'):''}`;}
  const team=t=>t==='red'?'赤チーム':t==='blue'?'青チーム':'チーム不明';
  const outTeam=e=>e.type==='foul'?(e.details?.raw?.last_kick_team||null):e.type==='foul_candidate'?e.team:null;
  const displayTeam=e=>['foul','foul_candidate'].includes(e.type)?e.penalty_target:e.team;
  const type=t=>({kick:'\u30ad\u30c3\u30af\u5019\u88dc',goal:'\u5f97\u70b9',body_block:'\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc',foul:'\u30d5\u30a1\u30a6\u30eb',foul_candidate:'\u30d5\u30a1\u30a6\u30eb',foul_notification:'\u30d5\u30a1\u30a6\u30eb\u901a\u77e5\uff08\u5bfe\u8c61\u672a\u78ba\u5b9a\uff09',forced_foul:'\u30d5\u30a1\u30a6\u30eb\u62bc\u3057\u4ed8\u3051\u5019\u88dc',ball_recovery:'\u30dc\u30fc\u30eb\u596a\u53d6\u5019\u88dc',possession_loss_candidate:'\u30dc\u30fc\u30eb\u88ab\u596a\u53d6\u5019\u88dc',breakthrough_candidate:'\u7a81\u7834\u5019\u88dc',goal_link_candidate:'\u5f97\u70b9\u3068\u306e\u95a2\u9023\u5019\u88dc',goal_outcome:'\u5f97\u70b9\u7d50\u679c',phase_change:'\u8a66\u5408\u30d5\u30a7\u30fc\u30ba',match_start:'\u8a66\u5408\u958b\u59cb',match_end:'\u8a66\u5408\u7d42\u4e86'}[t]||'\u30a4\u30d9\u30f3\u30c8');
  const symbol=t=>t==='goal'?'\u2605':t==='body_block'?'\u25c7':t==='kick'?'\u2197':t==='ball_recovery'?'\u21ba':t==='possession_loss_candidate'?'\u21c6':t==='breakthrough_candidate'?'\u2197':t==='forced_foul'?'!':'\xb7';
  const KICK_ATTRIBUTE_LABELS={pass_success:'PASS',key_pass_candidate:'キーパス',progressive_pass_candidate:'前進パス',chance_creation_candidate:'チャンスメイク',assist_candidate:'アシスト',interception_candidate:'インターセプト',possession_gain_candidate:'奪取'};
  const kickAttributes=e=>Array.isArray(e?.details?.raw?.kick_attributes)?e.details.raw.kick_attributes:[];
  const kickLabel=e=>{const base=({weak:'弱キック',medium:'中キック',strong:'強キック'}[e.kick_strength]||'キック（強さ不明）');const attrs=[...new Set(kickAttributes(e).map(a=>KICK_ATTRIBUTE_LABELS[a.type]).filter(Boolean))];return base+(attrs.length?'（'+attrs.join('・')+'）':'');};
  const EVENT_EXPLANATIONS={shot_candidate:'ゴール位置とボール位置から、シュートに該当すると判定したキックです。',big_chance_candidate:'シュート候補の位置と相手選手の配置から決定機と判定した候補です。',chance_creation_candidate:'決定機の直前にあった味方のパス、突破、またはドリブルをチャンスメイク候補として記録します。',key_pass_candidate:'同じボールで、シュート候補の直前5秒以内にあった最後の味方キックです。相手や打者不明のキックが間にある場合は対象外です。',progressive_pass_candidate:'味方が次に触れた成功パス候補のうち、受け手側のキック位置が攻撃方向へ10m以上進んだものです。',pass_success:'同じボールを味方が次に蹴り、途中に不明なキックや競り合いがないパス成功候補です。',assist_candidate:'得点に結びついたシュート候補の直前5秒以内にあった最後の味方キックです。',interception_candidate:'パスに近いキックの後、同じボールを相手チームが次に保持したと判定した奪取候補です。',possession_gain_candidate:'相手からボールの支配候補が移った場面です。キックが特定できない場合は位置関係の継続判定を使います。'};
  const eventExplanation=e=>{const types=e.type==='kick'?kickAttributes(e).map(a=>a.type):[e.type];return [...new Set(types.map(type=>EVENT_EXPLANATIONS[type]).filter(Boolean))].join(' ');};
  const eventLabel=e=>e.type==='kick'?kickLabel(e):({shot_candidate:'シュート候補',pass_success:'パス成功候補',progressive_pass_candidate:'前進パス候補',assist_candidate:'アシスト候補',key_pass_candidate:'キーパス候補',interception_candidate:'インターセプト候補',dribble_success_candidate:'ドリブル成功候補',big_chance_candidate:'決定機候補',chance_creation_candidate:'チャンスメイク候補'})[e.type]|| (e.type==='possession_gain_candidate'?'ボール奪取':e.type==='foul_notification'?'ファウル通知（対象未確定）':e.type==='foul_candidate'?(e.penalty_target?`${team(e.penalty_target)} ファウル候補`:'ファウル候補（処罰チーム未判定）'):e.type==='foul'?(e.penalty_target?`${team(e.penalty_target)} ファウル`:'ファウル（処罰チーム未判定）'):e.type==='forced_foul'?'ファウル押し付け候補':type(e.type));
  const eventLabelHtml=e=>['foul','foul_candidate'].includes(e.type)&&e.penalty_target?`<span class="${esc(e.penalty_target)}">${esc(team(e.penalty_target))}</span> ${e.type==='foul_candidate'?'ファウル候補':'ファウル'}`:esc(eventLabel(e));
  const eventSubLabel=e=>e.type==='foul_candidate'&&!e.details?.raw?.boundary?`攻撃速度低下：${team(e.penalty_target)}（候補）`:['foul','foul_candidate'].includes(e.type)?`アウト：${team(outTeam(e))}（推定） · 処罰：${team(e.penalty_target)}（推定）`:(e.actor||'選手不明');
  const item=x=>({'minecraft:stick':'棒','minecraft:bone':'骨','minecraft:blaze_rod':'ブレイズロッド'}[x]||x||'道具不明');
  const date=m=>{if(!m.match_date)return '日時不明';const d=new Date(m.match_date);return Number.isNaN(d.getTime())?'日時不明':d.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
  function buildPlayerHistory(matchRows){
    const players=new Map();let cohortAttempts=0,cohortSuccesses=0;
    for(const match of matchRows){for(const player of match.players||[]){const id=player.player_uuid||player.participant_id;if(!id)continue;const stats=player.analysis||{};let history=players.get(id);if(!history){history={id,username:player.username||id,team:player.team,appearances:[]};players.set(id,history);}history.appearances.push({match,player,stats});cohortAttempts+=Number(stats.pass_attempts)||0;cohortSuccesses+=Number(stats.pass_successes)||0;}}
    for(const history of players.values()){history.appearances.sort((a,b)=>String(b.match.match_date||'').localeCompare(String(a.match.match_date||''))||String(a.match.match_id).localeCompare(String(b.match.match_id)));history.appearances=history.appearances.slice(0,50);}
    cohortAttempts=0;cohortSuccesses=0;for(const history of players.values())for(const row of history.appearances){cohortAttempts+=Number(row.stats.pass_attempts)||0;cohortSuccesses+=Number(row.stats.pass_successes)||0;}
    const cohortRate=cohortAttempts?cohortSuccesses/cohortAttempts:.5;
    for(const history of players.values()){
      const sum=key=>history.appearances.reduce((n,row)=>n+(Number(row.stats[key])||0),0),attempts=sum('pass_attempts'),successes=sum('pass_successes'),kicks=sum('kick_count');
      history.matches=history.appearances.length;history.kicks=kicks;history.goals=sum('goals');history.shots=sum('shot_candidates');history.weak=sum('weak_kicks');history.medium=sum('medium_kicks');history.strong=sum('strong_kicks');history.blocks=sum('body_block_candidates');history.passAttempts=attempts;history.passSuccesses=successes;history.passRate=attempts?successes/attempts:null;history.adjustedPassRate=(successes+HISTORY_PRIOR_ATTEMPTS*cohortRate)/(attempts+HISTORY_PRIOR_ATTEMPTS);history.confident=history.matches>=5&&attempts>=20;history.cohortRate=cohortRate;
      history.appearances.sort((a,b)=>String(b.match.match_date||'').localeCompare(String(a.match.match_date||''))||String(a.match.match_id).localeCompare(String(b.match.match_id)));
    }
    return [...players.values()].sort((a,b)=>a.username.localeCompare(b.username,'ja')||a.id.localeCompare(b.id));
  }
  function buildArtifactPlayerHistory(data,matchRows){
    if(data.status!=='computed')return [];
    const appearances=new Map();
    for(const match of matchRows)for(const player of match.players||[]){const id=player.player_uuid||player.participant_id;if(!id)continue;if(!appearances.has(id))appearances.set(id,[]);appearances.get(id).push({match,player});}
    return (data.profiles||[]).map(profile=>{
      const id=profile.player_uuid||profile.uuid||profile.participant_id;
      const available=appearances.get(id)||[];
      const byMatch=new Map(available.map(row=>[row.match.match_id,row]));
      const selected=(profile.window_match_ids||[]).map(matchId=>byMatch.get(matchId)).filter(Boolean);
      const rows=selected.length?selected:available;
      return {id,username:profile.username||id||'選手名不明',team:profile.team,matches:profile.matches_in_window??profile.matches??rows.length,
        profile,appearances:rows.map(row=>({...row,stats:row.player.analysis||{}}))};
    }).filter(player=>player.id).sort((a,b)=>a.username.localeCompare(b.username,'ja')||a.id.localeCompare(b.id));
  }
  const playerByName=n=>state.match?.players.find(p=>p.username===n);
  const failedHeads=new Set();
  const head=p=>{const url=p?.head_asset;return failedHeads.has(url)?null:url;};
  function avatar(p){return `<span class="avatar ${esc(p?.team||'')}" title="${esc(p?.username||'')}"><span>${esc((p?.username||'?').slice(0,1))}</span>${head(p)?`<img src="${esc(head(p))}" alt="" loading="lazy">`:''}</span>`;}
  function node(tag,attrs={},parent=drawingLayer||$('#pitch')){const el=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;}
  function text(x,y,value,attrs={},parent=drawingLayer||$('#pitch')){const e=node('text',{x,y,...attrs},parent);e.textContent=value;return e;}
  function svgHead(p,x,y,size,parent,fallback){text(x,y+4,fallback||p?.username?.slice(0,1)||'?',{'text-anchor':'middle','font-size':13,fill:'#f0f3ed'},parent);const url=head(p);if(url){const image=node('image',{x:x-size/2,y:y-size/2,width:size,height:size,href:url,style:'image-rendering:pixelated'},parent);image.addEventListener('error',()=>{failedHeads.add(url);image.remove();});}}
  function setPlaying(value){state.playing=!!value&&state.loaded;$('#play').textContent=state.playing?'Ⅱ':'▶';$('#play').setAttribute('aria-label',state.playing?'一時停止':'再生');}
  function showView(view){if(stage2&&['stats','players'].includes(view))view='replay';state.view=view;$$('.view').forEach(el=>el.hidden=el.id!==`view-${view}`);$$('nav button').forEach(el=>{el.classList.toggle('active',el.dataset.view===view);el.setAttribute('aria-current',el.dataset.view===view?'page':'false');});$('.match-heading').hidden=!['replay','stats'].includes(view);$('.data-notes').hidden=!['replay','stats'].includes(view);if(view!=='replay')setPlaying(false);if(view==='players')renderPlayerHistory();}
  async function loadMatchAnalysisIntervals(match,generation){
    const url=analysisIndex[match.match_id];if(!url||match.analysis_intervals_loaded)return;
    match.analysis_intervals_loading=true;renderPossessionState();
    try{let payload=analysisCache.get(match.match_id);if(!payload){const response=await fetch(url);if(!response.ok)throw Error('HTTP '+response.status);payload=await response.json();analysisCache.set(match.match_id,payload);}if(generation!==state.generation)return;
      match.analysis=match.analysis||{};for(const [key,value]of Object.entries(payload)){match.analysis[key]=match.analysis[key]||{};match.analysis[key].intervals=value.intervals||[];}match.analysis_intervals_loaded=true;match.analysis_intervals_loading=false;renderPossessionState();if(state.loaded)renderFrame();
    }catch(error){if(generation!==state.generation)return;match.analysis_intervals_loading=false;match.analysis_intervals_error=true;renderPossessionState();}
  }
  function stage3OverviewCards(match){
    const summary=match.summary||{},analysis=match.analysis||{},teams=analysis.teams||{},spatial=analysis.spatial_control||analysis.possession||{},teamRows=spatial.teams||spatial.team_summaries||{};
    const sumTeam=key=>{const red=teamRows.red?.[key],blue=teamRows.blue?.[key];return red==null&&blue==null?null:Number(red||0)+Number(blue||0);};
    const twoSide=(key,label,help,altKey)=>{const red=teams.red?.[key]??(altKey?teams.red?.[altKey]:null),blue=teams.blue?.[key]??(altKey?teams.blue?.[altKey]:null);return [red==null||blue==null?null:Number(red)+Number(blue),label,`赤 ${fmt(red)} · 青 ${fmt(blue)}`,help];};
    const countEvents=type=>match.timeline.filter(event=>event.type===type).length;
    const gains=summary.possession_gain_candidates??sumTeam('possession_gain_candidates')??summary.ball_recovery_candidates??summary.inference_metrics?.ball_recovery_candidates??countEvents('ball_recovery');
    const losses=summary.possession_loss_candidates??sumTeam('possession_loss_candidates')??countEvents('possession_loss_candidate');
    const breakthroughRows=spatial.breakthroughs?.candidates,breakthroughStatus=spatial.breakthroughs?.status;
    const breakthroughDecisions=sumTeam('breakthrough_decisions');
    const breakthroughs=breakthroughStatus==='unknown_attack_direction'||breakthroughDecisions===0?null:summary.breakthrough_candidates??sumTeam('breakthrough_candidates')??(Array.isArray(breakthroughRows)?breakthroughRows.length:null)??countEvents('breakthrough_candidate');
    const gainDecisions=summary.possession_gain_decisions??sumTeam('possession_gain_decisions'),gainUnknown=summary.possession_gain_unknown??sumTeam('possession_gain_unknown');
    const lossDecisions=summary.possession_loss_decisions??sumTeam('possession_loss_decisions'),lossUnknown=summary.possession_loss_unknown??sumTeam('possession_loss_unknown');
    const red=teams.red||{},blue=teams.blue||{},controlRed=teamRows.red?.possession_candidate_share??teamRows.red?.control_candidate_share??spatial.possession_summary?.team_shares?.red,controlBlue=teamRows.blue?.possession_candidate_share??teamRows.blue?.control_candidate_share??spatial.possession_summary?.team_shares?.blue;
    const redRate=red.pass_success_rate,blueRate=blue.pass_success_rate;
    const breakthroughNote=breakthroughStatus==='unknown_attack_direction'?'攻撃方向が不明のため未判定':breakthroughDecisions===0?'判定できる支配区間がありません':'方向と位置から拾った候補';
    return [
      [red.goals??summary.goals,'得点',`赤 ${fmt(red.goals)} · 青 ${fmt(blue.goals)}`,'記録された得点通知の数です。'],
      twoSide('shot_attempt_candidates','シュート候補',EVENT_EXPLANATIONS.shot_candidate,'shot_candidates'),
      [redRate==null?'—':Math.round(redRate*100)+'%','パス成功率',`赤 ${fmt(red.pass_successes)}/${fmt(red.pass_attempts)} · 青 ${blueRate==null?'—':Math.round(blueRate*100)+'%'} (${fmt(blue.pass_successes)}/${fmt(blue.pass_attempts)})`,EVENT_EXPLANATIONS.pass_success],
      [controlRed==null?'—':Math.round(controlRed*100)+'%','推定ポゼッション',`赤 · 青 ${controlBlue==null?'—':Math.round(controlBlue*100)+'%'} ・ 判定可能時間内`,'工程2の位置情報とボール支配の移動から推定したチーム別割合です。未知・競合区間は分母から除外しています。'],
      [gains,'ボール奪取候補',`候補 ${fmt(gains)} / 判定可能な機会 ${fmt(gainDecisions)} ・ 不明 ${fmt(gainUnknown)}`,EVENT_EXPLANATIONS.possession_gain_candidate],
      [losses,'ボール被奪取候補',`候補 ${fmt(losses)} / 判定可能な機会 ${fmt(lossDecisions)} ・ 不明 ${fmt(lossUnknown)}`,'相手チームへ支配候補が移った場面です。責任選手は別途推定されます。'],
      [breakthroughs,'突破候補',breakthroughNote,'攻撃方向への前進と、進行方向の相手守備人数の変化から抽出した候補です。'],
      twoSide('big_chance_candidates','決定機候補',EVENT_EXPLANATIONS.big_chance_candidate),
      twoSide('chance_creation_candidates','チャンスメイク候補',EVENT_EXPLANATIONS.chance_creation_candidate),
      twoSide('key_pass_candidates','キーパス候補',EVENT_EXPLANATIONS.key_pass_candidate),
      twoSide('progressive_pass_candidates','前進パス候補',EVENT_EXPLANATIONS.progressive_pass_candidate),
      [summary.forced_foul_candidates??summary.inference_metrics?.forced_foul_candidates??summary.forced_foul_successes,'ファウル押し付け候補','候補です','ファウル通知と前後の攻撃速度低下から推定した候補です。'],
    ];
  }
  async function loadMatchDetail(summary){
    const id=summary.match_id;let detail=matchDetailCache.get(id);
    if(!detail&&matchDetailIndex[id]){const response=await fetch(matchDetailIndex[id]);if(!response.ok)throw Error('HTTP '+response.status);detail=await response.json();if(!detail||typeof detail!=='object')throw Error('Invalid match data');matchDetailCache.set(id,detail);}
    if(!detail)return summary;
    const previewPlayers=new Map((summary.players||[]).map(player=>[player.participant_id||player.player_uuid,player]));
    const players=(detail.players||summary.players||[]).map(player=>{const preview=previewPlayers.get(player.participant_id||player.player_uuid)||{};return {...preview,...player,head_asset:player.head_asset||preview.head_asset};});
    return {...summary,...detail,players};
  }
  async function loadPlayerHistory(){
    if(playerHistoryReady)return;
    if(playerHistoryPromise)return playerHistoryPromise;
    playerHistoryPromise=(async()=>{
      if(!profileData&&profileDataUrl){const response=await fetch(profileDataUrl);if(!response.ok)throw Error('HTTP '+response.status);profileData=await response.json();}
      if(profileData)playerHistory=buildArtifactPlayerHistory(profileData,matches);
      else if(!stage2){const fullMatches=await Promise.all(matches.map(loadMatchDetail));playerHistory=buildPlayerHistory(fullMatches);}
      playerHistoryReady=true;
    })();
    try{await playerHistoryPromise;}finally{playerHistoryPromise=null;}
  }
  async function selectMatch(id){
    const summary=matches.find(m=>m.match_id===id);if(!summary)return;
    state.map=null;drawingLayer=null;$('#pitch').replaceChildren();state.feedKey=null;state.match=summary;state.time=0;state.event=null;state.filter='all';state.player='all';state.tracks=[];state.territoryTracks=new Map();state.visiblePlayers=[];$('#player-tooltip').hidden=true;state.loaded=false;setPlaying(false);const generation=++state.generation;$('#load-status').textContent='試合データを読み込み中';$('#play').disabled=true;
    let match;try{match=await loadMatchDetail(summary);if(generation!==state.generation)return;}catch(error){if(generation===state.generation)$('#load-status').textContent='試合データを読み込めません';return;}
    state.match=match;
    if(timelineIndex[id]&&!match.timeline_loaded){$('#load-status').textContent='試合イベントを読み込み中';$('#play').disabled=true;try{const response=await fetch(timelineIndex[id]);if(!response.ok)throw Error('HTTP '+response.status);const rows=await response.json();if(generation!==state.generation)return;if(!Array.isArray(rows))throw Error('Invalid timeline');match.timeline=rows;match.timeline_loaded=true;matchDetailCache.set(id,{...match,timeline:rows,timeline_loaded:true});}catch(error){if(generation===state.generation)$('#load-status').textContent='試合イベントを読み込めません';return;}}
    match.timeline.sort((a,b)=>a.match_ms-b.match_ms);state.playerMap=new Map(match.players.map(p=>[p.participant_id,p]));
    $('#match-select').value=id;$('#red-score').textContent=fmt(match.score?.red);$('#blue-score').textContent=fmt(match.score?.blue);$('#match-date').textContent=`${date(match)}  /  ${match.format||'MATCH'}${match.stage===2?' · 工程2':''}`;
    $('#red-roster').textContent=`${match.teams?.red?.length||0}人`;$('#blue-roster').textContent=`${match.teams?.blue?.length||0}人`;
    $('#duration').textContent=`/ ${clock(match.window.duration_ms)}`;$('#end-clock').textContent=clock(match.window.duration_ms,false);$('#seek').max=match.window.duration_ms;$('#seek').value=0;
    $('#event-filter').value='all';$('#player-filter').innerHTML='<option value="all">全選手</option>'+match.players.map(p=>`<option value="${esc(p.username)}">${esc(p.username)}</option>`).join('');
    const s=match.summary,a=match.analysis||{},teams=a.teams||{};
    loadMatchAnalysisIntervals(match,generation);
    const cards=match.analysis_status!=='computed'?[[s.goals,'\u5f97\u70b9\u901a\u77e5','\u8a18\u9332\u3055\u308c\u305f\u8a66\u5408\u30a4\u30d9\u30f3\u30c8'],[s.kick_count,'\u30ad\u30c3\u30af\u5019\u88dc',`${s.actor_assigned}\u4ef6\u306b\u9078\u624b\u3092\u95a2\u9023\u4ed8\u3051`],[s.block_candidates,'\u4f53\u30d6\u30ed\u30c3\u30af\u8a18\u9332','\u5de5\u7a0b2\u306e\u30a4\u30d9\u30f3\u30c8\u4ef6\u6570'],[(s.event_counts?.foul||0)+(s.event_counts?.foul_candidate||0)+(s.event_counts?.foul_notification||0),'\u30d5\u30a1\u30a6\u30eb\u8a18\u9332','\u5de5\u7a0b2\u306e\u30a4\u30d9\u30f3\u30c8\u4ef6\u6570'],[match.players.length,'\u53c2\u52a0\u9078\u624b','\u5de5\u7a0b2\u306e\u53c2\u52a0\u8005\u30c7\u30fc\u30bf'],[Object.values(s.event_counts||{}).reduce((sum,n)=>sum+Number(n||0),0),'\u30a4\u30d9\u30f3\u30c8\u7dcf\u6570','\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u306b\u8a18\u9332']]:stage3OverviewCards(match);
    $('#metrics').innerHTML=cards.map(([n,label,note,help])=>`<div class="metric" title="${esc(help||'')}"><strong>${fmt(n)}</strong><span>${label}</span><small>${note}</small></div>`).join('');renderPossessionState();
    $('#data-notes').innerHTML=`<p>対象：${clock(match.window.start_replay_ms)}–${clock(match.window.end_replay_ms)}（リプレイ内）。最終結果の出所：${esc(match.score?.source_label||'不明')}。</p><ul>${(match.limitations||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>画像：録画に記録されたスキン。利用できない場合は頭文字を表示します。</p>`;
    if(match.court?.confidence==='estimated'&&match.court.length_m>0&&match.court.width_m>0){const note=document.createElement('p');note.textContent=`表示用の距離概算：1チーム ${match.teams?.red?.length||'?'}人、約 ${match.court.length_m.toFixed(1)} × ${match.court.width_m.toFixed(1)} マス。これは白線を含む整数の安全ブロック数ではありません。白線・ゴールの正確な位置は未確認です。`;$('#data-notes').append(note);}
    if(match.court?.line_positions){const note=document.createElement('p'),l=match.court.line_positions,fmt=a=>a?.coordinates?.length?a.coordinates.map(v=>a.units==='block_index'?String(v):Number(v).toFixed(2)).join(' / '):'不明',why=a=>a?.source==='glass_contact_candidate'?'ガラス接触から推定したブロック':a?.source==='notification_boundary_candidates'?'通知付近の候補':'開始配置を代用';note.textContent=`推定線：ゴール側 X ${fmt(l.goal_line_x)}（${why(l.goal_line_x)}）、サイド Z ${fmt(l.touch_line_z)}（${why(l.touch_line_z)}）。${match.court.white_lines?.x?.status==='conflicting_evidence'?'X方向の通知位置には矛盾があります。':''}${match.court.width_source==='extrapolated_from_4v4_and_5v5'?'幅は他人数からの外挿です。':''}`;$('#data-notes').append(note);}
    if(match.court?.integer_safe_field){const note=document.createElement('p'),f=match.court.integer_safe_field,fmt=a=>a?.safe_block_count_candidates?.length?a.safe_block_count_candidates.join(' / '):'不明';note.textContent=`白線を含む安全ブロック数の候補：X ${fmt(f.x)} × Z ${fmt(f.z)}。観測位置の両端に各1マスのずれを仮定した参考候補で、誤差の上限や確定値ではありません。`;$('#data-notes').append(note);}
    if(match.court?.integer_safe_field){const note=document.createElement('p'),f=match.court.integer_safe_field,fmt=a=>a?.glass_based_safe_block_count_candidate??'不明',edge=a=>{const e=a?.white_block_candidates_from_glass;return `${e?.low?.length?e.low.join('/'):'不明'} / ${e?.high?.length?e.high.join('/'):'不明'}`};note.textContent=`ガラス接触と仮定した白線ブロック候補（低側 / 高側）：X ${edge(f.x)}、Z ${edge(f.z)}。白線を含む安全ブロック数候補：X ${fmt(f.x)} × Z ${fmt(f.z)}。白線の外に通過可能な1マスがあり、その外がガラスで、ボールの当たり幅が0.9マスと仮定しています。ブロックの直接観測ではありません。`;$('#data-notes').append(note);}
    {const note=document.createElement('p');note.textContent='位置が推定値の場合も選手アイコンは通常の色で表示します。現在位置の根拠はアイコンにカーソルを合わせると確認できます。ボールは連続した観測の間が750ms以内の場合、推定位置を補間して表示します。';$('#data-notes').append(note);}
    renderEvents();renderMarkers();renderGoals();if(!stage2)renderStats();renderInspector();renderFrame();$('#load-status').textContent='データを読み込み中';$('#play').disabled=true;
    try{let rows=cache.get(id);if(!rows){const response=await fetch(index[id]);if(!response.ok)throw Error('HTTP '+response.status);rows=await response.json();cache.set(id,rows);}if(generation!==state.generation)return;
      const grouped=new Map(),territoryRows=new Map();let bounds=[Infinity,-Infinity,Infinity,-Infinity];for(const r of rows){if(!grouped.has(r.entity_instance_id))grouped.set(r.entity_instance_id,[]);grouped.get(r.entity_instance_id).push(r);if(r.participant_id&&!r.ball_id){if(!territoryRows.has(r.participant_id))territoryRows.set(r.participant_id,[]);territoryRows.get(r.participant_id).push(r);}if(r.match_ms>=0&&r.match_ms<=match.window.duration_ms&&Number.isFinite(r.x)&&Number.isFinite(r.z)){bounds=[Math.min(bounds[0],r.x),Math.max(bounds[1],r.x),Math.min(bounds[2],r.z),Math.max(bounds[3],r.z)];}}
      state.tracks=[...grouped.values()];state.territoryTracks=new Map([...territoryRows].map(([id,points])=>{const byTime=new Map();for(const point of points){const key=point.match_ms,previous=byTime.get(key);if(!previous||(point.position_source==='observed'&&previous.position_source!=='observed'))byTime.set(key,point);}return[id,[...byTime.values()].sort((a,b)=>a.match_ms-b.match_ms)];}));state.bounds=bounds;state.loaded=true;$('#load-status').textContent=`${match.players.length} PLAYERS · TRACKING READY`;$('#play').disabled=false;
    }catch(error){if(generation!==state.generation)return;console.error('Replay data loading failed',error);$('#load-status').textContent='位置データを読み込めません';$('#map-status').textContent='ローカルHTTPサーバーから開いてください';return;}
    try{renderFrame();}catch(error){console.error('Replay rendering failed',error);$('#load-status').textContent='Replay rendering error';}
  }
  function sample(rows,t){if(!rows?.length||t<rows[0].match_ms||t>rows.at(-1).match_ms)return null;let a=0,b=rows.length;while(a<b){const m=(a+b)>>1;if(rows[m].match_ms<t)a=m+1;else b=m;}const left=rows[Math.max(0,a-1)],right=rows[Math.min(rows.length-1,a)];const near=Math.abs(left.match_ms-t)<Math.abs(right.match_ms-t)?left:right;if(near.x==null||near.z==null||Math.abs(near.match_ms-t)>100)return null;
    if(left.x!=null&&right.x!=null&&left.z!=null&&right.z!=null&&left.match_ms<t&&right.match_ms>t&&right.match_ms-left.match_ms<=200&&left.prior_obs_id===right.prior_obs_id&&left.next_obs_id===right.next_obs_id&&left.position_source==='interpolated'&&right.position_source==='interpolated'){const f=(t-left.match_ms)/(right.match_ms-left.match_ms);return {...left,x:left.x+(right.x-left.x)*f,z:left.z+(right.z-left.z)*f};}return near;}
  function samplePlayer(rows,t){
    if(!rows?.length||t<rows[0].match_ms)return null;
    let a=0,b=rows.length;while(a<b){const m=(a+b)>>1;if(rows[m].match_ms<=t)a=m+1;else b=m;}
    const left=rows[a-1],right=rows[a];if(!left||(left.lifetime_end_ms!=null&&t>=left.lifetime_end_ms))return null;
    if(t===left.match_ms)return left;
    const elapsed=t-left.match_ms,gap=right?right.match_ms-left.match_ms:Infinity;
    if(right&&!right.break_before&&gap>0&&gap<=750){const f=elapsed/gap;return {...left,x:left.x+(right.x-left.x)*f,y:left.y+(right.y-left.y)*f,z:left.z+(right.z-left.z)*f,position_source:'interpolated'};}
    if(right&&!right.break_before&&gap<=5000&&left.x===right.x&&left.y===right.y&&left.z===right.z)return {...left,position_source:'stationary_estimate'};
    return elapsed<=250?{...left,position_source:'held_estimate'}:null;
  }
  function sampleTerritoryPlayer(rows,t){
    if(!rows?.length)return null;
    let a=0,b=rows.length;while(a<b){const m=(a+b)>>1;if(rows[m].match_ms<t)a=m+1;else b=m;}
    const left=rows[a-1],right=rows[a],valid=row=>row&&Number.isFinite(row.x)&&Number.isFinite(row.y)&&Number.isFinite(row.z);
    if(right?.match_ms===t&&valid(right))return {...right,territory_stale:false};
    if(valid(left)&&valid(right)&&!right.break_before){
      const gap=right.match_ms-left.match_ms;
      if(gap>0&&gap<=750){const f=(t-left.match_ms)/gap;return{...left,x:left.x+(right.x-left.x)*f,y:left.y+(right.y-left.y)*f,z:left.z+(right.z-left.z)*f,position_source:'interpolated',territory_stale:false};}
      if(gap>0&&gap<=5000&&left.x===right.x&&left.y===right.y&&left.z===right.z)return{...left,position_source:'stationary_estimate',territory_stale:false};
      const nearest=t-left.match_ms<=right.match_ms-t?left:right;return{...nearest,position_source:'last_known',territory_stale:true,territory_age_ms:Math.abs(t-nearest.match_ms)};
    }
    if(valid(left)&&right?.break_before)return{...left,position_source:'last_known',territory_stale:true,territory_age_ms:t-left.match_ms};
    const nearest=valid(left)?left:valid(right)?right:null;
    return nearest?{...nearest,position_source:'last_known',territory_stale:true,territory_age_ms:Math.abs(t-nearest.match_ms)}:null;
  }
  function sampleBall(rows,t){
    if(!rows?.length||t<rows[0].match_ms)return null;
    let a=0,b=rows.length;while(a<b){const m=(a+b)>>1;if(rows[m].match_ms<=t)a=m+1;else b=m;}
    const last=rows[a-1],next=rows[a],gap=next?next.match_ms-last.match_ms:Infinity;
    if(last.ball_id&&t>last.match_ms&&next&&!next.break_before&&gap>250&&gap<=750&&(last.lifetime_end_ms==null||t<last.lifetime_end_ms)){
      const f=(t-last.match_ms)/gap;return {...last,x:last.x+(next.x-last.x)*f,y:last.y+(next.y-last.y)*f,z:last.z+(next.z-last.z)*f,last_observation_ms:last.match_ms,position_source:'interpolated_wide'};
    }
    const current=samplePlayer(rows,t);
    return {...(current||last),last_observation_ms:last.match_ms,position_source:current?.position_source||'last_known'};
  }
  function axes(){const c=state.match?.court,g=c?.goals;if(!c?.center_xz||g?.length<2||!g.slice(0,2).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)))return null;const dx=g[1].x-g[0].x,dz=g[1].z-g[0].z,n=Math.hypot(dx,dz);return n>0?[dx/n,dz/n]:null;}
  function rotate(dx,dz){const a=axes();return a?[dx*a[0]+dz*a[1],-dx*a[1]+dz*a[0]]:[dx,dz];}
  function preparePitch(){
    const match=state.match,svg=$('#pitch');drawingLayer=null;svg.replaceChildren();state.pitchRect={x:0,y:0,width:960,height:540};
    node('rect',{width:960,height:540,fill:'#173b30'});
    for(let x=0;x<960;x+=96)node('rect',{x,y:0,width:48,height:540,fill:'#ffffff03'});
    const court=match.court||{},orientation=axes(),calibrated=orientation&&court.length_m>0&&court.width_m>0;let map;
    if(calibrated){const s=Math.min(864/court.length_m,444/court.width_m),cx=court.center_xz[0],cz=court.center_xz[1];state.pitchScale=s;map=(x,z)=>{const [a,b]=rotate(x-cx,z-cz);return [480+a*s,270+b*s]};const w=court.length_m*s,h=court.width_m*s,stroke='#e4f3dfb3';state.pitchRect={x:480-w/2,y:270-h/2,width:w,height:h};node('rect',{x:480-w/2,y:270-h/2,width:w,height:h,fill:'none',stroke,'stroke-width':2});node('line',{x1:480,y1:270-h/2,x2:480,y2:270+h/2,stroke,'stroke-width':2});node('circle',{cx:480,cy:270,r:Math.min(w,h)*.13,fill:'none',stroke,'stroke-width':2});for(const side of [-1,1]){const edge=480+side*w/2,depth=Math.min(8*s,w*.16),boxHeight=Math.min(20*s,h*.55),postHeight=Math.min(7*s,h*.35),outer=edge+side*Math.min(2*s,25),goalTeam=court.goals?.[side<0?0:1]?.team||(side<0?'red':'blue');node('rect',{x:side<0?edge:edge-depth,y:270-boxHeight/2,width:depth,height:boxHeight,fill:'none',stroke,'stroke-width':2});node('path',{d:`M ${edge} ${270-postHeight/2} L ${outer} ${270-postHeight/2} L ${outer} ${270+postHeight/2} L ${edge} ${270+postHeight/2}`,fill:'none',stroke:goalTeam==='red'?'#ef827e':'#7cb8ec','stroke-width':3,'stroke-linejoin':'round'});}}
    else{const [a,b,c,d]=state.bounds,s=Math.min(840/Math.max(1,b-a),430/Math.max(1,d-c));state.pitchScale=s;map=(x,z)=>[480+(x-(a+b)/2)*s,270+(z-(c+d)/2)*s];}const pitchLabel=court.team_size?`${court.team_size}v${court.team_size}`:'PITCH';$('#map-status').textContent=calibrated?`${pitchLabel} PITCH - distance estimate ${court.length_m.toFixed(1)} x ${court.width_m.toFixed(1)}${court.confidence==='estimated'?' - START POSITION ESTIMATE':''}`:`${pitchLabel} MAP - TRACKING COORDINATES`;
    const defs=node('defs',{},svg),clip=node('clipPath',{id:'territory-field-clip',clipPathUnits:'userSpaceOnUse'},defs);node('rect',state.pitchRect,clip);
    state.map=map;state.dynamic=node('g',{'data-layer':'live'});
  }
  function recentEvents(t,windowMs){const events=state.match.timeline;let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].match_ms<=t)lo=mid+1;else hi=mid;}let first=lo;while(first>0&&events[first-1].match_ms>=t-windowMs)first--;return events.slice(first,lo);}
  function activeKickOption(events,options,now,selected){
    // A selected kick at its own timestamp takes precedence over a preview.
    if(selected?.type==='kick'&&selected.match_ms===now)
      return options.find(option=>option.event_id===selected.event_id)||null;
    const previous=events.slice().reverse().find(e=>e.type==='kick'&&e.match_ms<=now);
    const upcoming=events.find(e=>e.type==='kick'&&e.match_ms>now&&e.match_ms-now<=2000);
    // Briefly keep a just-taken kick on screen; then preview the next kick.
    const kick=previous&&now-previous.match_ms<=250?previous:upcoming||(previous&&now-previous.match_ms<=1600?previous:null);
    if(!kick)return null;
    return options.find(option=>option.event_id===kick.event_id)||null;
  }
  function renderPossessionState(){
    const node=$('#possession-state');
    if(state.match.analysis_status!=='computed'){node.textContent='\u5de5\u7a0b3\u306e\u8a66\u5408\u5206\u6790\uff1a\u672a\u7b97\u51fa\uff08\u652f\u914d\u30fb\u596a\u53d6\u30fb\u88ab\u596a\u53d6\u30fb\u7a81\u7834\u5019\u88dc\u306f\u307e\u3060\u96c6\u8a08\u3057\u3066\u3044\u307e\u305b\u3093\uff09';return;}
    if(state.match.analysis_intervals_loading){node.textContent='\u5de5\u7a0b3\u306e\u652f\u914d\u533a\u9593\u3092\u8aad\u307f\u8fbc\u307f\u4e2d\u3067\u3059';return;}
    const analysis=state.match.analysis||{},data=analysis.spatial_control||analysis.possession;if(!data){node.textContent='\u5de5\u7a0b3\u306f\u7b97\u51fa\u6e08\u307f\u3067\u3059\u3002\u30dc\u30fc\u30eb\u652f\u914d\u30c7\u30fc\u30bf\u306f\u3042\u308a\u307e\u305b\u3093\u3002';return;}
    if(state.match.analysis_intervals_error){node.textContent='\u5de5\u7a0b3\u306e\u652f\u914d\u533a\u9593\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3002';return;}
    const replayMs=Number(state.match.window.start_replay_ms||0)+state.time,intervals=data.intervals||[];
    const interval=intervals.find(row=>{const matchRelative=row.start_match_ms!=null||row.end_match_ms!=null,at=matchRelative?state.time:replayMs,start=row.start_match_ms??row.start_replay_ms,end=row.end_match_ms??row.end_replay_ms;return start!=null&&end!=null&&start<=at&&at<end;});
    const label=!interval?'\u4e0d\u660e':interval.state==='contested'?'\u7af6\u308a\u5408\u3044':['controlled','control_candidate'].includes(interval.state)?team(interval.team):'\u4e0d\u660e';
    const teamRows=data.teams||data.team_summaries||{},red=teamRows.red?.control_candidate_share??data.known_control_share?.red??data.team_control_share?.red,blue=teamRows.blue?.control_candidate_share??data.known_control_share?.blue??data.team_control_share?.blue;
    const pieces=[`\u73fe\u5728\u306e\u652f\u914d\uff08\u5019\u88dc\uff09\uff1a${label}`,`\u652f\u914d\u5019\u88dc\u6642\u9593\u5272\u5408 \u8d64 ${red==null?'\u2014':Math.round(red*100)+'%'} / \u9752 ${blue==null?'\u2014':Math.round(blue*100)+'%'}`];
    const knownRed=teamRows.red?.known_time_share??data.known_time_share?.red,knownBlue=teamRows.blue?.known_time_share??data.known_time_share?.blue;
    if(knownRed!=null||knownBlue!=null)pieces.push(`\u65e2\u77e5\u6642\u9593\u306e\u5272\u5408 \u8d64 ${knownRed==null?'\u2014':Math.round(knownRed*100)+'%'} / \u9752 ${knownBlue==null?'\u2014':Math.round(knownBlue*100)+'%'}`);
    const contested=data.contested_ms??teamRows.contested_ms,unknown=data.unknown_ms??teamRows.unknown_ms,unknownShare=data.unknown_time_share??teamRows.unknown_time_share;
    if(contested!=null)pieces.push(`\u7af6\u308a\u5408\u3044 ${Math.round(contested/1000)}\u79d2`);
    if(unknown!=null)pieces.push(`\u4e0d\u660e ${Math.round(unknown/1000)}\u79d2`);
    if(unknownShare!=null)pieces.push(`\u4e0d\u660e\u5272\u5408 ${Math.round(unknownShare*100)}%`);
    const basis=interval?.basis||interval?.reason;if(basis)pieces.push(`\u5224\u5b9a\u6839\u62e0 ${typeof basis==='string'?basis:Array.isArray(basis)?basis.join('\u3001'):JSON.stringify(basis)}`);
    node.textContent=pieces.join(' · ');
  }
  function territoryPaths(players,bounds,pitchScale){
    const step=10,x0=bounds.x-step,y0=bounds.y-step;
    const nx=Math.max(1,Math.ceil((bounds.width+step*2)/step)),ny=Math.max(1,Math.ceil((bounds.height+step*2)/step));
    const dx=(bounds.width+step*2)/nx,dy=(bounds.height+step*2)/ny,cols=nx+1,rows=ny+1,total=cols*rows;
    const fields=players.map(()=>new Float32Array(total)),outside=-1000000,safety=2.5*pitchScale;
    for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
      const x=x0+gx*dx,y=y0+gy*dy,index=gy*cols+gx;
      if(x<bounds.x||x>bounds.x+bounds.width||y<bounds.y||y>bounds.y+bounds.height){for(const field of fields)field[index]=outside;continue;}
      const distances=players.map(player=>Math.hypot(x-player.x,y-player.y));
      for(let i=0;i<players.length;i++){
        let margin=Infinity;
        for(let j=0;j<players.length;j++)if(i!==j){const clearance=players[i].team===players[j].team?0:safety;margin=Math.min(margin,distances[j]-distances[i]-clearance);}
        fields[i][index]=margin;
      }
    }
    function key(point){return `${Math.round(point.x*1000)},${Math.round(point.y*1000)}`;}
    function smoothClosed(points){
      if(points.length<3)return '';
      let path=`M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for(let i=0;i<points.length;i++){
        const p0=points[(i-1+points.length)%points.length],p1=points[i],p2=points[(i+1)%points.length],p3=points[(i+2)%points.length];
        path+=` C ${(p1.x+(p2.x-p0.x)/6).toFixed(2)} ${(p1.y+(p2.y-p0.y)/6).toFixed(2)} ${(p2.x-(p3.x-p1.x)/6).toFixed(2)} ${(p2.y-(p3.y-p1.y)/6).toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
      }
      return path+' Z';
    }
    const output=[];
    for(const values of fields){
      const segments=[],points=new Map(),adjacency=new Map();
      function cross(a,b,ax,ay,bx,by){if((a>0)===(b>0))return null;const t=a/(a-b);return{x:ax+(bx-ax)*t,y:ay+(by-ay)*t};}
      function add(a,b){if(!a||!b)return;const ka=key(a),kb=key(b);if(ka===kb)return;const index=segments.length;segments.push([ka,kb]);points.set(ka,a);points.set(kb,b);for(const k of [ka,kb]){if(!adjacency.has(k))adjacency.set(k,[]);adjacency.get(k).push(index);}}
      for(let gy=0;gy<ny;gy++)for(let gx=0;gx<nx;gx++){
        const index=gy*cols+gx,v0=values[index],v1=values[index+1],v2=values[index+cols+1],v3=values[index+cols];
        const x=x0+gx*dx,y=y0+gy*dy,xr=x+dx,yb=y+dy;
        const edges=[cross(v0,v1,x,y,xr,y),cross(v1,v2,xr,y,xr,yb),cross(v2,v3,xr,yb,x,yb),cross(v3,v0,x,yb,x,y)];
        const crossed=[];for(let edge=0;edge<4;edge++)if(edges[edge])crossed.push(edge);
        if(crossed.length===2)add(edges[crossed[0]],edges[crossed[1]]);
        else if(crossed.length===4){
          const center=(v0+v1+v2+v3)/4,diagonal=v0>0;
          const pairs=center>0?(diagonal?[[0,1],[2,3]]:[[3,0],[1,2]]):(diagonal?[[3,0],[1,2]]:[[0,1],[2,3]]);
          for(const [a,b] of pairs)add(edges[a],edges[b]);
        }
      }
      const visited=new Uint8Array(segments.length),curves=[];
      for(let start=0;start<segments.length;start++){
        if(visited[start])continue;
        const [first,last]=segments[start],chain=[points.get(first),points.get(last)];visited[start]=1;let current=last,closed=false;
        for(let guard=0;guard<=segments.length;guard++){
          if(current===first){closed=true;break;}
          const next=(adjacency.get(current)||[]).find(index=>!visited[index]);if(next==null)break;
          visited[next]=1;const segment=segments[next],following=segment[0]===current?segment[1]:segment[0];chain.push(points.get(following));current=following;
        }
        if(closed){chain.pop();const curve=smoothClosed(chain);if(curve)curves.push(curve);}
      }
      output.push(curves.join(' '));
    }
    return output;
  }
  const EVENT_VISUAL_SPECS={
    shot_candidate:{toggle:'show-shot',label:'シュート',short:'シュート',icon:'S',color:'#ff834a',duration:1450,order:0},
    big_chance_candidate:{toggle:'show-big-chance',label:'決定機',short:'決定機',icon:'★',color:'#ffd66b',duration:2400,order:1},
    chance_creation_candidate:{toggle:'show-chance-creation',label:'チャンスメイク',short:'チャンスメイク',icon:'✦',color:'#d28cff',duration:1900,order:2},
    dribble_success_candidate:{toggle:'show-dribble',label:'ドリブル成功',short:'突破成功',icon:'↗',color:'#69e8cf',duration:1750,order:3},
    assist_candidate:{toggle:'show-assist',label:'アシスト',short:'アシスト',icon:'A',color:'#ff83bb',duration:2200,order:4},
    key_pass_candidate:{toggle:'show-key-pass',label:'キーパス',short:'キーパス',icon:'K',color:'#83c9ff',duration:1900,order:5},
    progressive_pass_candidate:{toggle:'show-progressive-pass',label:'前進パス',short:'前進パス',icon:'›',color:'#8ee0a8',duration:1750,order:6},
    interception_candidate:{toggle:'show-interception',label:'インターセプト',short:'カット',icon:'×',color:'#ff9b76',duration:1750,order:7},
  };
  function collectEventAnnotations(){
    const byPlayer=new Map();if(state.match.analysis_status!=='computed')return byPlayer;
    const actions=[];
    for(const source of state.match.timeline){
      if(source.match_ms>state.time)break;
      if(EVENT_VISUAL_SPECS[source.type])actions.push(source);
      for(const attribute of kickAttributes(source)){
        const at=Number(attribute.effect_match_ms??source.match_ms);if(!Number.isFinite(at)||at>state.time)continue;
        actions.push({...source,event_id:attribute.event_id||`${source.event_id}:${attribute.type}`,type:attribute.type,
          actor_id:attribute.actor_id,actor:attribute.actor,team:attribute.team,match_ms:at,
          details:{raw:attribute.details||{}}});
      }
    }
    for(const event of actions){
      const spec=EVENT_VISUAL_SPECS[event.type];if(!spec||!checked(spec.toggle)||!event.actor_id)continue;
      const age=state.time-event.match_ms,raw=event.details?.raw||{};let duration=spec.duration;
      if(event.type==='big_chance_candidate'&&raw.end_match_ms!=null){const end=Number(raw.end_match_ms);if(Number.isFinite(end)&&end>=event.match_ms)duration=Math.min(7000,Math.max(duration,end-event.match_ms+350));}
      if(age<0||age>duration)continue;
      const existing=byPlayer.get(event.actor_id)||[],at=existing.findIndex(row=>row.type===event.type);
      if(at>=0){if(existing[at].event.match_ms>=event.match_ms)continue;existing.splice(at,1);}
      existing.push({type:event.type,event,spec,age});byPlayer.set(event.actor_id,existing);
    }
    for(const rows of byPlayer.values())rows.sort((a,b)=>a.spec.order-b.spec.order);
    return byPlayer;
  }
  function renderPlayerEventVisuals(player,x,y,annotations){
    if(annotations.some(row=>row.type==='big_chance_candidate'))node('circle',{cx:x,cy:y,r:26,fill:'none',stroke:'#ffd66b','stroke-width':2.5,'stroke-dasharray':'3 4',opacity:reducedMotion.matches ? .82 : .62,'data-event-visual':'big_chance_candidate','pointer-events':'none'});
    if(annotations.some(row=>row.type==='dribble_success_candidate'))node('circle',{cx:x,cy:y,r:23,fill:'none',stroke:'#69e8cf','stroke-width':2,'stroke-dasharray':'2 5',opacity:.85,'data-event-visual':'dribble_success_candidate','pointer-events':'none'});
    if(annotations.some(row=>row.type==='chance_creation_candidate'))node('polygon',{points:`${x+22},${y-23} ${x+28},${y-17} ${x+22},${y-11} ${x+16},${y-17}`,fill:'#d28cff',stroke:'#fff','stroke-width':1,'data-event-visual':'chance_creation_candidate','pointer-events':'none'});
    annotations.forEach((row,index)=>{
      const {spec,event}=row,width=Math.max(46,Array.from(spec.short).length*10+22),column=Math.floor(index/4),bx=column===0?x+22:x-22-width,by=y-32+(index%4)*17;
      const badge=node('g',{'data-event-visual':row.type,'aria-label':`${spec.label}候補: ${player.username}`,'pointer-events':'none'}),title=node('title',{},badge);
      title.textContent=`${spec.label}候補 · ${player.username} · ${clock(event.match_ms,false)}`;
      node('rect',{x:bx,y:by,width,height:15,rx:7,fill:spec.color+'28',stroke:spec.color,'stroke-width':1},badge);
      text(bx+8,by+11,spec.icon,{'text-anchor':'middle','font-size':11,'font-weight':900,fill:spec.color,stroke:'#14251b','stroke-width':2,'paint-order':'stroke'},badge);
      text(bx+17,by+11,spec.short,{'font-size':10.5,'font-weight':800,fill:'#f7f5ed',stroke:'#14251b','stroke-width':2.5,'paint-order':'stroke'},badge);
    });
  }
  function drawShotFlame(position,x,y,parent){
    if(!checked('show-shot')||state.match.analysis_status!=='computed'||position.position_source==='last_known')return;
    const ballId=position.ball_id;if(!ballId)return;let shot=null;
    for(const event of state.recentEvents)if(event.type==='shot_candidate'&&event.details?.ball_id===ballId&&event.match_ms<=state.time&&state.time-event.match_ms<=1450)shot=event;
    if(!shot)return;
    for(const event of state.recentEvents)if(event.match_ms>shot.match_ms&&event.match_ms<=state.time&&event.type==='kick'&&event.details?.ball_id===ballId&&event.match_ms-shot.match_ms>140)return;
    const rows=state.tracks.find(track=>track[0]?.ball_id===ballId),previous=rows&&sampleBall(rows,Math.max(0,state.time-120));let angle=0;
    if(previous&&previous.position_source!=='last_known'){const [px,py]=state.map(previous.x,previous.z),dx=x-px,dy=y-py;if(Math.hypot(dx,dy)>1)angle=Math.atan2(dy,dx)*180/Math.PI;}
    const age=state.time-shot.match_ms,flick=reducedMotion.matches?0:Math.sin(age/72)*2.2,glow=reducedMotion.matches ? .76 : .58;
    const flame=node('g',{transform:`translate(${x} ${y+flick}) rotate(${angle})`,'data-event-visual':'shot_candidate','aria-label':`シュート候補: ${shot.actor||'選手不明'}`,'pointer-events':'none'},parent),title=node('title',{},flame);title.textContent=`シュート候補 · ${shot.actor||'選手不明'}`;
    node('circle',{cx:-8,cy:0,r:18,fill:'#ff5426',opacity:glow},flame);
    node('path',{d:'M -7 -5 C -18 -17 -27 -17 -35 -29 C -33 -14 -27 -8 -20 -4 C -30 -3 -36 3 -41 10 C -27 11 -17 6 -7 5 Z',fill:'#ff592d',opacity:.96},flame);
    node('path',{d:'M -8 -2 C -17 -10 -24 -11 -29 -19 C -28 -8 -21 -4 -15 -1 C -23 1 -28 5 -32 8 C -21 8 -14 4 -8 3 Z',fill:'#ffbd45'},flame);
    node('path',{d:'M -9 -1 C -16 -4 -20 -5 -24 -10 C -22 -3 -17 -1 -13 1 C -18 3 -21 5 -24 7 C -17 6 -12 3 -8 2 Z',fill:'#fff0a0'},flame);
    node('circle',{cx:-29,cy:-21,r:2.2,fill:'#ffe17b',opacity:glow},flame);node('circle',{cx:-36,cy:12,r:1.8,fill:'#ff8d40',opacity:glow},flame);
  }  function scoreAtTime(match,t){
    const asScore=value=>{if(!value||typeof value!=='object'||value.red==null||value.blue==null)return null;const red=Number(value.red),blue=Number(value.blue);return Number.isFinite(red)&&Number.isFinite(blue)?{red,blue}:null;};
    const goals=(match.timeline||[]).filter(event=>event.type==='goal').sort((a,b)=>Number(a.match_ms)-Number(b.match_ms));
    const final=asScore(match.score),totals={red:0,blue:0};
    for(const event of goals)if(event.team==='red'||event.team==='blue')totals[event.team]++;
    const firstScored=goals.find(event=>asScore(event.score||event.details?.score_after)&&(event.team==='red'||event.team==='blue'));
    let score;
    if(firstScored){score=asScore(firstScored.score||firstScored.details?.score_after);score[firstScored.team]=Math.max(0,score[firstScored.team]-1);}
    else if(final&&final.red>=totals.red&&final.blue>=totals.blue)score={red:final.red-totals.red,blue:final.blue-totals.blue};
    else score={red:0,blue:0};
    let shown={...score};
    for(const event of goals){if(Number(event.match_ms)>t)break;const snapshot=asScore(event.score||event.details?.score_after);if(snapshot)score=snapshot;else if(event.team==='red'||event.team==='blue')score[event.team]++;shown={...score};}
    return shown;
  }
  function recoveryRole(event,participantId,at){
    if(['possession_gain_candidate','ball_recovery'].includes(event.type)){
      if(at<event.match_ms||at-event.match_ms>1600)return null;
      if(event.details?.raw?.responsibility_candidate_id===participantId)return 'loss';
      return event.actor_id===participantId?'gain':null;
    }
    if(event.type!=='kick')return null;
    for(const a of kickAttributes(event)){
      const effectAt=Number(a.effect_match_ms??event.match_ms);
      if(a.type!=='possession_gain_candidate'||at<effectAt||at-effectAt>1600)continue;
      if(a.details?.responsibility_candidate_id===participantId)return 'loss';
      if(a.actor_id===participantId)return 'gain';
    }
    return null;
  }
  function renderFrame(){
    const match=state.match;if(!match)return;renderPossessionState();$('#clock').textContent=clock(state.time);$('#seek').value=state.time;$('#seek').setAttribute('aria-valuetext',`試合開始から${clock(state.time)}、全${clock(match.window.duration_ms)}`);
    const score=scoreAtTime(match,state.time);const redScore=score.red;const blueScore=score.blue;document.querySelector("#current-score").innerHTML="<span class=red>"+redScore+"</span> - <span class=blue>"+blueScore+"</span>";
    state.recentEvents=recentEvents(state.time,8000);
    const feed=state.recentEvents.filter(e=>['kick','goal','body_block','foul','foul_candidate','foul_notification','forced_foul','ball_recovery','possession_gain_candidate','possession_loss_candidate','breakthrough_candidate','goal_link_candidate','goal_outcome','shot_candidate','pass_success','progressive_pass_candidate','key_pass_candidate','assist_candidate','big_chance_candidate','chance_creation_candidate','dribble_success_candidate','interception_candidate'].includes(e.type)).slice(-4),feedKey=feed.map(e=>e.event_id).join('|');
    if(state.feedKey!==feedKey){state.feedKey=feedKey;$('#pitch-feed').innerHTML=feed.flatMap(e=>{const foul=['foul','foul_candidate'].includes(e.type),shownTeam=displayTeam(e);if(foul){const pushed=e.details?.raw?.push_foul_success===true,playerId=pushed?`forced_foul:${e.event_id}`:e.event_id,player=e.actor?`<button data-event="${esc(playerId)}" class="feed-line ${esc(pushed?'forced_foul':e.type)}"><time>${clock(e.match_ms,false)}</time> <b class="${esc(e.team||'')}">${esc(e.actor)}</b> ${pushed?'ファウル押し付け成功':'ファウル'}</button>`:'';return [player,`<button data-event="${esc(e.event_id)}" class="feed-line ${esc(e.type)}"><time>${clock(e.match_ms,false)}</time> ${eventLabelHtml(e)}</button>`].filter(Boolean);}const label=e.type==='goal'?'ゴール！':esc(eventLabel(e)),person=e.actor||(shownTeam?team(shownTeam):'');return [`<button data-event="${esc(e.event_id)}" class="feed-line ${esc(e.type)}"><time>${clock(e.match_ms,false)}</time> <b class="${esc(shownTeam||playerByName(e.actor)?.team||'')}">${esc(person)}</b> ${label}</button>`];}).join('');}
    $('#pitch-feed').hidden=!checked('show-feed');
    const svg=$('#pitch');
    if(!state.loaded||!Number.isFinite(state.bounds?.[0])){drawingLayer=null;svg.replaceChildren();text(480,270,state.loaded?'この区間の位置データはありません':'追跡データを読み込んでいます',{'text-anchor':'middle',fill:'#a8bbaa','font-size':16});return;}
    if(!state.map)preparePitch();drawingLayer=state.dynamic;drawingLayer.replaceChildren();const map=state.map;
    const current=state.match.timeline.filter(e=>e.match_ms<=state.time).at(-1);
    $$('#event-list [data-event]').forEach(el=>{const active=el.dataset.event===(state.event||current)?.event_id;el.classList.toggle('selected',active);if(active)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
    for(const rows of state.tracks){if(!checked('show-trail')||!rows[0].ball_id)continue;let path=[],last=null;const flush=()=>{if(path.length>1)node('polyline',{points:path.join(' '),fill:'none',stroke:'#d2f58b70','stroke-width':2});path=[]};for(const r of rows){if(r.match_ms<state.time-1000||r.match_ms>state.time)continue;if(r.x==null||r.z==null||r.break_before||(last!==null&&r.match_ms-last>150)){flush();last=null;if(r.x==null||r.z==null)continue;}path.push(map(r.x,r.z).join(','));last=r.match_ms;}flush();}
    state.visiblePlayers=[];let visible=0,ballVisible=false,ballPosition=null;const playerPositions=new Map();for(const rows of state.tracks){const p=sampleBall(rows,state.time);if(!p)continue;if(p.ball_id){if(!ballPosition||p.last_observation_ms>ballPosition.last_observation_ms)ballPosition=p;continue;}const previous=playerPositions.get(p.participant_id);if(!previous||p.last_observation_ms>previous.last_observation_ms)playerPositions.set(p.participant_id,p);}
    // Smooth marching-squares contours preserve the reach and teammate-nearest rules.
    if(checked('show-territory')){
      const active=[];for(const [participantId,rows] of state.territoryTracks){if(!state.playerMap.has(participantId))continue;const position=sampleTerritoryPlayer(rows,state.time);if(position)active.push({...position,participant_id:participantId});}
      const expected=(match.players||[]).filter(p=>['red','blue'].includes(p.team));
      const complete=active.length>=expected.length&&expected.length&&active.some(p=>state.playerMap.get(p.participant_id)?.team==='red')&&active.some(p=>state.playerMap.get(p.participant_id)?.team==='blue');
      const cache=state.territoryCache,now=performance.now();
      if(cache.matchId!==match.match_id){cache.matchId=match.match_id;cache.positionKey=null;cache.paths=null;cache.teams=[];cache.uncertain=false;cache.matchMs=null;cache.updatedAt=0;}
      if(complete){
        const mapped=active.map(p=>{const player=state.playerMap.get(p.participant_id),[x,y]=map(p.x,p.z);return{participant_id:p.participant_id,team:player.team,x,y};});
        const positionKey=mapped.map(p=>`${p.participant_id}:${p.team}:${p.territory_stale}:${Math.round(p.x*2)},${Math.round(p.y*2)}`).join('|');
        const keyChanged=positionKey!==cache.positionKey,timeWentBack=cache.matchMs!=null&&state.time<cache.matchMs;
        const mustRefresh=cache.paths===null||keyChanged||timeWentBack||cache.matchMs==null||state.time-cache.matchMs>250;
        if(mustRefresh&&(cache.paths===null||now-cache.updatedAt>=75)){
          cache.paths=territoryPaths(mapped,state.pitchRect,state.pitchScale);cache.teams=mapped.map(p=>p.team);cache.uncertain=mapped.some(p=>p.territory_stale);
          cache.positionKey=positionKey;cache.matchMs=state.time;cache.updatedAt=now;
        }else if(!keyChanged&&!timeWentBack){cache.matchMs=state.time;}
      }
      const canReuse=cache.paths!==null&&(complete||(cache.matchMs!=null&&state.time>=cache.matchMs&&state.time-cache.matchMs<=600));
      if(canReuse)for(let i=0;i<cache.paths.length;i++)if(cache.paths[i]){const color=cache.teams[i]==='red'?'#ef827e':'#7cb8ec';node('path',{d:cache.paths[i],fill:color,'fill-opacity':cache.uncertain ? 0.08 : 0.16,stroke:color,'stroke-width':1.5,'stroke-dasharray':cache.uncertain?'4 3':'','stroke-linecap':'round','stroke-linejoin':'round','clip-path':'url(#territory-field-clip)'});}
    }
    const playerEventAnnotations=collectEventAnnotations();
    for(const p of playerPositions.values()){const [x,y]=map(p.x,p.z),player=state.playerMap.get(p.participant_id);if(!player)continue;visible++;const positionLabel=({observed:'観測位置',interpolated:'短い区間を補間',stationary_estimate:'同位置の観測間を保持',held_estimate:'直前の位置を短時間保持',last_known:'最終観測位置・現在位置は不明'})[p.position_source]||'位置不明';state.visiblePlayers.push({x,y,player,positionLabel});const recent=state.recentEvents.filter(e=>['kick','body_block','goal'].includes(e.type)&&state.time>=e.match_ms&&state.time-e.match_ms<=(e.type==='goal'?2200:800)&&(e.actor_id?e.actor_id===player.participant_id:e.actor&&e.actor===player.username)).sort((a,b)=>(b.type==='goal')-(a.type==='goal')||b.match_ms-a.match_ms)[0];const transition=state.match.analysis_status==='computed'&&checked('show-recovery')?state.recentEvents.find(e=>recoveryRole(e,player.participant_id,state.time)):null;const pass=state.match.analysis_status==='computed'&&checked('show-pass')?state.recentEvents.find(e=>e.type==='kick'&&kickAttributes(e).some(a=>a.type==='pass_success'&&a.actor_id===player.participant_id&&state.time>=Number(a.effect_match_ms??e.match_ms)&&state.time-Number(a.effect_match_ms??e.match_ms)<=1600)):null;if(transition||pass){const lost=transition&&recoveryRole(transition,player.participant_id,state.time)==='loss';const labels=[];if(transition)labels.push({label:lost?'\u88ab\u596a\u53d6':'\u596a\u53d6',color:lost?'#ff6b6b':'#73ffcb'});if(pass)labels.push({label:'PASS',color:'#ffe16d'});labels.forEach((entry,index)=>{node('circle',{cx:x,cy:y,r:29+index*5,fill:'none',stroke:entry.color,'stroke-width':3,'stroke-dasharray':'5 3'});text(x,y-32-index*18,entry.label,{'text-anchor':'middle','font-size':16,'font-weight':800,fill:entry.color,stroke:'#14251b','stroke-width':3,'paint-order':'stroke'});});} const g=node('g',{'aria-label':`${player.username} ${team(player.team)} ${positionLabel}`,tabindex:0,role:'button','data-player':player.username,'aria-pressed':String(state.player===player.username),opacity:1});const title=node('title',{},g);title.textContent=`${player.username} · ${team(player.team)} · ${positionLabel}`;const size=Math.max(.65,Math.min(1.1,state.pitchScale/10)),icon=node('g',{transform:`translate(${x} ${y}) scale(${size}) translate(${-x} ${-y})`},g);if(state.player===player.username)node('circle',{cx:x,cy:y,r:23,fill:'none',stroke:'#ffffff','stroke-width':1.5,'stroke-dasharray':'3 3'},icon);const effectEnabled=recent?.type==='kick'?checked('show-kick-effects')&&!!recent.kick_strength:recent?.type==='goal'&&checked('show-goal-effects');if(recent&&effectEnabled){const goal=recent.type==='goal',shot=recent.type==='kick'&&recent.kick_strength==='strong',duration=goal?2200:800,phase=reducedMotion.matches?0:(state.time-recent.match_ms)/duration,color=goal?'#ffe08a':shot?'#ffb36b':recent.kick_strength==='medium'?'#78d5ff':recent.kick_strength==='weak'?'#d2f58b':'#ffc27d';node('circle',{cx:x,cy:y,r:21+phase*(goal?13:7),fill:'none',stroke:color,'stroke-width':goal?4:3,'stroke-dasharray':recent.kick_strength==='medium'?'6 4':'',opacity:Math.max(.2,1-phase)},icon);if(goal||shot){node('circle',{cx:x,cy:y,r:24,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':goal?'3 4':'8 5',opacity:.9},icon);for(let i=0;i<(goal?8:4);i++){const angle=i*Math.PI*2/(goal?8:4),inner=27,outer=goal?34:31;node('line',{x1:x+Math.cos(angle)*inner,y1:y+Math.sin(angle)*inner,x2:x+Math.cos(angle)*outer,y2:y+Math.sin(angle)*outer,stroke:color,'stroke-width':2,'stroke-linecap':'round',opacity:Math.max(.3,1-phase)},icon);}}}node('circle',{cx:x,cy:y,r:18,fill:'#18271d',stroke:player.team==='red'?'#ef827e':'#7cb8ec','stroke-width':2.5},icon);svgHead(player,x,y,24,icon);if($('#show-names').checked||state.player===player.username)text(x,y+28,player.username,{'text-anchor':'middle','font-size':13,fill:player.team==='red'?'#ff9c98':player.team==='blue'?'#91caff':'#ecf3e9',stroke:'#182c1d','stroke-width':4,'paint-order':'stroke','stroke-linejoin':'round'},g);const annotations=playerEventAnnotations.get(player.participant_id);if(annotations?.length)renderPlayerEventVisuals(player,x,y,annotations);}
    if(ballPosition){const [x,y]=map(ballPosition.x,ballPosition.z),stale=ballPosition.position_source==='last_known',wide=ballPosition.position_source==='interpolated_wide';ballVisible=true;const ball=node('g',{'aria-label':stale?'ボールの最終観測位置':wide?'ボールの推定位置':'ボール',opacity:1});const title=node('title',{},ball);title.textContent=stale?'ボールの最終観測位置（現在位置は不明）':wide?'ボールの推定位置（250〜750msの間を補間）':'ボール';drawShotFlame(ballPosition,x,y,ball);node('circle',{cx:x,cy:y,r:10,fill:'#f9fbf7',stroke:'#1d2920','stroke-width':1.4},ball);node('polygon',{points:`${x},${y-5} ${x+5},${y-1} ${x+3},${y+5} ${x-3},${y+5} ${x-5},${y-1}`,fill:'#26312a'},ball);for(let a=0;a<5;a++){const angle=(a*72-90)*Math.PI/180;node('line',{x1:x+Math.cos(angle)*5,y1:y+Math.sin(angle)*5,x2:x+Math.cos(angle)*9,y2:y+Math.sin(angle)*9,stroke:'#26312a','stroke-width':1},ball);}}
    const goal=state.recentEvents.filter(e=>e.type==='goal'&&state.time>=e.match_ms&&state.time-e.match_ms<=2200).sort((a,b)=>b.match_ms-a.match_ms)[0];if(goal&&checked('show-goal-effects')){const label=node('g',{'aria-label':`得点 ${goal.actor||'得点者不明'}`});node('rect',{x:378,y:18,width:204,height:48,rx:8,fill:'#17261e',stroke:'#ffe08a','stroke-width':2},label);text(480,39,'GOAL',{'text-anchor':'middle','font-size':18,'font-weight':700,'letter-spacing':4,fill:'#ffe08a'},label);text(480,56,goal.actor||team(goal.team),{'text-anchor':'middle','font-size':12,fill:'#f5f6ed'},label);}
    if(checked('show-best-kick')){
      // Pick the actual next/previous kick before looking up its evaluation;
      // an unanalysed kick must not inherit another kick's prediction.
      const option=activeKickOption(match.timeline,match.analysis?.kick_options?.kicks||[],state.time,state.event);
      if(option){
        const previousLayer=drawingLayer;drawingLayer=node('g',{'data-layer':'kick-options','pointer-events':'none'});
        const drawOption=(entry,color,dashed,label,offset)=>{
          if(!entry)return;
          const points=(entry.path?.length?entry.path:[entry.origin,entry.end]).map(p=>map(p.x,p.z).join(',')).join(' ');
          const [x2,y2]=map(entry.end.x,entry.end.z);
          node('polyline',{points,fill:'none',stroke:color,'stroke-width':4,'stroke-dasharray':dashed?'8 6':'','stroke-linecap':'round','stroke-linejoin':'round'});
          node('circle',{cx:x2,cy:y2,r:9,fill:'none',stroke:color,'stroke-width':3});
          const value=entry.score==null?'\u4e0d\u660e':Number(entry.score).toFixed(1);
          const labelX=Math.max(90,Math.min(870,x2)),labelY=Math.max(16,Math.min(526,y2+offset));
          text(labelX,labelY,`${label} ${value}`,{'text-anchor':'middle','font-size':13,fill:color,'font-weight':700,stroke:'#15231d','stroke-width':3,'paint-order':'stroke'});
          if(entry.block?.point){const [bx,by]=map(entry.block.point.x,entry.block.point.z);node('circle',{cx:bx,cy:by,r:7,fill:'#f59f39',stroke:'#fff','stroke-width':2});}
        };
        for(const p of option.best.projected_players||[]){const [px,py]=map(p.position.x,p.position.z);node('circle',{cx:px,cy:py,r:15,fill:'none',stroke:p.team==='red'?'#ff8888':'#8ac8ff','stroke-width':2,'stroke-dasharray':'4 3'});const player=state.playerMap.get(p.participant_id);if(player)text(px,py+27,player.username+' \u4e88\u6e2c',{'text-anchor':'middle','font-size':10,fill:'#fff'});}
        if(option.actual_observed?.ball_position){const [ox,oy]=map(option.actual_observed.ball_position.x,option.actual_observed.ball_position.z);node('circle',{cx:ox,cy:oy,r:6,fill:'#70edb2',stroke:'#123b2d','stroke-width':2});const ov=option.actual_observed.score==null?'\u4e0d\u660e':Number(option.actual_observed.score).toFixed(1);text(ox,oy+19,`\u5b9f\u6e2c ${ov}`,{'text-anchor':'middle','font-size':12,fill:'#70edb2',stroke:'#15231d','stroke-width':3,'paint-order':'stroke'});}
        drawOption(option.actual,'#ffffff',true,'\u5b9f\u30ad\u30c3\u30af\u8fd1\u4f3c',32);
        drawOption(option.worst,'#ff7777',true,'\u6700\u60aa\u5019\u88dc',50);
        drawOption(option.best,'#ffe16b',false,'\u6700\u826f\u5019\u88dc',-12);
        if(option.match_ms>state.time)text(480,70,`\u6b21\u306e\u30ad\u30c3\u30af\u307e\u3067 ${((option.match_ms-state.time)/1000).toFixed(1)}\u79d2`,{'text-anchor':'middle','font-size':14,fill:'#fff','font-weight':700,stroke:'#15231d','stroke-width':3,'paint-order':'stroke'});
        drawingLayer=previousLayer;
      }
    }
    $('#load-status').textContent=`${visible} / ${match.players.length} PLAYERS${!ballVisible?' · ボール位置記録なし':ballPosition.position_source==='last_known'?' · ボールは最終観測位置':ballPosition.position_source==='interpolated_wide'?' · ボール位置を補間中':''}`;
  }
  function filteredEvents(){
    return (state.match?.timeline||[]).filter(e=>{
      const attrs=kickAttributes(e);
      const typeMatch=state.filter==='all'||e.type===state.filter
        ||(state.filter==='foul'&&['foul_candidate','foul_notification'].includes(e.type))
        ||(state.filter==='ball_recovery'&&e.type==='possession_gain_candidate')
        ||(state.filter==='kick'&&e.type==='kick')
        ||(e.type==='kick'&&(e.kick_strength||'unknown')===state.filter)
        ||(e.type==='kick'&&attrs.some(a=>a.type===state.filter||(state.filter==='ball_recovery'&&a.type==='possession_gain_candidate')));
      const playerMatch=state.player==='all'||e.actor===state.player
        ||state.playerMap?.get(e.actor_id)?.username===state.player
        ||attrs.some(a=>a.actor===state.player||state.playerMap?.get(a.actor_id)?.username===state.player);
      return typeMatch&&playerMatch;
    });
  }
  function renderEvents(){const events=filteredEvents();$('#event-count').textContent=`${events.length} PLAYS`;$('#event-list').innerHTML=events.length?events.map(e=>`<button class="event-row ${esc(e.type)}" data-event="${esc(e.event_id)}" title="${esc(eventExplanation(e))}"><span class="event-time">${clock(e.match_ms,false)}</span><span class="event-icon">${symbol(e.type)}</span><span class="event-copy"><strong>${eventLabelHtml(e)}</strong><small class="${esc(displayTeam(e)||playerByName(e.actor)?.team||'')}">${esc(eventSubLabel(e))}</small></span><span class="event-chevron">›</span></button>`).join(''):'<p class="empty">条件に合うプレーがありません。</p>';}
  function selectEvent(e){setPlaying(false);state.event=e;state.time=Math.max(0,Math.min(state.match.window.duration_ms,Number(e.match_ms)||0));showView('replay');renderInspector();renderFrame();}
  function candidateList(candidates, raw, event) {
    if(event.type!=='kick') return '';
    const ambiguity={same_view_same_tool:'候補者の向きと道具が似ており、区別できません。',score_margin_insufficient:'候補者のスコア差が小さく、絞り込めません。',direction_conflict:'最上位候補の向きがボールの進行方向と大きく異なります。',missing_geometry:'位置・視線・打球方向の記録が不足しています。',no_matching_candidates:'距離、視線と打球方向の条件を満たす候補がいません。'};
    const reason=ambiguity[raw.actor_ambiguity_reason] || (candidates.length?'観測された根拠だけでは打者を特定できません。':'打者の候補となる観測がありません。');
    const rows=candidates.map(candidate=>{
      const player=state.playerMap?.get(candidate.participant_id)||playerByName(candidate.username)||{username:candidate.username,team:candidate.team};
      const status=candidate.recorder_swing_missing_estimate?'録画者の腕振りを補完':candidate.time_delta_ms!=null?'腕振りを観測':'腕振り未観測（操作の有無は不明）';
      const score=Number.isFinite(candidate.score)?candidate.score.toFixed(2):'不明';const scoreBasis=candidate.score_basis==="distance_timing_fallback"?"\u4f4d\u7f6e\u30fb\u6642\u5dee\u4e2d\u5fc3":"\u65b9\u5411\u89d2\u5ea6\u3092\u542b\u3080";
      const facts=[candidate.distance_m==null?'距離不明':`距離 ${Number(candidate.distance_m).toFixed(2)}m`,candidate.time_delta_ms==null?'腕振り時差不明':`通知との腕振り時差 ${candidate.time_delta_ms}ms`,candidate.observed_main_hand?`道具 ${item(candidate.observed_main_hand)}`:'道具不明',candidate.ball_view_difference_deg==null?'ボール方向不明':`ボール方向差 ${Number(candidate.ball_view_difference_deg).toFixed(0)}°`,candidate.direction_difference_deg==null?'打球方向不明':`打球方向差 ${Number(candidate.direction_difference_deg).toFixed(0)}°`,candidate.turn_detected?'振り向き検出':'振り向き未検出'];
      return `<div class="candidate">${avatar(player)}<div class="candidate-info"><b class="${esc(candidate.team||'')}">${esc(candidate.username||'選手不明')}</b><small>${esc(team(candidate.team))} · ${esc(status)}</small><small>${facts.map(esc).join(' / ')}</small></div><div class="candidate-score"><small>${esc(scoreBasis)}</small><b>${esc(score)}</b></div></div>`;
    }).join('');
    const positionNote=raw.actor_ball_position_source==='last_before_impact'?`打撃通知の${raw.actor_ball_position_age_ms}ms前に観測されたボール位置を使用。`:'速度通知時点のボール位置を使用。';
    return `<section class="candidates"><h4>打者候補 (${candidates.length}人)</h4>${!event.actor?`<p class="ambiguity"><b>打者を特定できません</b><br>${esc(reason)}</p>`:''}<p class="candidate-note">${esc(positionNote)} スコアは小さいほど条件に合います。</p>${rows||'<p class="candidate-note">候補はありません。</p>'}</section>`;
  }
  function renderEventContext(event){
    const context=(state.match?.analysis?.play_context?.kicks||[]).find(row=>row.event_id===event.event_id);
    if(!context)return '';
    const coord=p=>p?`(${Number(p.x).toFixed(1)}, ${Number(p.z).toFixed(1)})`:'\u4e0d\u660e';
    const labels={before:'1\u79d2\u524d',at:'\u30ad\u30c3\u30af\u6642',after:'1\u79d2\u5f8c'};
    const timing=sample=>sample&&Number.isFinite(sample.target_delta_ms)?` / ${sample.target_delta_ms>=0?'+':''}${sample.target_delta_ms}ms`:'';
    const sections=['before','at','after'].map(key=>{const snap=context[key];if(!snap)return '';const people=(snap.players||[]).map(p=>{const sample=p.sample,name=state.playerMap.get(p.participant_id)?.username||p.participant_id;const yaw=sample?.yaw_deg;return `<li>${esc(name)}: ${esc(coord(sample?.position))}${Number.isFinite(yaw)?` / \u5411\u304d ${Number(yaw).toFixed(0)}\xb0`:''} <small>(${esc(sample?.position_source||p.missing_reason||'\u4e0d\u660e')}${timing(sample)})</small></li>`;}).join('');return `<section><h5>${labels[key]} \xb7 ${clock(snap.target_match_ms)}</h5><p>\u30dc\u30fc\u30eb ${esc(coord(snap.ball?.position))} <small>(${esc(snap.ball?.position_source||snap.ball_missing_reason||'\u4e0d\u660e')}${timing(snap.ball)})</small></p><ul>${people}</ul></section>`;}).join('');
    return `<details class="reason"><summary>\u524d\u5f8c\u306e\u76e4\u9762\u3068\u4f4d\u7f6e\u306e\u6839\u62e0</summary><p>\u5ea7\u6a19\u306f X, Z \uff08\u30de\u30b9\uff09\u3002\u88dc\u9593\u30fb\u6b20\u6e2c\u3092\u542b\u307f\u3001\u5411\u304d\u306e\u89b3\u6e2c\u6642\u523b\u306f\u4e0d\u660e\u3067\u3059\u3002</p>${sections}</details>`;
  }
  function renderInspector(){const e=state.event;$('#event-browser').hidden=false;$('#event-detail').hidden=!e;if(!e)return;const raw=e.details?.raw||{},c=e.details?.candidate_actors||[],p=playerByName(e.actor);
    let summary=stage2&&e.type==='kick'?(e.actor?`${e.actor}に関連付けられた${kickLabel(e)}の候補です。強度と打者は推定です。`:'キック候補を記録しました。打者は不明です。'):e.type==='foul_notification'?'ファウルに関する通知です。対象選手や処罰チームは確定していません。':e.type==='goal'?(e.actor?`${e.actor}の名前を含む得点通知が記録されています。`:'得点通知が記録されています。得点者は特定できていません。'):e.type==='body_block'?'選手の近くでボールの速さが大きく下がりました。体に当たった可能性がありますが、接触は未確認です。':e.type==='kick'?(e.actor?`${e.actor}が${item(e.item)}で蹴ったと判定しました。`:'キック候補を検出しましたが、打者を一人に絞れていません。'):'この時刻の試合イベントです。';
    if(e.type==='possession_loss_candidate')summary=`被奪取の責任者候補：${e.actor||'なし（判定できない場合を含む）'}。支配や責任は推定です。`;
    if(e.type==='shot_candidate')summary=`シュート候補。結果：${({goal_candidate:'得点との関連候補',not_goal_candidate:'得点にならなかった候補',unknown:'不明'})[raw.outcome]||'不明'}。キックの意図と結果は推定です。`;
    if(e.type==='assist_candidate')summary='得点につながるシュートの前に味方が蹴ったアシスト候補です。';
    if(e.type==='key_pass_candidate')summary='シュート候補につながった味方へのパス候補です。';
    if(e.type==='progressive_pass_candidate')summary=`パス成功候補のうち、ゴール方向へ${raw.forward_progress_m??'不明'}マス進んだ候補です。`;
    if(e.type==='interception_candidate')summary='ゴール前の味方を狙った相手のパス候補を奪った場面です。全てのパスを判定できるわけではありません。';
    if(e.type==='dribble_success_candidate')summary='同じ相手が前方から後方に移り、支配候補を保って前進したドリブル成功候補です。';
    if(e.type==='big_chance_candidate')summary='位置と相手選手の配置から推定した決定機候補です。';
    if(e.type==='chance_creation_candidate')summary='決定機候補の前に味方が蹴ったチャンスメイク候補です。';
    if(e.type==='breakthrough_candidate')summary='\u653b\u6483\u65b9\u5411\u3078\u306e\u524d\u9032\u5019\u88dc\u3067\u3059\u3002\u7a81\u7834\u3084\u30b7\u30e5\u30fc\u30c8\u306e\u6210\u529f\u306f\u78ba\u8a8d\u3057\u3066\u3044\u307e\u305b\u3093\u3002';
    if(e.type==='goal_link_candidate')summary='\u3053\u306e\u30ad\u30c3\u30af\u3068\u5f97\u70b9\u901a\u77e5\u306e\u95a2\u9023\u3092\u793a\u3059\u5019\u88dc\u3067\u3059\u3002\u5f97\u70b9\u8005\u306e\u7279\u5b9a\u306f\u78ba\u5b9a\u3057\u3066\u3044\u307e\u305b\u3093\u3002';
    if(e.type==='goal_outcome')summary='\u5f97\u70b9\u901a\u77e5\u306b\u57fa\u3065\u304f\u7d50\u679c\u306e\u8a18\u9332\u3067\u3059\u3002';
    const reasons=[];if(stage2&&e.type==='kick'){reasons.push('工程2ではイベントの記録を表示しています。');}else if(e.type==='kick'){reasons.push('ボールの速度に変化が記録されています。');if(raw.kick_status==='supported_candidate')reasons.push('近い時刻に腕振り、またはボールの攻撃演出があります。');if(e.ball_damage_observed)reasons.push('ボールへのダメージ通知もあります。');if(raw.followup?.type==='goal')reasons.push(`次の打撃より先に${team(raw.followup.team)}の得点通知があります。`);if(raw.followup?.type==='foul')reasons.push('次の打撃より先にファウル通知があります。');if(raw.followup?.subsequent_goal)reasons.push(`次の打撃に続いて${team(raw.followup.subsequent_goal.team)}の得点通知があります。`);if(raw.direction_comparison_applied)reasons.push('候補者の向きとボールの進行方向の差を比較しています。');if(raw.actor_ambiguity_reason==='same_view_same_tool')reasons.push('候補者の道具と視線方向が近く、区別できません。');if(raw.recorder_swing_missing_estimate)reasons.push('録画者の腕振りが記録されていない可能性を考慮しています。');if(raw.actor_assignment_basis==='timing_compensated_swing')reasons.push('記録の時差に応じて候補距離を広げています。');if(raw.actor_assignment_basis==='goal_scoring_team_tiebreak')reasons.push('直後の得点チームを使って候補を絞っています。');if(raw.actor_assignment_basis==='independent_foul_outcome')reasons.push('独立したファウル結果の記録から候補を絞っています。');}if(e.type==='foul'){reasons.push(`アウトにしたチーム（直前の打者から推定）：${team(outTeam(e))}`);reasons.push(raw.penalty_team?`ペナルティ対象：${team(raw.penalty_team)}`:'ペナルティ対象は不明です。');reasons.push(raw.push_foul_candidate===true?'直前の打者のチームと処罰先が異なり、押し付けの候補です。':raw.push_foul_candidate===false?'直前の打者のチームと処罰先は同じです。':'押し付けの有無は不明です。');}
    if(e.type==='possession_loss_candidate')reasons.push(`\u524d\u306e\u63a5\u89e6\u30c1\u30fc\u30e0\uff1a${team(raw.previous_team)} \u30fb \u6b21\u306e\u63a5\u89e6\u30c1\u30fc\u30e0\uff1a${team(raw.next_team||e.team)} \u30fb \u63a5\u89e6\u9593\uff1a${raw.touch_gap_ms??'\u4e0d\u660e'}ms`);
    if(e.type==='breakthrough_candidate')reasons.push('\u9078\u624b\u30fb\u30dc\u30fc\u30eb\u306e\u4f4d\u7f6e\u3068\u653b\u6483\u65b9\u5411\u304b\u3089\u524d\u9032\u5019\u88dc\u3092\u62fe\u3063\u3066\u3044\u307e\u3059\u3002\u7d50\u679c\u306f\u78ba\u8a8d\u3057\u3066\u3044\u307e\u305b\u3093\u3002');
    if(['ball_recovery','possession_gain_candidate'].includes(e.type))reasons.push(raw.classification==='spatial_control_change'?`同じボールの位置に基づく支配候補が${team(raw.previous_team)}から${team(e.team)}へ移りました。`:`同じボールへの打撃が${team(raw.previous_team)}から${team(e.team)}へ${raw.touch_gap_ms}msで移りました。保持や奪取の成功は未確認です。`);
    if(e.type==='possession_gain_candidate')reasons.push(`被奪取の責任者候補：${state.playerMap.get(raw.responsibility_candidate_id)?.username||'なし（判定できない場合を含む）'}。`);
    if(e.type==='possession_gain_candidate'&&raw.classification==='contested_followed_by_observed_control')reasons.push('競り合いの前後で両チームの距離支配候補が確認されたため、支配移動の候補にしています。');
    if(e.type==='possession_gain_candidate'&&raw.responsibility_basis==='kick_toward_teammate_and_goal_ambiguous')reasons.push('味方とゴールが同じ方向にあり、シュートとパスを区別できない候補です。');
    if(e.type==='foul_candidate'&&raw.boundary)reasons.push('ボールが推定コート境界を越えました。',`アウトにしたチーム（直前の打者から推定）：${team(outTeam(e))}`,`直前の打者：${e.actor||'不明'}`,raw.penalty_team?`処罰チーム（${raw.penalty_team_player_count}人の攻撃速度低下から推定）：${team(raw.penalty_team)}`:'処罰チームは不明です。',raw.push_foul_success===true?'両チームが異なるため、押し付け成功として集計しています。':raw.push_foul_success===false?'両チームが同じため、押し付け成功には数えません。':'打者または処罰チームが不明なため、押し付けの集計を保留しています。',`直前の打撃から ${(Number(raw.last_kick_delay_ms)/1000).toFixed(2)} 秒後。コート境界も推定です。`);
    else if(e.type==='foul_candidate')reasons.push('同じチームの複数選手に攻撃速度低下が観測されたことからの候補です。ファウルやアウト、押し付けの成立は確定していません。');
    if(e.type==='forced_foul')reasons.push(`最後の打者は${team(raw.last_kick_team)}、ペナルティ対象は${team(raw.penalty_team)}です。押し付けや貫通は未確認です。`);
    if(e.type==='kick'&&e.kick_strength_source==='observed_flight_distance')reasons.push(`観測された水平移動距離 ${raw.flight_distance_estimate?.distance_m ?? '不明'}m から強さを推定しています。次の接触などで距離が途中で止まるため、実際より弱く推定する場合があります。`);
    if(e.type==='kick'&&e.kick_strength_source==='inferred_speed_band')reasons.push('道具が不明のため、ボールの初速からキックの強さを推定しています。');
    const displayName=['foul','foul_candidate'].includes(e.type)?eventLabel(e):(e.actor||'選手不明'),displayTeamName=displayTeam(e);
    const impact=e.type==='kick'&&!stage2?`<section class="impact-info"><h4>打撃の状況</h4><p>クリティカル：${raw.critical===true?'演出を観測（候補）':'不明（演出は未観測）'}<br>ダッシュ打撃：${raw.dash_candidate?'候補（スプリントと初速が条件に一致）':raw.sprinting_before_kick===true?'スプリント中を観測、ダッシュ打撃は不明':raw.sprinting_before_kick===false?'スプリントなしを観測':'不明（スプリントや道具の記録不足）'}<br>水平初速：${Number.isFinite(e.horizontal_speed)?Number(e.horizontal_speed).toFixed(2)+' マス/tick':'不明'}</p><small>初回ダッシュかどうかは特定できません。飛距離は接触などによって変わります。</small></section>`:'';
    const kickOption=e.type==='kick'?(state.match.analysis?.kick_options?.kicks||[]).find(k=>k.event_id===e.event_id):null;
    const optionInfo=kickOption?(()=>{
      const best=kickOption.best,worst=kickOption.worst,actual=kickOption.actual,before=kickOption.before?.score;
      const label={weak:'\u5f31',medium:'\u4e2d',strong:'\u5f37',weak_dash:'\u5f31\u30fb\u521d\u56de\u30c0\u30c3\u30b7\u30e5',medium_dash:'\u4e2d\u30fb\u521d\u56de\u30c0\u30c3\u30b7\u30e5',strong_dash:'\u5f37\u30fb\u521d\u56de\u30c0\u30c3\u30b7\u30e5'};
      const outcome={stopped_candidate:'\u505c\u6b62\u5019\u88dc',body_block_candidate:'\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc',goal_candidate:'\u5f97\u70b9\u5019\u88dc',own_goal_candidate:'\u30aa\u30a6\u30f3\u30b4\u30fc\u30eb\u5019\u88dc',out_candidate:'\u5834\u5916\u5019\u88dc'};
      const number=v=>v==null?'\u4e0d\u660e':Number(v).toFixed(1);
      const desc=x=>x?`${esc(label[x.strength]||x.strength)} ${number(x.score)} / ${esc(outcome[x.outcome?.kind]||x.outcome?.kind||'\u4e0d\u660e')}`:'\u4e0d\u660e';
      const delta=before==null||best.score==null?'\u4e0d\u660e':number(best.score-before);
      const cs=best.components||{};const detail=['red','blue'].map(t=>{const v=cs[t];return v?`${team(t)}\uff1a\u652f\u914d ${v.control.toFixed(2)}\u3001\u30b4\u30fc\u30eb ${v.goal_proximity.toFixed(2)}\u3001\u524d\u65b9 ${v.forward_space.toFixed(2)}\u3001\u5473\u65b9 ${v.teammate_space.toFixed(2)}`:''}).filter(Boolean).join('<br>');
      const blocker=best.block?.participant_id?state.playerMap.get(best.block.participant_id)?.username:null;
      return `<section class="impact-info"><h4>\u76e4\u9762\u8a55\u4fa1\u3068\u30ad\u30c3\u30af\u5019\u88dc\uff08\u8a66\u4f5c\uff09</h4><p>\u30ad\u30c3\u30af\u524d ${number(before)} / \u6700\u826f ${desc(best)} / \u5909\u5316 ${delta}<br>\u6700\u60aa\u5019\u88dc ${desc(worst)}<br>\u5b9f\u30ad\u30c3\u30af\u8fd1\u4f3c ${desc(actual)}<br>\u5b9f\u969b\u306b\u89b3\u6e2c\u3057\u305f\u76e4\u9762 ${number(kickOption.actual_observed?.score)}<br>\u5230\u9054 ${best.duration_ms}ms / \u5b9f\u6e2c ${best.distance_model_samples}\u4ef6 / \u5019\u88dc ${kickOption.options_count}\u4ef6 / \u5834\u5916\u7b49\u3067\u5224\u5b9a\u4fdd\u7559 ${kickOption.unknown_outcome_count||0}\u4ef6${blocker?`<br>\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc: ${esc(blocker)}`:''}<br>${detail}</p><small>\u30dc\u30fc\u30eb\u306e\u9ad8\u3055\u3001\u4f53\u30d6\u30ed\u30c3\u30af\u3001\u30b4\u30fc\u30eb\u4f4d\u7f6e\u306b\u306f\u4e0d\u78ba\u5b9f\u6027\u304c\u3042\u308a\u307e\u3059\u3002\u767d\u70b9\u7dda\uff1a\u5b9f\u30ad\u30c3\u30af\u8fd1\u4f3c\u3001\u9ec4\u8272\uff1a\u6700\u826f\u3001\u8d64\u8272\uff1a\u6700\u60aa\u5019\u88dc\u3002</small></section>`;
    })():'';
    $('#event-detail').innerHTML=`<button class="detail-back" id="detail-back">詳細を閉じる ×</button><button class="outline-button" id="replay-context">3秒前から再生</button><div class="detail-type">${esc(eventLabel(e))} · ${clock(e.match_ms)}</div><h3 class="detail-title ${esc(displayTeamName||p?.team||'')}">${esc(displayName)}</h3><div class="person">${e.type==='foul'?'':avatar(p)}<span>${esc(displayTeamName?team(displayTeamName):'チーム不明')}<small class="subtle">${e.item?' / '+esc(item(e.item)):''}</small></span></div><p class="detail-copy">${esc(summary)}</p>${reasons.length?`<div class="reason">${reasons.map(esc).join('<br>')}</div>`:''}${impact}${optionInfo}${candidateList(c,raw,e)}${renderEventContext(e)}<details class="raw-data"><summary>数値と根拠観測を見る</summary><pre>${esc(JSON.stringify({replay_ms:e.replay_ms,location:e.location,evidence:e.evidence,...e.details},null,2))}</pre></details>`;
    $('#replay-context').onclick=()=>{state.time=Math.max(0,e.match_ms-3000);setPlaying(true);renderFrame();};
    $('#detail-back').onclick=()=>{state.event=null;renderInspector();renderFrame();};
  }
  function renderMarkers(){const events=filteredEvents().filter(e=>['goal','kick','body_block','foul','foul_candidate','foul_notification','forced_foul','ball_recovery','possession_gain_candidate','possession_loss_candidate','breakthrough_candidate','goal_link_candidate','goal_outcome','shot_candidate','pass_success','progressive_pass_candidate','key_pass_candidate','assist_candidate','big_chance_candidate','chance_creation_candidate','dribble_success_candidate','interception_candidate'].includes(e.type));$('#event-markers').innerHTML='<div class="marker-track">'+events.map(e=>`<button class="marker ${e.type}" style="left:${Math.max(0,Math.min(100,e.match_ms/Math.max(1,state.match.window.duration_ms)*100))}%" data-event="${esc(e.event_id)}" title="${clock(e.match_ms)} ${eventLabel(e)} \xb7 ${esc(eventExplanation(e))}" aria-label="${clock(e.match_ms)} ${eventLabel(e)}"></button>`).join('')+'</div>';}
  function renderGoals(){$('#goals').innerHTML=state.match.timeline.filter(e=>e.type==='goal').map(e=>`<button class="goal-tile" data-event="${esc(e.event_id)}"><span>${clock(e.match_ms)} · ${team(e.team)}</span><strong class="${esc(e.team||playerByName(e.actor)?.team||'')}">${esc(e.actor||'得点者不明')}</strong><b>${e.score?`<span class="red">${esc(e.score.red)}</span> — <span class="blue">${esc(e.score.blue)}</span>`:'—'}</b></button>`).join('')||'<p class="empty">得点通知はありません。</p>';}
  const baseColumns=[['username','選手'],['analysis.goals','得点'],['analysis.shot_attempt_candidates','シュート候補'],['analysis.shot_unresolved_kicks','シュート判定不明'],['analysis.shot_goal_candidate','得点につながったシュート候補'],['analysis.shot_not_goal_candidate','得点にならなかったシュート候補'],['analysis.assist_candidates','アシスト候補'],['analysis.key_pass_candidates','キーパス候補'],['analysis.big_chance_candidates','決定機候補'],['analysis.chance_creation_candidates','チャンスメイク候補'],['analysis.dribble_success_candidates','ドリブル成功候補'],['analysis.pass_success_rate','パス成功率'],['analysis.progressive_pass_candidates','前進パス候補'],['analysis.body_block_candidates','体ブロック候補'],['analysis.possession_gain_candidates','奪取候補'],['analysis.possession_loss_candidates','被奪取候補']];
  function renderPlayEvaluation(){
    const target=$('#play-evaluation'),evaluation=state.match?.analysis?.play_evaluation;
    if(!evaluation){target.innerHTML='';return;}
    const labels={positive:'\u597d\u6750\u6599',observed:'\u89b3\u6e2c\u5019\u88dc',review:'\u8981\u78ba\u8a8d',unresolved:'\u5224\u65ad\u4fdd\u7559'};
    target.innerHTML=`<div class="section-bar"><div><span class="eyebrow">MATCH REVIEW</span><h2>\u8a66\u5408\u5225\u306e\u9078\u624b\u8a55\u4fa1\uff08\u8a66\u884c\uff09</h2></div></div><p class="subtle">\u30d7\u30ec\u30fc\u306e\u5019\u88dc\u3068\u305d\u306e\u6839\u62e0\u3067\u3059\u3002\u70b9\u6570\u3084\u9806\u4f4d\u3067\u306f\u3042\u308a\u307e\u305b\u3093\u3002\u5224\u65ad\u3067\u304d\u306a\u3044\u5834\u9762\u3082\u6b8b\u3057\u307e\u3059\u3002</p>`+(evaluation.players||[]).map(player=>{
      const items=player.items||[];
      const rows=items.map(entry=>{const id=entry.anchor_kick_event_id||entry.anchor_event_id,exists=state.match.timeline.some(e=>e.event_id===id);const button=exists?`data-event="${esc(id)}"`:`data-match="${esc(state.match.match_id)}" data-match-ms="${esc(entry.match_ms??0)}"`;return `<li><button class="outline-button" ${button}>${clock(entry.match_ms)}</button> <b>${esc(labels[entry.polarity]||entry.polarity)}</b> ${esc(entry.reason||'')}</li>`;}).join('');
      return `<details><summary><b class="${esc(player.team||'')}">${esc(player.username)}</b> <span class="subtle">\u30d7\u30ec\u30fc\u5019\u88dc ${items.length}\u4ef6</span></summary>${rows?`<ul>${rows}</ul>`:'<p class="subtle">\u5224\u65ad\u6750\u6599\u306a\u3057</p>'}</details>`;
    }).join('');
  }
  function renderStats(){if(!state.match||stage2)return;renderPlayEvaluation();const group=$('#stats-group').value;const cols=group==='tools'?[['username','選手'],['analysis.weak_kicks','弱キック'],['analysis.medium_kicks','中キック'],['analysis.strong_kicks','強キック'],['analysis.unknown_kicks','強さ不明']]:group==='other'?[['consecutive_touches','連続タッチ'],['critical_candidates','クリティカル'],['dash_candidates','ダッシュ'],['turn_candidates','振り向き']].map((x,i)=>i===0?['username','選手']:x):baseColumns;
    const value=(p,k)=>k.startsWith('analysis.')?p.analysis?.[k.slice(9)]:p[k];if(!cols.some(c=>c[0]===state.sort))state.sort=cols[1][0];const selectedTeam=$('#stats-team').value;const rows=state.match.players.filter(p=>selectedTeam==='all'||p.team===selectedTeam).sort((a,b)=>{const av=value(a,state.sort),bv=value(b,state.sort);if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),'ja');return (state.descending?-delta:delta)||a.username.localeCompare(b.username,'ja')||a.participant_id.localeCompare(b.participant_id);});
    $('#stats-table thead').innerHTML='<tr>'+cols.map(([k,label])=>`<th class="${k==='username'?'':'num'}" ${state.sort===k?`aria-sort="${state.descending?'descending':'ascending'}"`:''}><button data-sort="${k}">${label}${state.sort===k?state.descending?' ↓':' ↑':''}</button></th>`).join('')+'</tr>';
    $('#stats-table tbody').innerHTML=rows.map(p=>'<tr>'+cols.map(([k])=>k==='username'?`<td><div class="player-cell">${avatar(p)}<div><span class="${esc(p.team)}">${esc(p.username)}</span><small class="${p.team}">${team(p.team)}</small></div></div></td>`:`<td class="num">${k==='analysis.pass_success_rate'?(value(p,k)==null?'—':Math.round(value(p,k)*100)+'% ('+fmt(p.analysis.pass_successes)+'/'+fmt(p.analysis.pass_attempts)+')'):fmt(value(p,k))}</td>`).join('')+'</tr>').join('');
  }
  function renderPlayerHistory(){
    if(!playerHistoryReady){
      $('#player-count').textContent='読み込み中';
      $('#player-list').innerHTML='<p class="empty">選手データを読み込み中です。</p>';
      loadPlayerHistory().then(()=>{if(state.view==='players')renderPlayerHistory();}).catch(()=>{if(state.view==='players'){$('#player-count').textContent='';$('#player-list').innerHTML='<p class="empty">選手データを読み込めません。</p>';}});
      return;
    }
    const query=$('#player-history-search').value.trim().toLocaleLowerCase('ja');
    if(profileData&&profileData.status!=='computed'){
      $('#player-count').textContent='\u672a\u7b97\u51fa';
      $('#player-list').innerHTML='<p class="empty">\u5de5\u7a0b4\u306e\u9078\u624b\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u306f\u672a\u7b97\u51fa\u3067\u3059\u3002</p>';
      renderPlayerProfile(null);return;
    }
    const rows=playerHistory.filter(player=>player.username.toLocaleLowerCase('ja').includes(query));
    if(!rows.some(player=>player.id===state.profileId))state.profileId=rows[0]?.id||null;
    $('#player-count').textContent=rows.length+'\u4eba';
    $('#player-list').innerHTML=rows.map(player=>`<button class="directory-player ${player.id===state.profileId?'selected':''}" data-profile="${esc(player.id)}" aria-pressed="${player.id===state.profileId}">${avatar(player.appearances[0]?.player||{username:player.username,team:player.team})}<span><strong>${esc(player.username)}</strong><small>\u76f4\u8fd1 ${player.matches} \u8a66\u5408</small></span><span aria-hidden="true">\u203a</span></button>`).join('')||`<p class="empty">${profileData?'\u5de5\u7a0b4\u306f\u7b97\u51fa\u6e08\u307f\u3067\u3059\u304c\u3001\u5bfe\u8c61\u9078\u624b\u306f\u3044\u307e\u305b\u3093\u3002':'\u8a72\u5f53\u3059\u308b\u9078\u624b\u304c\u3044\u307e\u305b\u3093\u3002'}</p>`;
    renderPlayerProfile(rows.find(player=>player.id===state.profileId)||null);
  }
  function renderMetricsV2(player){
    const profile=player?.profile||{},payload=profile.metrics_v2||profile.metrics||player?.metrics_v2;
    if(!payload||typeof payload!=='object')return '';
    const pairPayload=profile.pair_metrics_v2||player?.pair_metrics_v2||{};
    const cohorts=Array.isArray(payload.cohorts)?payload.cohorts.filter(cohort=>cohort&&typeof cohort==='object'):[payload];
    const labels={
      presence_time:'\u51fa\u5834\u78ba\u8a8d\u6642\u9593',valid_position_coverage:'\u6709\u52b9\u4f4d\u7f6e\u89b3\u6e2c\u7387',candidate_control_time:'\u652f\u914d\u5019\u88dc\u6642\u9593',opponent_control_exposure:'\u76f8\u624b\u652f\u914d\u4e2d\u306e\u51fa\u5834\u6642\u9593',
      nearest_known_opponent_distance_blocks:'\u65e2\u77e5\u76f8\u624b\u3068\u306e\u6700\u8fd1\u63a5\u8ddd\u96e2',nearest_opponent_distance_full_roster_blocks:'\u5168\u76f8\u624b\u3092\u89b3\u6e2c\u3067\u304d\u305f\u6642\u306e\u6700\u8fd1\u63a5\u8ddd\u96e2',opponent_pair_closing_speed_blocks_per_second:'\u76f8\u624b\u3068\u306e\u8ddd\u96e2\u5909\u5316\u901f\u5ea6',
      spatial_interval_coverage_time:'\u7a7a\u9593\u533a\u9593\u306e\u89b3\u6e2c\u5145\u8db3\u7387',own_team_control_candidate_time:'\u5473\u65b9\u652f\u914d\u5019\u88dc\u6642\u9593',opponent_team_control_candidate_time:'\u76f8\u624b\u652f\u914d\u5019\u88dc\u6642\u9593',contested_time:'\u7af6\u308a\u5408\u3044\u5019\u88dc\u6642\u9593',explicit_unknown_control_time:'\u652f\u914d\u4e0d\u660e\u533a\u9593',unclassified_control_time:'\u30c1\u30fc\u30e0\u4e0d\u660e\u306e\u652f\u914d\u5019\u88dc',unrepresented_spatial_interval_time:'\u533a\u9593\u672a\u8868\u73fe\u6642\u9593',overlap_conflict_spatial_time:'\u533a\u9593\u91cd\u306a\u308a\u7af6\u5408\u6642\u9593',individual_control_candidate_time:'\u500b\u4eba\u652f\u914d\u5019\u88dc\u6642\u9593',
      teammate_next_kick_share:'\u5473\u65b9\u3078\u306e\u63a5\u7d9a\u5019\u88dc\u5272\u5408',connection_forward_progress:'\u5473\u65b9\u63a5\u7d9a\u6642\u306e\u5e73\u5747\u524d\u9032\u91cf',connection_goal_distance_reduction:'味方接続時のゴール距離の平均減少量',progressive_connection_candidates:'\u524d\u9032\u63a5\u7d9a\u5019\u88dc\u6570',notified_goals:'\u901a\u77e5\u5f97\u70b9\u6570',
      observed_tool_kicks:'\u88c5\u5099\u89b3\u6e2c\u6e08\u307f\u306e\u30ad\u30c3\u30af',tool_share_minecraft_stick:'\u89b3\u6e2c\u30c4\u30fc\u30eb\u4e2d\u306e\u30b9\u30c6\u30a3\u30c3\u30af\u5272\u5408',tool_share_minecraft_bone:'\u89b3\u6e2c\u30c4\u30fc\u30eb\u4e2d\u306e\u9aa8\u5272\u5408',tool_share_minecraft_blaze_rod:'\u89b3\u6e2c\u30c4\u30fc\u30eb\u4e2d\u306e\u30d6\u30ec\u30a4\u30ba\u30ed\u30c3\u30c9\u5272\u5408',dash_candidates:'\u30c0\u30c3\u30b7\u30e5\u5019\u88dc',turn_candidates:'\u30bf\u30fc\u30f3\u5019\u88dc',critical_candidates:'\u30af\u30ea\u30c6\u30a3\u30ab\u30eb\u5019\u88dc',sprint_knockback_candidates:'\u30b9\u30d7\u30ea\u30f3\u30c8\u30ce\u30c3\u30af\u30d0\u30c3\u30af\u5019\u88dc',estimated_speed_band_weak:'\u5f31\u30b9\u30d4\u30fc\u30c9\u5e2f\u306e\u63a8\u5b9a',estimated_speed_band_medium:'\u4e2d\u30b9\u30d4\u30fc\u30c9\u5e2f\u306e\u63a8\u5b9a',estimated_speed_band_strong:'\u5f37\u30b9\u30d4\u30fc\u30c9\u5e2f\u306e\u63a8\u5b9a',
      shot_candidates:'\u30b7\u30e5\u30fc\u30c8\u5019\u88dc\u6570',shot_goal_distance:'シュート候補の平均ゴール距離',shot_direction_angle:'シュート候補の平均打球方向角',shot_attack_fragment_involvement:'シュート・決定機を含む攻撃断片への関与候補',shot_candidate_conversion:'\u30b7\u30e5\u30fc\u30c8\u5019\u88dc\u306e\u5f97\u70b9\u5019\u88dc\u5272\u5408',chance_creation_candidates:'\u30c1\u30e3\u30f3\u30b9\u5275\u51fa\u5019\u88dc\u6570',big_chance_candidates:'\u5927\u30c1\u30e3\u30f3\u30b9\u5019\u88dc\u6570',
      key_pass_candidates:'\u30ad\u30fc\u30d1\u30b9\u5019\u88dc\u6570',assist_candidates:'\u30a2\u30b7\u30b9\u30c8\u5019\u88dc\u6570',dribble_success_candidates:'\u30c9\u30ea\u30d6\u30eb\u6210\u529f\u5019\u88dc\u6570',recovery_candidates:'\u596a\u53d6\u5019\u88dc\u6570',body_block_candidates:'\u30dc\u30c7\u30a3\u30d6\u30ed\u30c3\u30af\u5019\u88dc\u6570',recovery_activity_per_10min:'\u76f8\u624b\u652f\u914d\u5019\u88dc10\u5206\u5f53\u305f\u308a\u596a\u53d6\u6d3b\u52d5'
    };
    const styleKeys=['style','tool_share','tool_usage','kick_share','kick_strength','shot_selection','activity_position','heatmap','dominant_zone','kick_tool'];
    const number=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
    const showNumber=value=>{const n=number(value);if(n===null)return '\u672a\u7b97\u51fa';return Number.isInteger(n)?fmt(n):fmt(Number(n.toFixed(2)));};
    const kindFor=(id,metric)=>{
      const kind=String(metric.category||metric.metric_group||metric.metric_class||metric.presentation_group||metric.classification||metric.kind||'').toLowerCase();
      if(['context','observation','quality'].includes(kind))return '\u89b3\u6e2c\u30fb\u30b3\u30f3\u30c6\u30ad\u30b9\u30c8';
      if(['style','play_style'].includes(kind)||styleKeys.some(key=>id.toLowerCase().includes(key)))return '\u30d7\u30ec\u30fc\u30b9\u30bf\u30a4\u30eb';
      return '\u30d1\u30d5\u30a9\u30fc\u30de\u30f3\u30b9';
    };
    const showValue=(value,measure,unit)=>{
      const n=number(value);if(n===null)return '\u672a\u7b97\u51fa';
      const mode=String(measure||'').toLowerCase(),u=String(unit||'').toLowerCase();
      if(['proportion','ratio','share','percentage','percent'].includes(mode)||['ratio','fraction','percent','percentage','%'].includes(u))return `${showNumber(u==='percent'||u==='percentage'||u==='%'?n:n*100)}%`;
      if(u==='ms'||mode==='duration')return `${showNumber(n/60000)} \u5206`;
      if(u==='events_per_10min'||mode==='events_per_10min')return `${showNumber(n)} \u56de / 10\u5206`;
      const unitLabel={blocks:'\u30de\u30b9',degrees:'度',blocks_per_second:'\u30de\u30b9/\u79d2',events:'\u56de',attacks:'\u653b\u6483'}[u]||String(unit||'').replaceAll('_',' ');
      return `${showNumber(n)}${unitLabel?` ${unitLabel}`:''}`;
    };
    const renderMetric=([id,metric])=>{
      const pooled=metric.pooled&&typeof metric.pooled==='object'?metric.pooled:{};
      const quality=metric.quality&&typeof metric.quality==='object'?metric.quality:{};
      const score=metric.score&&typeof metric.score==='object'?metric.score:{};
      const label=metric.label||metric.display_name||metric.title||labels[id]||id;
      const measure=pooled.measure||metric.measure||metric.registry?.measure,unit=pooled.unit||metric.unit||metric.registry?.unit;
      const numerator=pooled.numerator??metric.numerator,denominator=pooled.denominator??metric.denominator;
      let value=pooled.value??pooled.rate??pooled.mean??pooled.pooled_value??metric.value??metric.raw_value;
      if(value==null&&['proportion','ratio','share'].includes(String(measure||'').toLowerCase())&&number(numerator)!==null&&number(denominator)>0)value=Number(numerator)/Number(denominator);
      const rawLine=numerator!=null||denominator!=null?`${metric.numerator_label||'\u5206\u5b50'} ${showNumber(numerator)} / ${metric.denominator_label||'\u5206\u6bcd'} ${showNumber(denominator)}`:'';
      const exposureMs=quality.observable_ms??pooled.observable_ms;
      const exposureUnit=metric.exposure_unit||metric.registry?.exposure_unit||'';
      const exposureLabel=exposureUnit==='samples'?'\u89b3\u6e2c\u6a19\u672c':exposureUnit==='connections'?'\u63a5\u7d9a\u6a5f\u4f1a':exposureUnit==='ms'?'\u5bfe\u8c61\u6642\u9593':'\u5bfe\u8c61\u6a5f\u4f1a';
      const exposure=number(exposureMs)!==null?`\u89b3\u6e2c\u53ef\u80fd\u6642\u9593 ${showNumber(Number(exposureMs)/60000)}\u5206`:number(pooled.exposure)!==null?`${exposureLabel} ${showNumber(pooled.exposure)}${exposureUnit==='ms'?'ms':''}`:'';
      const samples=metric.matches_with_value??pooled.matches??0,availableMatches=metric.matches_available??0;
      const effectiveMatches=score.effective_matches;
      const unknown=pooled.unknown_opportunities;
      const candidate=metric.candidate_only===true;
      const isUnknown=value==null;
      const qualityText=isUnknown?'\u672a\u7b97\u51fa':quality.complete===false||Number(quality.partial_or_unknown_matches)>0?'\u4e00\u90e8\u89b3\u6e2c':'';
      const scoreStatus=String(score.score_status||'').toLowerCase(),scoreValue=number(score.value);
      const scoreHtml=scoreValue!==null&&['provisional','usable'].includes(scoreStatus)?`<div class="metrics-v2-score"><span>\u6bd4\u8f03\u30b9\u30b3\u30a2</span><strong>${showNumber(scoreValue)}</strong><b class="metrics-v2-status ${scoreStatus}">${scoreStatus==='usable'?'\u6bd4\u8f03\u53ef\u80fd':'\u53c2\u8003\u5024'}</b></div>`:'';
      const reasonLabels={reference_cohort_insufficient:'\u6bd4\u8f03\u53c2\u7167\u7fa4\u306e\u8a66\u5408\u30fb\u9078\u624b\u30fb\u30bb\u30c3\u30b7\u30e7\u30f3\u6570\u4e0d\u8db3',insufficient_sample:'\u5bfe\u8c61\u8a66\u5408\u6570\u4e0d\u8db3',minimum_total_denominator:'\u7d2f\u8a08\u6a5f\u4f1a\u6570\u4e0d\u8db3',minimum_total_exposure:'\u89b3\u6e2c\u6642\u9593\u4e0d\u8db3',reference_distribution_degenerate:'\u6bd4\u8f03\u53c2\u7167\u5024\u306b\u5dee\u304c\u306a\u3044',decision_coverage_unavailable:'\u5224\u5b9a\u7bc4\u56f2\u306e\u5145\u8db3\u7387\u304c\u4e0d\u660e'};
      const scoreUnavailable=metric.score_enabled===true&&scoreStatus==='not_computed'?`<p class="metrics-v2-meta">\u6bd4\u8f03\u30b9\u30b3\u30a2\u672a\u7b97\u51fa: ${esc(reasonLabels[score.reason]||score.reason||'\u5224\u5b9a\u6761\u4ef6\u4e0d\u8db3')}${score.reference_matches!=null?` (\u53c2\u7167 ${showNumber(score.reference_matches)} \u8a66\u5408 / ${showNumber(score.reference_players)} \u9078\u624b / ${showNumber(score.reference_sessions)} \u30bb\u30c3\u30b7\u30e7\u30f3)`:''}</p>`:'';
      const reasonCounts=quality.reason_counts&&typeof quality.reason_counts==='object'?Object.entries(quality.reason_counts).filter(([,count])=>Number(count)>0).map(([reason,count])=>`${reason} ${showNumber(count)}`).join(', '):'';
      const matchDelta=score.leave_one_match_out_delta,sessionDelta=score.leave_one_session_out_delta;
      const distribution=metric.match_distribution||{},median=distribution.median??distribution.q50;
      const meta=[`\u5024\u3042\u308a ${showNumber(samples)} / \u96c6\u8a08\u5bfe\u8c61 ${showNumber(availableMatches)} \u8a66\u5408`,effectiveMatches!=null?`\u6709\u52b9 ${showNumber(effectiveMatches)} \u8a66\u5408\u76f8\u5f53`:'',exposure,unknown!=null?`\u5224\u5b9a\u4e0d\u80fd ${showNumber(unknown)} \u6a5f\u4f1a`:'',reasonCounts?`\u7406\u7531 ${reasonCounts}`:'',matchDelta!=null?`1\u8a66\u5408\u9664\u5916\u6642\u306e\u6700\u5927\u5909\u52d5 ${showNumber(matchDelta)}`:'',sessionDelta!=null?`1\u30bb\u30c3\u30b7\u30e7\u30f3\u9664\u5916\u6642\u306e\u6700\u5927\u5909\u52d5 ${showNumber(sessionDelta)}`:'',median!=null?`\u8a66\u5408\u5225\u4e2d\u592e\u5024 ${showValue(median,measure,unit)}`:''].filter(Boolean).join(' \u00b7 ');
      const eventLinks=(metric.match_values||[]).flatMap(match=>(match.representative_events||[]).filter(ref=>ref.event_id&&ref.match_ms!=null&&Number.isFinite(Number(ref.match_ms))).map(ref=>{const ms=Number(ref.match_ms),stamp=`${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}`;return `<button class="history-match metrics-v2-event" data-match="${esc(match.match_id)}" data-match-ms="${ms}" data-event-id="${esc(ref.event_id)}" title="${esc(ref.event_id)}">${esc(String(match.match_id||'').slice(0,8))} \u00b7 ${stamp}</button>`;})).slice(0,5).join(' ');
      return `<article class="metrics-v2-card"><div class="metrics-v2-heading"><div><span class="metrics-v2-kind">${kindFor(id,metric)}</span><h5>${esc(label)}</h5></div><strong class="metrics-v2-value ${isUnknown?'unknown':''}">${isUnknown?'\u2014':esc(showValue(value,measure,unit))}</strong></div>${rawLine?`<p class="metrics-v2-raw">${esc(rawLine)}</p>`:''}${scoreHtml}${scoreUnavailable}${eventLinks?`<div class="metrics-v2-evidence">${eventLinks}</div>`:''}${meta?`<p class="metrics-v2-meta">${esc(meta)}</p>`:''}${candidate?'<span class="metrics-v2-flag">\u5019\u88dc\u6307\u6a19</span>':''}${qualityText?`<span class="metrics-v2-flag ${isUnknown?'unknown':'warning'}">${qualityText}</span>`:''}</article>`;
    };
    const renderCohort=cohort=>{
      const metrics=cohort.metrics||cohort.indicators||(!Array.isArray(payload.cohorts)?payload.metrics||payload.indicators:{});
      const entries=Array.isArray(metrics)?metrics.filter(metric=>metric&&typeof metric==='object').map((metric,index)=>[String(metric.metric_id||metric.id||`metric_${index}`),metric]):Object.entries(metrics).filter(([,metric])=>metric&&typeof metric==='object');
      const performance=entries.filter(([id,metric])=>kindFor(id,metric)==='\u30d1\u30d5\u30a9\u30fc\u30de\u30f3\u30b9');
      const style=entries.filter(([id,metric])=>kindFor(id,metric)==='\u30d7\u30ec\u30fc\u30b9\u30bf\u30a4\u30eb');
      const context=entries.filter(([id,metric])=>kindFor(id,metric)==='\u89b3\u6e2c\u30fb\u30b3\u30f3\u30c6\u30ad\u30b9\u30c8');
      const group=(title,rows)=>rows.length?`<div class="metrics-v2-group"><h5>${title}</h5><div class="metrics-v2-grid">${rows.map(renderMetric).join('')}</div></div>`:'';
      const key=cohort.group_key||cohort.cohort||{},parts=Array.isArray(key)?key:[key.format,key.rules_group,key.court_group].filter(Boolean);
      let courtLabel=parts[2]||'';
      try{const court=typeof courtLabel==='string'?JSON.parse(courtLabel):courtLabel;if(court&&typeof court==='object')courtLabel=[court.court_id,[court.length_blocks??court.length_m,court.width_blocks??court.width_m].filter(value=>value!=null).join('\u00d7')].filter(Boolean).join(' ');}catch{}
      const rulesLabel=parts[1]&&parts[1]!=='unknown'?`\u30eb\u30fc\u30eb ${String(parts[1]).slice(0,8)}`:'';
      const scopeLabel=parts[4]==='undated'?'\u65e5\u6642\u4e0d\u660e\u306e\u8a66\u5408':parts[4]==='dated'?'\u65e5\u6642\u78ba\u8a8d\u6e08\u307f':'';
      const title=cohort.label||cohort.name||cohort.format||[parts[0],courtLabel,rulesLabel,scopeLabel].filter(Boolean).join(' \u00b7 ')||`\u6bd4\u8f03\u7fa4 ${cohort.index||''}`;
      const strata=cohort.condition_strata||{},conditionNames={regular_time:'通常時間',overtime:'延長',chance_time:'チャンスタイム',ended:'終了後',unknown:'不明',leading:'リード',tied:'同点',trailing:'ビハインド',stick:'棒',bone:'骨',blaze_rod:'ブレイズロッド','minecraft:stick':'棒','minecraft:bone':'骨','minecraft:blaze_rod':'ブレイズロッド'};
      const conditionRows=Object.entries(strata.metrics||{}).map(([id,metric])=>{const dimensions=Object.entries(metric.by_dimension||{}).map(([dimension,bins])=>{const items=Object.entries(bins||{}).map(([name,row])=>`${conditionNames[name]||name}: ${showNumber(row.value)}回${row.complete?'':'（一部観測）'}`).join(' / ');return items?`${({phase:'時間区分',score_state:'得点差',tool:'観測道具'})[dimension]||dimension}：${items}`:'';}).filter(Boolean).join('、');return dimensions?`<li>${esc(labels[id]||id)} — ${esc(dimensions)}</li>`:'';}).filter(Boolean).join('');
      const conditionHtml=conditionRows?`<details class="metrics-v2-uncomputed"><summary>時間・得点差・道具別の候補数</summary><p>同じイベントをそれぞれの条件で集計しています。出場時間は判定可能時間を意味しません。</p><ul>${conditionRows}</ul></details>`:'';
      const map=cohort.position_heatmap||{},mapAll=map.phases?.all||{},shares=mapAll.heatmap_share_bin||{},mapMax=Math.max(0,...Object.entries(shares).filter(([key])=>key!=='out_of_bounds').map(([,v])=>Number(v)||0));
      const mapCells=mapMax?Array.from({length:8},(_,y)=>Array.from({length:12},(_,x)=>{const share=Number(shares[`${x},${y}`])||0,alpha=Math.min(1,share/mapMax);return `<span style="background:rgba(99,205,127,${(0.12+0.78*alpha).toFixed(3)})" title="滞在割合 ${(share*100).toFixed(2)}%"></span>`;}).join('')).join(''):'';
      const mapHtml=mapCells?`<details class="metrics-v2-uncomputed"><summary>活動位置の時間分布</summary><p>左が自陣側、右が相手ゴール側。時間区間ごとの検証済みコート校正を使用。対応する位置を観測できた ${showNumber(mapAll.heatmap_ms/60000)} 分・${showNumber(map.matches_with_position)} 試合を集計。</p><div class="metrics-v2-heatmap">${mapCells}</div><p>場外 ${showNumber((Number(shares.out_of_bounds)||0)*100)}%</p></details>`:'';
      return `<div class="metrics-v2-cohort"><h5 class="metrics-v2-cohort-title">${esc(title)}</h5>${entries.length?`${group('\u89b3\u6e2c\u30fb\u30b3\u30f3\u30c6\u30ad\u30b9\u30c8',context)}${group('\u30d1\u30d5\u30a9\u30fc\u30de\u30f3\u30b9',performance)}${group('\u30d7\u30ec\u30fc\u30b9\u30bf\u30a4\u30eb',style)}`:'<p class="empty">\u3053\u306e\u6bd4\u8f03\u7fa4\u306e\u6307\u6a19\u306f\u672a\u7b97\u51fa\u3067\u3059\u3002</p>'}${conditionHtml}${mapHtml}</div>`;
    };
    const cohortHtml=cohorts.map(renderCohort).join('');
    const missing=Array.isArray(payload.not_computed)?payload.not_computed:[];
    const missingHtml=missing.length?`<details class="metrics-v2-uncomputed"><summary>\u672a\u7b97\u51fa\u306e\u6307\u6a19 (${missing.length})</summary><ul>${missing.map(item=>`<li>${esc(item.metric_id||item.id||'unknown')}: ${esc(item.reason||item.status||'not_computed')}</li>`).join('')}</ul></details>`:'';
    const pairRows=Array.isArray(pairPayload.pairs)?pairPayload.pairs:[];
    const pairHtml=pairRows.length?`<section class="profile-section metrics-v2-section"><h4>\u30da\u30a2\u306e\u5171\u6f14\u30fb\u9023\u4fc2\u5019\u88dc</h4><p class="subtle">\u51fa\u5834\u6839\u62e0\u306e\u91cd\u306a\u308a\u3068\u63a5\u7d9a\u5019\u88dc\u6570\u3092\u5206\u3051\u3066\u3044\u307e\u3059\u3002\u540c\u6642\u4f4d\u7f6e\u89b3\u6e2c\u306f\u63a5\u7d9a\u6a5f\u4f1a\u306e\u89b3\u6e2c\u53ef\u80fd\u6642\u9593\u3068\u306f\u3057\u3066\u3044\u307e\u305b\u3093\u3002</p><div class="metrics-v2-grid">${pairRows.map(pair=>{const minutes=number(pair.coappearance_ms),joint=number(pair.joint_position_observable_ms),connections=number(pair.connection_count),progress=number(pair.connection_forward_progress?.value);const name=pair.counterpart_username||pair.counterpart_uuid||'\u9078\u624b\u4e0d\u660e';return `<article class="metrics-v2-card"><div class="metrics-v2-heading"><div><span class="metrics-v2-kind">\u30da\u30a2</span><h5>${esc(name)}</h5></div><strong class="metrics-v2-value">${connections==null?'\u2014':showNumber(connections)} \u5019\u88dc</strong></div><p class="metrics-v2-meta">\u5171\u6f14 ${minutes==null?'\u672a\u89b3\u6e2c':`${showNumber(minutes/60000)}\u5206`} \u00b7 \u540c\u6642\u4f4d\u7f6e\u89b3\u6e2c ${joint==null?'\u672a\u89b3\u6e2c':`${showNumber(joint/60000)}\u5206`} \u00b7 \u5e73\u5747\u524d\u9032 ${progress==null?'\u672a\u7b97\u51fa':`${showNumber(progress)}\u30de\u30b9`} \u00b7 \u63a5\u7d9a\u983b\u5ea6 \u672a\u7b97\u51fa</p></article>`;}).join('')}</div></section>`:'';
    return `<section class="profile-section metrics-v2-section"><h4>選手の詳細指標（工程3）</h4><p class="subtle">人数形式・ルール・コートごとに、観測された通算値と試合別の分布を表示しています。候補や一部観測の値には注記を付けています。比較スコアは、判定機会の観測範囲と複数ボールの扱いを確認できるまで未算出です。</p>${cohortHtml||'<p class="empty">この選手の詳細指標は未算出です。</p>'}${missingHtml}</section>${pairHtml}`;
  }
  function renderArtifactPlayerProfile(player){
    const host=$('#player-profile-detail');
    if(!player){host.innerHTML=profileData?.status==='computed'?'<p class="empty">\u5de5\u7a0b4\u306f\u7b97\u51fa\u6e08\u307f\u3067\u3059\u304c\u3001\u8868\u793a\u3067\u304d\u308b\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u304c\u3042\u308a\u307e\u305b\u3093\u3002</p>':'<p class="empty">\u5de5\u7a0b4\u306e\u9078\u624b\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u306f\u672a\u7b97\u51fa\u3067\u3059\u3002</p>';return;}
    const profile=player.profile||{},labels={pass_success:'\u30d1\u30b9\u6210\u529f\u7387',same_team_next_touch:'\u540c\u30c1\u30fc\u30e0\u6b21\u63a5\u89e6\u7387',weak_kick_share:'\u5f31\u30ad\u30c3\u30af\u5272\u5408',medium_kick_share:'\u4e2d\u30ad\u30c3\u30af\u5272\u5408',strong_kick_share:'\u5f37\u30ad\u30c3\u30af\u5272\u5408',shot_candidate_per_kick:'\u30b7\u30e5\u30fc\u30c8\u5019\u88dc\u5272\u5408',possession_gain_candidate_per_kick:'\u596a\u53d6\u5019\u88dc\u5272\u5408',possession_loss_candidate_share:'\u88ab\u596a\u53d6\u5019\u88dc\u5272\u5408',forced_foul_candidate_per_kick:'\u62bc\u3057\u4ed8\u3051\u5019\u88dc\u5272\u5408',breakthrough_candidate_share:'\u7a81\u7834\u5019\u88dc\u5272\u5408'};
    const source={...(profile.rates||{}),...(profile.indicators||{})},order=['pass_success','same_team_next_touch','weak_kick_share','medium_kick_share','strong_kick_share','shot_candidate_per_kick','possession_gain_candidate_per_kick','possession_loss_candidate_share','forced_foul_candidate_per_kick','breakthrough_candidate_share'];
    const ids=[...order.filter(id=>Object.hasOwn(source,id)),...Object.keys(source).filter(id=>!order.includes(id))];
    const indicators=ids.map(id=>{const raw=source[id],item=raw&&typeof raw==='object'?raw:{value:raw};return {id,...item,label:labels[id]||item.label||id};});
    const countLabels={pass_success:['味方につながった候補','判定可能なパス候補'],same_team_next_touch:['本人・味方への次キック','判定可能な次キック'],weak_kick_share:['弱キック候補','強度を判定できたキック'],medium_kick_share:['中キック候補','強度を判定できたキック'],strong_kick_share:['強キック候補','強度を判定できたキック'],shot_candidate_per_kick:['シュート候補','方向を判定できたキック'],possession_gain_candidate_per_kick:['奪取候補','キック候補'],possession_loss_candidate_share:['被奪取候補','判定可能な機会'],forced_foul_candidate_per_kick:['押し付け候補','キック候補'],breakthrough_candidate_share:['突破候補','判定可能な支配区間']};
    const pct=value=>value==null?'\u2014':`${Math.round(Number(value)*100)}%`,sampleCount=profile.matches_in_window??player.matches,available=profile.matches_available;
    const avatarPlayer=player.appearances[0]?.player||{username:player.username,team:player.team};
    const indicatorRows=indicators.map(item=>{const value=Number.isFinite(Number(item.value))&&item.value!==null?Number(item.value):null,width=value==null?0:Math.max(0,Math.min(100,value*100));const numerator=item.numerator,denominator=item.denominator,names=countLabels[item.id]||['分子','分母'];const evidence=numerator!=null||denominator!=null?`${names[0]} ${fmt(numerator)} / ${names[1]} ${fmt(denominator)}`:`対象 ${fmt(item.sample_matches??sampleCount)} 試合`;const status=item.status==='insufficient'?'標本が小さい':item.status==='unknown'||value==null?'算出できる機会なし':'算出済み';return `<div class="ability-row"><div class="ability-label"><strong>${esc(item.label)}</strong><span>${pct(value)}</span></div><div class="ability-track"><span style="width:${width}%"></span></div><small>${item.candidate_only?'候補指標 · ':''}${esc(evidence)} · ${status}</small></div>`;}).join('');
    const start=profile.window_start_utc?date({match_date:profile.window_start_utc}):'\u65e5\u6642\u4e0d\u660e',end=profile.window_end_utc?date({match_date:profile.window_end_utc}):'\u65e5\u6642\u4e0d\u660e';
    const warning=profile.small_sample||profile.status_confidence==='insufficient'||profile.sample_warning;
    host.innerHTML=`<div class="profile-header">${avatar(avatarPlayer)}<div><span class="eyebrow">PLAYER PROFILE</span><h3>${esc(player.username)}</h3><p class="subtle">\u76f4\u8fd1 ${fmt(sampleCount)} / ${fmt(available??sampleCount)} \u8a66\u5408 \xb7 ${esc(start)} \u301c ${esc(end)}</p></div></div><section class="profile-section"><h4>\u6307\u6a19\uff08\u5272\u5408\u4e2d\u5fc3\uff09</h4><p class="subtle">\u5272\u5408\u3068\u5206\u6bcd\u3092\u4e26\u3079\u3066\u8868\u793a\u3057\u307e\u3059\u3002\u5019\u88dc\u30a4\u30d9\u30f3\u30c8\u306f\u6210\u529f\u3092\u610f\u5473\u3057\u307e\u305b\u3093\u3002</p>${indicatorRows||'<p class="empty">\u8868\u793a\u3067\u304d\u308b\u5272\u5408\u6307\u6a19\u304c\u3042\u308a\u307e\u305b\u3093\u3002</p>'}</section><section class="profile-section"><h4>\u96c6\u8a08\u7bc4\u56f2</h4><p class="subtle">${esc(profile.sample_warning||'')} ${warning?'\u5c0f\u3055\u306a\u30b5\u30f3\u30d7\u30eb\u306e\u305f\u3081\u53c2\u8003\u5024\u3068\u3057\u3066\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002':'\u6307\u5b9a\u7bc4\u56f2\u306e\u51fa\u5834\u8a18\u9332\u3092\u96c6\u8a08\u3057\u3066\u3044\u307e\u3059\u3002'}</p><p class="subtle">\u5bfe\u8c61\u8a66\u5408ID: ${esc((profile.window_match_ids||[]).join(', ')||'\u4e0d\u660e')}</p></section>`;
    const metricsV2Section=renderMetricsV2(player);
    if(metricsV2Section)host.insertAdjacentHTML('beforeend',metricsV2Section);
  }
  function renderPlayerProfile(player){
    if(profileData){renderArtifactPlayerProfile(player);return;}
    const host=$('#player-profile-detail');if(!player){host.innerHTML='<p class="empty">\u8868\u793a\u3067\u304d\u308b\u9078\u624b\u304c\u3044\u307e\u305b\u3093\u3002</p>';return;}
    const percent=value=>value==null?'\u2014':`${Math.round(value*100)}%`,perMatch=value=>(value/player.matches).toFixed(2);
    const measures=[['\u30d1\u30b9\u6210\u529f\u7387',player.passRate,percent(player.passRate),`${player.passSuccesses} / ${player.passAttempts}`],['\u30b7\u30e5\u30fc\u30c8\u5019\u88dc / \u8a66\u5408',player.shots/player.matches,perMatch(player.shots),`${player.shots} \u5019\u88dc`],['\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc / \u8a66\u5408',player.blocks/player.matches,perMatch(player.blocks),`${player.blocks} \u5019\u88dc`],['\u5f97\u70b9 / \u8a66\u5408',player.goals/player.matches,perMatch(player.goals),`${player.goals} \u70b9`]];
    host.innerHTML=`<div class="profile-header">${avatar(player.appearances[0]?.player||{username:player.username,team:player.team})}<div><span class="eyebrow">PLAYER PROFILE</span><h3>${esc(player.username)}</h3><p class="subtle">\u76f4\u8fd1 ${player.matches} \u8a66\u5408</p></div></div><section class="profile-section"><h4>\u6307\u6a19</h4>${measures.map(([label,value,shown,counts])=>`<div class="ability-row"><div class="ability-label"><strong>${label}</strong><span>${shown}</span></div><div class="ability-track"><span style="width:${value==null?0:Math.max(0,Math.min(100,value*100))}%"></span></div><small>${counts}</small></div>`).join('')}</section><p class="subtle">\u5de5\u7a0b4\u306e\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u306f\u307e\u3060\u8aad\u307f\u8fbc\u307e\u308c\u3066\u3044\u307e\u305b\u3093\u3002</p>`;
  }
  function renderLibrary(){const query=$('#match-search').value.toLowerCase();$('#match-library').innerHTML=matches.filter(m=>`${date(m)} ${m.players.map(p=>p.username).join(' ')}`.toLowerCase().includes(query)).map(m=>`<button class="archive-card" data-match="${esc(m.match_id)}"><span class="eyebrow">${esc(date(m))} · ${esc(m.format||'MATCH')}</span><div class="archive-score"><span class="red">${fmt(m.score?.red)}</span> <span class="subtle">—</span> <span class="blue">${fmt(m.score?.blue)}</span></div><div class="archive-roster">${m.players.map(avatar).join('')}</div></button>`).join('')||'<p class="empty">条件に合う試合がありません。</p>';}
  function move(t){setPlaying(false);state.time=Math.max(0,Math.min(state.match?.window.duration_ms||0,t));renderFrame();}
  if(stage2){$$('nav button[data-view="stats"],nav button[data-view="players"]').forEach(button=>button.hidden=true);$$('nav .nav-group-label').at(-1)?.setAttribute('hidden','');$('#view-stats').hidden=true;$('#view-players').hidden=true;$('#view-stats').setAttribute('aria-hidden','true');$('#view-players').setAttribute('aria-hidden','true');$('.match-heading h1').textContent='工程2：試合タイムライン';$('.data-notes summary').textContent='工程2のタイムライン・位置データについて';}
  $$('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#match-select').onchange=()=>selectMatch($('#match-select').value);$('#play').onclick=()=>{if(state.time>=state.match.window.duration_ms)state.time=0;setPlaying(!state.playing)};$('#stop').onclick=()=>setPlaying(false);$('#seek').oninput=()=>move(Number($('#seek').value));$('#seek').onkeydown=e=>{if(e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(state.time+(e.key==='ArrowRight'?1000:-1000));}};$('#rate').onchange=()=>state.rate=Number($('#rate').value);$('#back-second').onclick=()=>move(state.time-1000);$('#forward-second').onclick=()=>move(state.time+1000);$('#show-names').onchange=renderFrame;
  for(const [id,direction]of [['#prev',-1],['#next',1]])$(id).onclick=()=>{const events=state.match.timeline.filter(e=>direction<0?e.match_ms<state.time:e.match_ms>state.time).sort((a,b)=>a.match_ms-b.match_ms);const e=direction<0?events.at(-1):events[0];if(e)selectEvent(e);};
  $('#goto').onclick=()=>{const p=/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/.exec($('#time-input').value.trim());let t=p?Number(p[1])*60000+Number(p[2])*1000+Number((p[3]||'').padEnd(3,'0')):NaN;if(!p||Number(p[2])>=60||t>state.match.window.duration_ms){$('#time-error').textContent='試合内の時刻を 02:14.300 の形式で入力';return;}$('#time-error').textContent='';move(t);};
  $('#pitch').addEventListener('pointermove',event=>{const svg=$('#pitch'),ctm=svg.getScreenCTM(),tip=$('#player-tooltip');if(!ctm){tip.hidden=true;return}const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const at=point.matrixTransform(ctm.inverse());const nearest=state.visiblePlayers.map(p=>({...p,distance:Math.hypot(p.x-at.x,p.y-at.y)})).sort((a,b)=>a.distance-b.distance)[0];if(!nearest||nearest.distance>21){tip.hidden=true;return}tip.textContent=`${nearest.player.username} · ${team(nearest.player.team)} · ${nearest.positionLabel}`;const box=$('.pitch-shell').getBoundingClientRect();tip.style.left=`${Math.max(8,Math.min(box.width-190,event.clientX-box.left+14))}px`;tip.style.top=`${Math.max(8,event.clientY-box.top-38)}px`;tip.hidden=false;});
  $('#pitch').addEventListener('pointerleave',()=>{$('#player-tooltip').hidden=true;});
  $('#event-filter').onchange=()=>{state.filter=$('#event-filter').value;renderEvents();renderMarkers();renderFrame();};$('#player-filter').onchange=()=>{state.player=$('#player-filter').value;renderEvents();renderMarkers();renderFrame();};$('#stats-team').onchange=renderStats;$('#stats-group').onchange=renderStats;$('#match-search').oninput=renderLibrary;$('#player-history-search').oninput=renderPlayerHistory;
  document.addEventListener('click',event=>{const button=event.target.closest('[data-event],[data-sort],[data-match],[data-player],[data-profile]');if(!button)return;if(button.dataset.profile){state.profileId=button.dataset.profile;renderPlayerHistory();}else if(button.dataset.player){state.player=state.player===button.dataset.player?'all':button.dataset.player;$('#player-filter').value=state.player;renderEvents();renderMarkers();renderFrame();}else if(button.dataset.event){const e=state.match.timeline.find(e=>e.event_id===button.dataset.event);if(e)selectEvent(e);}else if(button.dataset.sort){state.descending=state.sort===button.dataset.sort?!state.descending:button.dataset.sort!=='username';state.sort=button.dataset.sort;renderStats();}else if(button.dataset.match){const matchId=button.dataset.match,matchMs=Number(button.dataset.matchMs),eventId=button.dataset.eventId;selectMatch(matchId).then(()=>{if(state.match?.match_id!==matchId)return;const target=eventId?state.match.timeline?.find(row=>row.event_id===eventId):null;if(target)selectEvent(target);else if(Number.isFinite(matchMs))move(matchMs);});showView('replay');window.scrollTo({top:0,behavior:'smooth'});}});
  document.addEventListener('keydown',e=>{if(e.target.matches('[data-player]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}if(state.match&&state.view==='replay'&&['ArrowLeft','ArrowRight'].includes(e.key)&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();move(state.time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1000:100));return;}if(state.match&&e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(state.time>=state.match.window.duration_ms)state.time=0;setPlaying(!state.playing);}});document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){failedHeads.add(event.target.getAttribute('src'));event.target.hidden=true;}},true);
  for(const id of ['show-best-kick','show-trail','show-kick-effects','show-goal-effects','show-pass','show-recovery','show-shot','show-big-chance','show-chance-creation','show-dribble','show-assist','show-key-pass','show-progressive-pass','show-interception','show-territory','show-feed']){const input=$('#'+id);if(input)input.onchange=renderFrame;}
  $('#focus-mode').onclick=()=>{const active=$('#view-replay').classList.toggle('focused');$('#focus-mode').setAttribute('aria-pressed',String(active));$('#focus-mode').textContent=active?'一覧も表示':'コートを広く';};
  let last=null;function frame(now){if(state.playing){if(last!==null)state.time=Math.min(state.match.window.duration_ms,state.time+(now-last)*state.rate);renderFrame();if(state.time>=state.match.window.duration_ms)setPlaying(false);}last=state.playing?now:null;requestAnimationFrame(frame);}
  $('#match-select').innerHTML=matches.map(m=>`<option value="${esc(m.match_id)}">${esc(date(m))} · ${fmt(m.score?.red)}–${fmt(m.score?.blue)}</option>`).join('');renderLibrary();if(matches.length)selectMatch(matches[0].match_id);else{$('#load-status').textContent='試合データがありません';$('#play').disabled=true;}requestAnimationFrame(frame);
})();
