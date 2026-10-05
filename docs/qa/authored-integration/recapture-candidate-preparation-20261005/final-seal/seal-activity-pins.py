#!/usr/bin/env python3
"""Source-only activity pin refresh. Default dry; no git mutation or tool execution."""
import argparse,copy,datetime,hashlib,json,re,struct,subprocess,sys
from pathlib import Path

PAGES_PIN='cd09551e40a576172cf21c42871c10245056c94fa99d7be115f21c2efdc11fcb'
BASELINE='7a90f7934b7c9d1af5c4494bf08c4ec337c373e4'
HOME_LOBBY='assets/harbor/home/home-lobby-fittings.glb'
B_SOURCES=('src/harbor-district.js','src/harbor-frontage-profiles.js')
def fail(message):raise ValueError(message)
def digest_bytes(value):return hashlib.sha256(value).hexdigest()
def digest(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  while b:=f.read(1024*1024):h.update(b)
 return h.hexdigest()
def jb(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def contained(root,relative):
 p=Path(relative)
 if p.is_absolute() or '..' in p.parts:fail('Non-contained activity pin: '+relative)
 result=root/p
 if result.is_symlink() or not result.is_file():fail('Missing/symlink pin target: '+str(result))
 return result
def load(path):return json.loads(path.read_text())
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--worktree',required=True)
 ap.add_argument('--bread-receipt',help='Actual finalized B source/unchanged-bounds receipt; source evidence only')
 ap.add_argument('--output',required=True,help='New unique receipt JSON, outside worktree')
 ap.add_argument('--apply',action='store_true')
 ap.add_argument('--methods-frozen',action='store_true',help='Caller has finished merging all approved methods/runtime')
 args=ap.parse_args();w=Path(args.worktree).resolve();b=w/'tools/native-review';out=Path(args.output).resolve()
 if not b.is_dir():fail('Worktree has no native-review bundle')
 if out.exists() or out.is_relative_to(w):fail('Receipt must be a new path outside worktree')
 if args.apply and not args.methods_frozen:fail('Apply requires explicit methods-frozen; use dry while merging')
 try:
  import yaml
 except ImportError:fail('Python PyYAML is required for source YAML validation; no install is performed')
 changes={};before={};blockers=[];notes=[]
 def current(path):return changes.get(path,path.read_bytes())
 def plan(path,bytes_):
  if path not in before:before[path]=path.read_bytes()
  if bytes_!=before[path]:changes[path]=bytes_
 def planjson(path,x):plan(path,jb(x))
 def problem(condition,message):
  if not condition:blockers.append(message)
 pages=w/'.github/workflows/pages.yml'
 if not pages.exists():
  matches=list((w/'.github/workflows').glob('*pages*'))
  if len(matches)!=1:fail('Cannot identify the existing Pages workflow')
  pages=matches[0]
 problem(digest(pages)==PAGES_PIN,'Pages bytes changed; this sealer never updates its historical gate pin')
 ci_path=w/'.github/workflows/ci.yml';native_path=w/'.github/workflows/native-art.yml'
 ci=yaml.load(ci_path.read_text(),Loader=yaml.BaseLoader);native=yaml.load(native_path.read_text(),Loader=yaml.BaseLoader)
 problem(ci.get('permissions')=={'contents':'read'},'CI permissions must remain contents:read')
 problem(native.get('permissions')=={'contents':'read'},'Native permissions must remain contents:read')
 cin=ci['on'];cn=cin['workflow_dispatch']['inputs'];cc=cin['workflow_call']['inputs']
 problem(cc['capture_native'].get('default')=='false' and cc['native_only'].get('default')=='false','Reusable CI must default capture_native/native_only false so Pages runs functional gate')
 problem(cn['capture_native'].get('default')=='true','Manual CI capture_native default must remain true')
 problem(cc['selected_case_ids'].get('default')=='all','Reusable CI selection default must remain all')
 for job in ['verify','multiplayer']:
  problem(ci['jobs'][job].get('if')=="${{ !(github.event_name == 'workflow_dispatch' && inputs.native_only == true) }}",job+' must skip only explicit manual native_only')
 nj=ci['jobs'].get('native-art',ci['jobs'].get('native-evidence',ci['jobs'].get('native')))
 if nj is None:
  possible=[j for j in ci['jobs'].values() if j.get('uses')=='./.github/workflows/native-art.yml']
  nj=possible[0] if len(possible)==1 else {}
 problem(nj.get('uses')=='./.github/workflows/native-art.yml','CI must call the feature native reusable workflow')
 problem(nj.get('if') in ["github.event_name == 'workflow_dispatch' && inputs.capture_native == true","${{ github.event_name == 'workflow_dispatch' && inputs.capture_native == true }}","${{ github.event_name == 'workflow_dispatch' && (inputs.capture_native == true || inputs.native_only == true) }}"],'Native CI job must require manual capture_native or explicit native_only')
 problem(nj.get('with',{}).get('selected_case_ids')=='${{ inputs.selected_case_ids }}','Selected IDs must pass to native workflow unchanged')
 max_parallel=int(native['jobs']['capture']['strategy']['max-parallel'])
 problem(max_parallel==12,'Native max-parallel must be12')
 problem(native['jobs']['capture']['strategy'].get('fail-fast')=='false','A failure must not cancel independent evidence cases')
 problem(native['jobs']['capture'].get('needs')=='select','Capture must depend on strict selection job')
 problem(native['jobs']['capture']['strategy'].get('matrix')=='${{ fromJSON(needs.select.outputs.matrix) }}','Native matrix must be the validated selector result')
 for event in ['workflow_call','workflow_dispatch']:
  problem(native['on'][event]['inputs']['selected_case_ids'].get('default')=='all','Native24 default matrix must remain all')
 for job in ['select','capture']:
  uploads=[s for s in native['jobs'][job]['steps'] if s.get('uses')=='actions/upload-artifact@v4']
  problem(bool(uploads) and all(s.get('if')=='always()' for s in uploads),'Native'+job+' must preserve failure artifacts always')
 if cn['native_only'].get('default')!='true':notes.append('CI no-input manual dispatch still repeats functional jobs. Native-only requires explicit inputs supported by actual dispatch or the separately reviewed no-input feature defaults. This script does not silently change dispatch policy; activation remains unproven until an actual run.')
 cfg_path=b/'cases.json';cfg=load(cfg_path);rows=cfg['cases'];matrix=load(b/'native-matrix.json')['include']
 ids=[r['id'] for r in rows];mid=[r['id'] for r in matrix]
 problem(len(ids)==24 and len(set(ids))==24,'There must be exactly24 unique existing cases')
 problem(set(ids)==set(mid) and len(mid)==len(set(mid))==24,'Selector matrix must contain exactly the existing24 IDs once')
 problem(cfg.get('baselineHead')==BASELINE,'Fixed baseline changed')
 low={'continuous-tour','resident-loop'};paired=sum(r['paired'] for r in rows);author_only=len(rows)-paired
 for r in rows:
  mr=next((v for v in matrix if v['id']==r['id']),{})
  problem(mr.get('job_timeout_minutes')==r['jobTimeoutMinutes'],'Case/selector job budget mismatch:'+r['id'])
  problem(mr.get('evidence_label')==('Low functional tour' if r['id']=='continuous-tour' else 'Low functional resident day' if r['id']=='resident-loop' else 'Native High'),'Case/selector quality label mismatch:'+r['id'])
  minimum=1200+(2 if r['paired'] else 1)*(r['originalBudgetSeconds']+120)
  problem(r['jobTimeoutMinutes']*60>=minimum,'Workflow budget cannot contain preparation + all original whole/owned executor windows:'+r['id'])
 cfg.update(caseCount=len(rows),pairedCases=paired,authoredOnlyCases=author_only,authoredOnlyFunctionalCases=len(low),highNativeCaseCount=len(rows)-len(low),captureCompletionIsArtApproval=False)
 planjson(cfg_path,cfg)
 dictionaries_path=b/'expected-runtime-dictionaries.json';dictionaries=load(dictionaries_path)
 authored=dictionaries['authored'];baseline=dictionaries['baseline'];info=authored['currentBuildInfo']
 info_path=contained(w,info['path']) if info['path'].startswith('tools/native-review/') else contained(b,info['path'])
 info['path']=str(info_path.relative_to(b));build=load(info_path)
 problem(build.get('version')=='0.8.0' and authored['version']=='0.8.0','Current authored version must be0.8.0')
 problem(len(build['assets'])==len(authored['assets'])==192,'Current authored runtime must contain actual192 assets')
 problem(build['assets']==authored['assets'],'Current actual build-info and authored expected dictionary disagree; supply actual final build, never infer a receipt')
 problem(digest(info_path)==info['sha256'],'Current original build-info bytes do not match declared SHA')
 problem(len(baseline['assets'])==156,'Fixed baseline156 dictionary changed')
 for rel,pin in authored['assets'].items():
  try:actual=digest(contained(w,rel))
  except Exception as e:blockers.append(str(e));continue
  problem(actual==pin,'Authored actual source/asset differs from final actual build:'+rel)
 info.update(bytes=info_path.stat().st_size,assetCount=len(build['assets']),version=build['version'],revision=build.get('revision'))
 planjson(dictionaries_path,dictionaries)
 # The reviewed HOME amendment really has19 unique primitive geometries;
 # do not adjust the unchanged7 texture/image or0 bone guards.
 glb=contained(w,HOME_LOBBY)
 with glb.open('rb') as f:
  header=f.read(12);length,kind=struct.unpack('<II',f.read(8));glb_json=json.loads(f.read(length))
 problem(header[:4]==b'glTF' and kind==0x4e4f534a,'HOME lobby must be the actual GLB JSON chunk')
 geom=sum(len(m.get('primitives',[])) for m in glb_json.get('meshes',[]))
 problem((geom,len(glb_json.get('textures',[])),len(glb_json.get('images',[])),len(glb_json.get('skins',[])))==(19,7,7,0),'HOME reviewed actual19 geometry/7 texture/7 image/0 bone fixture no longer matches')
 exp_path=b/'methods/harbor/expectations.mjs';exp=exp_path.read_text();pattern=r"('home-lobby-fittings':\{folder:'home',geometries:)(14|19)(,textures:7,images:7,bones:0,sha256:')([0-9a-f]{64})('\})"
 matches=list(re.finditer(pattern,exp));problem(len(matches)==1,'HOME activity expectation table no longer has the reviewed exact fixture')
 if len(matches)==1:
  exp=re.sub(pattern,lambda m:m[1]+'19'+m[3]+authored['assets'][HOME_LOBBY]+m[5],exp);plan(exp_path,exp.encode())
 home_source='src/harbor-home-authored.js';common=load(b/'methods/harbor/evidence/common-pose-proof.json')
 homepins=[v for k,v in common['sourceHashes'].items() if k.endswith('/'+home_source)]
 problem(homepins==[authored['assets'][home_source]],'Active common-pose HOME source pin is stale; its approved source-only amendment must be supplied')
 wide_path=b/'methods/harbor/evidence/frontage-wide-static-proof.json';wide=load(wide_path);old_wide=copy.deepcopy(wide)
 updated={rel:authored['assets'][rel] for rel in B_SOURCES};stale={rel:{'before':wide['sourceHashes']['authored'].get(rel),'after':pin} for rel,pin in updated.items() if wide['sourceHashes']['authored'].get(rel)!=pin}
 active_b_amendment=wide.get('breadCeramicFinishAmendment',wide.get('shopDisplayCraftRefinementAmendment'))
 if active_b_amendment:
  after_pins=active_b_amendment.get('sourceHashesAfter',active_b_amendment.get('actualSourceHashesAfter',{}))
  problem(all(after_pins.get(rel)==pin for rel,pin in updated.items()),'B current amendment source hashes do not match both final source pins')
 if stale or not active_b_amendment:
  if not args.bread_receipt:blockers.append('B active wide source pins/amendment need the actual finalized unchanged-bounds/physics receipt')
  else:
   rp=Path(args.bread_receipt).resolve();rb=rp.read_bytes();receipt=load(rp)
   wide['sourceHashes']['authored'].update(updated)
   wide['breadCeramicFinishAmendment']={'status':'ACTIVE_SOURCE_PIN_AMENDMENT_WITH_SUPPLIED_ORIGINAL_CPU_EVIDENCE','at':utc(),'sourceHashesBefore':{rel:old_wide['sourceHashes']['authored'].get(rel) for rel in B_SOURCES},'sourceHashesAfter':updated,'actualReceipt':{'path':str(rp),'bytes':len(rb),'sha256':digest_bytes(rb),'value':receipt},'originalGeometryCaseDataUnchanged':True,'originalCaseGeometryReexecutedBySealer':False,'humanArtAcceptance':False,'scope':'Only approved bread/ceramic appearance source pins refreshed. Original derived case bounds/physics/standing/path tables retained; this sealer performs no new geometric/native/art test.'}
   problem(wide.get('cases')==old_wide.get('cases') and wide.get('shopDisplayArtAmendment')==old_wide.get('shopDisplayArtAmendment'),'Historical B case geometry/shopDisplayArtAmendment changed')
   planjson(wide_path,wide)
 # Only active family SHA maps and active fields are refreshed. Provenance,
 # original sealed records, old build-info and curated-original ledger are read-only.
 for family in ['resident','resident-extra']:
  folder=b/'methods'/family;sp=folder/'SEALED_SHA256.json';seal=load(sp)
  active=folder/'docs/CURRENT_METHOD_AMENDMENT.json'
  if active.exists():
   value=load(active);tool=folder/('tools/capture-resident-extra.mjs' if family=='resident-extra' else 'tools/capture-resident-native.mjs')
   if 'activeMethodSha256' in value:value['activeMethodSha256']=digest(tool);planjson(active,value)
   seal[str(active.relative_to(folder))]=digest_bytes(current(active))
  for tool in (folder/'tools').glob('*.mjs'):seal[str(tool.relative_to(folder))]=digest_bytes(current(tool))
  for rel in list(seal):
   target=contained(folder,rel)
   actual=digest_bytes(current(target))
   if '/provenance/' in '/'+rel or rel.startswith('patches/'):
    problem(seal[rel]==actual,'Historical family entry changed:'+family+'/'+rel)
   else:seal[rel]=actual
  planjson(sp,seal)
 for family in ['transport','transport-owner']:
  folder=b/'methods'/family;mp=folder/'method-manifest.json';m=load(mp);tool=contained(folder,m['tool']['path']);resources=contained(folder,'runtime-resources.json')
  m['tool'].update(sha256=digest(tool),bytes=tool.stat().st_size);m['resources']['sha256']=digest(resources)
  if 'canonical' in m:m['canonical']['sha256']=digest(contained(folder,'canonical-layouts.json'))
  for field in ['sourcePins','authoredSourcePins','servedSourcePins']:
   for rel,pin in m.get(field,{}).items():problem(digest(contained(w,rel))==pin,'Unapproved '+family+' active source pin differs:'+rel)
  if 'serverSha256' in m:problem(digest(w/'tools/server.mjs')==m['serverSha256'],family+' server implementation changed')
  planjson(mp,m)
 history={p:digest(p) for p in b.rglob('*') if p.is_file() and ('provenance' in p.parts or p.name=='curated-original-provenance.json' or p.parent.name=='expected-build-provenance')}
 catalog_path=b/'bundle-manifest.json';catalog=load(catalog_path)
 actual_files=[p for p in b.rglob('*') if p.is_file() and p!=catalog_path and '__pycache__' not in p.parts and p.suffix!='.pyc']
 for p in actual_files:
  if p.is_symlink():blockers.append('Bundle symlink:'+str(p))
 catalog['files']={str(p.relative_to(b)):{'bytes':len(current(p)),'sha256':digest_bytes(current(p))} for p in sorted(actual_files)}
 catalog.update(nativeWorkflowSha256=digest(native_path),ciWorkflowSha256=digest(ci_path),unchangedPagesSha256=PAGES_PIN,caseCount=len(rows),pairedHighCases=paired,authoredOnlyHighCases=author_only-len(low),authoredOnlyLowFunctionalCases=len(low),maxParallelNativeVMs=max_parallel,artAcceptance='PENDING_HUMAN_NATIVE_REVIEW')
 catalog['activeCases']={r['id']:{'activeBudgetSeconds':r['originalBudgetSeconds'],'historicalBudgetSeconds':r.get('historicalOriginalBudgetSeconds',r['originalBudgetSeconds']),'jobTimeoutMinutes':r['jobTimeoutMinutes'],'paired':r['paired']} for r in rows}
 catalog['currentRuntimeProvenance'].update(authoredAssetCount=len(authored['assets']),baselineAssetCount=len(baseline['assets']),currentLocalBuildInfoPath=info['path'],currentLocalBuildInfoSHA256=info['sha256'],historicalBaselineAndAuthoredOriginalFilesUnchanged=True,nativeCaptureAndArtApproval='PENDING_ACTUAL_NEW_RUN_AND_HUMAN_REVIEW',refreshChangedRuntimeSource=True)
 catalog['activityPinRefresh']={'status':'SOURCE_ONLY_ACTIVITY_PINS_NO_NATIVE_ACCEPTANCE','at':utc(),'historicalRecordBytesPreserved':True,'actualCurrentBuildInfoSHA256':info['sha256'],'caseCount':len(rows),'nativeOnlyNoInputDefault':cn['native_only'].get('default'),'dispatchActivationActuallyExecutedBySealer':False,'productTestsBuildBrowserGpuExecutedBySealer':False}
 planjson(catalog_path,catalog)
 inventory={'trackedBefore':subprocess.check_output(['git','ls-files','--','tools/native-review','.github/workflows'],cwd=w,text=True).splitlines(),'allActualBundleFiles':[str(p.relative_to(w)) for p in sorted(actual_files)],'untrackedBundleFiles':subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','tools/native-review'],cwd=w,text=True).splitlines()}
 change_rows={str(p.relative_to(w)):{'beforeSha256':digest_bytes(before[p]),'afterSha256':digest_bytes(v),'beforeBytes':len(before[p]),'afterBytes':len(v)} for p,v in changes.items()}
 result={'status':'BLOCKED_NO_WORKTREE_WRITES' if blockers else 'SOURCE_ONLY_DRY_READY' if not args.apply else 'SOURCE_ONLY_ACTIVITY_PINS_APPLIED_NATIVE_UNRUN','worktree':str(w),'at':utc(),'applyRequested':args.apply,'blockers':blockers,'notes':notes,'plannedChanges':change_rows,'fileCount':len(catalog['files']),'caseCount':len(rows),'maxParallel':max_parallel,'currentBuildInfo':info,'inventory':inventory,'nativeRun':False,'gitRefsIndexMutated':False,'productTestsBuildBrowserGpuExecuted':False}
 if args.apply and not blockers:
  for p,old in before.items():
   if p.read_bytes()!=old:fail('File changed during planning; refusing apply:'+str(p))
  for p,pin in history.items():
   if digest(p)!=pin:fail('Historical file changed during planning:'+str(p))
  for p,v in changes.items():p.write_bytes(v)
  for p,pin in history.items():
   if digest(p)!=pin:fail('Historical file bytes were unexpectedly changed:'+str(p))
  result['finalBundleManifestSHA256']=digest(catalog_path)
 out.parent.mkdir(parents=True,exist_ok=True)
 with out.open('x') as f:json.dump(result,f,ensure_ascii=False,indent=2);f.write('\n')
 print(json.dumps({'status':result['status'],'receipt':str(out),'receiptSha256':digest(out),'files':len(catalog['files']),'changedMetadataFiles':len(changes),'blockers':blockers,'notes':notes}))
 return 1 if blockers else 0

if __name__=='__main__':
 try:sys.exit(main())
 except Exception as e:print(json.dumps({'status':'SEALER_ERROR_NO_ACCEPTANCE','error':str(e)}),file=sys.stderr);sys.exit(2)
