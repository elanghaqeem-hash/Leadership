import type {
  ActionValidity,
  AuctionProgram,
  AuctionRound,
  BoardroomCategory,
  FollowUpStatus,
  MetricDirection,
  PlannerBufferStatus,
  PriorityInput,
  PriorityLevel,
  PriorityWeights,
} from './types.js';

export const DEFAULT_PRIORITY_WEIGHTS: PriorityWeights = {
  urgency: 0.20, business: 0.15, customer: 0.20, risk: 0.20, compliance: 0.15, strategic: 0.10,
};

const assertScale1to5 = (value: number, field: string) => {
  if (!Number.isFinite(value) || value < 1 || value > 5) throw new Error(`${field} must be between 1 and 5`);
};

export function scorePriority(input: PriorityInput, weights: PriorityWeights = DEFAULT_PRIORITY_WEIGHTS) {
  Object.entries(input).forEach(([k, v]) => assertScale1to5(v, k));
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('Priority weights must sum to > 0');
  const weightedScore = (
    input.urgency * weights.urgency + input.business * weights.business +
    input.customer * weights.customer + input.risk * weights.risk +
    input.compliance * weights.compliance + input.strategic * weights.strategic
  ) / totalWeight;
  const override = input.risk === 5 || input.compliance === 5;
  const level: PriorityLevel = override || weightedScore >= 4 ? 'P1' : weightedScore >= 3 ? 'P2' : weightedScore >= 2 ? 'P3' : 'P4';
  const action = level === 'P1' ? 'DO / eskalasi hari ini' : level === 'P2' ? 'PLAN: time block minggu ini' : level === 'P3' ? 'DELEGATE dengan contract' : 'ELIMINATE / batch';
  return { weightedScore, level, override, action };
}

export function evaluatePlannerBuffer(nonBreakMinutes:number, bufferMinutes:number, minPct=0.15, maxPct=0.20) {
  if (nonBreakMinutes <= 0) throw new Error('nonBreakMinutes must be > 0');
  const ratio = bufferMinutes / nonBreakMinutes;
  const status: PlannerBufferStatus = ratio < minPct ? 'LOW' : ratio > maxPct ? 'HIGH' : 'IDEAL';
  return { ratio, percent: ratio*100, status, label: status==='IDEAL'?'IDEAL':status==='LOW'?'Kurang buffer':'Buffer berlebih', warning:status!=='IDEAL' };
}

export function evaluatePlannerFocus(nonBreakMinutes:number, focusMinutes:number, minPct=0.20) {
  if (nonBreakMinutes <= 0) throw new Error('nonBreakMinutes must be > 0');
  const ratio=focusMinutes/nonBreakMinutes;
  return {ratio,enough:ratio>=minPct,label:ratio>=minPct?'Focus cukup' as const:'Tambah focus block' as const};
}

export function validateRaciRow(assignments:Array<'R'|'A'|'C'|'I'|''>) {
  const accountableCount=assignments.filter(x=>x==='A').length;
  return accountableCount===1 ? {valid:true,accountableCount,label:'OK (1 A)' as const} : {valid:false,accountableCount,label:'Harus tepat 1 A' as const};
}

export interface ActionTrackerItem { action?:string|null; owner?:string|null; deadline?:string|null; evidence?:string|null; status?:string|null; }

export function validateActionItem(item:ActionTrackerItem): ActionValidity|null {
  if (!item.action?.trim()) return null;
  return item.owner?.trim() && item.deadline && item.evidence?.trim() ? 'VALID' : 'INVALID';
}

export function isActionOverdue(item:ActionTrackerItem,todayISO:string):boolean|null {
  if (!item.action?.trim() || !item.deadline) return null;
  if ((item.status??'')==='Done') return false;
  const deadline=new Date(`${item.deadline}T00:00:00Z`);
  const today=new Date(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(deadline.getTime())||Number.isNaN(today.getTime())) throw new Error('Invalid ISO date');
  return deadline<today;
}

export function actionTrackerSummary(items:ActionTrackerItem[],todayISO:string) {
  const totalActions=items.filter(x=>Boolean(x.action?.trim())).length;
  const doneCount=items.filter(x=>x.status==='Done').length;
  return {
    totalActions, doneCount, closureRate:totalActions===0?0:doneCount/totalActions,
    overdueCount:items.filter(x=>isActionOverdue(x,todayISO)===true).length,
    invalidCount:items.filter(x=>validateActionItem(x)==='INVALID').length
  };
}

