const sharp = require('sharp');
const { HttpError } = require('./auth');
const formats = new Set(['jpeg','png','webp','gif']);
async function validateImage(image) {
  if (image == null) return null;
  if (typeof image !== 'object' || typeof image.name !== 'string' || image.name.length>180 || /[\x00-\x1f/\\]/.test(image.name) || typeof image.content !== 'string' || image.content.length>4_000_000 || image.content.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.content)) throw new HttpError(400,'Neispravna slika.');
  const buffer=Buffer.from(image.content,'base64');
  try {
    const info=await sharp(buffer,{limitInputPixels:16000000}).metadata();
    if (!formats.has(info.format) || !info.width || !info.height || (info.pages || 1)>1) throw new Error();
    return {name:image.name,mime:'image/'+info.format,content:image.content};
  } catch { throw new HttpError(400,'Slika mora biti ispravan PNG, JPG, WebP ili statički GIF, do 16 megapiksela.'); }
}
async function prepareImage(name, buffer) {
  await validateImage({name,content:buffer.toString('base64')});
  try {
    const output=await sharp(buffer,{limitInputPixels:16000000}).rotate().resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:88}).toBuffer();
    if(output.length>3_000_000)throw new Error();
    return {name:name.replace(/\.[^.]+$/,'.jpg'),mime:'image/jpeg',content:output.toString('base64')};
  }catch {throw new HttpError(400,'Slika nije mogla da se pripremi. Pokušajte sa manjom slikom.');}
}
function visionMessages(messages) {
  return messages.map(({role,content,image})=>({role,content:image?[{type:'text',text:content},{type:'image_url',image_url:{url:'data:'+image.mime+';base64,'+image.content}}]:content}));
}
module.exports={validateImage,prepareImage,visionMessages};
