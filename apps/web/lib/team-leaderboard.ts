import { prisma } from '@ltw/db';
import { scoreArena, scoreBoardroom, scoreDecisionAuction, scoreWarRoom, type ArenaDecision, type ArenaDimension, type AuctionProgram, type AuctionRound } from '@ltw/scoring';

type Team={id:string;name:string;number:number};
type ScoreRow={team:Team;complete:boolean;nativeScore:number|null;rank:number|null;rankPoints:number;detail?:Record<string,unknown>};
type GameStanding={activityId:string;type:string;code:string;title:string;source:'EXCEL_NATIVE'|'RUBRIC'|'COMPLETION_ONLY';rows:ScoreRow[]};

const scoredTypes=['ARENA','WAR_ROOM','DETECTIVE_ROOM','DECISION_AUCTION','BOARDROOM'] as const;
const trackedTypes=[...scoredTypes,'CALENDAR_TETRIS'] as const;

function competitionRanks(values:Array<number|null>){
  return values.map(v=>v===null?null:1+values.filter(x=>x!==null&&x>v).length);
}
function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}

async function arenaStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const cfg=activity.config as {contentCode?:unknown};
  const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'ARENA_EVENTS_V1';
  const content=await prisma.contentItem.findFirst({
    where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
    orderBy:{version:'desc'},select:{payload:true,answerKey:true},
  });
  const payload=content?.payload as {events?:Array<{no:number;dimension:ArenaDimension;doMinutes:number}>}|undefined;
  const key=content?.answerKey as {events?:Array<{no:number;best:ArenaDecision;acceptable:ArenaDecision}>}|undefined;
  const rows=await prisma.submission.findMany({
    where:{activityId:activity.id,ownerType:'TEAM',submissionKey:{startsWith:`arena:${activity.id}:`}},
    select:{teamId:true,payload:true},
  });
  const eventMap=new Map((payload?.events||[]).map(e=>[e.no,e]));
  const keyMap=new Map((key?.events||[]).map(e=>[e.no,e]));
  const values=teams.map(team=>{
    const decisions=rows.filter(r=>r.teamId===team.id).map(r=>r.payload as {eventNo?:number;decision?:ArenaDecision});
    const inputs=decisions.flatMap(d=>{
      if(typeof d.eventNo!=='number'||!d.decision)return[];
      const e=eventMap.get(d.eventNo),k=keyMap.get(d.eventNo);
      if(!e||!k)return[];
      return[{dimension:e.dimension,best:k.best,acceptable:k.acceptable,doMinutes:e.doMinutes,selected:d.decision}];
    });
    if(!inputs.length)return{team,complete:false,nativeScore:null,detail:{decisions:0}};
    const score=scoreArena(inputs);
    return{team,complete:true,nativeScore:score.total,detail:{decisions:inputs.length,totalMinutes:score.totalMinutes,balanceIndex:score.balanceIndex}};
  });
  const ranks=competitionRanks(values.map(x=>x.nativeScore));
  return{activityId:activity.id,type:activity.type,code:'ARENA',title:activity.title,source:'EXCEL_NATIVE',rows:values.map((x,i)=>({...x,rank:ranks[i],rankPoints:0}))};
}

async function warStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const rubric=await prisma.rubric.findFirst({where:{tenantId:null,code:'WAR_ROOM',version:1,isPublished:true},select:{id:true,dimensions:true}});
  if(!rubric)return{activityId:activity.id,type:activity.type,code:'WAR_ROOM',title:activity.title,source:'RUBRIC',rows:teams.map(team=>({team,complete:false,nativeScore:null,rank:null,rankPoints:0}))};
  const dims=(rubric.dimensions as Array<{name:string;max:number}>).map(d=>({code:slug(d.name),max:Number(d.max)}));
  const scores=await prisma.rubricScore.findMany({where:{activityId:activity.id,rubricId:rubric.id},select:{teamId:true,dimensionCode:true,rawValue:true}});
  const values=teams.map(team=>{
    const dimValues=dims.map(dim=>{
      const found=scores.filter(s=>s.teamId===team.id&&s.dimensionCode===dim.code);
      const score=found.length?found.reduce((sum,r)=>sum+Number(r.rawValue),0)/found.length:0;
      return{code:dim.code,max:dim.max,score,has:found.length>0};
    });
    const complete=dimValues.every(x=>x.has);
    const result=complete?scoreWarRoom(dimValues.map(({code,max,score})=>({code,max,score}))):null;
    return{team,complete,nativeScore:result?.total??null,detail:result?{weakestDimension:result.weakestDimension,weakestPercent:result.weakestPercent}:{}};
  });
  const ranks=competitionRanks(values.map(x=>x.nativeScore));
  return{activityId:activity.id,type:activity.type,code:'WAR_ROOM',title:activity.title,source:'RUBRIC',rows:values.map((x,i)=>({...x,rank:ranks[i],rankPoints:0}))};
}