export function closureRateValidOnly(items:ActionTrackerItem[]):number|null {
  const valid=items.filter(x=>validateActionItem(x)==='VALID');
  return valid.length ? valid.filter(x=>x.status==='Done').length/valid.length : null;
}

export type ArenaDecision='Do'|'Delegate'|'Escalate'|'Defer';
export type ArenaDimension='Business'|'Customer'|'Risk'|'People'|'Execution';
export interface ArenaEventInput {dimension:ArenaDimension;best:ArenaDecision;acceptable:ArenaDecision;doMinutes:number;selected:ArenaDecision;}
export const DEFAULT_ARENA_MINUTES={Delegate:15,Escalate:10,Defer:0} as const;

export function scoreArenaEvent(event:ArenaEventInput,minutes=DEFAULT_ARENA_MINUTES) {
  const points=event.selected===event.best?10:event.selected===event.acceptable?5:0;
  const usedMinutes=event.selected==='Do'?event.doMinutes:event.selected==='Delegate'?minutes.Delegate:event.selected==='Escalate'?minutes.Escalate:minutes.Defer;
  return {points,minutes:usedMinutes,riskPenalty:event.dimension==='Risk'&&event.selected==='Defer'?-10:0};
}

export function scoreArena(events:ArenaEventInput[],minutes=DEFAULT_ARENA_MINUTES) {
  const categoryScores:Record<ArenaDimension,number>={Business:0,Customer:0,Risk:0,People:0,Execution:0};
  let totalMinutes=0,riskPenalty=0,escalateDeferCount=0;
  for(const event of events){const r=scoreArenaEvent(event,minutes);categoryScores[event.dimension]+=r.points;totalMinutes+=r.minutes;riskPenalty+=r.riskPenalty;if(event.selected==='Escalate'||event.selected==='Defer')escalateDeferCount++;}
  const executionPenalty=(totalMinutes>480?-15:0)+(escalateDeferCount>8?-10:0);
  const total=Object.values(categoryScores).reduce((a,b)=>a+b,0)+riskPenalty+executionPenalty;
  const vals=Object.values(categoryScores),max=Math.max(...vals,0),min=Math.min(...vals);
  return {categoryScores,totalMinutes,riskPenalty,executionPenalty,total,balanceIndex:max===0?0:min/max,escalateDeferCount};
}

export const DEFAULT_AUCTION_PROGRAMS:AuctionProgram[]=[
{id:'hire_staff',cost:300,benefit:350,risk:1,uncertainty:1,factors:{r1:1,r2:1,r3:1.4}},
{id:'automation',cost:450,benefit:650,risk:2,uncertainty:3,factors:{r1:.4,r2:1,r3:1}},
{id:'training',cost:150,benefit:220,risk:1,uncertainty:2,factors:{r1:1,r2:1,r3:1.3}},
{id:'process_redesign',cost:250,benefit:420,risk:2,uncertainty:2,factors:{r1:1,r2:1.1,r3:1}},
{id:'marketing_campaign',cost:300,benefit:380,risk:2,uncertainty:3,factors:{r1:1,r2:.8,r3:1}},
{id:'collection_improvement',cost:200,benefit:380,risk:1,uncertainty:2,factors:{r1:1,r2:1.5,r3:1}},
{id:'system_upgrade',cost:500,benefit:700,risk:3,uncertainty:3,factors:{r1:.7,r2:1,r3:1}},
];

export function scoreDecisionAuction(rounds:AuctionRound[],programs:AuctionProgram[]=DEFAULT_AUCTION_PROGRAMS,config={budget:1000,maxActive:3,switchingRate:.10}) {
 const byId=new Map(programs.map(p=>[p.id,p]));
 const rr=(['R0','R1','R2','R3'] as const).map(round=>rounds.find(x=>x.round===round));
 if(rr.some(x=>!x)) throw new Error('Rounds R0-R3 are required');
 const rounds4=rr as AuctionRound[];
 const resolve=(ids:string[])=>ids.map(id=>{const p=byId.get(id);if(!p)throw new Error(`Unknown program: ${id}`);return p;});
 const cost=(ids:string[])=>resolve(ids).reduce((s,p)=>s+p.cost,0);
 const r0Cost=cost(rounds4[0].activeProgramIds),finalPrograms=resolve(rounds4[3].activeProgramIds);
 const r3Cost=finalPrograms.reduce((s,p)=>s+p.cost,0),r3ProgramCount=finalPrograms.length;
 const validR3=r3Cost<=config.budget&&r3ProgramCount<=config.maxActive;
 let switchingCost=0;
 for(let i=0;i<3;i++){const prev=new Set(rounds4[i].activeProgramIds),next=new Set(rounds4[i+1].activeProgramIds);for(const id of prev)if(!next.has(id))switchingCost+=(byId.get(id)?.cost??0)*config.switchingRate;}
 const finalBenefit=finalPrograms.reduce((s,p)=>s+p.benefit*p.factors.r1*p.factors.r2*p.factors.r3,0);
 const riskExposure=finalPrograms.reduce((s,p)=>s+p.risk,0);
 return {validR3,r0Cost,r3Cost,r3ProgramCount,finalBenefit,finalProgramCost:r3Cost,switchingCost,riskExposure,net:validR3?finalBenefit-switchingCost-r3Cost:0};
}

