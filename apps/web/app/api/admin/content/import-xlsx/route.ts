import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

type ContentRow={code:string;type:string;version:number;title:string;isPublished:boolean;payload:Prisma.InputJsonValue;answerKey:Prisma.InputJsonValue|null};
type RubricRow={code:string;version:number;name:string;isPublished:boolean;dimensions:Prisma.InputJsonValue};
type QuestionRow={
  testCode:string;testVersion:number;testName:string;durationSec:number|null;questionCode:string;sequence:number;
  prompt:string;options:Prisma.InputJsonValue;answerKey:string;explanation:string|null;points:number;
};

function scalar(value:ExcelJS.CellValue):string{
  if(value===null||value===undefined)return'';
  if(value instanceof Date)return value.toISOString();
  if(typeof value==='object'){
    if('text' in value&&typeof (value as any).text==='string')return (value as any).text;
    if('result' in value)return String((value as any).result??'');
    if('richText' in value)return (value as any).richText.map((x:any)=>x.text).join('');
    if('formula' in value)return String((value as any).result??'');
  }
  return String(value);
}
function bool(value:string){
  const v=value.trim().toLowerCase();
  return['true','1','yes','y','ya'].includes(v);
}
function int(value:string,label:string,min=1){
  const n=Number(value);
  if(!Number.isInteger(n)||n<min)throw new Error(label+' harus integer >= '+min);
  return n;
}
function optionalInt(value:string,label:string){
  if(!value.trim())return null;
  return int(value,label,1);
}
function parseJson(value:string,label:string):Prisma.InputJsonValue{
  try{
    const parsed=JSON.parse(value);
    if(parsed===null)throw new Error('null');
    return parsed as Prisma.InputJsonValue;
  }catch{throw new Error(label+' harus JSON valid dan tidak boleh null');}
}
function optionalJson(value:string,label:string):Prisma.InputJsonValue|null{
  if(!value.trim())return null;
  return parseJson(value,label);
}
function rowsByHeader(ws:ExcelJS.Worksheet){
  const headerRow=ws.getRow(1);
  const headers=new Map<string,number>();
  headerRow.eachCell((cell,col)=>headers.set(scalar(cell.value).trim(),col));
  const out:Array<Record<string,string>>=[];
  for(let rowNo=2;rowNo<=ws.rowCount;rowNo++){
    const row=ws.getRow(rowNo);
    const record:Record<string,string>={};
    let nonEmpty=false;
    for(const [name,col] of headers){
      const value=scalar(row.getCell(col).value).trim();
      record[name]=value;
      if(value)nonEmpty=true;
    }
    if(nonEmpty)out.push(record);
  }
  return out;
}
function required(record:Record<string,string>,key:string,rowNo:number){
  const value=record[key]?.trim();
  if(!value)throw new Error(`Row ${rowNo}: ${key} wajib diisi`);
  return value;
}

