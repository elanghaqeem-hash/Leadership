import { SimplePdfDocument, type SimplePdfPage, wrapPdfText } from './simple-pdf';

export const PDF_MARGIN=46;
export const PDF_CONTENT_WIDTH=503;

export function pdfHeader(page:SimplePdfPage,eyebrow:string,title:string,subtitle?:string){
  page.rect(0,762,595.28,79,{fillGray:0.10});
  page.text(46,812,'LEADERSHIP THAT WORKS',10,true);
  page.text(46,795,eyebrow,9,false);
  page.text(46,775,title,18,true);
  if(subtitle)page.text(46,755,subtitle,9,false);
  return 730;
}

export function pdfFooter(page:SimplePdfPage,label:string){
  page.line(46,42,549,42,0.5);
  page.text(46,27,label,8,false);
  page.text(430,27,'Lead Yourself. Think Better. Decide Smarter.',8,false);
}

export function pdfSection(page:SimplePdfPage,y:number,title:string){
  page.rect(46,y-4,503,22,{fillGray:0.93});
  page.text(54,y+3,title,11,true);
  return y-22;
}

export function pdfKeyValue(page:SimplePdfPage,y:number,label:string,value:string){
  page.text(50,y,label,9,true);
  const lines=wrapPdfText(value||'-',70);
  lines.slice(0,3).forEach((line,i)=>page.text(180,y-i*12,line,9,false));
  return y-Math.max(16,lines.slice(0,3).length*12);
}

export function pdfParagraph(page:SimplePdfPage,y:number,text:string,options:{size?:number;bold?:boolean;maxChars?:number;leading?:number}={}){
  const size=options.size??9,leading=options.leading??12,maxChars=options.maxChars??92;
  const lines=wrapPdfText(text,maxChars);
  for(const line of lines)page.text(50,y,line,size,options.bold??false),y-=leading;
  return y;
}

export function pdfMetricCard(page:SimplePdfPage,x:number,y:number,w:number,label:string,value:string,note=''){
  page.rect(x,y-42,w,48,{fillGray:0.96,strokeGray:0.82,width:0.6});
  page.text(x+10,y-7,label,8,true);
  page.text(x+10,y-25,value,15,true);
  if(note)page.text(x+10,y-37,note,7,false);
}

export function newReport(title:string,eyebrow:string,subtitle?:string){
  const doc=new SimplePdfDocument();
  const page=doc.addPage();
  const y=pdfHeader(page,eyebrow,title,subtitle);
  return{doc,page,y};
}
