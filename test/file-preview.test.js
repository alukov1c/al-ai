const {test}=require('node:test');const assert=require('node:assert/strict');const {previewFile}=require('../file-preview');const {generateDocument}=require('../document-export');
test('PDF stranice i tekstualni pregledi',async()=>{
 const pdf=await generateDocument({format:'pdf',title:'Formule',content:'Formula: $x=\\frac{1}{2}$'+ '\nTekst'.repeat(180)});
 const result=await previewFile({name:'formule.pdf',content:pdf},1);assert.equal(result.kind,'pdf');assert(result.pages>1);assert(result.image.startsWith('data:image/png;base64,'));
 const second=await previewFile({name:'formule.pdf',content:pdf},2);assert.equal(second.page,2);
 await assert.rejects(previewFile({name:'formule.pdf',content:pdf},999));
 for(const format of ['docx','xlsx','pptx']){const content=await generateDocument({format,title:'Pregled',content:'Tekst za pregled'});const result=await previewFile({name:'test.'+format,content});assert.match(result.text,/Tekst za pregled/);}
});