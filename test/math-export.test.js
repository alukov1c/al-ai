const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {chromium}=require('playwright');const {normalizeBareMath}=require('../math-format');const {generateDocument}=require('../document-export');
const content=String.raw`Zapamti: δy = Δy/\|y\| — relativna greška je najbrži put do apsolutne!
$$\Delta = N\sum x^2 - (\sum x)^2$$
1. Težine: $w_i=1/\sigma_i^2$.
\[
a=\frac{S_{xx}S_y-S_xS_{xy}}{\Delta}
\]
| Naziv | Formula |
| --- | --- |
| Greška | $\sigma_a=\sqrt{S_{xx}/\Delta}$ |
`;
test('Relativna greška bez delimitera i PDF formule',async()=>{
 assert.match(normalizeBareMath(content),/\\frac\{\\Delta y\}/);
 assert.equal(normalizeBareMath('`δy = Δy/\\|y\\|`'),'`δy = Δy/\\|y\\|`');
 assert.equal(normalizeBareMath('$δy = Δy/|y|$'),'$δy = Δy/|y|$');
 const pdf=await generateDocument({format:'pdf',title:'Formule',content});
 const {PDFParse}=require('pdf-parse');const parser=new PDFParse({data:pdf});try{const text=(await parser.getText()).text;assert(!text.includes('\\frac'));assert(!text.includes('$$'));assert.match(text,/relativna greška/);}finally{await parser.destroy();}
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const page=await browser.newPage();await page.setContent('<!doctype html><div class="bubble"></div>');await page.addStyleTag({path:'node_modules/katex/dist/katex.min.css'});await page.addStyleTag({path:'stil.css'});
 for(const file of ['node_modules/katex/dist/katex.min.js','node_modules/katex/dist/contrib/auto-render.min.js','math-format.js'])await page.addScriptTag({path:file});
 const source=fs.readFileSync('app.js','utf8');await page.addScriptTag({content:source.slice(source.indexOf('function appendInlineFormatting'),source.indexOf('function renderConversation'))});await page.evaluate(value=>renderAssistantContent(document.querySelector('.bubble'),value),content);assert.equal(await page.locator('.katex').count(),5);
 await page.setViewportSize({width:390,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-artifacts/bare-math-390.png',animations:'disabled'});
 }finally{await browser.close();}
});