async function detectiveStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const submissions=await prisma.submission.findMany({
    where:{activityId:activity.id,ownerType:'TEAM',submissionKey:{startsWith:`detective:${activity.id}:`}},
    select:{teamId:true,score:true,scoreDetail:true,payload:true},
  });
  const values=teams.map(team=>{
    const row=submissions.find(s=>s.teamId===team.id);
    const state=(row?.payload||{}) as {diagnosisCorrect?:unknown;purchased?:unknown[]};
    const complete=typeof state.diagnosisCorrect==='boolean'&&row?.score!==null&&row?.score!==undefined;
    return{team,complete,nativeScore:complete?Number(row!.score):null,detail:{evidenceCount:Array.isArray(state.purchased)?state.purchased.length:0,diagnosisCorrect:state.diagnosisCorrect===true}};
  });
  const ranks=competitionRanks(values.map(x=>x.nativeScore));
  return{activityId:activity.id,type:activity.type,code:'G7',title:activity.title,source:'EXCEL_NATIVE',rows:values.map((x,i)=>({...x,rank:ranks[i],rankPoints:0}))};
}

async function auctionStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const cfg=activity.config as {contentCode?:unknown};
  const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'DECISION_AUCTION_V1';
  const content=await prisma.contentItem.findFirst({
    where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
    orderBy:{version:'desc'},select:{payload:true,answerKey:true},
  });
  const payload=content?.payload as {budget:number;switchingRate:number;maxActive:number;programs:Array<{id:string;name:string;cost:number;benefit:number;risk:number;uncertainty:number}>}|undefined;
  const key=content?.answerKey as {factors?:Record<string,{r1:number;r2:number;r3:number}>}|undefined;
  const submissions=await prisma.submission.findMany({
    where:{activityId:activity.id,ownerType:'TEAM',submissionKey:{startsWith:`auction:${activity.id}:`}},
    select:{teamId:true,payload:true},
  });
  if(!payload||!key?.factors){
    return{activityId:activity.id,type:activity.type,code:'G10',title:activity.title,source:'EXCEL_NATIVE',rows:teams.map(team=>({team,complete:false,nativeScore:null,rank:null,rankPoints:0}))};
  }
  const programs:AuctionProgram[]=payload.programs.map(p=>({...p,factors:key.factors![p.id]})).filter(p=>Boolean(p.factors));
  const names=['R0','R1','R2','R3'] as const;
  const values=teams.map(team=>{
    const rr:AuctionRound[]=names.map(round=>{
      const row=submissions.find(s=>s.teamId===team.id&&(s.payload as any)?.round===round);
      return{round,activeProgramIds:Array.isArray((row?.payload as any)?.activeProgramIds)?(row!.payload as any).activeProgramIds:[]};
    });
    const complete=names.every(round=>submissions.some(s=>s.teamId===team.id&&(s.payload as any)?.round===round));
    const result=complete?scoreDecisionAuction(rr,programs,{budget:payload.budget,maxActive:payload.maxActive,switchingRate:payload.switchingRate}):null;
    return{team,complete,nativeScore:result?.net??null,detail:result?{validR3:result.validR3,switchingCost:result.switchingCost,riskExposure:result.riskExposure}:{}};
  });
  const ranks=competitionRanks(values.map(x=>x.nativeScore));
  return{activityId:activity.id,type:activity.type,code:'G10',title:activity.title,source:'EXCEL_NATIVE',rows:values.map((x,i)=>({...x,rank:ranks[i],rankPoints:0}))};
}

