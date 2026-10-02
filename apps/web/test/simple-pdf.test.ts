import { describe, expect, it } from 'vitest';
import { SimplePdfDocument, wrapPdfText } from '../lib/simple-pdf.js';

describe('simple PDF renderer',()=>{
  it('renders a valid multi-page PDF with xref',()=>{
    const pdf=new SimplePdfDocument();
    pdf.addPage().textTop(40,50,'Leadership That Works',20,true).line(40,780,555,780,1);
    pdf.addPage().textTop(40,50,'Page 2',16,true);
    const bytes=pdf.render();
    const text=bytes.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text).toContain('xref');
    expect(text).toContain('%%EOF');
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('wraps long text without losing words',()=>{
    const input='Lead Yourself Think Better Decide Smarter Execute Stronger';
    const lines=wrapPdfText(input,20);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(input);
  });
});
