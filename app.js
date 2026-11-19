(() => {
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const stage=Number(window.PR11_SITE_STAGE||3), stage2=stage===2;
  const matches=[...(window.PR11_SITE_DATA||[])].sort((a,b)=>String(b.match_date||'').localeCompare(String(a.match_date||'')));
  let profileData=window.PR11_PROFILE_DATA||null;
  const artifactProfileCache=new Map();
  let playerStatistics=window.PR11_PLAYER_STATISTICS||null;
  let playerStatisticsPromise=null;
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
  function passRating(stats){const mean=stats?.score_mean,count=stats?.evaluated_passes;if(!Number.isFinite(mean)||!Number.isFinite(count)||count<=0)return null;const raw=Math.max(3,Math.min(10,6+mean/4));return raw>6?6+(raw-6)*Math.min(1,Math.sqrt(count/5)):raw;}
  function clock(ms,detail=true){ms=Math.max(0,Math.floor(ms||0));return `${String(Math.floor(ms/60000)).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}${detail?'.'+String(ms%1000).padStart(3,'0'):''}`;}
  const team=t=>t==='red'?'赤チーム':t==='blue'?'青チーム':'チーム不明';
  const outTeam=e=>e.type==='foul'?(e.details?.raw?.last_kick_team||null):e.type==='foul_candidate'?e.team:null;
  const displayTeam=e=>['foul','foul_candidate'].includes(e.type)?e.penalty_target:e.team;
  const type=t=>({kick:'\u30ad\u30c3\u30af\u5019\u88dc',goal:'\u5f97\u70b9',body_block:'\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc',foul:'\u30d5\u30a1\u30a6\u30eb',foul_candidate:'\u30d5\u30a1\u30a6\u30eb',foul_notification:'\u30d5\u30a1\u30a6\u30eb\u901a\u77e5\uff08\u5bfe\u8c61\u672a\u78ba\u5b9a\uff09',forced_foul:'\u30d5\u30a1\u30a6\u30eb\u62bc\u3057\u4ed8\u3051\u5019\u88dc',ball_recovery:'\u30dc\u30fc\u30eb\u596a\u53d6\u5019\u88dc',possession_loss_candidate:'\u30dc\u30fc\u30eb\u88ab\u596a\u53d6\u5019\u88dc',breakthrough_candidate:'\u7a81\u7834\u5019\u88dc',goal_link_candidate:'\u5f97\u70b9\u3068\u306e\u95a2\u9023\u5019\u88dc',goal_outcome:'\u5f97\u70b9\u7d50\u679c',phase_change:'\u8a66\u5408\u30d5\u30a7\u30fc\u30ba',match_start:'\u8a66\u5408\u958b\u59cb',match_end:'\u8a66\u5408\u7d42\u4e86'}[t]||'\u30a4\u30d9\u30f3\u30c8');
  const symbol=t=>t==='goal'?'\u2605':t==='body_block'?'\u25c7':t==='kick'?'\u2197':t==='ball_recovery'?'\u21ba':t==='possession_loss_candidate'?'\u21c6':t==='breakthrough_candidate'?'\u2197':t==='forced_foul'?'!':'\xb7';
  const KICK_ATTRIBUTE_LABELS={pass_success:'パス成功',pass_failure:'パス失敗',key_pass_candidate:'キーパス',progressive_pass_candidate:'前進パス',chance_creation_candidate:'チャンスメイク',assist_candidate:'アシスト',interception_candidate:'インターセプト',possession_gain_candidate:'奪取'};
  const kickAttributes=e=>{const attrs=Array.isArray(e?.details?.raw?.kick_attributes)?e.details.raw.kick_attributes:[];const intent=kickClassification(e);if(!intent||!['pass-intent.v6','pass-intent.v7','pass-intent.v8','pass-intent.v9','pass-intent.v10'].includes(state.match?.analysis?.pass_intent?.definition_version)||e.type!=='kick')return attrs;const pass=intent.classification==='pass_attempt',success=pass&&intent.outcome==='teammate_next_kick',failure=pass&&intent.outcome==='opponent_next_kick';const metric=state.match?.analysis?.pass_metrics?.passes?.find(p=>p.event_id===e.event_id);const keys=new Set(['pass_success','pass_failure','progressive_pass_candidate','key_pass_candidate','assist_candidate']);const filtered=attrs.filter(a=>!keys.has(a.type)||(success&&a.type!=='pass_success'&&a.type!=='pass_failure'&&(a.type!=='key_pass_candidate'||metric?.key_pass)));const next=(state.match?.timeline||[]).find(k=>k.event_id===intent.next_kick_event_id);if(success||failure)filtered.push({type:success?'pass_success':'pass_failure',actor_id:e.actor_id,effect_match_ms:next?.match_ms??Infinity});if(success&&metric?.key_pass&&!filtered.some(a=>a.type==='key_pass_candidate'))filtered.push({type:'key_pass_candidate',actor_id:e.actor_id,effect_match_ms:e.match_ms});return filtered;};
  const kickClassification=e=>(state.match?.analysis?.pass_intent?.kicks||[]).find(k=>k.event_id===e.event_id);
  const kickKind=e=>({pass_attempt:'\u30d1\u30b9',shot_attempt:'\u30b7\u30e5\u30fc\u30c8',self_carry_candidate:'\u30c9\u30ea\u30d6\u30eb',unknown:'\u5206\u985e\u4fdd\u7559'}[kickClassification(e)?.classification]||'\u5206\u985e\u672a\u7b97\u51fa');
  const kickLabel=e=>{const base=({weak:'弱キック',medium:'中キック',strong:'強キック'}[e.kick_strength]||'キック（強さ不明）');const attrs=[...new Set(kickAttributes(e).map(a=>KICK_ATTRIBUTE_LABELS[a.type]).filter(Boolean))];const intent=kickClassification(e);if(intent?.classification==='pass_attempt'&&!['teammate_next_kick','opponent_next_kick'].includes(intent.outcome))attrs.unshift('結果不明');return kickKind(e)+' / '+base+(attrs.length?'（'+attrs.join('・')+'）':'');};
  const EVENT_EXPLANATIONS={pass_failure:'同じボールの次の判明キックが相手だったパス候補です。途中の打者不明キックがドリブル候補なら、その後まで追跡します。',shot_candidate:'ゴール位置とボール位置から、シュートに該当すると判定したキックです。',big_chance_candidate:'シュート候補の位置と相手選手の配置から決定機と判定した候補です。',chance_creation_candidate:'決定機の直前にあった味方のパス、突破、またはドリブルをチャンスメイク候補として記録します。',key_pass_candidate:'シュートにつながったパス、または受け手に決定機候補を作った成功パスです。位置による判定は暫定です。',progressive_pass_candidate:'味方が次に触れた成功パス候補のうち、受け手側のキック位置が攻撃方向へ10m以上進んだものです。',pass_success:'同じボールを次に味方が蹴ったパス候補です。途中の打者不明キックがドリブル候補なら、その後のキックまで確認します。',assist_candidate:'得点に結びついたシュート候補の直前5秒以内にあった最後の味方キックです。',interception_candidate:'パスに近いキックの後、同じボールを相手チームが次に保持したと判定した奪取候補です。',possession_gain_candidate:'相手からボールの支配候補が移った場面です。キックが特定できない場合は位置関係の継続判定を使います。'};
  const eventExplanation=e=>{const types=e.type==='kick'?kickAttributes(e).map(a=>a.type):[e.type];return [...new Set(types.map(type=>EVENT_EXPLANATIONS[type]).filter(Boolean))].join(' ');};
  const eventLabel=e=>e.type==='kick'?kickLabel(e):({shot_candidate:'シュート候補',pass_success:'パス成功候補',progressive_pass_candidate:'前進パス候補',assist_candidate:'アシスト候補',key_pass_candidate:'キーパス候補',interception_candidate:'インターセプト候補',dribble_success_candidate:'ドリブル成功候補',big_chance_candidate:'決定機候補',chance_creation_candidate:'チャンスメイク候補'})[e.type]|| (e.type==='possession_gain_candidate'?'ボール奪取':e.type==='foul_notification'?'ファウル通知（対象未確定）':e.type==='foul_candidate'?(e.penalty_target?`${team(e.penalty_target)} ファウル候補`:'ファウル候補（処罰チーム未判定）'):e.type==='foul'?(e.penalty_target?`${team(e.penalty_target)} ファウル`:'ファウル（処罰チーム未判定）'):e.type==='forced_foul'?'ファウル押し付け候補':type(e.type));
  const eventLabelHtml=e=>['foul','foul_candidate'].includes(e.type)&&e.penalty_target?`<span class="${esc(e.penalty_target)}">${esc(team(e.penalty_target))}</span> ${e.type==='foul_candidate'?'ファウル候補':'ファウル'}`:esc(eventLabel(e));
  const eventSubLabel=e=>e.type==='foul_candidate'&&!e.details?.raw?.boundary?`攻撃速度低下：${team(e.penalty_target)}（候補）`:['foul','foul_candidate'].includes(e.type)?`アウト：${team(outTeam(e))}（推定） · 処罰：${team(e.penalty_target)}（推定）`:(e.actor||'選手不明');
  const item=x=>({'minecraft:stick':'棒','minecraft:bone':'骨','minecraft:blaze_rod':'ブレイズロッド'}[x]||x||'道具不明');
  const date=m=>{if(!m.match_date)return '日時不明';const d=new Date(m.match_date);return Number.isNaN(d.getTime())?'日時不明':d.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});};
  function buildPlayerHistory(matchRows){
    const players=new Map();let cohortAttempts=0,cohortSuccesses=0;
    for(const match of matchRows){for(const player of match.players||[]){const id=player.player_uuid||player.participant_id;if(!id)continue;const stats=player.analysis||{};let history=players.get(id);if(!history){history={id,username:player.username||id,team:player.team,appearances:[]};players.set(id,history);}history.appearances.push({match,player,stats});cohortAttempts+=Number(stats.pass_attempts)||0;cohortSuccesses+=Number(stats.pass_successes)||0;}}
    for(const history of players.values()){history.appearances.sort((a,b)=>String(b.match.match_date||'').localeCompare(String(a.match.match_date||''))||String(a.match.match_id).localeCompare(String(b.match.match_id)));history.appearances=history.appearances.slice(0,100);}
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
    const appearances=new Map(), roster=new Map(), aliases=new Map();
    for(const person of data.roster||[]){const id=person.player_uuid;if(!id)continue;roster.set(id,person);for(const source of person.source_uuids||[])aliases.set(source,id);}
    const profiles=new Map();for(const profile of data.profiles||[]){const id=profile.player_uuid||profile.uuid||profile.participant_id;if(id){profiles.set(id,profile);if(!roster.has(id))roster.set(id,profile);}}
    for(const match of matchRows)for(const player of match.players||[]){const source=player.player_uuid||player.participant_id,id=aliases.get(source)||source;if(!id)continue;if(!roster.has(id))roster.set(id,player);if(!appearances.has(id))appearances.set(id,[]);appearances.get(id).push({match,player});}
    return [...roster].map(([id,person])=>{
      const profile=profiles.get(id)||{};
      const available=appearances.get(id)||[];
      const rows=available.slice().sort((a,b)=>String(b.match.match_date||'').localeCompare(String(a.match.match_date||''))||String(a.match.match_id).localeCompare(String(b.match.match_id))).slice(0,100);
      return {id,username:rows[0]?.player.username||profile.username||person.username||id||'選手名不明',team:rows[0]?.player.team||profile.team||person.team,head_asset:person.head_asset,matches:rows.length,
        profile_url:profile.profile_url||null,profile:null,appearances:rows.map(row=>({...row,stats:row.player.analysis||{}}))};
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
    const analysis=detail.analysis||{}, metrics=analysis.pass_metrics;
    if(metrics?.definition_version==='pass-metrics.v2'){
      const byId=new Map((metrics.players||[]).map(p=>[p.participant_id,p]));
      for(const player of players){const m=byId.get(player.participant_id);if(m)player.analysis={...player.analysis,key_pass_candidates:m.key_passes};}
      for(const side of ['red','blue']){const group=players.filter(p=>p.team===side), values=group.map(p=>byId.get(p.participant_id)?.key_passes);if(analysis.teams?.[side]&&values.length)analysis.teams[side].key_pass_candidates=values.some(v=>v==null)?null:values.reduce((a,b)=>a+b,0);}
    }
    return {...summary,...detail,analysis,players};
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
  async function loadArtifactProfile(player){
    if(player.profile)return player.profile;
    if(!player.profile_url)throw Error('Profile file is unavailable');
    if(!artifactProfileCache.has(player.id))artifactProfileCache.set(player.id,fetch(player.profile_url).then(response=>{
      if(!response.ok)throw Error('HTTP '+response.status);
      return response.json();
    }));
    try{player.profile=await artifactProfileCache.get(player.id);}catch(error){artifactProfileCache.delete(player.id);throw error;}
    return player.profile;
  }
  async function loadArtifactMetrics(player){
    if(player.metrics)return player.metrics;
    if(!player.metrics_url)throw Error('Metrics file is unavailable');
    if(!artifactProfileCache.has(player.id+':metrics'))artifactProfileCache.set(player.id+':metrics',fetch(player.metrics_url).then(response=>{
      if(!response.ok)throw Error('HTTP '+response.status);
      return response.json();
    }));
    try{player.metrics=await artifactProfileCache.get(player.id+':metrics');}catch(error){artifactProfileCache.delete(player.id+':metrics');throw error;}
    return player.metrics;
  }
  function loadPlayerStatistics(){
    if(playerStatistics)return Promise.resolve(playerStatistics);
    if(!playerStatisticsPromise)playerStatisticsPromise=fetch('player-statistics.json').then(response=>{
      if(!response.ok)throw Error('HTTP '+response.status);
      return response.json();
    }).then(data=>{playerStatistics=data;return data;});
    return playerStatisticsPromise;
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
    if(match.analysis_status==='computed'){
      const red=teams.red||{},blue=teams.blue||{},control=(a.spatial_control||a.possession)?.teams||{};
      const rows=[['推定ポゼッション',control.red?.control_candidate_share??red.possession_candidate_share,control.blue?.control_candidate_share??blue.possession_candidate_share,true],['シュート候補',red.shot_attempt_candidates,blue.shot_attempt_candidates],['パス試行',red.pass_attempts,blue.pass_attempts],['パス成功',red.pass_successes,blue.pass_successes],['パス成功率',red.pass_success_rate,blue.pass_success_rate,true],['決定機候補',red.big_chance_candidates,blue.big_chance_candidates],['キーパス候補',red.key_pass_candidates,blue.key_pass_candidates],['体ブロック候補',red.body_block_candidates,blue.body_block_candidates],['ファウル記録',red.foul_events,blue.foul_events]];
      const display=(v,pct)=>Number.isFinite(v)?(pct?Math.round(v*100)+'%':fmt(v)):'—';
      $('#metrics').innerHTML=`<div class="comparison-heading"><b class="red">赤チーム</b><b class="blue">青チーム</b></div>`+rows.map(([label,left,right,pct])=>{const valid=Number.isFinite(left)&&Number.isFinite(right),sum=left+right,share=valid&&sum>0?100*left/sum:null;return `<div class="comparison-stat"><div class="comparison-values"><b>${display(left,pct)}</b><span>${label}</span><b>${display(right,pct)}</b></div><div class="comparison-bar" aria-hidden="true">${share==null?'':`<i style="width:${share}%"></i><i style="width:${100-share}%"></i>`}</div></div>`;}).join('')+'<p class="comparison-note">バーは各項目の両チームの値の比率です。ポゼッションは判定可能な支配時間内の推定割合です。</p>';
    }else $('#metrics').innerHTML=cards.map(([n,label,note,help])=>`<div class="metric" title="${esc(help||'')}"><strong>${fmt(n)}</strong><span>${label}</span><small>${note}</small></div>`).join('');renderPossessionState();
    $('#data-notes').innerHTML=`<p>対象：${clock(match.window.start_replay_ms)}–${clock(match.window.end_replay_ms)}（リプレイ内）。最終結果の出所：${esc(match.score?.source_label||'不明')}。</p><ul>${(match.limitations||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>画像：録画に記録されたスキン。利用できない場合は頭文字を表示します。</p>`;
    if(match.court?.confidence==='estimated'&&match.court.length_m>0&&match.court.width_m>0){const note=document.createElement('p');note.textContent=`\u8868\u793a\u7528\u306e\u8ddd\u96e2\u6982\u7b97\uff1a1\u30c1\u30fc\u30e0 ${match.teams?.red?.length||'?'}\u4eba\u3001\u7d04 ${match.court.length_m} \u00d7 ${match.court.width_m} \u30d6\u30ed\u30c3\u30af\u3002\u767d\u7dda\u3068\u30b4\u30fc\u30eb\u306e\u4f4d\u7f6e\u306f\u5019\u88dc\u3067\u3059\u3002`;$('#data-notes').append(note);}
    if(match.court?.boundary_model==='uncertain_white_line'){const note=document.createElement('p'),c=match.court.line_calibration||{},d=c.field_blocks_including_white_lines||{},status=c.status==='conditional_candidate'?'\u5bf8\u6cd5\u306f\u5019\u88dc':'\u5bf8\u6cd5\u672a\u6821\u6b63';note.textContent=`\u4e2d\u5fc3\uff1a\u8a66\u5408\u958b\u59cb\u6642\u306e\u30dc\u30fc\u30eb\u4f4d\u7f6e\u3002\u767d\u7dda\u3092\u542b\u3080\u30b3\u30fc\u30c8\u5bf8\u6cd5 ${d.x||'?'} \u00d7 ${d.z||'?'} \u30d6\u30ed\u30c3\u30af\uff08${status}\uff09\u3002\u767d\u7dda\u901a\u904e\u5f8c\u306e\u53cd\u767a\u3068\u5f97\u70b9\u5224\u5b9a\u306f\u4fdd\u7559\u3057\u307e\u3059\u3002`;$('#data-notes').append(note);}
    if(match.court?.line_positions){const note=document.createElement('p'),l=match.court.line_positions,fmt=a=>a?.coordinates?.length?a.coordinates.map(v=>a.units==='block_index'?String(v):Number(v).toFixed(1)).join(' / '):'\u4e0d\u660e',why=a=>a?.source==='glass_contact_candidate'?'\u30ac\u30e9\u30b9\u63a5\u89e6\u304b\u3089\u63a8\u5b9a':a?.source==='notification_boundary_candidates'?'\u901a\u77e5\u4ed8\u8fd1\u306e\u5019\u88dc':a?.source==='team_size_integer_safe_field'?'\u4eba\u6570\u5225\u306e\u6574\u6570\u5bf8\u6cd5\u5019\u88dc':'\u5019\u88dc\u60c5\u5831';note.textContent=`\u63a8\u5b9a\u767d\u7dda\u4f4d\u7f6e\uff1aX ${fmt(l.goal_line_x)}\uff08${why(l.goal_line_x)}\uff09\u3001Z ${fmt(l.touch_line_z)}\uff08${why(l.touch_line_z)}\uff09\u3002`;$('#data-notes').append(note);}
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
    if(calibrated){const s=Math.min(864/court.length_m,444/court.width_m),cx=court.center_xz[0],cz=court.center_xz[1];state.pitchScale=s;map=(x,z)=>{const [a,b]=rotate(x-cx,z-cz);return [480+a*s,270+b*s]};const w=court.length_m*s,h=court.width_m*s,stroke='#e4f3dfb3';state.pitchRect={x:480-w/2,y:270-h/2,width:w,height:h};node('rect',{x:480-w/2,y:270-h/2,width:w,height:h,fill:'none',stroke,'stroke-width':2});node('line',{x1:480,y1:270-h/2,x2:480,y2:270+h/2,stroke,'stroke-width':2});node('circle',{cx:480,cy:270,r:Math.min(w,h)*.13,fill:'none',stroke,'stroke-width':2});for(const side of [-1,1]){const edge=480+side*w/2,depth=Math.min(8*s,w*.16),boxHeight=Math.min(20*s,h*.55),postHeight=Math.min(7*s,h*.35),outer=edge+side*Math.min(3*s,35),goalTeam=court.goals?.[side<0?0:1]?.team||(side<0?'red':'blue');node('rect',{x:side<0?edge:edge-depth,y:270-boxHeight/2,width:depth,height:boxHeight,fill:'none',stroke,'stroke-width':2});node('path',{d:`M ${edge} ${270-postHeight/2} L ${outer} ${270-postHeight/2} L ${outer} ${270+postHeight/2} L ${edge} ${270+postHeight/2}`,fill:'none',stroke:goalTeam==='red'?'#ef827e':'#7cb8ec','stroke-width':3,'stroke-linejoin':'round'});}}
    else{const [a,b,c,d]=state.bounds,s=Math.min(840/Math.max(1,b-a),430/Math.max(1,d-c));state.pitchScale=s;map=(x,z)=>[480+(x-(a+b)/2)*s,270+(z-(c+d)/2)*s];}const pitchLabel=court.team_size?`${court.team_size}v${court.team_size}`:'PITCH';$('#map-status').textContent=calibrated?`${pitchLabel} PITCH - distance estimate ${court.length_m.toFixed(1)} x ${court.width_m.toFixed(1)}${court.confidence==='estimated'?' - START POSITION ESTIMATE':''}`:`${pitchLabel} MAP - TRACKING COORDINATES`;
    const defs=node('defs',{},svg),clip=node('clipPath',{id:'territory-field-clip',clipPathUnits:'userSpaceOnUse'},defs);node('rect',state.pitchRect,clip);
    state.map=map;state.dynamic=node('g',{'data-layer':'live'});
  }
  function recentEvents(t,windowMs){const events=state.match.timeline;let lo=0,hi=events.length;while(lo<hi){const mid=(lo+hi)>>1;if(events[mid].match_ms<=t)lo=mid+1;else hi=mid;}let first=lo;while(first>0&&events[first-1].match_ms>=t-windowMs)first--;return events.slice(first,lo);}
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
    shot_candidate:{toggle:null,label:'シュート',short:'シュート',icon:'S',color:'#ff834a',duration:1450,order:0},
    big_chance_candidate:{toggle:null,label:'決定機',short:'決定機',icon:'★',color:'#ffd66b',duration:2400,order:1},
    chance_creation_candidate:{toggle:'show-pass-detail',label:'チャンスメイク',short:'チャンスメイク',icon:'✦',color:'#d28cff',duration:1900,order:2},
    dribble_success_candidate:{toggle:'show-dribble',label:'ドリブル成功',short:'突破成功',icon:'↗',color:'#69e8cf',duration:1750,order:3},
    assist_candidate:{toggle:null,label:'アシスト',short:'アシスト',icon:'A',color:'#ff83bb',duration:2200,order:4},
    key_pass_candidate:{toggle:'show-pass-detail',label:'キーパス',short:'キーパス',icon:'K',color:'#83c9ff',duration:1900,order:5},
    progressive_pass_candidate:{toggle:'show-pass-detail',label:'前進パス',short:'前進パス',icon:'›',color:'#8ee0a8',duration:1750,order:6},
    pass_success:{toggle:'show-pass',label:'パス成功',short:'パス成功',icon:'✓',color:'#77e5c0',duration:1900,order:7},
    pass_failure:{toggle:'show-pass-failure',label:'パス失敗',short:'パス失敗',icon:'×',color:'#ff967b',duration:1900,order:7},
    interception_candidate:{toggle:null,label:'インターセプト',short:'カット',icon:'×',color:'#ff9b76',duration:1750,order:7},
  };
  function collectEventAnnotations(){
    const byPlayer=new Map();if(state.match.analysis_status!=='computed')return byPlayer;
    const actions=[];
    for(const source of state.match.timeline){
      if(source.match_ms>state.time)break;
      if(source.type!=='shot_candidate'&&EVENT_VISUAL_SPECS[source.type])actions.push(source);
      for(const attribute of kickAttributes(source)){
        const at=Number(attribute.effect_match_ms??source.match_ms);if(!Number.isFinite(at)||at>state.time)continue;
        actions.push({...source,event_id:attribute.event_id||`${source.event_id}:${attribute.type}`,type:attribute.type,
          actor_id:attribute.actor_id,actor:attribute.actor,team:attribute.team,match_ms:at,
          details:{raw:attribute.details||{}}});
      }
    }
    for(const event of actions){
      const originalSpec=EVENT_VISUAL_SPECS[event.type];if(!originalSpec||(originalSpec.toggle&&!checked(originalSpec.toggle))||!event.actor_id)continue;const spec=EVENT_VISUAL_SPECS[event.type];
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
  function renderPlayerEventVisuals(player,x,y,annotations,kick){
    if(kick){
      const kind=kickClassification(kick)?.classification;
      const styles={pass_attempt:{icon:'P',color:'#78d5ff'},shot_attempt:{icon:'S',color:'#ff8b51'},self_carry_candidate:{icon:'D',color:'#69e8cf'}};
      const style=styles[kind]||{icon:'?',color:'#bdbdbd'};
      annotations=[{type:'kick',event:kick,spec:{...style,label:kickKind(kick),short:kickKind(kick)},kickKind:kind||'unknown'},...annotations];
    }
    if(annotations.some(row=>row.type==='big_chance_candidate'))node('circle',{cx:x,cy:y,r:26,fill:'none',stroke:'#ffd66b','stroke-width':2.5,'stroke-dasharray':'3 4',opacity:reducedMotion.matches ? .82 : .62,'data-event-visual':'big_chance_candidate','pointer-events':'none'});
    if(annotations.some(row=>row.type==='dribble_success_candidate'))node('circle',{cx:x,cy:y,r:23,fill:'none',stroke:'#69e8cf','stroke-width':2,'stroke-dasharray':'2 5',opacity:.85,'data-event-visual':'dribble_success_candidate','pointer-events':'none'});
    if(annotations.some(row=>row.type==='chance_creation_candidate'))node('polygon',{points:`${x+22},${y-23} ${x+28},${y-17} ${x+22},${y-11} ${x+16},${y-17}`,fill:'#d28cff',stroke:'#fff','stroke-width':1,'data-event-visual':'chance_creation_candidate','pointer-events':'none'});
    annotations.forEach((row,index)=>{
      const {spec,event}=row,width=Math.max(46,Array.from(spec.short).length*10+22),column=Math.floor(index/4),bx=column===0?x+22:x-22-width,by=y-32+(index%4)*17;
      const badge=node('g',{'data-event-visual':row.type,...(row.kickKind?{'data-kick-kind':row.kickKind}:{}),'aria-label':`${spec.label}${row.type==='kick'?'':'\u5019\u88dc'} ${player.username}`,'pointer-events':'none'}),title=node('title',{},badge);
      title.textContent=`${spec.label}${row.type==='kick'?'':'\u5019\u88dc'} \u00b7 ${player.username} \u00b7 ${clock(event.match_ms,false)}`;
      node('rect',{x:bx,y:by,width,height:15,rx:7,fill:spec.color+'28',stroke:spec.color,'stroke-width':1},badge);
      text(bx+8,by+11,spec.icon,{'text-anchor':'middle','font-size':11,'font-weight':900,fill:spec.color,stroke:'#14251b','stroke-width':2,'paint-order':'stroke'},badge);
      text(bx+17,by+11,spec.short,{'font-size':10.5,'font-weight':800,fill:'#f7f5ed',stroke:'#14251b','stroke-width':2.5,'paint-order':'stroke'},badge);
    });
  }
  function drawShotFlame(position,x,y,parent){
    if(!checked('show-kick-effects')||state.match.analysis_status!=='computed'||position.position_source==='last_known')return;
    const ballId=position.ball_id;if(!ballId)return;let shot=null;
    for(const event of state.recentEvents)if(event.type==='kick'&&kickClassification(event)?.classification==='shot_attempt'&&event.details?.ball_id===ballId&&event.match_ms<=state.time&&state.time-event.match_ms<=1450)shot=event;
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
    const feed=state.recentEvents.filter(e=>e.type!=='shot_candidate'&&['kick','goal','body_block','foul','foul_candidate','foul_notification','forced_foul','ball_recovery','possession_gain_candidate','possession_loss_candidate','breakthrough_candidate','goal_link_candidate','goal_outcome','shot_candidate','pass_success','progressive_pass_candidate','key_pass_candidate','assist_candidate','big_chance_candidate','chance_creation_candidate','dribble_success_candidate','interception_candidate'].includes(e.type)).slice(-4),feedKey=feed.map(e=>e.event_id).join('|');
    if(state.feedKey!==feedKey){state.feedKey=feedKey;$('#pitch-feed').innerHTML=feed.flatMap(e=>{const foul=['foul','foul_candidate'].includes(e.type),shownTeam=displayTeam(e);if(foul){const pushed=e.details?.raw?.push_foul_success===true,playerId=pushed?`forced_foul:${e.event_id}`:e.event_id,player=e.actor?`<button data-event="${esc(playerId)}" class="feed-line ${esc(pushed?'forced_foul':e.type)}"><time>${clock(e.match_ms,false)}</time> <b class="${esc(e.team||'')}">${esc(e.actor)}</b> ${pushed?'ファウル押し付け成功':'ファウル'}</button>`:'';return [player,`<button data-event="${esc(e.event_id)}" class="feed-line ${esc(e.type)}"><time>${clock(e.match_ms,false)}</time> ${eventLabelHtml(e)}</button>`].filter(Boolean);}const label=e.type==='goal'?'ゴール！':esc(eventLabel(e)),person=e.actor||(shownTeam?team(shownTeam):'');return [`<button data-event="${esc(e.event_id)}" class="feed-line ${esc(e.type)}"><time>${clock(e.match_ms,false)}</time> <b class="${esc(shownTeam||playerByName(e.actor)?.team||'')}">${esc(person)}</b> ${label}</button>`];}).join('');}
    $('#pitch-feed').hidden=!checked('show-feed');$('#replay-feed-wrap').hidden=!checked('show-feed');
    const svg=$('#pitch');
    if(!state.loaded||!Number.isFinite(state.bounds?.[0])){drawingLayer=null;svg.replaceChildren();text(480,270,state.loaded?'この区間の位置データはありません':'追跡データを読み込んでいます',{'text-anchor':'middle',fill:'#a8bbaa','font-size':16});return;}
    if(!state.map)preparePitch();drawingLayer=state.dynamic;drawingLayer.replaceChildren();const map=state.map;
    const current=state.match.timeline.filter(e=>e.match_ms<=state.time).at(-1);
    $$('#event-list [data-event]').forEach(el=>{const active=el.dataset.event===(state.event||current)?.event_id;el.classList.toggle('selected',active);if(active)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');});
    for(const rows of state.tracks){if(!rows[0].ball_id)continue;let path=[],last=null;const flush=()=>{if(path.length>1)node('polyline',{points:path.join(' '),fill:'none',stroke:'#d2f58b70','stroke-width':2});path=[]};for(const r of rows){if(r.match_ms<state.time-1000||r.match_ms>state.time)continue;if(r.x==null||r.z==null||r.break_before||(last!==null&&r.match_ms-last>150)){flush();last=null;if(r.x==null||r.z==null)continue;}path.push(map(r.x,r.z).join(','));last=r.match_ms;}flush();}
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
    for(const p of playerPositions.values()){const [x,y]=map(p.x,p.z),player=state.playerMap.get(p.participant_id);if(!player)continue;visible++;const positionLabel=({observed:'観測位置',interpolated:'短い区間を補間',stationary_estimate:'同位置の観測間を保持',held_estimate:'直前の位置を短時間保持',last_known:'最終観測位置・現在位置は不明'})[p.position_source]||'位置不明';state.visiblePlayers.push({x,y,player,positionLabel});const recent=state.recentEvents.filter(e=>['kick','body_block','goal'].includes(e.type)&&state.time>=e.match_ms&&state.time-e.match_ms<=(e.type==='goal'?2200:800)&&(e.actor_id?e.actor_id===player.participant_id:e.actor&&e.actor===player.username)).sort((a,b)=>(b.type==='goal')-(a.type==='goal')||b.match_ms-a.match_ms)[0];const transition=state.match.analysis_status==='computed'?state.recentEvents.find(e=>recoveryRole(e,player.participant_id,state.time)):null;const pass=state.match.analysis_status==='computed'&&checked('show-pass')?state.recentEvents.find(e=>e.type==='kick'&&kickAttributes(e).some(a=>a.type==='pass_success'&&a.actor_id===player.participant_id&&state.time>=Number(a.effect_match_ms??e.match_ms)&&state.time-Number(a.effect_match_ms??e.match_ms)<=1600)):null;if(transition||pass){const lost=transition&&recoveryRole(transition,player.participant_id,state.time)==='loss';const labels=[];if(transition)labels.push({label:lost?'\u88ab\u596a\u53d6':'\u596a\u53d6',color:lost?'#ff6b6b':'#73ffcb'});if(pass)labels.push({label:'PASS',color:'#ffe16d'});labels.forEach((entry,index)=>{node('circle',{cx:x,cy:y,r:29+index*5,fill:'none',stroke:entry.color,'stroke-width':3,'stroke-dasharray':'5 3'});});} const g=node('g',{'aria-label':`${player.username} ${team(player.team)} ${positionLabel}`,tabindex:0,role:'button','data-player':player.username,'aria-pressed':String(state.player===player.username),opacity:1});const title=node('title',{},g);title.textContent=`${player.username} · ${team(player.team)} · ${positionLabel}`;const size=Math.max(.65,Math.min(1.1,state.pitchScale/10)),icon=node('g',{transform:`translate(${x} ${y}) scale(${size}) translate(${-x} ${-y})`},g);if(state.player===player.username)node('circle',{cx:x,cy:y,r:23,fill:'none',stroke:'#ffffff','stroke-width':1.5,'stroke-dasharray':'3 3'},icon);const effectEnabled=recent?.type==='kick'?checked('show-kick-effects'):recent?.type==='goal';if(recent&&effectEnabled){const goal=recent.type==='goal',kind=kickClassification(recent)?.classification,shot=kind==='shot_attempt',duration=goal?2200:800,phase=reducedMotion.matches?0:(state.time-recent.match_ms)/duration,color=goal?'#ffe08a':shot?'#ff8b51':kind==='self_carry_candidate'?'#69e8cf':kind==='pass_attempt'?'#78d5ff':'#bdbdbd';node('circle',{cx:x,cy:y,r:21+phase*(goal?13:7),fill:'none',stroke:color,'stroke-width':goal?4:3,'stroke-dasharray':kind==='pass_attempt'?'6 4':kind==='self_carry_candidate'?'2 4':'',opacity:Math.max(.2,1-phase)},icon);if(goal||shot){node('circle',{cx:x,cy:y,r:24,fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':goal?'3 4':'8 5',opacity:.9},icon);for(let i=0;i<(goal?8:4);i++){const angle=i*Math.PI*2/(goal?8:4),inner=27,outer=goal?34:31;node('line',{x1:x+Math.cos(angle)*inner,y1:y+Math.sin(angle)*inner,x2:x+Math.cos(angle)*outer,y2:y+Math.sin(angle)*outer,stroke:color,'stroke-width':2,'stroke-linecap':'round',opacity:Math.max(.3,1-phase)},icon);}}}node('circle',{cx:x,cy:y,r:18,fill:'#18271d',stroke:player.team==='red'?'#ef827e':'#7cb8ec','stroke-width':2.5},icon);svgHead(player,x,y,24,icon);if(true)text(x,y+28,player.username,{'text-anchor':'middle','font-size':13,fill:player.team==='red'?'#ff9c98':player.team==='blue'?'#91caff':'#ecf3e9',stroke:'#182c1d','stroke-width':4,'paint-order':'stroke','stroke-linejoin':'round'},g);const annotations=playerEventAnnotations.get(player.participant_id)||[],kick=recent?.type==='kick'&&effectEnabled?recent:null;if(annotations.length||kick)renderPlayerEventVisuals(player,x,y,annotations,kick);}
    if(ballPosition){const [x,y]=map(ballPosition.x,ballPosition.z),stale=ballPosition.position_source==='last_known',wide=ballPosition.position_source==='interpolated_wide';ballVisible=true;const ball=node('g',{'aria-label':stale?'ボールの最終観測位置':wide?'ボールの推定位置':'ボール',opacity:1});const title=node('title',{},ball);title.textContent=stale?'ボールの最終観測位置（現在位置は不明）':wide?'ボールの推定位置（250〜750msの間を補間）':'ボール';drawShotFlame(ballPosition,x,y,ball);node('circle',{cx:x,cy:y,r:10,fill:'#f9fbf7',stroke:'#1d2920','stroke-width':1.4},ball);node('polygon',{points:`${x},${y-5} ${x+5},${y-1} ${x+3},${y+5} ${x-3},${y+5} ${x-5},${y-1}`,fill:'#26312a'},ball);for(let a=0;a<5;a++){const angle=(a*72-90)*Math.PI/180;node('line',{x1:x+Math.cos(angle)*5,y1:y+Math.sin(angle)*5,x2:x+Math.cos(angle)*9,y2:y+Math.sin(angle)*9,stroke:'#26312a','stroke-width':1},ball);}}
    const goal=state.recentEvents.filter(e=>e.type==='goal'&&state.time>=e.match_ms&&state.time-e.match_ms<=2200).sort((a,b)=>b.match_ms-a.match_ms)[0];if(goal&&true){const label=node('g',{'aria-label':`得点 ${goal.actor||'得点者不明'}`});node('rect',{x:378,y:18,width:204,height:48,rx:8,fill:'#17261e',stroke:'#ffe08a','stroke-width':2},label);text(480,39,'GOAL',{'text-anchor':'middle','font-size':18,'font-weight':700,'letter-spacing':4,fill:'#ffe08a'},label);text(480,56,goal.actor||team(goal.team),{'text-anchor':'middle','font-size':12,fill:'#f5f6ed'},label);}
    $('#load-status').textContent=`${visible} / ${match.players.length} PLAYERS${!ballVisible?' · ボール位置記録なし':ballPosition.position_source==='last_known'?' · ボールは最終観測位置':ballPosition.position_source==='interpolated_wide'?' · ボール位置を補間中':''}`;
  }
  function filteredEvents(){
    return (state.match?.timeline||[]).filter(e=>{
      if(e.type==='shot_candidate')return false;
      const attrs=kickAttributes(e);
      const typeMatch=state.filter==='all'||e.type===state.filter
        ||(state.filter==='foul'&&['foul_candidate','foul_notification'].includes(e.type))
        ||(state.filter==='ball_recovery'&&e.type==='possession_gain_candidate')
        ||(state.filter==='kick'&&e.type==='kick')
        ||(e.type==='kick'&&kickClassification(e)?.classification===(state.filter==='classification_unknown'?'unknown':state.filter))
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
  const PASS_EVALUATION_VERSION='pass-evaluation.v2';
  const hasLaunchEvaluation=version=>/^pass-launch-evaluation\.v1(?:\.[1-8])?$/.test(version||'');
  const hasPassEvaluation=version=>version===PASS_EVALUATION_VERSION||hasLaunchEvaluation(version);
  const passScoreText=value=>Number.isFinite(value)?(value>=0?'+':'')+value.toFixed(2):'—';
  const passExecutionText=value=>Number.isFinite(value)?value.toFixed(1)+' / 10':'—';
  const launchScoreText=value=>Number.isFinite(value)?value.toFixed(1)+' / 100':'—';
  function renderLaunchEvaluation(pass){
    if(!pass)return '';
    const title='<h4>パス選択の評価</h4>';
    const reasons={unknown_passer:'出し手またはチームが不明',missing_start:'キックの記録が不足',
      missing_goals:'コートの攻撃方向が不明',actor_requires_outcome:'打者の推定にその後の結果が必要',
      missing_launch_velocity:'初速・方向の記録が不足',missing_prelaunch_ball:'打球前のボール位置が不足',
      missing_prelaunch_players:'打球前の選手位置が不足',start_out_of_reach:'出し手と打球前のボール位置が大きく離れている',
      missing_opposing_side:'味方と相手の到達時間を比較できない'};
    if(pass.evaluation_status!=='scored'){
      return `<section class="impact-info pass-evaluation-event">${title}<p><b>採点保留</b> · ${esc(reasons[pass.reason]||'キック時点の情報不足')}</p></section>`;
    }
    const f=pass.forecast, receiver=f.receiver, intercept=f.first_interception, counter=f.counter_direction, runout=f.own_side_runout;
    const block=f.body_block,early=f.early_reach;
    const name=id=>state.match.players.find(player=>player.participant_id===id)?.username||'選手不明';
    const source={pre_launch_observed:'打球前の観測',pre_launch_tracking:'打球前の追跡位置',settled_before_launch:'打球前に静止した軌跡から推定',
      pre_launch_packet:'打球前の位置パケット',settled_before_launch_packet:'打球前の位置パケットから静止を推定',
      pre_launch_packet_projection:'打球前の位置パケットと移動から推定',launch_packet_backprojection:'打球時の位置パケットと初速から蹴り出し位置を逆算'};
    const recovered=f.recovered_players||[];
    const ballTiming=f.origin_source==='launch_packet_backprojection'
      ?`打球時点から ${fmt(f.origin_age_ms)}ms後の同じ打球の位置`:`打球前の位置の時差 ${fmt(f.origin_age_ms)}ms`;
    const labels={base:'基準点',outlet:'味方が先に扱える見込み',head_start:'味方の到達の余裕',penetration:'予測前進',
      relief:'相手との間合いを広げる価値',shot_access:'得点機会',interception:'軌道上のカットの余地',
      danger:'失点可能性',boundary:'コート外に出る見込み',defensive_relief:'自陣の守備に生まれる猶予',
      direction_cost:'角度を変えた場合の回収しやすさ',range_adjustment:'点数の範囲調整'};
    const list=Object.entries(pass.components||{}).filter(([,value])=>Math.abs(value)>=0.005)
      .map(([key,value])=>`<li><span>${esc(labels[key]||key)}</span><b>${passScoreText(value)}</b></li>`).join('');
    const actual={teammate_next_kick:'味方が次に蹴った',opponent_next_kick:'相手が次に蹴った',self_next_kick:'出し手が続けて蹴った'}[pass.observed_outcome]||'不明';
    const compare=(label,key)=>`<li><span>${label}</span><b>${fmt(f.before[key])} → ${fmt(f.target[key])}マス</b></li>`;
    const goalFactors=(label,outcome,side,goal)=>outcome&&outcome.branch!=='none'?`<p><b>${label}</b> · ${side}が回収 ${outcome.possession.toFixed(2)} × ${goal}へ進める ${outcome.toward_goal.toFixed(2)} × 進めたときの得点しやすさ ${outcome.goal_if_advanced.toFixed(2)} ＝ 指数 ${outcome.value.toFixed(2)}</p>`:'';
    return `<section class="impact-info pass-evaluation-event">${title}
      <p class="pass-evaluation-total"><strong>${launchScoreText(pass.score)}</strong><span>キック時点の予測</span></p>
      <ul class="pass-evaluation-values">${list}</ul>
      <details open><summary>採点の根拠</summary>
        ${goalFactors('得点機会',f.scoring_opportunity,'味方','敵陣ゴール')}
        ${goalFactors('失点可能性',f.concession_risk,'相手','自陣ゴール')}
        ${receiver?`<p>受け手候補 ${esc(name(receiver.player_id))} · 約 ${fmt(receiver.offset_ms)}ms 後</p>
          <p>その地点までの推定到達時間 · 味方 ${fmt(receiver.own_eta_ms)}ms ／ 相手 ${esc(name(receiver.opponent_id))} ${fmt(receiver.opponent_eta_ms)}ms</p>`:
          '<p>予測範囲にボールへ届く味方を確認できませんでした。</p>'}
        ${intercept?`<p>カット候補 ${esc(name(intercept.player_id))} · 約 ${fmt(intercept.match_offset_ms)}ms 後${intercept.basis==='body_overlap'?' · 体ブロック':intercept.basis==='body_overlap_margin'?' · 体ブロック（位置の誤差を考慮）':intercept.basis==='slow_ball'?' · 減速後':''}</p>`:''}
        ${block?`<p>味方の体ブロック候補 ${esc(name(block.player_id))} · 約 ${fmt(block.match_offset_ms)}ms 後 · 軌道と体の中心の水平距離 ${fmt(block.horizontal_distance_blocks)}マス${block.uses_position_margin?'（位置の誤差を考慮）':''}。</p>`:''}
        ${runout?`<p><b>ボールがそのまま進んだ場合の自陣リスク</b> · ${early?`約 ${fmt(early.offset_ms)}ms 後に ${esc(name(early.player_id))} が近づける予測ですが、この位置では体で止められる軌道を確認できませんでした。`:''} ボールはそこからさらに ${fmt(runout.extra_retreat_blocks)}マス自陣側へ進む予測。停止地点へは ${esc(name(runout.opponent_id))} が ${esc(name(runout.own_id))} より約 ${fmt(runout.opponent_lead_ms)}ms先着。自陣ゴールまで ${fmt(runout.own_goal_distance)}マス。</p>`:''}
        ${counter?.contest?`<p>競り合い地点ではボールが味方の ${fmt(counter.contest.beyond_teammate_blocks)}マス、相手の ${fmt(counter.contest.beyond_opponent_blocks)}マス敵陣側。相手の追走方向を考慮した自陣への反撃の危険指数 ${fmt(counter.danger_before)} → ${fmt(counter.danger_after)}。${counter.danger_before===counter.danger_after?' 別のカット候補があり、軌道全体では危険が残ります。':''}</p>`:''}
        ${f.boundary_exit?'<p>到達予測の前にコート境界を越える可能性があります。</p>':''}
        ${f.rebound?`<p>約 ${fmt(f.rebound.offset_ms)}ms 後に壁で反射する仮定を使用。</p>`:''}
        ${f.open_run_if_received>=0.45?`<p>受け手が回収できれば、ゴール方向に運べる空間が広がる予測。</p>`:''}
        ${f.direction_alternative?`<p>方向を ${passScoreText(f.direction_alternative.angle_deg)}° 変えると、${esc(name(f.direction_alternative.receiver_id))} が先に扱いやすくなる予測。</p>`:''}
        <ul class="pass-evaluation-values">${compare('相手ゴールまで','goal_distance')}${compare('最寄りの相手まで','opponent_distance')}${compare('ゴールへの線と相手の間隔','lane_clearance')}</ul>
        <p>予測前進 ${passScoreText(f.forward_change_blocks)}マス · 初速 ${fmt(f.launch_speed_blocks_tick)}マス/tick</p>
        <small>ボール位置の根拠は ${esc(source[f.origin_source]||'打球前の位置')}（${ballTiming}）。移動方向を推定できた選手 ${fmt(f.players_with_motion)}人。</small>
        ${recovered.length?`<small>打球前の位置パケットで補った選手 · ${recovered.map(player=>`${esc(name(player.player_id))}（${fmt(player.age_ms)}ms前${player.source==='held_player'?'の位置を基準に推定':''}）`).join('、')}</small>`:''}
      </details>
      <p class="subtle">実際の次キック · ${esc(actual)}（採点外）</p>
    </section>`;
  }
  function renderPassEvidence(pass){
    if(!pass)return '';
    const outcomes={teammate_next_kick:'味方が次に蹴った',opponent_next_kick:'相手が次に蹴った',self_next_kick:'出し手が続けて蹴った',unknown:'受け渡し不明'};
    const reasons={missing_start:'出し手のキック記録が不足',unknown_passer:'出し手またはチームが不明',missing_goals:'ゴール位置が不足',interrupted:'次の接触までに中断の記録あり',no_next_contact:'5秒以内に同じボールの次のキックを確認できない',ambiguous_next_contact:'同時刻に次の接触候補が重なった',unattributed_intervening_contact:'同じボールへの次の接触の打者が不明',self_next_touch:'味方への受け渡しが発生していない',missing_precontact_ball:'打球前のボール位置を確認できない',missing_player_positions:'両チームの位置が不足',start_out_of_reach:'出し手と打球前のボール位置のずれが大きい',endpoint_out_of_reach:'次の打者と打球前のボール位置のずれが大きい',missing_opposing_side:'到達時間を比較できる両チームの選手が不足'};
    const sources={observed_before_contact:'打球前の観測',tracking_before_contact:'打球前の追跡座標',settled_before_contact:'減速後の位置を使用した静止推定',settled_with_kick_corroboration:'静止した軌跡と次の打球方向から推定'};
    const labels={delivery:'味方への受け渡し',attacking_options:'シュート機会の変化',pressure_change:'相手との間合いの変化',retained_progress:'前進と守備者を越えた分',turnover:'相手への受け渡し',counterattack_risk:'相手に与えた攻撃機会'};
    const name=id=>state.match.players.find(player=>player.participant_id===id)?.username||'選手不明';
    const next=pass.next_kick_event_id&&state.match.timeline.some(e=>e.event_id===pass.next_kick_event_id)
      ?` <button class="outline-button" data-event="${esc(pass.next_kick_event_id)}">${clock(pass.next_match_ms)}を見る</button>`:'';
    const outcome=esc(outcomes[pass.outcome]||outcomes.unknown);
    const title='<h4>パス評価</h4>';
    if(pass.evaluation_status!=='scored'){
      return `<section class="impact-info pass-evaluation-event">${title}<p><b>採点保留</b> · ${outcome}${next}</p><p>${esc(reasons[pass.reason]||'採点に必要な根拠が不足')}</p></section>`;
    }
    const race=pass.race||{}, contact=race.contact, landing=race.landing;
    const raceLine=(label,r)=>r?`<p>${label} ${clock(r.match_ms)} · 味方 ${esc(name(r.own_id))} ${fmt(r.own_distance)}マス／${fmt(r.own_eta_ms)}ms · 相手 ${esc(name(r.opponent_id))} ${fmt(r.opponent_distance)}マス／${fmt(r.opponent_eta_ms)}ms</p>`:'';
    const measure=(label,key,unit='')=>`<li><span>${label}</span><b>${fmt(pass.before?.[key])} → ${fmt(pass.after?.[key])}${unit}</b></li>`;
    const evidence=(label,at)=>at?`<p>${label} ${esc(sources[at.source]||'位置推定')}（最終位置から ${fmt(at.age_ms)}ms）</p>`:'';
    const defenders=(pass.bypassed_defender_ids||[]).map(name);
    const componentList=Object.entries(pass.components||{}).map(([key,value])=>`<li><span>${esc(labels[key]||key)}</span><b>${passScoreText(value)}</b></li>`).join('');
    const lead=Number.isFinite(pass.receiver_time_advantage_ms)?`<p>実際の受け手は推定で ${fmt(Math.abs(pass.receiver_time_advantage_ms))}ms ${pass.receiver_time_advantage_ms>=0?'先着':'後着'}。</p>`:'';
    const windowNote=race.own_window?`<p>相手の次キックより前に、味方が先に扱える位置関係が ${fmt(race.own_window.duration_ms)}ms続いた候補。</p>`:'';
    return `<section class="impact-info pass-evaluation-event">${title}
      <p class="pass-evaluation-total"><strong>${passScoreText(pass.score)}点</strong><span>受け渡し ${passExecutionText(pass.execution_score)}</span></p>
      <p>${outcome} · ${esc(name(pass.next_actor_id))}${next}</p>
      <ul class="pass-evaluation-values">${componentList}</ul>
      <details open><summary>採点の根拠</summary>
        <p>出し手の相手まで ${fmt(pass.before?.opponent_distance)}マス · ${pass.difficulty==='pressured'?'相手が近い':'相手と間合いあり'}</p>
        ${raceLine('着弾付近',landing)}${raceLine('次の打球前',contact)}${lead}${windowNote}
        <small>到達時間はキック可能な距離までの推定です。観測できた移動方向を加味。軌道を確認できた ${fmt(race.trajectory_samples)} 地点のうち相手がキック可能な距離にいたのは ${fmt(race.opponent_reach_samples)} 地点。</small>
        <ul class="pass-evaluation-values">${measure('ゴールまで','goal_distance','マス')}${measure('最寄りの相手まで','opponent_distance','マス')}${measure('ゴールへの線と相手の間隔','lane_clearance','マス')}${measure('シュート機会指数','chance')}</ul>
        <p>攻撃方向の移動 ${passScoreText(pass.forward_change_blocks)}マス · 越えた守備者候補 ${defenders.length}人${defenders.length?`（${esc(defenders.join('、'))}）`:''}</p>
        ${pass.counterattack?`<p>相手の攻撃機会指数 ${fmt(pass.counterattack.chance)} · 相手の攻撃先ゴールまで ${fmt(pass.counterattack.goal_distance)}マス</p>`:''}
        ${evidence('出し手側',pass.source_contact)}${evidence('受け手側',pass.receiver_contact)}
        <small>盤面点は受け渡し前後の推定です。シュートや得点の結果は加点に含めません。</small>
      </details>
    </section>`;
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
    const passMetric=state.match?.analysis?.pass_metrics?.passes?.find(p=>p.event_id===e.event_id),sourceChance=passMetric?.source_shot_opportunity,receiverChance=passMetric?.receiver_shot_opportunity;
    const evaluation=state.match.analysis?.pass_board_evaluation;
    const savedPass=evaluation?.passes?.find(pass=>pass.event_id===e.event_id);
    const newPass=hasPassEvaluation(evaluation?.definition_version)?savedPass:null;
    const evaluationInfo=hasLaunchEvaluation(evaluation?.definition_version)?renderLaunchEvaluation(newPass):renderPassEvidence(newPass);
    const boardPass=newPass?null:savedPass;
    const boardReasonLabels={endpoint_not_immediate:'同じボールの次キックがパス分類の終点と一致しません',interrupted_before_next_kick:'次のキックまでに中断があります',foul_penalty_team_unknown:'ファールの処罰対象が不明です',foul_restriction_next_kick_conflict:'処罰中のキックと判定が食い違っています',missing_next_kick_direction:'次キックの方向が不明です',outcome_not_scored_in_v1:'成功・失敗の判定対象外です',no_immediate_same_ball_kick:'同じボールの次キックがありません',next_kick_outside_interval_limit:'次のキックまでの時間が上限を超えています',missing_goal_coordinates:'ゴール位置が不足しています'};
    const boardReasonText=reason=>reason?.startsWith('before_')?'パス直前の盤面位置が不足しています':reason?.startsWith('after_')?'次キック直前の盤面位置が不足しています':boardReasonLabels[reason]||reason||'入力不足';
    const signed=n=>n==null?'—':`${Number(n)>=0?'+':''}${Number(n).toFixed(2)}`;
    const isChanceTrial=/^pass-board-evaluation\.match-trial-20261110-v(?:15|16|17|18)$/.test(state.match?.analysis?.pass_board_evaluation?.definition_version||'');
    const componentLabels={success_base:'味方支配の基礎',destination_safety:'パス先の安全性（試行）',stable_control:'安定した受渡し',reception_ease:'味方の取りやすさ（試行）',shooting_position:'シュート位置',scoring_opportunity:'得点機会の改善（試行）',contest_direction:isChanceTrial?(boardPass?.outcome==='opponent_next_kick'?'パス先の相手のキック方向（失敗）':'安全性を補填する次のキックの向き'):'競り合い方向',foul_followup_direction:'ファール後のキック方向',numbers_bonus:'前方人数差',progress_bonus:isChanceTrial?'前線の前進・後退':'前進',failure_base_loss:'失敗基礎損失',own_opportunity_loss:'攻撃機会損失',opponent_threat_loss:'相手への危険',pressure_pass:'時間的余裕が少ないパス候補（試行）',open_space_connection:'空き領域から味方への接続（試行）'};
    const boardInfo=boardPass?`<section class="impact-info pass-board-event"><h4>パス特化盤面評価</h4>${boardPass.evaluation_status==='scored'?`<p><b>${signed(boardPass.score)}</b> · ${boardPass.endpoint_basis==='clear_own_arrival'?'到達時は味方が優勢':boardPass.endpoint_basis==='open_forward_space'?'前方の空き領域':boardPass.foul?.endpoint_basis==='clear_own_arrival'?'ファール後の味方支配':'次のキック時'} · ${fmt(boardPass.interval_ms)}ms</p><p>次キックによるパス成否：${boardPass.outcome==='teammate_next_kick'?'成功':boardPass.outcome==='opponent_next_kick'?'失敗':'不明'}</p>${boardPass.foul?`<p>ファールの処罰対象：${team(boardPass.foul.penalty_team)}（候補を含む）</p>`:''}${isChanceTrial?`<p>前進 ${boardPass.forward_change_blocks==null?'—':signed(boardPass.forward_change_blocks)+'マス'} · ${(boardPass.after?.direction_status||boardPass.direction_status)==='not_required_clear_control'&&boardPass.trial_direction_component==null?'次キック方向は対象外':(boardPass.trial_direction_component!=null||boardPass.after?.direction_status==='observed')?`次キック方向 ${signed(boardPass.trial_direction_component??boardPass.direction_component)}`:'方向不明'}</p>`:`<p>前進 ${boardPass.forward_change_blocks==null?'—':signed(boardPass.forward_change_blocks)+'マス'} · 前方人数差の変化 ${boardPass.trial_forward_numbers?(boardPass.trial_forward_numbers.status==='projected'?signed(boardPass.trial_forward_numbers.numbers_change):'予測保留'):(boardPass.numbers_change==null?'—':signed(boardPass.numbers_change))}</p><p>前方人数差${boardPass.trial_forward_numbers?'（到達時予測）':''}：${fmt(boardPass.trial_forward_numbers?.before_raw_region_counts?.difference??boardPass.before?.raw_region_counts?.difference)} → ${boardPass.trial_forward_numbers?(boardPass.trial_forward_numbers.status==='projected'?fmt(boardPass.trial_forward_numbers.raw_region_counts?.difference):'予測保留'):fmt(boardPass.after?.raw_region_counts?.difference)}人 · ${(boardPass.after?.direction_status||boardPass.direction_status)==='not_required_clear_control'&&boardPass.trial_direction_component==null?'次キック方向は対象外':(boardPass.trial_direction_component!=null||boardPass.after?.direction_status==='observed')?`次キック方向 ${signed(boardPass.trial_direction_component??boardPass.direction_component)}`:'方向不明'}</p>`}<ul>${Object.entries(boardPass.components||{}).map(([key,value])=>`<li>${esc(componentLabels[key]||key)}：${signed(value)}</li>`).join('')}</ul>`:`<p>評価保留：${esc(boardReasonText(boardPass.reason))}</p>`}${isChanceTrial?'':`<details><summary>評価前後の位置と内訳</summary><p>パス前：${esc(JSON.stringify(boardPass.trial_forward_numbers?.before_raw_region_counts||boardPass.before?.raw_region_counts||null))}<br>評価時：${esc(JSON.stringify(boardPass.trial_forward_numbers?.raw_region_counts||boardPass.after?.raw_region_counts||null))}</p><small>位置根拠 ${fmt((boardPass.before?.evidence_obs_ids||[]).length+(boardPass.after?.evidence_obs_ids||[]).length)}件 · 次キック ${esc(boardPass.next_kick_event_id||'不明')}</small></details>`}</section>`:'';
    const pressureLabels={possible_time_available:'余裕があった可能性（圧迫加点なし）',sustained_pressure_candidate:'時間的余裕が少ない候補',unknown_no_previous_kick:'直前の同じボールのキックが不明',unknown_missing_positions:'到達時の選手位置が不足',unknown_missing_ball_trajectory:'ボールの位置が不足',unknown_ball_trajectory_gap:'ボール位置の記録間隔が長く圧迫加点は保留（合計に含まれません）',unknown_interrupted:'直前のキック後に中断があり判断保留'};
    const pressure=boardPass?.trial_pressure,pressureInfo=pressure?`<section class="impact-info"><h4>パス前の時間的余裕（試行）</h4><p>${esc(pressureLabels[pressure.status]||'判断保留')}</p><p>直前の同じボールのキックから：${pressure.interval_ms==null?'不明':fmt(pressure.interval_ms)+'ms'}${pressure.status==='unknown_ball_trajectory_gap'?`<br>直前の保存座標から ${fmt(pressure.trajectory_final_gap_ms)}ms（300ms超）`:''}${pressure.arrival_match_ms==null?'':`<br>パス位置付近への到達：${clock(pressure.arrival_match_ms)} · パスまで ${fmt(pressure.arrival_to_pass_ms)}ms<br>到達時のボールまでの距離：出し手 ${fmt(pressure.passer_distance_blocks)} / 相手 ${fmt(pressure.nearest_opponent_distance_blocks)} マス<br>推定した到達時間差：${fmt(pressure.relative_reach_time_ms)}ms · 直前の保存座標から ${fmt(pressure.trajectory_final_gap_ms)}ms<br>それ以前に余裕があった可能性：${fmt(pressure.earlier_safe_window_ms)}ms`}</p><small>保存された推定座標を使用。到達時間差は同じ速度で移動すると仮定した目安です。保存座標の間が長い場合は直線補間の誤差も大きくなります。ボールの高さやキックの待機時間は未考慮です。</small></section>`:'';
    const forward=boardPass?.trial_forward_numbers,forwardInfo=forward?`<section class="impact-info"><h4>味方到達時の前方人数（試行）</h4>${forward.status==='projected'?`<p>最短の味方：${esc(state.playerMap.get(forward.receiver_id)?.username||'不明')} · パスから到達まで ${fmt(forward.collect_after_ms)}ms<br>その間に相手が最大 ${fmt(forward.opponent_retreat_blocks)} マス戻ったと仮定<br>到達時の前方：味方 ${fmt(forward.raw_region_counts?.own)}人 / 相手 ${fmt(forward.raw_region_counts?.opponent)}人 · 加点 ${signed(forward.bonus)}</p>${forward.opponent_projection?`<p>相手の予測位置（ボールから敵ゴール方向を＋）：<br>${forward.opponent_projection.map(p=>`${esc(state.playerMap.get(p.participant_id)?.username||'不明')} ${signed(p.relative_to_ball_blocks)}マス ${p.counted?'対象':'対象外'}`).join('<br>')}</p>`:''}<small>ボールより自陣側2マス以内は相手だけを数え、ボールのラインから敵ゴールまでは両チームを数えます。パス前の出し手と到達時の受け手は例外として味方に含め、重複して数えません。味方はボールから3マス以内かつ自陣側へ0.5マス以上の位置へ最短で移動し、相手は全員が自陣ゴールへ同じ速度で戻る想定です。ボールは到達地点にとどまると仮定します。向きや実際の移動は確認していません。</small>`:'<p>味方の位置または盤面が不足しているため予測保留です。</p>'}</section>`:'';
    const opportunity=boardPass?.trial_scoring_opportunity,opportunityInfo=opportunity?`<section class="impact-info"><h4>得点機会の変化（試行）</h4>${opportunity.status==='estimated'?`<p>位置による機会指数：${fmt(opportunity.before?.quality)} → ${fmt(opportunity.after?.quality)}<br>ゴールまで ${fmt(opportunity.before?.goal_distance_blocks)} → ${fmt(opportunity.after?.goal_distance_blocks)}マス<br>最も近い相手まで ${fmt(opportunity.before?.nearest_opponent_blocks)} → ${fmt(opportunity.after?.nearest_opponent_blocks)}マス<br>ゴールへの進路と相手の距離 ${fmt(opportunity.before?.shot_lane_clearance_blocks)} → ${fmt(opportunity.after?.shot_lane_clearance_blocks)}マス<br>改善による加点 ${signed(opportunity.bonus)} / +15.00</p><small>距離、相手の近さとゴールへの進路をパス前後で比較します。推定値であり、得点確率やパスだけの効果を示すものではありません。${opportunity.opponent_chase_ms?`空き領域では相手が到達まで近づくことを考慮しています。`:''}</small>`:opportunity.status==='projected'?`<p>旧試行版の得点機会 ${signed(opportunity.bonus)} / +8.00</p>`:opportunity.status==='not_successful'?'<p>パス失敗候補のため加点は0です。</p>':'<p>味方・相手またはゴールの位置が不足しているため判断保留です。</p>'}</section>`:'';
    const failureRisk=boardPass?.trial_failure_risk,failureRiskInfo=failureRisk?`<section class="impact-info"><h4>失敗時の相手の取りやすさと危険（試行）</h4>${failureRisk.status==='estimated'?`<p>パス先のボールまで：相手 ${fmt(failureRisk.opponent_distance_blocks)}マス / 味方 ${fmt(failureRisk.own_distance_blocks)}マス<br>相手の取りやすさ ${signed(failureRisk.opponent_reception_ease)} / +5.00<br>自陣ゴールまで ${fmt(failureRisk.own_goal_distance_blocks)}マス · 危険度指数 ${fmt(failureRisk.danger)}<br>損失への調整係数 ${fmt(failureRisk.loss_factor)}</p><small>相手が先に支配しやすいほど減点を強くし、自陣ゴールへの危険も考慮します。${failureRisk.direction_relief_capped?'相手の次キックによる緩和は損失の半分までに制限しました。':''}距離は推定であり、実際の接触や得点確率ではありません。</small>`:'<p>相手・味方またはゴールの位置が不足し、取りやすさの調整は保留です。</p>'}</section>`:'';
    const startControl=boardPass?.trial_start_control,startControlInfo=startControl?`<section class="impact-info"><h4>パス前の支配状況（試行）</h4>${startControl.status==='estimated'?`<p>パス前のボールまで：最寄り味方 ${fmt(startControl.own_distance_blocks)}マス / 相手 ${fmt(startControl.opponent_distance_blocks)}マス<br>基準：${startControl.ball_reference==='last_observed_ball_before_impact'?'打球前に記録されたボール':'キックのボール位置'} ${clock(startControl.reference_match_ms)}<br>失敗基礎損失・攻撃機会損失の調整係数 ${fmt(startControl.factor)}</p><small>味方の支配が不明瞭な場合は、もともと保持していた攻撃機会を失った損失を軽くします。相手への危険は別に評価します。支配の確定ではありません。</small>`:'<p>位置不足のためパス前の支配調整は行えません。</p>'}</section>`:'';
    const stability=boardPass?.trial_reception_ease,stabilityInfo=stability&&stability.status!=='not_successful'?`<section class="impact-info"><h4>味方の取りやすさ（試行）</h4>${stability.status==='scored'?`<p>評価時点：${stability.basis==='clear_own_arrival'?'味方優勢での到達時':stability.basis==='open_forward_space'?'空き領域への到達時':'味方の次キック時'}<br>ボールから最も近い味方 ${fmt(stability.own_distance_blocks)}マス / 相手 ${fmt(stability.opponent_distance_blocks)}マス<br>距離差 ${signed(stability.territory_margin_blocks)}マス · ${stability.territory_state==='own'?'味方優勢の領域':stability.territory_state==='opponent'?'相手優勢の領域':'競り合いの領域'}<br>味方の取りやすさ ${signed(stability.score)}</p><small>味方までの距離、相手までの距離と支配領域の優勢さから、最大5点で連続的に評価します。距離差が2マス以上なら味方優勢、−2マス以下なら相手優勢、それ以外は競り合いです。実際の支配や接触は確定していません。</small>`:'<p>評価時点の位置情報が不足しているため判断保留です。</p>'}</section>`:'';
    const safety=boardPass?.trial_destination_safety,safetyInfo=safety?`<section class="impact-info"><h4>パス先の安全性（試行）</h4>${safety.status==='scored'?`<p>ボールまで：最寄り味方 ${fmt(safety.own_distance_blocks)}マス / 相手 ${fmt(safety.opponent_distance_blocks)}マス<br>${safety.territory_state==='own'?'味方優勢の支配領域':safety.territory_state==='opponent'?'相手優勢の支配領域':'競り合いの領域'} · 安全性 ${signed(safety.score)} / +5.00</p><small>味方が2マス以上近い支配領域は満点です。それ以外は最大3点とし、距離差と敵ゴール方向の相手の位置を考慮します。相手が実際にどちらを向いているかは使用していません。</small>`:safety.status==='not_successful'?'<p>パス失敗候補のため安全性の加点は0です。</p>':'<p>距離や位置が不足しているため安全性は判断保留です。</p>'}</section>`:'';
    const directionInfo=isChanceTrial&&boardPass?.outcome==='teammate_next_kick'&&boardPass?.components?.contest_direction!=null?`<p class="subtle">安全性を補填する次のキックの向き：上限は5点からパス先の安全性を引いた値です。次のキックが前方向に近いほど加点します。${boardPass.trial_direction_status!=='scored'?'必要な位置またはキック方向が不足しているため加点は保留です。':''}</p>`:'';
    const progressInfo=isChanceTrial&&boardPass?.components?.progress_bonus!=null?'<p class="subtle">「前線の前進・後退」はボールの攻撃方向への移動量から計算します。成功パスの後退による減点は従来の半分です。</p>':'';
    const chanceText=c=>c?`ゴールまで ${c.goal_distance_blocks} マス、最も近い相手まで ${c.nearest_opponent_blocks} マス。${c.clear_chance_candidate?'決定機候補':c.shot_opportunity_candidate?'シュート機会候補':'決定機の距離外'}${c.under_pressure?'（相手が近い）':''}`:'位置情報不足';
    const optionInfo=e.type==='kick'?`<section class="impact-info"><h4>\u30ad\u30c3\u30af\u306e\u5206\u985e</h4><p>${esc(kickKind(e))}</p>${passMetric?`<p>パス前：${esc(chanceText(sourceChance))}</p><p>受け手の次キック時：${esc(chanceText(receiverChance))}</p>${passMetric.key_pass_basis==='receiver_clear_chance'?'<p>受け手に決定機候補を作ったキーパス候補。</p>':''}${passMetric.decision_review?'<p>シュート可能な場面から、相手が近い受け手につないだ候補。得点確率や判断の優劣は未検証です。</p>':''}`:''}<small>分類と盤面の評価は試作の推定です。</small></section>${boardInfo}${directionInfo}${progressInfo}${pressureInfo}${forwardInfo}${opportunityInfo}${stabilityInfo}${safetyInfo}${startControlInfo}${failureRiskInfo}`:'';
    $('#event-detail').innerHTML=`<button class="detail-back" id="detail-back">詳細を閉じる ×</button><button class="outline-button" id="replay-context">3秒前から再生</button><div class="detail-type">${esc(eventLabel(e))} · ${clock(e.match_ms)}</div><h3 class="detail-title ${esc(displayTeamName||p?.team||'')}">${esc(displayName)}</h3><div class="person">${e.type==='foul'?'':avatar(p)}<span>${esc(displayTeamName?team(displayTeamName):'チーム不明')}<small class="subtle">${e.item?' / '+esc(item(e.item)):''}</small></span></div><p class="detail-copy">${esc(summary)}</p>${evaluationInfo}${reasons.length?`<div class="reason">${reasons.map(esc).join('<br>')}</div>`:''}${impact}${newPass?'':optionInfo}${candidateList(c,raw,e)}${renderEventContext(e)}<details class="raw-data"><summary>数値と根拠観測を見る</summary><pre>${esc(JSON.stringify({replay_ms:e.replay_ms,location:e.location,evidence:e.evidence,...e.details},null,2))}</pre></details>`;
    $('#replay-context').onclick=()=>{state.time=Math.max(0,e.match_ms-3000);setPlaying(true);renderFrame();};
    $('#detail-back').onclick=()=>{state.event=null;renderInspector();renderFrame();};
  }
  function renderMarkers(){const events=filteredEvents().filter(e=>['goal','kick','body_block','foul','foul_candidate','foul_notification','forced_foul','ball_recovery','possession_gain_candidate','possession_loss_candidate','breakthrough_candidate','goal_link_candidate','goal_outcome','shot_candidate','pass_success','progressive_pass_candidate','key_pass_candidate','assist_candidate','big_chance_candidate','chance_creation_candidate','dribble_success_candidate','interception_candidate'].includes(e.type));$('#event-markers').innerHTML='<div class="marker-track">'+events.map(e=>`<button class="marker ${e.type}" style="left:${Math.max(0,Math.min(100,e.match_ms/Math.max(1,state.match.window.duration_ms)*100))}%" data-event="${esc(e.event_id)}" title="${clock(e.match_ms)} ${eventLabel(e)} \xb7 ${esc(eventExplanation(e))}" aria-label="${clock(e.match_ms)} ${eventLabel(e)}"></button>`).join('')+'</div>';}
  function renderGoals(){$('#goals').innerHTML=state.match.timeline.filter(e=>e.type==='goal').map(e=>`<button class="goal-tile" data-event="${esc(e.event_id)}"><span>${clock(e.match_ms)} · ${team(e.team)}</span><strong class="${esc(e.team||playerByName(e.actor)?.team||'')}">${esc(e.actor||'得点者不明')}</strong><b>${e.score?`<span class="red">${esc(e.score.red)}</span> — <span class="blue">${esc(e.score.blue)}</span>`:'—'}</b></button>`).join('')||'<p class="empty">得点通知はありません。</p>';}
  const baseColumns=[['username','選手'],['analysis.goals','得点'],['analysis.assist_candidates','アシスト候補'],['analysis.key_pass_candidates','キーパス候補'],['analysis.big_chance_candidates','決定機候補'],['analysis.chance_creation_candidates','チャンスメイク候補'],['analysis.dribble_success_candidates','ドリブル成功候補'],['analysis.pass_success_rate','パス成功率'],['analysis.progressive_pass_candidates','前進パス候補'],['analysis.body_block_candidates','体ブロック候補'],['analysis.possession_gain_candidates','奪取候補'],['analysis.possession_loss_candidates','被奪取候補']];
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
  function passSummaryValues(stats,launch=false){
    const groups=stats?.difficulty_groups||{};
    return `<ul class="pass-evaluation-values">
      <li><span>${launch?'パス選択の平均':'盤面点の平均'}</span><b>${launch?launchScoreText(stats?.score_mean):passScoreText(stats?.score_mean)}</b></li>
      ${[['pressured','相手が近い'],['unpressured','相手と間合いあり']].map(([key,label])=>`<li><span>${label}</span><b>${launch?launchScoreText(groups[key]?.score_mean):passExecutionText(groups[key]?.execution_mean)} · ${fmt(groups[key]?.count??0)}本</b></li>`).join('')}
    </ul><p>採点 ${fmt(stats?.evaluated_passes??0)} / ${fmt(stats?.attempts??0)} 本</p>`;
  }
  function renderMatchRatings(){
    const players=state.match.players||[],evaluation=state.match.analysis?.pass_board_evaluation;
    const byId=new Map((evaluation?.players||[]).map(row=>[row.participant_id,row]));
    for(const player of players)player.pass_board_stats=byId.get(player.participant_id)||null;
    if(!evaluation){$('#match-player-ratings').innerHTML='';return;}
    if(hasPassEvaluation(evaluation.definition_version)){
      const launch=hasLaunchEvaluation(evaluation.definition_version);
      const cards=side=>players.filter(player=>player.team===side).map(player=>`<article class="match-rating-card">
        <header>${avatar(player)}<div><strong>${esc(player.username)}</strong><small>${team(side)}</small></div></header>
        ${passSummaryValues(player.pass_board_stats,launch)}
      </article>`).join('');
      $('#match-player-ratings').innerHTML=`<div class="section-bar"><div><span class="eyebrow">PASS EVALUATION</span><h2>選手別のパス評価 <small>試行</small></h2></div></div>
        <p class="subtle">相手がキック位置から4.5マス以内のパスを分けて表示します。各パスの根拠は MATCH EVENT で確認できます。</p>
        <div class="match-rating-teams">${['red','blue'].map(side=>`<section><h3 class="${side}">${team(side)}</h3><div class="match-rating-grid">${cards(side)}</div></section>`).join('')}</div>`;
      return;
    }
    const point=(i,value)=>{const angle=-Math.PI/2+i*2*Math.PI/5,r=65*value/10;return `${(100+Math.cos(angle)*r).toFixed(1)},${(85+Math.sin(angle)*r).toFixed(1)}`;};
    const polygon=values=>values.map((v,i)=>point(i,v)).join(' ');
    const cards=side=>players.filter(player=>player.team===side).map(player=>{
      const stats=player.pass_board_stats,pass=passRating(stats),ps=player.pass_stats,values=[pass,6,6,6,6],labels=['パス','シュート','ドリブル','ディフェンス','ポジショニング'];
      const assistCount=Number.isSafeInteger(player.analysis?.assist_candidates)&&player.analysis.assist_candidates>0?player.analysis.assist_candidates:0,goalCount=Number.isSafeInteger(player.analysis?.goals)&&player.analysis.goals>0?player.analysis.goals:0;
      const assists=assistCount?`<span class="assist-marks" role="img" aria-label="アシスト ${assistCount}回" title="アシスト ${assistCount}回"><span class="assist-label" aria-hidden="true">アシスト</span>${'<span class="assist-icon" aria-hidden="true">A</span>'.repeat(assistCount)}</span>`:'';
      const goals=goalCount?`<span class="goal-marks" role="img" aria-label="ゴール ${goalCount}回" title="ゴール ${goalCount}回"><span class="goal-label" aria-hidden="true">ゴール</span>${'<span class="goal-icon" aria-hidden="true">⚽</span>'.repeat(goalCount)}</span>`:'';
      const grid=[2,4,6,8,10].map(n=>`<polygon points="${polygon([n,n,n,n,n])}" fill="none" stroke="#50616a" stroke-width=".6"/>`).join('');
      const graph=pass==null?'':`<polygon points="${polygon(values)}" fill="#91ce8b" fill-opacity=".35" stroke="#a8e49d" stroke-width="2"/>`;
      return `<article class="match-rating-card"><header>${avatar(player)}<div><strong>${esc(player.username)}</strong><small>${team(side)}</small>${goals}${assists}</div><div class="match-rating-total"><b>6.0</b><small>総合（仮）</small></div></header><div class="match-rating-body"><svg viewBox="0 0 200 170" role="img" aria-label="5項目の評価グラフ">${grid}${graph}</svg><div class="match-rating-values">${labels.map((label,i)=>`<div><span>${label}${i?'（仮）':''}</span><b>${values[i]==null?'—':values[i].toFixed(1)}</b></div>`).join('')}</div></div><p>パス ${fmt(ps?.passes)}本 · 成功 ${fmt(ps?.connected)}本 · 成功率 ${ps?.rate==null?'—':Math.round(ps.rate*100)+'%'}<br>シュート ${fmt(ps?.shots)}本 · ドリブル ${fmt(ps?.dribbles)}回<br>パス評価対象 ${fmt(stats?.evaluated_passes||0)}本 / 試行 ${fmt(stats?.attempts||0)}本</p></article>`;
    }).join('');
    $('#match-player-ratings').innerHTML=`<div class="section-bar"><div><span class="eyebrow">PLAYER RATINGS</span><h2>選手評価 <small>試行</small></h2></div></div><p class="subtle">パスは6点を基準に評価します。評価対象が5本未満の場合は、6点を超える加点を本数に応じて抑えます。総合と他の4項目は仮の6点です。</p><div class="match-rating-teams">${['red','blue'].map(side=>`<section><h3 class="${side}">${team(side)}</h3><div class="match-rating-grid">${cards(side)}</div></section>`).join('')}</div>`;
  }
  function renderStats(){if(!state.match||stage2)return;renderPlayEvaluation();
    const entries=state.match.analysis?.pass_intent?.kicks;
    for(const player of state.match.players){
      if(!Array.isArray(entries)){player.pass_stats=null;continue;}
      const kicks=entries.filter(k=>k.actor_id===player.participant_id),passes=kicks.filter(k=>k.classification==='pass_attempt');
      const connected=passes.filter(k=>k.outcome==='teammate_next_kick').length,opponent=passes.filter(k=>k.outcome==='opponent_next_kick').length;
      const progress=passes.map(k=>k.goal_distance_change_blocks).filter(Number.isFinite);
      player.pass_stats={passes:passes.length,shots:kicks.filter(k=>k.classification==='shot_attempt').length,dribbles:kicks.filter(k=>k.classification==='self_carry_candidate').length,unknown:kicks.filter(k=>k.classification==='unknown').length,connected,opponent,unresolved:passes.length-connected-opponent,rate:connected+opponent?connected/(connected+opponent):null,progress:progress.length?progress.reduce((a,b)=>a+b,0)/progress.length:null,progress_count:progress.length};
      const metric=state.match.analysis?.pass_metrics?.players?.find(row=>row.participant_id===player.participant_id);
      if(metric)Object.assign(player.pass_stats,{passes:metric.attempts,connected:metric.successes,opponent:metric.failures,unresolved:metric.unknown_outcomes,rate:metric.success_rate,progressive_rate:metric.progressive_success_rate,progressive_successes:metric.progressive_successes,progressive_failures:metric.progressive_failures,progressive_unknown:metric.progressive_unknown_geometry,frequency:metric.attempts_per_10min,progressive_frequency:metric.progressive_successes_per_10min,key_passes:metric.key_passes});
    }
    renderMatchRatings();
    const group=$('#stats-group').value;const cols=group==='passing'?[['username','\u9078\u624b'],['pass_stats.passes','\u30d1\u30b9'],['pass_stats.shots','\u30b7\u30e5\u30fc\u30c8'],['pass_stats.dribbles','\u30c9\u30ea\u30d6\u30eb'],['pass_stats.unknown','\u5206\u985e\u4fdd\u7559'],['pass_stats.connected','\u6b21\u306b\u5473\u65b9'],['pass_stats.opponent','\u6b21\u306b\u76f8\u624b'],['pass_stats.unresolved','\u7d50\u679c\u4e0d\u660e\u30fb\u81ea\u5206'],['pass_stats.rate','\u5473\u65b9\u3078\u306e\u63a5\u7d9a\u7387'],['pass_stats.progress','\u63a5\u7d9a\u6642\u306e\u5e73\u5747\u524d\u9032'],['pass_stats.progress_count','\u524d\u9032\u306e\u5bfe\u8c61\u6570']]:group==='tools'?[['username','選手'],['analysis.weak_kicks','弱キック'],['analysis.medium_kicks','中キック'],['analysis.strong_kicks','強キック'],['analysis.unknown_kicks','強さ不明']]:group==='other'?[['consecutive_touches','連続タッチ'],['critical_candidates','クリティカル'],['dash_candidates','ダッシュ'],['turn_candidates','振り向き']].map((x,i)=>i===0?['username','選手']:x):baseColumns;
    if(group==='passing'&&state.match.analysis?.pass_metrics){cols.push(['pass_stats.progressive_rate','前進パス成功率'],['pass_stats.progressive_unknown','前進判定不能'],['pass_stats.frequency','パス試行 / 10分'],['pass_stats.progressive_frequency','前進パス成功 / 10分'],['pass_stats.key_passes','キーパス候補']);}
    if(group==='passing'&&hasPassEvaluation(state.match.analysis?.pass_board_evaluation?.definition_version)){cols.push(['pass_board_stats.score_mean',hasLaunchEvaluation(state.match.analysis?.pass_board_evaluation?.definition_version)?'パス評価':'盤面点平均']);}
    const value=(p,k)=>k.startsWith('analysis.')?p.analysis?.[k.slice(9)]:k.startsWith('pass_stats.')?p.pass_stats?.[k.slice(11)]:k.startsWith('pass_board_stats.')?p.pass_board_stats?.[k.slice(17)]:p[k];if(!cols.some(c=>c[0]===state.sort))state.sort=cols[1][0];const selectedTeam=$('#stats-team').value;const rows=state.match.players.filter(p=>selectedTeam==='all'||p.team===selectedTeam).sort((a,b)=>{const av=value(a,state.sort),bv=value(b,state.sort);if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''),'ja');return (state.descending?-delta:delta)||a.username.localeCompare(b.username,'ja')||a.participant_id.localeCompare(b.participant_id);});
    $('#stats-table thead').innerHTML='<tr>'+cols.map(([k,label])=>`<th class="${k==='username'?'':'num'}" ${state.sort===k?`aria-sort="${state.descending?'descending':'ascending'}"`:''}><button data-sort="${k}">${label}${state.sort===k?state.descending?' ↓':' ↑':''}</button></th>`).join('')+'</tr>';
    $('#stats-table tbody').innerHTML=rows.map(p=>'<tr>'+cols.map(([k])=>k==='username'?`<td><div class="player-cell">${avatar(p)}<div><span class="${esc(p.team)}">${esc(p.username)}</span><small class="${p.team}">${team(p.team)}</small></div></div></td>`:`<td class="num">${k==='pass_board_stats.score_mean'?(value(p,k)==null?'—':hasLaunchEvaluation(state.match.analysis?.pass_board_evaluation?.definition_version)?value(p,k).toFixed(1):(value(p,k)>=0?'+':'')+value(p,k).toFixed(1)):k==='pass_stats.progressive_rate'?(value(p,k)==null?'—':Math.round(value(p,k)*100)+'% ('+p.pass_stats.progressive_successes+'/'+(p.pass_stats.progressive_successes+p.pass_stats.progressive_failures)+')'):['pass_stats.frequency','pass_stats.progressive_frequency'].includes(k)?(value(p,k)==null?'—':value(p,k).toFixed(1)):k==='pass_stats.rate'?(value(p,k)==null?'\u2014':Math.round(value(p,k)*100)+'% ('+p.pass_stats.connected+'/'+(p.pass_stats.connected+p.pass_stats.opponent)+')'):k==='pass_stats.progress'?(value(p,k)==null?'\u2014':value(p,k).toFixed(1)+' \u30de\u30b9'):k==='analysis.pass_success_rate'?(value(p,k)==null?'—':Math.round(value(p,k)*100)+'% ('+fmt(p.analysis.pass_successes)+'/'+fmt(p.analysis.pass_attempts)+')'):fmt(value(p,k))}</td>`).join('')+'</tr>').join('');
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
    const rows=playerHistory.filter(player=>player.matches>0&&player.username.toLocaleLowerCase('ja').includes(query));
    renderPlayerRankings();
    if(!rows.some(player=>player.id===state.profileId))state.profileId=rows[0]?.id||null;
    $('#player-count').textContent=rows.length+'\u4eba';
    $('#player-list').innerHTML=rows.map(player=>`<button class="directory-player ${player.id===state.profileId?'selected':''}" data-profile="${esc(player.id)}" aria-pressed="${player.id===state.profileId}">${avatar(player.appearances[0]?.player||player)}<span><strong>${esc(player.username)}</strong><small>\u76f4\u8fd1 ${player.matches} \u8a66\u5408</small></span><span aria-hidden="true">\u203a</span></button>`).join('')||`<p class="empty">${profileData?'\u5de5\u7a0b4\u306f\u7b97\u51fa\u6e08\u307f\u3067\u3059\u304c\u3001\u5bfe\u8c61\u9078\u624b\u306f\u3044\u307e\u305b\u3093\u3002':'\u8a72\u5f53\u3059\u308b\u9078\u624b\u304c\u3044\u307e\u305b\u3093\u3002'}</p>`;
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
    if(player.metrics_url){
      host.insertAdjacentHTML('beforeend','<details class="profile-section metrics-v2-lazy"><summary>選手の詳細指標（工程3）を表示</summary><div class="metrics-v2-content"><p class="subtle">開くと詳細指標データを読み込みます。</p></div></details>');
      const details=host.querySelector('.metrics-v2-lazy');
      details.addEventListener('toggle',()=>{
        if(!details.open||details.dataset.loaded||details.dataset.loading)return;
        details.dataset.loading='true';
        loadArtifactMetrics(player).then(metrics=>{
          Object.assign(player,metrics);
          const content=details.querySelector('.metrics-v2-content');
          content.innerHTML=renderMetricsV2(player)||'<p class="empty">この選手の詳細指標は未算出です。</p>';
          details.dataset.loaded='true';delete details.dataset.loading;
        }).catch(()=>{
          details.querySelector('.metrics-v2-content').innerHTML='<p class="empty">詳細指標を読み込めませんでした。</p>';
          delete details.dataset.loading;
        });
      });
    }else{
      const metricsV2Section=renderMetricsV2(player);
      if(metricsV2Section)host.insertAdjacentHTML('beforeend',metricsV2Section);
    }
  }
  const PROFILE_RATE_FIELDS = [
    ['キック数','kick_count'],['パス数','pass_attempts'],['シュート数','shot_candidates'],
    ['得点数','goals'],['アシスト数','assist_candidates'],
    ['ボール奪取数','possession_gain_candidates'],['ボール被奪取数','possession_loss_candidates'],
  ];
  const RANKING_TYPES = [
    ['pass_skill','パス評価ランキング'],
    ['dribbles','ドリブル頻度ランキング'],
    ['pass_attempts','パス頻度ランキング'],
    ['shot_candidates','シュート頻度ランキング'],
  ];
  let rankingType = 'pass_skill';
  const profileStat = (label,value,note='') => `<div class="profile-stat"><span>${label}</span><strong>${value}</strong>${note?`<small>${note}</small>`:''}</div>`;
  function rateValue(player,key){
    const rate=player.rates?.[key];
    return rate?.per_10min??null;
  }
  function renderPlayerRankings(){
    const host=$('#player-ranking');
    if(!playerStatistics){
      host.innerHTML='<p class="subtle">ランキングを読み込み中です。</p>';
      loadPlayerStatistics().then(()=>{if(state.view==='players')renderPlayerRankings();}).catch(()=>{
        if(state.view==='players')host.innerHTML='<p class="empty">選手統計を読み込めませんでした。</p>';
      });
      return;
    }
    const value=player=>rankingType==='pass_skill'?player.pass_evaluation?.skill:rateValue(player,rankingType);
    const ranking=(playerStatistics.players||[]).filter(player=>Number.isFinite(value(player))&&(rankingType==='pass_skill'||player.rates?.[rankingType]?.duration_ms>40*60000))
      .sort((a,b)=>value(b)-value(a)||String(a.username).localeCompare(String(b.username),'ja'));
    const title=RANKING_TYPES.find(([id])=>id===rankingType)?.[1]||'ランキング';
    host.innerHTML=`<div class="ranking-heading"><h3>${title}</h3>
      <label>ランキング <select id="player-ranking-type" aria-label="ランキングの種類">
      ${RANKING_TYPES.map(([id,label])=>`<option value="${id}" ${id===rankingType?'selected':''}>${label}</option>`).join('')}
      </select></label></div>
      <p class="subtle">${rankingType==='pass_skill'?'採点済みパスが20本以上の選手を表示。':'試合時間10分あたりの候補数。集計対象の参加時間が40分を超える選手を表示。'} 直近最大100試合を集計。</p>
      ${ranking.length?`<ol class="pass-ranking">${ranking.map((player,index)=>`<li><span class="ranking-position">${index+1}</span><button data-profile="${esc(player.id)}">${avatar(player)}<span class="ranking-name">${esc(player.username)}<small>${rankingType==='pass_skill'?`${fmt(player.pass_evaluation.count)}本`:`${(player.rates[rankingType].duration_ms/60000).toFixed(1)}分`}</small></span><strong>${value(player).toFixed(rankingType==='pass_skill'?2:1)}</strong></button></li>`).join('')}</ol>`:'<p class="empty">条件を満たす選手はいません。</p>'}`;
    $('#player-ranking-type').onchange=event=>{rankingType=event.target.value;renderPlayerRankings();};
  }
  function renderPassHistogram(bins){
    const max=Math.max(...bins);
    const description=bins.map((count,i)=>`${i*10}点台 ${count}本`);
    description[9]=`90〜100点 ${bins[9]}本`;
    return `<figure class="pass-histogram" role="img" aria-label="パスの点数分布。 ${description.join('、')}">
      <figcaption>パスの点数分布</figcaption><div class="pass-histogram-chart" aria-hidden="true">
      <div class="pass-histogram-y"><span>本数</span><span>${fmt(max)}</span><span>0</span></div>
      <div class="pass-histogram-plot">${bins.map((count,i)=>`<div class="pass-histogram-bin${i<4?' low':''}" title="${description[i]}">
      <div class="pass-histogram-track"><span style="height:${count*100/max}%"></span></div><small>${i*10}</small></div>`).join('')}
      <small class="pass-histogram-end">100</small></div></div><div class="pass-histogram-axis" aria-hidden="true">パスの点数（点）</div></figure>`;
  }
  function renderPlayerProfile(player){
    const host=$('#player-profile-detail');
    if(!player){host.innerHTML='<p class="empty">表示できる選手がいません。</p>';return;}
    if(profileData&&!player.profile){
      host.innerHTML='<p class="empty">選手プロフィールを読み込み中です。</p>';
      loadArtifactProfile(player).then(()=>{if(state.profileId===player.id&&state.view==='players')renderPlayerProfile(player);}).catch(()=>{
        if(state.profileId===player.id&&state.view==='players')host.innerHTML='<p class="empty">選手プロフィールを読み込めませんでした。</p>';
      });
      return;
    }
    if(!playerStatistics){
      host.innerHTML='<p class="empty">選手統計を読み込み中です。</p>';
      loadPlayerStatistics().then(()=>{if(state.profileId===player.id&&state.view==='players')renderPlayerProfile(player);}).catch(()=>{
        if(state.profileId===player.id&&state.view==='players')host.innerHTML='<p class="empty">選手統計を読み込めませんでした。</p>';
      });
      return;
    }
    const stats=(playerStatistics.players||[]).find(row=>row.id===player.id);
    if(!stats){host.innerHTML='<p class="empty">この選手の集計データがありません。</p>';return;}
    const rates=PROFILE_RATE_FIELDS.map(([label,key])=>{
      const item=stats.rates[key],value=rateValue(stats,key);
      return profileStat(label,value==null?'—':value.toFixed(1),value==null?'集計できる試合時間なし':`${fmt(item.count)} 回 / ${(item.duration_ms/60000).toFixed(1)} 分`);
    }).join('');
    const evaluation=stats.pass_evaluation, totals=stats.pass_totals, judged=totals.successes+totals.failures;
    const lowRate=evaluation.low_rate;
    host.innerHTML=`<div class="profile-header">${avatar(player.appearances[0]?.player||stats)}<div><h3>${esc(player.username)}</h3>
      <p class="subtle">直近 ${stats.matches} 試合</p></div></div>
      <section class="profile-section player-overview"><h4>試合統計</h4>
      <div class="profile-stats-grid">${profileStat('勝利数',stats.known_results?`${fmt(stats.wins)} 勝`:'—',`結果判明 ${fmt(stats.known_results)} 試合`)}</div>
      <h5>参加時間10分あたり</h5><div class="profile-stats-grid">${rates}</div>
      <p class="subtle">参加試合の試合時間の合計 ${(stats.duration_ms/60000).toFixed(1)} 分。各項目は件数と試合時間が分かる試合で換算しています。得点以外の件数には推定が含まれます。</p></section>
      <section class="profile-section"><h4>パス</h4><div class="profile-stats-grid">
      ${profileStat('パスのうまさ',evaluation.skill==null?'—':`${evaluation.skill.toFixed(2)} / 10`,evaluation.count<20?'採点20本以上で表示':'')}
      ${profileStat('パス平均点',launchScoreText(evaluation.average),`採点 ${fmt(evaluation.count)} / ${fmt(totals.evaluationAttempts)} 本`)}
      ${profileStat('不安定指数',evaluation.instability==null?'—':evaluation.instability.toFixed(3),'0〜1 · 低いほど安定')}
      ${profileStat('致命的なミスパスの割合',lowRate==null?'—':`${(100*lowRate).toFixed(1)}%`,`40点未満 · ${fmt(evaluation.low_count)} / ${fmt(evaluation.count)} 本`)}
      ${profileStat('パス成功率',totals.success_rate==null?'—':`${(100*totals.success_rate).toFixed(1)}%`,`${fmt(totals.successes)} 成功 / ${fmt(judged)} 本判定 · ${fmt(totals.attempts)} 本試行`)}
      </div>${evaluation.count?renderPassHistogram(evaluation.bins):'<p class="empty">点数が記録されたパスがありません。</p>'}
      <p class="subtle">不安定指数は、40点未満のパスごとに (40−点数)÷40 を足し、採点した全パス数で割ります。パスのうまさは平均点÷10から不安定指数の6倍を差し引いた暫定評価です。最低は0点です。</p></section>`;
  }
  function renderLegacyPlayerProfile(player){
    if(profileData){renderArtifactPlayerProfile(player);return;}
    const host=$('#player-profile-detail');if(!player){host.innerHTML='<p class="empty">\u8868\u793a\u3067\u304d\u308b\u9078\u624b\u304c\u3044\u307e\u305b\u3093\u3002</p>';return;}
    const percent=value=>value==null?'\u2014':`${Math.round(value*100)}%`,perMatch=value=>(value/player.matches).toFixed(2);
    const measures=[['\u30d1\u30b9\u6210\u529f\u7387',player.passRate,percent(player.passRate),`${player.passSuccesses} / ${player.passAttempts}`],['\u30b7\u30e5\u30fc\u30c8\u5019\u88dc / \u8a66\u5408',player.shots/player.matches,perMatch(player.shots),`${player.shots} \u5019\u88dc`],['\u4f53\u30d6\u30ed\u30c3\u30af\u5019\u88dc / \u8a66\u5408',player.blocks/player.matches,perMatch(player.blocks),`${player.blocks} \u5019\u88dc`],['\u5f97\u70b9 / \u8a66\u5408',player.goals/player.matches,perMatch(player.goals),`${player.goals} \u70b9`]];
    host.innerHTML=`<div class="profile-header">${avatar(player.appearances[0]?.player||{username:player.username,team:player.team})}<div><span class="eyebrow">PLAYER PROFILE</span><h3>${esc(player.username)}</h3><p class="subtle">\u76f4\u8fd1 ${player.matches} \u8a66\u5408</p></div></div><section class="profile-section"><h4>\u6307\u6a19</h4>${measures.map(([label,value,shown,counts])=>`<div class="ability-row"><div class="ability-label"><strong>${label}</strong><span>${shown}</span></div><div class="ability-track"><span style="width:${value==null?0:Math.max(0,Math.min(100,value*100))}%"></span></div><small>${counts}</small></div>`).join('')}</section><p class="subtle">\u5de5\u7a0b4\u306e\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u306f\u307e\u3060\u8aad\u307f\u8fbc\u307e\u308c\u3066\u3044\u307e\u305b\u3093\u3002</p>`;
  }
  function renderLibrary(){const query=$('#match-search').value.toLowerCase();$('#match-library').innerHTML=matches.filter(m=>`${date(m)} ${m.players.map(p=>p.username).join(' ')}`.toLowerCase().includes(query)).map(m=>`<button class="archive-card" data-match="${esc(m.match_id)}"><span class="eyebrow">${esc(date(m))} · ${esc(m.format||'MATCH')}</span><div class="archive-score"><span class="red">${fmt(m.score?.red)}</span> <span class="subtle">—</span> <span class="blue">${fmt(m.score?.blue)}</span></div><div class="archive-roster">${m.players.map(avatar).join('')}</div></button>`).join('')||'<p class="empty">条件に合う試合がありません。</p>';}
  function move(t){setPlaying(false);state.time=Math.max(0,Math.min(state.match?.window.duration_ms||0,t));renderFrame();}
  if(stage2){$$('nav button[data-view="stats"],nav button[data-view="players"]').forEach(button=>button.hidden=true);$$('nav .nav-group-label').at(-1)?.setAttribute('hidden','');$('#view-stats').hidden=true;$('#view-players').hidden=true;$('#view-stats').setAttribute('aria-hidden','true');$('#view-players').setAttribute('aria-hidden','true');$('.match-heading h1').textContent='工程2：試合タイムライン';$('.data-notes summary').textContent='工程2のタイムライン・位置データについて';}
  $$('nav button').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#match-select').onchange=()=>selectMatch($('#match-select').value);$('#play').onclick=()=>{if(state.time>=state.match.window.duration_ms)state.time=0;setPlaying(!state.playing)};$('#stop').onclick=()=>setPlaying(false);$('#seek').oninput=()=>move(Number($('#seek').value));$('#seek').onkeydown=e=>{if(e.shiftKey&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(state.time+(e.key==='ArrowRight'?1000:-1000));}};$('#rate').onchange=()=>state.rate=Number($('#rate').value);$('#back-second').onclick=()=>move(state.time-1000);$('#forward-second').onclick=()=>move(state.time+1000);
  for(const [id,direction]of [['#prev',-1],['#next',1]])$(id).onclick=()=>{const events=state.match.timeline.filter(e=>direction<0?e.match_ms<state.time:e.match_ms>state.time).sort((a,b)=>a.match_ms-b.match_ms);const e=direction<0?events.at(-1):events[0];if(e)selectEvent(e);};
  $('#goto').onclick=()=>{const p=/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/.exec($('#time-input').value.trim());let t=p?Number(p[1])*60000+Number(p[2])*1000+Number((p[3]||'').padEnd(3,'0')):NaN;if(!p||Number(p[2])>=60||t>state.match.window.duration_ms){$('#time-error').textContent='試合内の時刻を 02:14.300 の形式で入力';return;}$('#time-error').textContent='';move(t);};
  $('#pitch').addEventListener('pointermove',event=>{const svg=$('#pitch'),ctm=svg.getScreenCTM(),tip=$('#player-tooltip');if(!ctm){tip.hidden=true;return}const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const at=point.matrixTransform(ctm.inverse());const nearest=state.visiblePlayers.map(p=>({...p,distance:Math.hypot(p.x-at.x,p.y-at.y)})).sort((a,b)=>a.distance-b.distance)[0];if(!nearest||nearest.distance>21){tip.hidden=true;return}tip.textContent=`${nearest.player.username} · ${team(nearest.player.team)} · ${nearest.positionLabel}`;const box=$('.pitch-shell').getBoundingClientRect();tip.style.left=`${Math.max(8,Math.min(box.width-190,event.clientX-box.left+14))}px`;tip.style.top=`${Math.max(8,event.clientY-box.top-38)}px`;tip.hidden=false;});
  $('#pitch').addEventListener('pointerleave',()=>{$('#player-tooltip').hidden=true;});
  $('#event-filter').onchange=()=>{state.filter=$('#event-filter').value;renderEvents();renderMarkers();renderFrame();};$('#player-filter').onchange=()=>{state.player=$('#player-filter').value;renderEvents();renderMarkers();renderFrame();};$('#stats-team').onchange=renderStats;$('#stats-group').onchange=renderStats;$('#match-search').oninput=renderLibrary;$('#player-history-search').oninput=renderPlayerHistory;
  document.addEventListener('click',event=>{const button=event.target.closest('[data-event],[data-sort],[data-match],[data-player],[data-profile]');if(!button)return;if(button.dataset.profile){state.profileId=button.dataset.profile;renderPlayerHistory();}else if(button.dataset.player){state.player=state.player===button.dataset.player?'all':button.dataset.player;$('#player-filter').value=state.player;renderEvents();renderMarkers();renderFrame();}else if(button.dataset.event){const e=state.match.timeline.find(e=>e.event_id===button.dataset.event);if(e)selectEvent(e);}else if(button.dataset.sort){state.descending=state.sort===button.dataset.sort?!state.descending:button.dataset.sort!=='username';state.sort=button.dataset.sort;renderStats();}else if(button.dataset.match){const matchId=button.dataset.match,matchMs=Number(button.dataset.matchMs),eventId=button.dataset.eventId;selectMatch(matchId).then(()=>{if(state.match?.match_id!==matchId)return;const target=eventId?state.match.timeline?.find(row=>row.event_id===eventId):null;if(target)selectEvent(target);else if(Number.isFinite(matchMs))move(matchMs);});showView('replay');window.scrollTo({top:0,behavior:'smooth'});}});
  document.addEventListener('keydown',e=>{if(e.target.matches('[data-player]')&&['Enter',' '].includes(e.key)){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));return;}if(state.match&&state.view==='replay'&&['ArrowLeft','ArrowRight'].includes(e.key)&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();move(state.time+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?1000:100));return;}if(state.match&&e.code==='Space'&&!['INPUT','SELECT','BUTTON','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(state.time>=state.match.window.duration_ms)state.time=0;setPlaying(!state.playing);}});document.addEventListener('visibilitychange',()=>{if(document.hidden)setPlaying(false);});
  document.addEventListener('error',event=>{if(event.target instanceof HTMLImageElement){failedHeads.add(event.target.getAttribute('src'));event.target.hidden=true;}},true);
  for(const id of ['show-kick-effects','show-pass','show-pass-failure','show-dribble','show-pass-detail','show-territory','show-feed']){const input=$('#'+id);if(input)input.onchange=renderFrame;}
  $('#focus-mode').onclick=()=>{const active=$('#view-replay').classList.toggle('focused');$('#focus-mode').setAttribute('aria-pressed',String(active));$('#focus-mode').textContent=active?'一覧も表示':'コートを広く';};
  let last=null;function frame(now){if(state.playing){if(last!==null)state.time=Math.min(state.match.window.duration_ms,state.time+(now-last)*state.rate);renderFrame();if(state.time>=state.match.window.duration_ms)setPlaying(false);}last=state.playing?now:null;requestAnimationFrame(frame);}
  $('#match-select').innerHTML=matches.map(m=>`<option value="${esc(m.match_id)}">${esc(date(m))} · ${fmt(m.score?.red)}–${fmt(m.score?.blue)}</option>`).join('');renderLibrary();if(matches.length)selectMatch(matches[0].match_id);else{$('#load-status').textContent='試合データがありません';$('#play').disabled=true;}requestAnimationFrame(frame);
})();
