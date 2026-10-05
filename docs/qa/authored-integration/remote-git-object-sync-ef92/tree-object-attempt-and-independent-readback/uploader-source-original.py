#!/usr/bin/env python3
"""Create exact directory Git trees only; never blobs/commits/refs or local mutations."""
from pathlib import Path
import concurrent.futures,datetime,hashlib,json,re,subprocess,threading,time
REPO=Path('/workspace/scratch/neon-harbor')
REMOTE='qifalab/neon-harbor'
COMMIT='ef92c25980f1da12b508971170b72b9dd6230059'
PARENT='7a90f7934b7c9d1af5c4494bf08c4ec337c373e4'
EXPECTED='e4f9f3be49c222242592d64ad2f33104154725d3'
OUT=Path('/tmp/neon-git-trees-ef92-sync')
LOCK=threading.Lock()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def require(c,m):
 if not c:raise RuntimeError(m)
def sha256(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO)
def save(path,data):
 t=Path(str(path)+'.writing');t.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');t.replace(path)
def sanitized(value):
 if isinstance(value,str):
  value=re.sub(r'(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}','[redacted credential]',value)
  return re.sub(r'(https?://[^\s?]+)\?[^\s]+',r'\1?[redacted query]',value)
 if isinstance(value,list):return [sanitized(v) for v in value]
 if isinstance(value,dict):return {k:sanitized(v) for k,v in value.items() if k in ['message','errors','resource','field','code','value']}
 return value

def api(method,endpoint,label,payload=None):
 argv=['gh','api','--method',method,'repos/'+REMOTE+'/'+endpoint]
 raw=None
 if payload is not None:
  raw=(json.dumps(payload,ensure_ascii=False)+'\n').encode();argv+=['--input','-']
  (OUT/(label+'.request.original.json')).write_bytes(raw)
 started=now()
 r=subprocess.run(argv,input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE,cwd=REPO,timeout=60)
 (OUT/(label+'.response.original.json')).write_bytes(r.stdout)
 try:body=json.loads(r.stdout)
 except ValueError:body={}
 statuses=re.findall(rb'HTTP\s+(\d{3})',r.stderr)
 http=int(statuses[-1]) if statuses else (200 if r.returncode==0 else None)
 receipt={'method':method,'endpoint':endpoint,'startedAt':started,'completedAt':now(),'exitCode':r.returncode,'http':http,'actualSha':body.get('sha'),'message':sanitized(body.get('message')),'errors':sanitized(body.get('errors')),'responseBytes':len(r.stdout),'responseSha256':hashlib.sha256(r.stdout).hexdigest(),'rawStderrNotEmittedOrStored':True}
 save(OUT/(label+'.receipt.json'),receipt)
 return receipt,body

def tree_entries(sha):
 records=git('ls-tree','-z',sha).split(b'\0');result=[]
 for record in records:
  if not record:continue
  meta,name=record.split(b'\t',1);mode,kind,pin=meta.decode().split();name=name.decode('utf-8')
  require('/' not in name and name not in ('','.','..'),'Entry is not an immediate child')
  require((mode,kind) in [('040000','tree'),('100644','blob'),('100755','blob'),('120000','blob'),('160000','commit')],'Unsupported mode/type')
  require(bool(re.fullmatch('[a-f0-9]{40}',pin)),'Invalid tree entry SHA')
  result.append({'path':name,'mode':mode,'type':kind,'sha':pin})
 require(len(result)==len({r['path'] for r in result}),'Duplicate immediate name')
 raw=git('cat-file','tree',sha);require(hashlib.sha1(('tree '+str(len(raw))+'\0').encode()+raw).hexdigest()==sha,'Local tree object SHA mismatch')
 return result

def verify_remote(body,sha,entries):
 require(body.get('sha')==sha,'Remote tree SHA mismatch: '+sha)
 require(body.get('truncated') is False,'Remote tree response unexpectedly truncated')
 got=[{k:r[k] for k in ['path','mode','type','sha']} for r in body.get('tree',[])]
 key=lambda r:r['path'].encode('utf-8')
 require(sorted(got,key=key)==sorted(entries,key=key),'Remote immediate children differ: '+sha)

require(git('rev-parse','HEAD').decode().strip()==COMMIT,'ROOT HEAD changed before read-only tree preflight')
require(git('rev-parse',COMMIT+'^{tree}').decode().strip()==EXPECTED,'Committed root tree differs')
require(git('rev-parse',COMMIT+'^').decode().strip()==PARENT,'Committed parent differs')
base=git('rev-parse',PARENT+'^{tree}').decode().strip()
old_trees={base}
for record in git('ls-tree','-r','-t','-z',base).split(b'\0'):
 if record and record.split(b'\t',1)[0].split()[1]==b'tree':old_trees.add(record.split(b'\t',1)[0].split()[2].decode())
nodes={};paths={}
def visit(sha,path):
 paths.setdefault(sha,[]).append(path)
 if sha in nodes:return
 entries=tree_entries(sha);nodes[sha]=entries
 for row in entries:
  if row['type']=='tree':visit(row['sha'],path+'/'+row['path'] if path else row['path'])