export async function POST(req:Request){
  try{
    const actor=await assertPermission('CONTENT_MANAGE',{});
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof File))throw new HttpError('File XLSX wajib diunggah',400);
    if(file.size>5*1024*1024)throw new HttpError('File content import maksimal 5 MB',413);
    if(!/\.xlsx$/i.test(file.name))throw new HttpError('Gunakan file .xlsx',400);
    const dryRun=new URL(req.url).searchParams.get('dryRun')==='1';

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);

    const contentRows:ContentRow[]=[];
    const rubricRows:RubricRow[]=[];
    const questionRows:QuestionRow[]=[];
    const errors:string[]=[];

    const contentWs=wb.getWorksheet('Content Items');
    if(contentWs){
      rowsByHeader(contentWs).forEach((r,i)=>{
        try{
          contentRows.push({
            code:required(r,'Code',i+2),type:required(r,'Type',i+2),version:int(required(r,'Version',i+2),'Version'),
            title:required(r,'Title',i+2),isPublished:bool(r.IsPublished||'false'),
            payload:parseJson(required(r,'PayloadJSON',i+2),'PayloadJSON row '+(i+2)),
            answerKey:optionalJson(r.AnswerKeyJSON||'','AnswerKeyJSON row '+(i+2)),
          });
        }catch(e){errors.push(e instanceof Error?e.message:String(e));}
      });
    }

    const rubricWs=wb.getWorksheet('Rubrics');
    if(rubricWs){
      rowsByHeader(rubricWs).forEach((r,i)=>{
        try{
          rubricRows.push({
            code:required(r,'Code',i+2),version:int(required(r,'Version',i+2),'Version'),
            name:required(r,'Name',i+2),isPublished:bool(r.IsPublished||'false'),
            dimensions:parseJson(required(r,'DimensionsJSON',i+2),'DimensionsJSON row '+(i+2)),
          });
        }catch(e){errors.push(e instanceof Error?e.message:String(e));}
      });
    }

    const testWs=wb.getWorksheet('Test Questions');
    if(testWs){
      rowsByHeader(testWs).forEach((r,i)=>{
        try{
          questionRows.push({
            testCode:required(r,'TestCode',i+2),testVersion:int(required(r,'TestVersion',i+2),'TestVersion'),
            testName:required(r,'TestName',i+2),durationSec:optionalInt(r.DurationSec||'','DurationSec'),
            questionCode:required(r,'QuestionCode',i+2),sequence:int(required(r,'Sequence',i+2),'Sequence'),
            prompt:required(r,'Prompt',i+2),options:parseJson(required(r,'OptionsJSON',i+2),'OptionsJSON row '+(i+2)),
            answerKey:required(r,'AnswerKey',i+2),explanation:r.Explanation?.trim()||null,
            points:int(required(r,'Points',i+2),'Points'),
          });
        }catch(e){errors.push(e instanceof Error?e.message:String(e));}
      });
    }

    if(contentRows.length+rubricRows.length+questionRows.length===0){
      errors.push('Tidak ada data pada sheet Content Items, Rubrics, atau Test Questions.');
    }
    const duplicate=(items:string[])=>items.filter((x,i)=>items.indexOf(x)!==i);
    const dupContent=duplicate(contentRows.map(x=>x.code+'@'+x.version));
    const dupRubrics=duplicate(rubricRows.map(x=>x.code+'@'+x.version));
    const dupQuestions=duplicate(questionRows.map(x=>x.testCode+'@'+x.testVersion+':'+x.questionCode));
    if(dupContent.length)errors.push('Duplicate Content Items: '+[...new Set(dupContent)].join(', '));
    if(dupRubrics.length)errors.push('Duplicate Rubrics: '+[...new Set(dupRubrics)].join(', '));
    if(dupQuestions.length)errors.push('Duplicate Test Questions: '+[...new Set(dupQuestions)].join(', '));

    if(errors.length){
      return NextResponse.json({ok:false,dryRun,errors,summary:{contentItems:contentRows.length,rubrics:rubricRows.length,questions:questionRows.length}},{status:400});
    }
    if(dryRun){
      return NextResponse.json({ok:true,dryRun:true,errors:[],summary:{contentItems:contentRows.length,rubrics:rubricRows.length,questions:questionRows.length}});
    }

    await prisma.$transaction(async tx=>{
      for(const item of contentRows){
        const existing=await tx.contentItem.findFirst({where:{tenantId:null,code:item.code,version:item.version},select:{id:true}});
        const data={
          type:item.type,title:item.title,payload:item.payload,
          answerKey:item.answerKey===null?Prisma.DbNull:item.answerKey,
          isPublished:item.isPublished,
        };
        if(existing)await tx.contentItem.update({where:{id:existing.id},data});
        else await tx.contentItem.create({data:{tenantId:null,code:item.code,version:item.version,...data}});
      }

      for(const rubric of rubricRows){
        const existing=await tx.rubric.findFirst({where:{tenantId:null,code:rubric.code,version:rubric.version},select:{id:true}});
        const data={name:rubric.name,dimensions:rubric.dimensions,isPublished:rubric.isPublished};
        if(existing)await tx.rubric.update({where:{id:existing.id},data});
        else await tx.rubric.create({data:{tenantId:null,code:rubric.code,version:rubric.version,...data}});
      }

      const groups=new Map<string,QuestionRow[]>();
      for(const q of questionRows){
        const key=q.testCode+'@'+q.testVersion;
        const rows=groups.get(key)??[];rows.push(q);groups.set(key,rows);
      }
      for(const rows of groups.values()){
        const first=rows[0];
        let test=await tx.test.findFirst({where:{tenantId:null,code:first.testCode,version:first.testVersion}});
        if(test)test=await tx.test.update({where:{id:test.id},data:{name:first.testName,durationSec:first.durationSec}});
        else test=await tx.test.create({data:{tenantId:null,code:first.testCode,version:first.testVersion,name:first.testName,durationSec:first.durationSec}});
        for(const q of rows){
          await tx.question.upsert({
            where:{testId_code:{testId:test.id,code:q.questionCode}},
            create:{testId:test.id,code:q.questionCode,prompt:q.prompt,options:q.options,answerKey:q.answerKey,explanation:q.explanation,points:q.points,sequence:q.sequence},
            update:{prompt:q.prompt,options:q.options,answerKey:q.answerKey,explanation:q.explanation,points:q.points,sequence:q.sequence},
          });
        }
      }

      await tx.auditLog.create({data:{
        actorUserId:actor.id,action:'UPDATE',resourceType:'MasterContentImport',
        metadata:{fileName:file.name,contentItems:contentRows.length,rubrics:rubricRows.length,questions:questionRows.length},
      }});
    });

    return NextResponse.json({ok:true,dryRun:false,summary:{contentItems:contentRows.length,rubrics:rubricRows.length,questions:questionRows.length}});
  }catch(e){return jsonError(e)}
}