async function boardroomStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const rubric=await prisma.rubric.findFirst({where:{tenantId:null,code:'BOARDROOM',version:1,isPublished:true},select:{id:true,dimensions:true}});
  const dimensions=rubric?.dimensions as {criteria?:string[]}|undefined;
  const criteria=Array.isArray(dimensions?.criteria)?dimensions!.criteria!.map(String):[];
  if(!rubric||criteria.length!==6)return{activityId:activity.id,type:activity.type,code:'G11',title:activity.title,source:'RUBRIC',rows:teams.map(team=>({team,complete:false,nativeScore:null,rank:null,rankPoints:0}))};
  const specs=criteria.map(name=>({name,code:slug(name)}));
  const scores=await prisma.rubricScore.findMany({where:{activityId:activity.id,rubricId:rubric.id},select:{teamId:true,dimensionCode:true,rawValue:true}});
  const values=teams.map(team=>{
    const values=specs.map(spec=>{
      const found=scores.filter(s=>s.teamId===team.id&&s.dimensionCode===spec.code);
      return{has:found.length>0,value:found.length?found.reduce((sum,r)=>sum+Number(r.rawValue),0)/found.length:0};
    });
    const complete=values.every(x=>x.has);
    const result=complete?scoreBoardroom(values.map(x=>x.value)):null;
    return{team,complete,nativeScore:result?.percent??null,detail:result?{rawTotal:result.total,category:result.category}:{}};
  });
  const ranks=competitionRanks(values.map(x=>x.nativeScore));
  return{activityId:activity.id,type:activity.type,code:'G11',title:activity.title,source:'RUBRIC',rows:values.map((x,i)=>({...x,rank:ranks[i],rankPoints:0}))};
}

async function calendarStanding(activity:any,teams:Team[]):Promise<GameStanding>{
  const rows=await prisma.submission.findMany({
    where:{activityId:activity.id,ownerType:'TEAM',submissionKey:{startsWith:`calendar:${activity.id}:`}},
    select:{teamId:true,payload:true},
  });
  return{
    activityId:activity.id,type:activity.type,code:'G4',title:activity.title,source:'COMPLETION_ONLY',
    rows:teams.map(team=>{
      const row=rows.find(r=>r.teamId===team.id);
      const placements=Array.isArray((row?.payload as any)?.placements)?(row!.payload as any).placements.length:0;
      return{team,complete:Boolean(row),nativeScore:null,rank:null,rankPoints:0,detail:{placements}};
    }),
  };
}

export async function buildTeamLeaderboard(batchId:string){
  const [batch,teams,activities]=await Promise.all([
    prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}}),
    prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}}),
    prisma.activity.findMany({where:{batchId,type:{in:[...trackedTypes]}},orderBy:{sequence:'asc'},select:{id:true,tenantId:true,type:true,title:true,config:true,status:true,sequence:true}}),
  ]);
  if(!batch)return null;

  const standings:GameStanding[]=[];
  for(const activity of activities){
    if(activity.type==='ARENA')standings.push(await arenaStanding(activity,teams));
    else if(activity.type==='WAR_ROOM')standings.push(await warStanding(activity,teams));
    else if(activity.type==='DETECTIVE_ROOM')standings.push(await detectiveStanding(activity,teams));
    else if(activity.type==='DECISION_AUCTION')standings.push(await auctionStanding(activity,teams));
    else if(activity.type==='BOARDROOM')standings.push(await boardroomStanding(activity,teams));
    else if(activity.type==='CALENDAR_TETRIS')standings.push(await calendarStanding(activity,teams));
  }

  for(const game of standings){
    if(game.source==='COMPLETION_ONLY')continue;
    const ranked=game.rows.filter(r=>r.rank!==null);
    for(const row of ranked)row.rankPoints=Math.max(0,teams.length-(row.rank||teams.length)+1);
  }

  const overall=teams.map(team=>{
    const perGame=standings.map(game=>{
      const row=game.rows.find(r=>r.team.id===team.id)!;
      return{code:game.code,title:game.title,type:game.type,source:game.source,complete:row.complete,nativeScore:row.nativeScore,rank:row.rank,rankPoints:row.rankPoints,detail:row.detail||{}};
    });
    const scoreGames=perGame.filter(g=>g.source!=='COMPLETION_ONLY'&&g.rank!==null);
    const completionGames=perGame.filter(g=>g.complete);
    return{team,rankPoints:scoreGames.reduce((s,g)=>s+g.rankPoints,0),scoredGames:scoreGames.length,completedGames:completionGames.length,perGame};
  });
  overall.sort((a,b)=>b.rankPoints-a.rankPoints||b.scoredGames-a.scoredGames||a.team.number-b.team.number);
  const ranks=competitionRanks(overall.map(x=>x.rankPoints));
  const rankedOverall=overall.map((x,i)=>({...x,rank:ranks[i]||i+1}));

  return{
    batch,
    meta:{
      method:'RANK_POINTS',
      operationalOnly:true,
      note:'Composite leaderboard uses relative rank points across scored games. Calendar Tetris is completion-only because the source workbook defines no scoring rubric.',
      tracked:['ARENA','G4','G7','G10','G11','WAR_ROOM'],
    },
    games:standings,
    overall:rankedOverall,
  };
}
