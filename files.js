const {randomUUID}=require('node:crypto');
const {transaction}=require('./db');
const {HttpError}=require('./auth');
const mimeTypes={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',md:'text/plain',csv:'text/csv',json:'application/json',log:'text/plain'};
async function saveFile(pool,userId,{name,mime,kind,direction,content,conversationId=null}){
 return transaction(pool,async client=>{
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[userId]);
  const usage=(await client.query('SELECT count(*)::int AS count,coalesce(sum(octet_length(content)),0)::bigint AS bytes FROM user_files WHERE user_id=$1',[userId])).rows[0];
  if(usage.count>=100 || Number(usage.bytes)+content.length>100000000)throw new HttpError(413,'Prostor za datoteke je popunjen (100 datoteka / 100 MB). Obrišite nepotrebne stavke u podešavanjima.');
  const id=randomUUID();
  await client.query('INSERT INTO user_files(id,user_id,conversation_id,name,mime,kind,direction,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,userId,conversationId,name,mime,kind,direction,content]);
  return id;
 });
}
module.exports={saveFile,mimeTypes};
