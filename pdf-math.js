const {mathjax}=require('mathjax-full/js/mathjax.js');
const {TeX}=require('mathjax-full/js/input/tex.js');
const {SVG}=require('mathjax-full/js/output/svg.js');
const {liteAdaptor}=require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler}=require('mathjax-full/js/handlers/html.js');
require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');
const SVGtoPDF=require('svg-to-pdfkit');
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const engine=mathjax.document('',{InputJax:new TeX({packages:['base','ams'],maxBuffer:10000,maxMacros:200}),OutputJax:new SVG({fontCache:'none'})});
function equation(tex,size,display) {
  if(tex.length>8000)throw new Error('Formula je preduga.');
  const node=engine.convert(tex,{display});
  const svgNode=adaptor.tags(node,'svg')[0];
  if(adaptor.tags(node,'merror').length || adaptor.outerHTML(node).includes('data-mml-node="merror"'))throw new Error('Neispravna formula.');
  const svg=adaptor.outerHTML(svgNode);
  const box=adaptor.getAttribute(svgNode,'viewBox').split(/\s+/).map(Number);
  const scale=size/1000;
  return {svg,width:box[2]*scale,height:box[3]*scale,ascent:Math.max(0,-box[1]*scale)};
}
function layout(doc,text,size,width,code=false) {
  doc.fontSize(size);
  const pattern=/(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$[^$\n]+\$)/g;
  const segments=code?[text]:text.split(pattern);
  const lines=[];let line={items:[],width:0,ascent:size,descent:size*.3};
  const flush=()=>{if(line.items.length){lines.push(line);line={items:[],width:0,ascent:size,descent:size*.3};}};
  const add=item=>{if(line.width+item.width>width && line.items.length)flush();item.x=line.width;line.items.push(item);line.width+=item.width;line.ascent=Math.max(line.ascent,item.ascent);line.descent=Math.max(line.descent,item.height-item.ascent);};
  for(let i=0;i<segments.length;i++) {
    const part=segments[i];
    if(!code && i%2) {
      const display=part.startsWith('$$') || part.startsWith('\\[');
      const n=part.startsWith('$') && !display?1:2;
      try {
        const item=equation(part.slice(n,-n),size,display);const ratio=Math.min(1,width/item.width,600/item.height);item.width*=ratio;item.height*=ratio;item.ascent*=ratio;
        if(display)flush();add(item);if(display){line.center=true;flush();}
      }catch{for(const word of part.split(/(\s+)/))add({text:word,width:doc.widthOfString(word),height:size*1.3,ascent:size});}
    } else {
      for(const word of part.split(/(\s+)/)) {
        if(!word)continue;
        const chunks=doc.widthOfString(word)>width?Array.from(word):[word];
        for(const chunk of chunks)add({text:chunk,width:doc.widthOfString(chunk),height:size*1.3,ascent:size});
      }
    }
  }
  flush();return lines;
}
const lineHeight=line=>line.ascent+line.descent+5;
function drawLine(doc,line,x,y,width,size) {
  const offset=line.center?Math.max(0,(width-line.width)/2):0;
  for(const item of line.items) {
    const top=y+line.ascent-item.ascent;
    if(item.svg)SVGtoPDF(doc,item.svg,x+offset+item.x,top,{width:item.width,height:item.height,assumePt:true,preserveAspectRatio:'xMinYMin meet',imageCallback:()=>undefined,documentCallback:()=>undefined});
    else doc.fontSize(size).text(item.text,x+offset+item.x,top-1,{lineBreak:false});
  }
}
function writeParagraph(doc,text,size,{code=false,color='#243247'}={}) {
  const left=doc.page.margins.left,width=doc.page.width-left-doc.page.margins.right;
  doc.fillColor(color);
  let y=doc.y;
  for(const line of layout(doc,text,size,width,code)) {
    const h=lineHeight(line);if(y+h>doc.page.height-doc.page.margins.bottom){doc.addPage();y=doc.page.margins.top;}
    drawLine(doc,line,left,y,width,size);y+=h;
  }
  doc.x=left;doc.y=y+size*.6;
}
function writeTable(doc,rows,size=9) {
  const left=doc.page.margins.left,available=doc.page.width-left-doc.page.margins.right;
  const columns=Math.max(...rows.map(r=>r.length)),cw=available/columns,pad=5;
  let y=doc.y;
  for(let rowIndex=0;rowIndex<rows.length;rowIndex++) {
    const lines=Array.from({length:columns},(_,i)=>layout(doc,rows[rowIndex][i]||'',size,cw-pad*2));
    let index=0;
    while(index<Math.max(1,...lines.map(l=>l.length))) {
      const heights=[];let h=pad*2;
      while(index+heights.length<Math.max(1,...lines.map(l=>l.length))) {
        const next=Math.max(size*1.5,...lines.map(l=>l[index+heights.length]?lineHeight(l[index+heights.length]):0));
        if(y+h+next>doc.page.height-doc.page.margins.bottom)break;
        heights.push(next);h+=next;
      }
      if(!heights.length){doc.addPage();y=doc.page.margins.top;continue;}
      for(let col=0;col<columns;col++) {
        doc.save().rect(left+col*cw,y,cw,h).fillAndStroke(rowIndex===0?'#EAF1FF':'#FFFFFF','#CBD7EB').restore();doc.fillColor('#243247');let cy=y+pad;
        for(let n=0;n<heights.length;n++){const line=lines[col][index+n];if(line)drawLine(doc,line,left+col*cw+pad,cy,cw-pad*2,size);cy+=heights[n];}
      }
      y+=h;index+=heights.length;
    }
  }
  doc.x=left;doc.y=y+10;
}
module.exports={writeParagraph,writeTable,equation};
