const {createHash,randomUUID}=require('node:crypto');
const {HttpError}=require('./auth');
const {transaction}=require('./db');
const {ownProject}=require('./workspace');

// Imports are text copies: provider metadata never becomes application instructions.
function parseConversations(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw)>3000000)throw new HttpError(413,'JSON izvoz može imati najviše 3 MB.');
 let input;try{input=JSON.parse(raw);}catch{throw new HttpError(400,'Datoteka nije ispravan JSON.');}
 const items=Array.isArray(input)?input:Array.isArray(input?.conversations)?input.conversations:[input];
 if(!items.length||items.length>100)throw new HttpError(400,'Izaberite izvoz sa 1–100 razgovora.');
 let total=0;const warnings=[];
 const textOf=value=>typeof value==='string'?value:Array.isArray(value)?value.map(part=>typeof part==='string'?part:part?.type==='text'?part.text:'').filter(Boolean).join('\n'):'';
 const conversations=items.map((item,index)=>{
  if(!item||typeof item!=='object')throw new HttpError(400,'Neispravan razgovor '+(index+1)+'.');
  let source='JSON',messages;
  if(item.mapping&&typeof item.mapping==='object'){
   source='ChatGPT';const chain=[],seen=new Set();let node=item.current_node;
   if(typeof node!=='string')throw new HttpError(400,'ChatGPT razgovor nema izabranu granu (current_node).');
   while(node){if(seen.has(node)||seen.size>10000)throw new HttpError(400,'Neispravna grana ChatGPT razgovora.');seen.add(node);const entry=item.mapping[node];if(!entry)throw new HttpError(400,'Nedostaje deo ChatGPT razgovora.');if(entry.message)chain.unshift(entry.message);node=entry.parent;}
   messages=chain.map(m=>({role:m.author?.role,content:textOf(m.content?.parts),unsupported:m.content?.content_type!=='text'}));
  }else if(Array.isArray(item.chat_messages)){
   source='Claude';messages=item.chat_messages.map(m=>({role:m?.sender==='human'?'user':m?.sender==='assistant'?'assistant':m?.sender,content:typeof m?.text==='string'&&m.text?m.text:textOf(m?.content),unsupported:!!(m?.attachments?.length||m?.files?.length||m?.content?.some?.(p=>p?.type!=='text'))}));
  }else if(Array.isArray(item.messages)){
   source='messages';messages=item.messages.map(m=>({role:m?.role,content:textOf(m?.content),unsupported:typeof m?.content!=='string'}));
  }else throw new HttpError(400,'Nepodržan JSON razgovor '+(index+1)+'. Podržani su ChatGPT, Claude i title/messages.');
  let skipped=0;messages=messages.filter(m=>{if(m.unsupported)skipped++;return ['user','assistant'].includes(m.role)&&m.content.trim();}).map(m=>({role:m.role,content:m.content}));
  if(skipped)warnings.push('Razgovor '+(index+1)+': prenosi se samo tekst; prilozi i drugi sadržaj nisu uvezeni.');
  if(!messages.length||messages.length>2000||messages.some(m=>m.content.length>500000))throw new HttpError(400,'Razgovor '+(index+1)+' mora imati 1–2000 tekstualnih poruka, do 500.000 znakova po poruci.');
  total+=messages.length;if(total>5000)throw new HttpError(413,'Jedan uvoz može imati najviše 5000 poruka.');
  const title=String(item.title||item.name||'Uvezeni razgovor').trim().slice(0,80)||'Uvezeni razgovor';
  const key='external:'+createHash('sha256').update(JSON.stringify({title,messages})).digest('hex');
  return {title,messages,key,source};
 });
 return {conversations,warnings};
}
async function importConversations(pool,user,data){
 const parsed=parseConversations(data.text),projectId=data.projectId||null;
 if(projectId){const p=await ownProject(pool,projectId,user.id);if(p.archived)throw new HttpError(409,'Projekat je arhiviran.');}
 if(data.preview===true)return {items:parsed.conversations.map(c=>({title:c.title,count:c.messages.length,source:c.source})),warnings:parsed.warnings};
 return transaction(pool,async db=>{
  await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
  if(projectId){const p=await ownProject(db,projectId,user.id);if(p.archived)throw new HttpError(409,'Projekat je arhiviran.');}
  const ids=[];let skipped=0;
  for(const c of parsed.conversations){
   const id=randomUUID();const inserted=await db.query("INSERT INTO conversations(id,user_id,title,model,import_key,project_id,sort_order) SELECT $1,$2,$3,'deepseek-flash',$4,$5,coalesce(min(sort_order),1)-1 FROM conversations WHERE user_id=$2 ON CONFLICT(user_id,import_key) DO NOTHING RETURNING id",[id,user.id,c.title,c.key,projectId]);
   if(!inserted.rowCount){skipped++;continue;}
   for(const m of c.messages)await db.query('INSERT INTO messages(conversation_id,role,content) VALUES($1,$2,$3)',[id,m.role,m.content]);
   ids.push(id);
  }
  return {imported:ids.length,skipped,ids,warnings:parsed.warnings};
 });
}
module.exports={parseConversations,importConversations};
