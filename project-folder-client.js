(() => {
 window.collectProjectFolderSnapshot=async(projectId)=>{
  if(!projectId||!currentUser)return null;const session=epoch,user=currentUser.id;const snapshot={projectId,status:'unconnected',rootName:'',capturedAt:new Date().toISOString(),truncated:false,entries:[]};
  try{
   const linked=await window.localFolderAccess.get(projectId);if(session!==epoch||user!==currentUser?.id)return null;
   if(!linked.handle)return snapshot;snapshot.rootName=linked.name||linked.handle.name;
   if(await linked.handle.queryPermission({mode:'read'})!=='granted'){snapshot.status='permission_required';return snapshot;}
   let budget=0;const encoder=new TextEncoder(),skip=new Set(['.git','.svn','node_modules','.cache','.npm-cache','.pglite']);
   async function walk(dir,prefix='',depth=0){const children=[];for await(const child of dir.values()){children.push(child);if(children.length>=501){snapshot.truncated=true;break;}}children.sort((a,b)=>a.name.localeCompare(b.name,'sr'));
    for(const child of children){if(session!==epoch||user!==currentUser?.id)return;if(snapshot.entries.length>=500){snapshot.truncated=true;return;}const path=prefix+child.name,cost=encoder.encode(path).length+70;if(path.length>1000||budget+cost>55000){snapshot.truncated=true;continue;}budget+=cost;const entry={path,kind:child.kind};if(child.kind==='file'){try{entry.bytes=(await child.getFile()).size;}catch{entry.bytes=null;snapshot.truncated=true;}}snapshot.entries.push(entry);
     if(child.kind==='directory'){if(depth<3&&!skip.has(child.name))await walk(child,path+'/',depth+1);else snapshot.truncated=true;}
    }
   }
   await walk(linked.handle);if(session!==epoch||user!==currentUser?.id)return null;snapshot.status=snapshot.truncated?'partial':'ready';snapshot.capturedAt=new Date().toISOString();return snapshot;
  }catch{if(session!==epoch||user!==currentUser?.id)return null;snapshot.status=snapshot.entries.length?'partial':'unavailable';snapshot.truncated=!!snapshot.entries.length;return snapshot;}
 };
})();