export interface WarRoomDimensionScore {code:string;max:number;score:number;}
export function scoreWarRoom(dimensions:WarRoomDimensionScore[]) {
 const maxTotal=dimensions.reduce((s,d)=>s+d.max,0);if(Math.abs(maxTotal-100)>1e-9)throw new Error('War Room maximums must sum to 100');
 dimensions.forEach(d=>{if(d.max<=0||d.score<0||d.score>d.max)throw new Error(`Invalid score for ${d.code}`);});
 const total=dimensions.reduce((s,d)=>s+d.score,0),normalized=dimensions.map(d=>({code:d.code,ratio:d.score/d.max}));
 const weakest=normalized.length?normalized.reduce((a,b)=>b.ratio<a.ratio?b:a):null;
 return {total,weakestDimension:weakest?.code??null,weakestPercent:weakest?weakest.ratio*100:null,normalized};
}
export function rankWarRoomTotals(totals:number[]){return totals.map(v=>1+totals.filter(x=>x>v).length);}

export function scoreBoardroom(scores:number[]) {
 if(scores.length!==6)throw new Error('Boardroom requires exactly 6 criteria');
 scores.forEach((v,i)=>assertScale1to5(v,`criterion[${i}]`));
 const total=scores.reduce((a,b)=>a+b,0),ratio=total/30;
 const category:BoardroomCategory=ratio>=.8?'BOARDROOM_READY':ratio>=.6?'BERKEMBANG':'PERLU_LATIHAN';
 return {total,ratio,percent:ratio*100,category};
}
export function scoreTestAnswers(answers:string[],key:string[]):number|null {
 if(answers.length!==key.length)throw new Error('Answers and key lengths must match');
 if(answers.every(x=>!x?.trim()))return null;
 return answers.reduce((sum,a,i)=>sum+(a.trim().toUpperCase()===key[i].trim().toUpperCase()?1:0),0)*5;
}
export function scoreTest(correctAnswers:number,questionCount=20,pointsPerQuestion=5){if(!Number.isInteger(correctAnswers)||correctAnswers<0||correctAnswers>questionCount)throw new Error('Invalid correct answer count');return correctAnswers*pointsPerQuestion;}
export function testGain(preScore:number,postScore:number){return postScore-preScore;}
export function managerFollowUpStatusFromRatio(progressRatio:number):FollowUpStatus {if(progressRatio<0||progressRatio>1)throw new Error('progressRatio must be 0..1');return progressRatio>=.8?'ON_TRACK':progressRatio>=.5?'PERLU_DORONGAN':'PERLU_INTERVENSI';}
export function managerFollowUpStatus(progressPct:number):FollowUpStatus {if(progressPct<0||progressPct>100)throw new Error('progressPct must be 0..100');return managerFollowUpStatusFromRatio(progressPct/100);}
export function impactMetric(baseline:number,day30:number,direction:MetricDirection) {
 if(baseline===0)return {percentChange:null,status:null,reason:'BASELINE_ZERO' as const};
 const percentChange=(day30-baseline)/baseline;
 const better=direction==='UP_IS_BETTER'?day30>baseline:day30<baseline;
 return {percentChange,status:better?'MEMBAIK' as const:'BELUM' as const};
}
export function scoreDetectiveRoom(diagnosisCorrect:boolean,relevantEvidenceCount:number,remainingTokens:number) {
 if(relevantEvidenceCount<0||remainingTokens<0)throw new Error('Counts cannot be negative');
 const diagnosisPoints=diagnosisCorrect?40:0,evidencePoints=relevantEvidenceCount*5,tokenPoints=remainingTokens*2;
 return {total:diagnosisPoints+evidencePoints+tokenPoints,diagnosisPoints,evidencePoints,tokenPoints};
}
