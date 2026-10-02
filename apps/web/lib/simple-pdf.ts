const PAGE_W = 595.28;
const PAGE_H = 841.89;

type DrawCommand =
  | { kind:'text'; x:number; y:number; text:string; size:number; bold:boolean }
  | { kind:'line'; x1:number; y1:number; x2:number; y2:number; width:number }
  | { kind:'rect'; x:number; y:number; w:number; h:number; fillGray?:number; strokeGray?:number; width?:number };

function sanitize(value:string){
  return value
    .replace(/[–—]/g,'-')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/…/g,'...')
    .replace(/×/g,'x')
    .replace(/→/g,'->')
    .replace(/≥/g,'>=')
    .replace(/≤/g,'<=')
    .replace(/[^ -~ -ÿ]/g,'?');
}

function pdfString(value:string){
  return sanitize(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

function fmt(n:number){
  return Number.isInteger(n)?String(n):n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'');
}

export function wrapPdfText(value:string,maxChars:number){
  const words=sanitize(value).split(/\s+/).filter(Boolean);
  const lines:string[]=[];
  let line='';
  for(const word of words){
    if(!line){line=word;continue;}
    if((line+' '+word).length<=maxChars){line+=' '+word;continue;}
    lines.push(line);line=word;
  }
  if(line)lines.push(line);
  return lines.length?lines:[''];
}

export class SimplePdfPage {
  private commands:DrawCommand[]=[];
  readonly width=PAGE_W;
  readonly height=PAGE_H;

  text(x:number,y:number,text:string,size=10,bold=false){
    this.commands.push({kind:'text',x,y,text,size,bold});
    return this;
  }

  textTop(x:number,top:number,text:string,size=10,bold=false){
    return this.text(x,PAGE_H-top,text,size,bold);
  }

  centered(y:number,text:string,size=10,bold=false){
    const estimated=sanitize(text).length*size*0.52;
    return this.text(Math.max(24,(PAGE_W-estimated)/2),y,text,size,bold);
  }

  line(x1:number,y1:number,x2:number,y2:number,width=1){
    this.commands.push({kind:'line',x1,y1,x2,y2,width});
    return this;
  }

  rect(x:number,y:number,w:number,h:number,options:{fillGray?:number;strokeGray?:number;width?:number}={}){
    this.commands.push({kind:'rect',x,y,w,h,...options});
    return this;
  }

  stream(){
    const out:string[]=[];
    for(const c of this.commands){
      if(c.kind==='text'){
        out.push(`BT /${c.bold?'F2':'F1'} ${fmt(c.size)} Tf ${fmt(c.x)} ${fmt(c.y)} Td (${pdfString(c.text)}) Tj ET`);
      }else if(c.kind==='line'){
        out.push(`${fmt(c.width)} w ${fmt(c.x1)} ${fmt(c.y1)} m ${fmt(c.x2)} ${fmt(c.y2)} l S`);
      }else{
        if(c.fillGray!==undefined)out.push(`${fmt(Math.max(0,Math.min(1,c.fillGray)))} g`);
        if(c.strokeGray!==undefined)out.push(`${fmt(Math.max(0,Math.min(1,c.strokeGray)))} G`);
        if(c.width!==undefined)out.push(`${fmt(c.width)} w`);
        const op=c.fillGray!==undefined&&c.strokeGray!==undefined?'B':c.fillGray!==undefined?'f':'S';
        out.push(`${fmt(c.x)} ${fmt(c.y)} ${fmt(c.w)} ${fmt(c.h)} re ${op}`);
        if(c.fillGray!==undefined)out.push('0 g');
        if(c.strokeGray!==undefined)out.push('0 G');
      }
    }
    return out.join('\n')+'\n';
  }
}

export class SimplePdfDocument {
  private pages:SimplePdfPage[]=[];
  addPage(){const page=new SimplePdfPage();this.pages.push(page);return page;}

  render(){
    if(!this.pages.length)this.addPage();
    const objects=new Map<number,Buffer>();
    const pageIds=this.pages.map((_,i)=>5+i*2);
    objects.set(1,Buffer.from('<< /Type /Catalog /Pages 2 0 R >>','latin1'));
    objects.set(2,Buffer.from(`<< /Type /Pages /Count ${this.pages.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`,'latin1'));
    objects.set(3,Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','latin1'));
    objects.set(4,Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>','latin1'));

    this.pages.forEach((page,i)=>{
      const pageId=5+i*2,contentId=pageId+1;
      const stream=Buffer.from(page.stream(),'latin1');
      const content=Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`,'latin1'),
        stream,
        Buffer.from('endstream','latin1'),
      ]);
      objects.set(contentId,content);
      objects.set(pageId,Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
        'latin1',
      ));
    });

    const maxId=Math.max(...objects.keys());
    const chunks:Buffer[]=[Buffer.from('%PDF-1.4\n%LTW\n','latin1')];
    const offsets:number[]=Array(maxId+1).fill(0);
    let cursor=chunks[0].length;
    for(let id=1;id<=maxId;id++){
      const body=objects.get(id);
      if(!body)throw new Error('Missing PDF object '+id);
      offsets[id]=cursor;
      const prefix=Buffer.from(`${id} 0 obj\n`,'latin1');
      const suffix=Buffer.from('\nendobj\n','latin1');
      chunks.push(prefix,body,suffix);
      cursor+=prefix.length+body.length+suffix.length;
    }
    const xrefOffset=cursor;
    let xref=`xref\n0 ${maxId+1}\n0000000000 65535 f \n`;
    for(let id=1;id<=maxId;id++)xref+=String(offsets[id]).padStart(10,'0')+' 00000 n \n';
    xref+=`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    chunks.push(Buffer.from(xref,'latin1'));
    return Buffer.concat(chunks);
  }
}

export const A4={width:PAGE_W,height:PAGE_H};