visit(EXPECTED,'')
state={'status':'RUNNING_TREE_OBJECTS_ONLY','remote':REMOTE,'commit':COMMIT,'parent':PARENT,'localRootTree':EXPECTED,'baseTree':base,'startedAt':now(),'refsChanged':False,'commitsCreated':False,'blobsReadOrUploaded':False,'localRootsIndexSourceWritten':False,'uniqueTreeObjects':len(nodes),'reusedParentTrees':sorted(set(nodes)&old_trees),'confirmedTrees':{},'firstFailure':None}
save(OUT/'local-immediate-tree-graph.json',{'rootTree':EXPECTED,'treeObjects':{sha:{'paths':paths[sha],'children':entries,'reuseKnownParent':sha in old_trees} for sha,entries in nodes.items()}})
# The known remote parent binds all identically hashed old subtrees transitively.
receipt,remote_parent=api('GET','git/commits/'+PARENT,'remote-parent-precheck')
require(receipt['exitCode']==0 and remote_parent.get('sha')==PARENT and remote_parent.get('tree',{}).get('sha')==base,'Remote committed parent/tree is not available')
for sha in set(nodes)&old_trees:state['confirmedTrees'][sha]={'sha':sha,'source':'exact subtree of confirmed remote parent','paths':paths[sha]}
save(OUT/'tree-sync-state.json',state)
print(json.dumps({'status':'tree-preflight','uniqueTrees':len(nodes),'reusedParentTrees':len(state['confirmedTrees']),'newTrees':len(nodes)-len(state['confirmedTrees']),'refsChanged':False}),flush=True)

def make_tree(sha):
 entries=nodes[sha]
 # GET before POST; every API attempt is preserved, including expected404.
 receipt,body=api('GET','git/trees/'+sha,sha+'-get-initial')
 if receipt['exitCode']==0:
  verify_remote(body,sha,entries);return {'sha':sha,'source':'already exists exact GET','paths':paths[sha],'getReceipt':sha+'-get-initial.receipt.json'}
 require(receipt['http']==404,'Unexpected tree GET error: '+json.dumps(receipt,ensure_ascii=False))
 for attempt in range(1,4):
  receipt,body=api('POST','git/trees',sha+'-post-'+str(attempt),{'tree':entries})
  if receipt['exitCode']==0:
   verify_remote(body,sha,entries);return {'sha':sha,'source':'created exact immediate children','paths':paths[sha],'postReceipt':sha+'-post-'+str(attempt)+'.receipt.json'}
  # A gateway failure may follow an actual object creation; verify before retry.
  if receipt['http'] in (502,503,504):
   get,remote=api('GET','git/trees/'+sha,sha+'-after-post-'+str(attempt))
   if get['exitCode']==0:
    verify_remote(remote,sha,entries);return {'sha':sha,'source':'POST gateway error, then actual exact GET','paths':paths[sha],'postReceipt':sha+'-post-'+str(attempt)+'.receipt.json','getReceipt':sha+'-after-post-'+str(attempt)+'.receipt.json'}
   require(get['http']==404,'Unexpected diagnostic GET after gateway error')
   if attempt<3:
    time.sleep(.5*attempt);continue
  raise RuntimeError('Tree POST failed '+sha+': '+json.dumps({k:receipt[k] for k in ['http','exitCode','message','errors']},ensure_ascii=False))
 raise RuntimeError('No tree completion')

try:
 pending=set(nodes)-set(state['confirmedTrees'])
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  while pending:
   ready=sorted(sha for sha in pending if all(r['type']!='tree' or r['sha'] in state['confirmedTrees'] for r in nodes[sha]))
   require(ready,'Directory DAG dependencies not closed')
   futures={pool.submit(make_tree,sha):sha for sha in ready}
   for future in concurrent.futures.as_completed(futures):
    sha=futures[future]
    try:proof=future.result()
    except BaseException as error:
     failure={'sha':sha,'paths':paths[sha],'type':type(error).__name__,'message':sanitized(str(error)),'at':now()}
     with LOCK:
      state['firstFailure']=state['firstFailure'] or failure;save(OUT/'tree-sync-state.json',state)
     print(json.dumps({'status':'tree-failed','failure':failure,'refsChanged':False}),flush=True);raise
    state['confirmedTrees'][sha]=proof;pending.remove(sha);save(OUT/'tree-sync-state.json',state)
    n=len(state['confirmedTrees'])
    if n%10==0 or sha==EXPECTED:print(json.dumps({'status':'tree-confirmed','confirmed':n,'total':len(nodes),'sha':sha,'path':paths[sha][0],'source':proof['source'],'refsChanged':False}),flush=True)
 require(EXPECTED in state['confirmedTrees'],'Root tree not confirmed')
 receipt,root=api('GET','git/trees/'+EXPECTED,'root-final-get')
 require(receipt['exitCode']==0,'Final root GET failed');verify_remote(root,EXPECTED,nodes[EXPECTED])
 require(git('rev-parse','HEAD').decode().strip()==COMMIT,'ROOT HEAD changed; no refs mutated by this tool')
 state['status']='COMPLETE_EXACT_TREE_OBJECTS_ONLY';state['actualRootTree']=root['sha'];state['completedAt']=now();state['exactRoot']=True
except BaseException as error:
 state['status']='FAILED_TREE_OBJECTS_ONLY';state['firstFailure']=state['firstFailure'] or {'type':type(error).__name__,'message':sanitized(str(error)),'at':now()};state['completedAt']=now();raise
finally:save(OUT/'tree-sync-state.json',state)
files={str(p.relative_to(OUT)):{'bytes':p.stat().st_size,'sha256':sha256(p)} for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='evidence-files.json'}
save(OUT/'evidence-files.json',{'status':state['status'],'actualRootTree':state.get('actualRootTree'),'refsChanged':False,'files':files,'uploaderSourcePath':str(Path(__file__)),'uploaderSourceSha256':sha256(__file__)})
print(json.dumps({'status':state['status'],'actualRootTree':state['actualRootTree'],'exact':True,'treeObjects':len(nodes),'refsChanged':False,'commitsCreated':False,'receiptDirectory':str(OUT),'sourceSha256':sha256(__file__)}),flush=True)
