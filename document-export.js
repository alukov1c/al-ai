const {normalizeBareMath}=require('./math-format');
﻿const path = require('node:path');
function plain(value) { return value.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'); }
function cells(line) { return line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(s => plain(s.trim().replace(/\\\|/g, '|'))); }
function blocks(text) {
  const lines = text.replace(/\r/g, '').split('\n'), result = [];
  let code = false;
  for (let i=0;i<lines.length;i++) {
    const line = lines[i];
    if (line.startsWith('```')) { code = !code; continue; }
    if (!code && (line.trim().startsWith('$$') || line.trim().startsWith('\\['))) {
      const delimiter=line.trim().startsWith('$$')?'$$':'\\]';
      if(!line.trim().slice(2).includes(delimiter)) {
        let end=i+1;while(end<lines.length && !lines[end].includes(delimiter))end++;
        if(end<lines.length){result.push({type:'text',text:lines.slice(i,end+1).join('\n')});i=end;continue;}
      }
    }
    const next = cells(lines[i+1] || '');
    if (!code && line.includes('|') && next.every(c => /^:?-{3,}:?$/.test(c)) && next.length === cells(line).length) {
      const rows = [cells(line)]; i++;
      while (i+1<lines.length && lines[i+1].trim() && lines[i+1].includes('|')) rows.push(cells(lines[++i]));
      result.push({type:'table',rows});
    } else if (line.trim()) result.push({type: !code && /^#{1,6}\s/.test(line) ? 'heading' : 'text', code, text: code ? line : plain(line.replace(/^#{1,6}\s+/, ''))});
  }
  return result;
}
async function generateDocument({ format, title, content, settings = {} }) {
  const page = settings?.page === 'LETTER' ? 'LETTER' : 'A4';
  const font = [10,11,12,14].includes(settings?.font) ? settings.font : 11;
  const wide = settings?.slides !== 'standard';
  const wrap = settings?.wrap !== false;
  const parts = blocks(format === 'pdf' ? normalizeBareMath(content) : content);
  if (format === 'docx') {
    const d = require('docx');
    const children = [new d.Paragraph({ text:title, heading:d.HeadingLevel.TITLE })];
    for (const part of parts) {
      if (part.type === 'table') children.push(new d.Table({ width:{size:100,type:d.WidthType.PERCENTAGE}, rows:part.rows.map((row,i)=>new d.TableRow({tableHeader:i===0,children:row.map(text=>new d.TableCell({shading:i===0?{fill:'EAF1FF'}:undefined,children:[new d.Paragraph({children:[new d.TextRun({text,bold:i===0})]})]}))})) }));
      else children.push(new d.Paragraph({text:part.text,heading:part.type==='heading'?d.HeadingLevel.HEADING_1:undefined,spacing:{after:140}}));
    }
    return d.Packer.toBuffer(new d.Document({creator:'A-L AI',title,styles:{default:{document:{run:{font:'Calibri',size:font*2}}}},sections:[{properties:{page:{size:page==='LETTER'?{width:12240,height:15840}:{width:11906,height:16838}}},children}]}));
  }
  if (format === 'xlsx') {
    const wb = new (require('exceljs').Workbook)();
    wb.creator = 'A-L AI';
    const sheet = wb.addWorksheet('Odgovor');
    sheet.columns = [{width:105}];
    sheet.addRow([title]).font={bold:true,size:16,color:{argb:'FF1E40AF'}};
    let tableNo=0;
    for (const part of parts) {
      if (part.type === 'table') {
        const table = wb.addWorksheet('Tabela '+(++tableNo));
        const count = Math.max(...part.rows.map(r=>r.length));
        table.columns = Array.from({length:count},()=>({width:30}));
        part.rows.forEach((row,i)=>{
          const added=table.addRow(row.map(value=> i>0 && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) && value.replace(/\D/g,'').length<16 ? Number(value) : value));
          added.eachCell(cell=>{cell.alignment={wrapText:wrap,vertical:'top'};cell.border={bottom:{style:'thin',color:{argb:'FFCBD7EB'}}};if(i===0){cell.font={bold:true,color:{argb:'FF1E40AF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAF1FF'}}}});
          added.height=Math.min(300,Math.max(...row.map(v=>Math.ceil(v.length/28)))*16+8);
        });
        table.views=[{state:'frozen',ySplit:1}];
        sheet.addRow(['Tabela '+tableNo]);
      } else {
        for(let i=0;i<part.text.length;i+=30000){const row=sheet.addRow([part.text.slice(i,i+30000)]);row.alignment={wrapText:wrap,vertical:'top'};row.height=Math.min(400,Math.ceil(Math.min(part.text.length-i,30000)/100)*16+8);if(part.type==='heading')row.font={bold:true};}
      }
    }
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  if (format === 'pptx') {
    const PptxGenJS = require('pptxgenjs');
    const pptx = new PptxGenJS(); pptx.layout=wide?'LAYOUT_WIDE':'LAYOUT_4x3';pptx.author='A-L AI';pptx.subject=title;pptx.title=title;pptx.lang='sr-Latn-RS';pptx.theme={headFontFace:'Calibri',bodyFontFace:'Calibri',lang:'sr-Latn-RS'};
    let heading=title;
    const addSlide = (body, table) => {
      const slide=pptx.addSlide();slide.background={color:'FFFFFF'};
      slide.addText(heading,{x:.6,y:.35,w:wide?12.1:8.8,h:.85,fontSize:26,bold:true,color:'1E40AF',breakLine:false,fit:'shrink',margin:0});
      if(table) slide.addTable(table.map((row,i)=>row.map(text=>({text,options:{bold:i===0,fill:i===0?'EAF1FF':'FFFFFF'}}))),{x:.6,y:1.5,w:wide?12.1:8.8,h:4.8,fontSize:15,color:'243247',border:{pt:1,color:'CBD7EB'},margin:8,autoPage:false});
      else slide.addText(body,{x:.6,y:1.5,w:wide?12.1:8.8,h:5.2,fontSize:20,color:'243247',margin:0,breakLine:false,fit:'shrink',paraSpaceAfterPt:12});
    };
    let pending='';
    const flush=()=>{if(pending){addSlide(pending);pending='';}};
    for(const part of parts){
      if(part.type==='heading'){flush();heading=part.text;continue;}
      if(part.type==='table' && part.rows[0].length<=6 && part.rows.every(r=>r.every(v=>v.length<=100))){flush();for(let i=1;i<part.rows.length;i+=3)addSlide('',[part.rows[0],...part.rows.slice(i,i+3)]);if(part.rows.length===1)addSlide('',part.rows);continue;}
      const text=part.type==='table'?part.rows.map(r=>r.join(' | ')).join('\n'):part.text;
      for(let i=0;i<text.length;i+=650){const chunk=text.slice(i,i+650);if(pending.length+chunk.length>700)flush();pending+=(pending?'\n\n':'')+chunk;}
    }
    flush();if(!pptx._slides.length)addSlide(title);
    return Buffer.from(await pptx.write({outputType:'nodebuffer',compression:true}));
  }
  if (format === 'pdf') {
    const PDFDocument = require('pdfkit');
    return new Promise((resolve,reject)=>{
      const doc=new PDFDocument({size:page,margin:48,info:{Title:title,Author:'A-L AI'}}), chunks=[];
      doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
      doc.font(path.join(path.dirname(require.resolve('dejavu-fonts-ttf/package.json')),'ttf/DejaVuSans.ttf'));
      doc.fontSize(20).fillColor('#1E40AF').text(title).moveDown();
      const {writeParagraph,writeTable}=require('./pdf-math');
      for(const part of parts){
        if(part.type==='table')writeTable(doc,part.rows,9);
        else if(!/^[-_*]{3,}$/.test(part.text.trim()))writeParagraph(doc,part.text,part.type==='heading'?font+3:font,{code:part.code,color:part.type==='heading'?'#1E40AF':'#243247'});
      }
      doc.end();
    });
  }
  throw new Error('Unsupported format');
}
module.exports={generateDocument};
