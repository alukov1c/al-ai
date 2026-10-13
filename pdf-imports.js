const {randomUUID,createHash}=require('node:crypto');
const {transaction}=require('./db');
const {HttpError,limitLogin}=require('./auth');
const {extractAttachment}=require('./attachments');
const {indexBook}=require('./books');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(v){if(typeof v!=='string'||!UUID.test(v))throw new HttpError(400,'Neispravan identifikator.');return v;}
function view(row){return {id:row.id,fileId:row.file_id,status:row.status,stage:row.stage,error:row.error,result:row.result};}
async function acceptPdf(pool,user,data,existingFileId=null){
 const name=typeof data.name==='string'?data.name.trim():'';
 if(!name||name.length>180||/[\x00-\x1f/\\]/.test(name)||!name.toLowerCase().endsWith('.pdf'))throw new HttpError(400,'Izaberite PDF sa ispravnim nazivom.');
 if(typeof data.content!=='string'||data.content.length>40000000||data.content.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.content))throw new HttpError(413,'PDF može imati najviše 30 MB.');
 const buffer=Buffer.from(data.content,'base64');if(!buffer.length||buffer.length>30000000||!buffer.subarray(0,5).equals(Buffer.from('%PDF-')))throw new HttpError(400,'Datoteka nije ispravan PDF.');
 const scope=data.projectId?validId(data.projectId):'',fingerprint=createHash('sha256').update(name).update('\0').update(buffer).digest('hex');
 return transaction(pool,async db=>{
  const account=(await db.query('SELECT document_plugins FROM users WHERE id=$1 FOR UPDATE',[user.id])).rows[0];if(account.document_plugins?.pdf!==true)throw new HttpError(403,'PDF modul je isključen.');
  if(scope){const p=(await db.query('SELECT archived FROM projects WHERE id=$1 AND user_id=$2',[scope,user.id])).rows[0];if(!p)throw new HttpError(404,'Projekat nije pronađen.');if(p.archived)throw new HttpError(409,'Projekat je arhiviran.');}
  const old=(await db.query('SELECT * FROM pdf_import_jobs WHERE user_id=$1 AND scope=$2 AND fingerprint=$3',[user.id,scope,fingerprint])).rows[0];
  if(old?.file_id){if(old.status==='failed'){const row=(await db.query("UPDATE pdf_import_jobs SET status='queued',stage='Čeka ponovnu obradu',error=NULL WHERE id=$1 RETURNING *",[old.id])).rows[0];return view(row);}return view(old);}
  if(old)await db.query('DELETE FROM pdf_import_jobs WHERE id=$1',[old.id]);
  const fileId=existingFileId||randomUUID(),jobId=randomUUID();
  if(existingFileId){const original=(await db.query('SELECT id,name,project_id FROM user_files WHERE id=$1 AND user_id=$2 FOR UPDATE',[validId(existingFileId),user.id])).rows[0];if(!original)throw new HttpError(404,'Original je obrisan.');if(original.name!==name||(original.project_id||'')!==scope)throw new HttpError(409,'Original je promenjen. Osvežite Biblioteku.');}
  else {await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[user.id]);const used=(await db.query('SELECT count(*)::int AS count,coalesce(sum(octet_length(content)),0) AS bytes FROM user_files WHERE user_id=$1',[user.id])).rows[0];if(used.count>=100||Number(used.bytes)+buffer.length>100000000)throw new HttpError(413,'Prostor Biblioteke je popunjen (100 datoteka / 100 MB).');await db.query("INSERT INTO user_files(id,user_id,project_id,name,mime,kind,direction,content) VALUES($1,$2,$3,$4,'application/pdf','document','import',$5)",[fileId,user.id,scope||null,name,buffer]);}
  const row=(await db.query('INSERT INTO pdf_import_jobs(id,user_id,file_id,scope,fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING *',[jobId,user.id,fileId,scope,fingerprint])).rows[0];return view(row);
 });
}
class PdfImportQueue {
 constructor(pool){this.pool=pool;this.running=false;this.stopped=true;this.timer=null;}
 start(){this.stopped=false;this.wake();}
 stop(){this.stopped=true;clearTimeout(this.timer);}
 wake(){if(this.stopped||this.running||this.timer)return;this.timer=setTimeout(()=>{this.timer=null;this.run().catch(()=>{});},0);this.timer.unref();}
 async run(){if(this.stopped||this.running)return;this.running=true;let job;
  try{job=await transaction(this.pool,async db=>{const row=(await db.query("SELECT * FROM pdf_import_jobs WHERE file_id IS NOT NULL AND (status='queued' OR (status='processing' AND started_at<now()-interval '10 minutes')) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!row)return null;await db.query("UPDATE pdf_import_jobs SET status='processing',stage='Izdvajanje teksta po stranicama',started_at=now(),error=NULL WHERE id=$1",[row.id]);return row;});
   if(job){const file=(await this.pool.query('SELECT f.*,u.document_plugins,u.is_active FROM user_files f JOIN users u ON u.id=f.user_id WHERE f.id=$1 AND f.user_id=$2',[job.file_id,job.user_id])).rows[0];if(!file)throw new Error('Original je obrisan.');if(!file.is_active||file.document_plugins?.pdf!==true)throw new Error('Nalog ili PDF modul nije aktivan.');
    const extracted=await extractAttachment({name:file.name,content:Buffer.from(file.content).toString('base64')});await this.pool.query("UPDATE pdf_import_jobs SET stage='Čuvanje indeksa stranica' WHERE id=$1",[job.id]);const book=await indexBook(this.pool,file.id,job.user_id,extracted.pages);
    const result={fileId:file.id,name:file.name,text:extracted.text,book,indexedBook:!extracted.text||book.characters>40000};await this.pool.query("UPDATE pdf_import_jobs SET status='complete',stage='Obrada završena',result=$2,error=NULL WHERE id=$1",[job.id,JSON.stringify(result)]);
   }
  }catch(e){if(job)await this.pool.query("UPDATE pdf_import_jobs SET status='failed',stage=CASE WHEN file_id IS NULL THEN 'Original je obrisan' ELSE 'Obrada nije završena; original je sačuvan' END,error=$2 WHERE id=$1",[job.id,e instanceof HttpError?e.message:e.message==='Original je obrisan.'?e.message:'Obrada PDF-a nije završena. Original je sačuvan; ponovite obradu.']).catch(()=>{});
  }finally{this.running=false;if(job&&!this.stopped)this.wake();}
 }
}
async function pdfImportsApi({pool,user,data,pathname,method,queue,send}){
 const existing=pathname.match(/^\/api\/pdf-imports\/from-file\/([0-9a-f-]+)$/i);
 if(existing&&method==='POST'){await limitLogin(pool,'pdf-import:'+user.id,20);const file=(await pool.query('SELECT * FROM user_files WHERE id=$1 AND user_id=$2',[validId(existing[1]),user.id])).rows[0];if(!file)throw new HttpError(404,'Original nije pronađen.');const result=await acceptPdf(pool,user,{name:file.name,projectId:file.project_id,content:Buffer.from(file.content).toString('base64')},file.id);send(result);queue.wake();return true;}
 if(pathname==='/api/pdf-imports/find'&&method==='POST'){
  if(typeof data.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(data.fingerprint))throw new HttpError(400,'Neispravan otisak PDF-a.');const scope=data.projectId?validId(data.projectId):'';
  const row=(await pool.query("SELECT j.* FROM pdf_import_jobs j JOIN user_files f ON f.id=j.file_id WHERE j.user_id=$1 AND f.user_id=$1 AND j.scope=$2 AND coalesce(f.project_id::text,'')=$2 AND j.fingerprint=$3",[user.id,scope,data.fingerprint])).rows[0];send({job:row?view(row):null});if(row)queue.wake();return true;
 }
 if(pathname==='/api/pdf-imports'&&method==='POST'){await limitLogin(pool,'pdf-import:'+user.id,20);const result=await acceptPdf(pool,user,data);send(result);queue.wake();return true;}
 if(pathname==='/api/pdf-imports'&&method==='GET'){send({jobs:(await pool.query("SELECT * FROM pdf_import_jobs WHERE user_id=$1 AND file_id IS NOT NULL AND status<>'complete' ORDER BY created_at DESC LIMIT 100",[user.id])).rows.map(view)});return true;}
 const route=pathname.match(/^\/api\/pdf-imports\/([0-9a-f-]+)(?:\/(retry))?$/i);if(route){const row=(await pool.query('SELECT * FROM pdf_import_jobs WHERE id=$1 AND user_id=$2',[validId(route[1]),user.id])).rows[0];if(!row)throw new HttpError(404,'Uvoz nije pronađen.');
  if(method==='GET'&&!route[2]){if(row.status==='processing'&&Date.now()-Date.parse(row.started_at)>600000)queue.wake();send(view(row));return true;}
  if(method==='POST'&&route[2]==='retry'){if(!row.file_id)throw new HttpError(404,'Original je obrisan.');const fresh=(await pool.query("UPDATE pdf_import_jobs SET status=CASE WHEN status='failed' THEN 'queued' ELSE status END,error=CASE WHEN status='failed' THEN NULL ELSE error END WHERE id=$1 RETURNING *",[row.id])).rows[0];send(view(fresh));queue.wake();return true;}
 }return false;
}
module.exports={PdfImportQueue,pdfImportsApi,acceptPdf};
