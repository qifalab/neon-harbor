from pathlib import Path
import hashlib,json,shutil,difflib,struct
r=Path('/workspace/scratch/neon-harbor');d=Path(__file__).resolve().parent;payload=d/'payload';payload.mkdir(exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest();describe=lambda p:{'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
js=(d/'harbor-authored-transport-assets.before.js').read_text();assets=json.loads(js[js.index('{'):js.rindex(';')]);assetsOld=json.loads(json.dumps(assets));entries=[];sources=[]
for kind,stem,author,master in [('bus','serein-d11','author_bus.py','serein-d11-master.blend'),('tram','vesper-t9','author_tram.py','vesper-t9-master.blend')]:
 p=d/'art-source/transport'/kind;cpu=json.loads((p/'review/cpu-asset-check.json').read_text());assert cpu['staticChecksPassed']and not cpu['issues'];oldManifest=json.loads((d/'history/ef92-before-enclosure/art-source/transport'/kind/'asset-manifest.json').read_text());manifest=json.loads(json.dumps(oldManifest));manifest['totalGlbBytes']=cpu['totalGlbBytes']
 for t in cpu['tiers']:
  source=p/'models'/t['file'];assert source.stat().st_size==t['bytes'] and sha(source.read_bytes())==t['sha256'];rec=next(v for v in manifest['assets']if v['tier']==t['tier']);rec.update({key:t[key]for key in ['sha256','bytes','triangles','materialCount','primitiveCount','externalUris']});assetEntry=next(v for v in assets[kind]['files']if v['tier']==t['tier']);assetEntry.update({'sha256':t['sha256'],'bytes':t['bytes']})
  for target in ['assets/harbor/transport/'+kind+'/'+source.name,'art-source/transport/'+kind+'/models/'+source.name]:
   dest=payload/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
  entries.append({'kind':kind,'source':str(source),'target':'assets/harbor/transport/'+kind+'/'+source.name,'bytes':t['bytes'],'sha256':t['sha256']})
 assets[kind]['totalGlbBytes']=cpu['totalGlbBytes']
 for f in [p/'source'/author,p/'source'/master]:
  target='art-source/transport/'+kind+'/source/'+f.name;dest=payload/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest);sources.append({'target':target,**describe(f)})
 for name in ['cpu-asset-check.json','authoring-stats.json','export-tangent-hygiene.json']:
  source=p/'review'/name;dest=payload/'art-source/transport'/kind/'review'/name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
 manifest['editableSource']=describe(p/'source'/master);manifest['designSource']=describe(p/'source'/author);manifest['cpuProof']=describe(p/'review/cpu-asset-check.json')
 manifest['upperEnclosureAmendment']={'status':'CPU_GEOMETRY_CHECKED_NATIVE_ART_REVIEW_PENDING','revision':'upper-enclosure-2026-10-05','originalManifest':describe(d/'history/ef92-before-enclosure/art-source/transport'/kind/'asset-manifest.json'),'originalEditableSource':oldManifest['editableSource'],'originalDesignSource':oldManifest['designSource'],'originalCpuProof':oldManifest['cpuProof'],'scope':'Only original curved upper-deck side/end spandrels and 8 far-corner-return triangles; all original materials, textures, canonical layout/door/wheel/hook/physics unchanged','nativeValidated':False,'originalSourceProvenanceRemainsHistorical':True}
 source=p/'asset-manifest.json';source.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');dest=payload/'art-source/transport'/kind/'asset-manifest.json';dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
 # Everything except the declared source/metadata/models must remain original.
 original=d/'history/ef92-before-enclosure/art-source/transport'/kind
 for f in original.rglob('*'):
  if not f.is_file() or f.name in [author,master,'asset-manifest.json']:continue
  assert f.read_bytes()==(p/f.relative_to(original)).read_bytes(),str(f)+' changed helper/layout/texture'
assert assets['ferry']==assetsOld['ferry']
newJs=js[:js.index('{')]+json.dumps(assets,indent=2,ensure_ascii=False)+';\n';newJsPath=payload/'src/harbor-authored-transport-assets.js';newJsPath.parent.mkdir(parents=True,exist_ok=True);newJsPath.write_text(newJs);assetModuleSha=sha(newJsPath.read_bytes())
# Preserve original method files byte for byte before active resource-pin updates.
for method in ['transport','transport-owner']:
 base=r/'tools/native-review/methods'/method;hist=d/'history/native-before-enclosure'/method;hist.mkdir(parents=True,exist_ok=True)
 for name in ['runtime-resources.json','method-manifest.json']:shutil.copy2(base/name,hist/name)
 oldResources=json.loads((base/'runtime-resources.json').read_bytes());resources=json.loads(json.dumps(oldResources))
 for v in resources['files']:
  if v['kind']in ['bus','tram']:
   q=next(e for e in entries if e['target']==v['target']);v.update(q)
 # All ferry records remain untouched historical inputs.
 for oldEntry,newEntry in zip(oldResources['files'],resources['files']):
  if oldEntry['kind']=='ferry':assert oldEntry==newEntry
 integration=d/'transport-asset-integration-files.json'
 if not integration.exists():integration.write_text(json.dumps({'status':'EXACT_FINAL_C_ASSET_PINS_NATIVE_UNRUN','files':resources['files'],'authoredSourceFiles':sources,'assetModule':{'target':'src/harbor-authored-transport-assets.js',**describe(newJsPath)},'oldIntegrationSource':{'path':oldResources['source'],'sha256':oldResources['sourceSha256']}},indent=2)+'\n')
 resources['source']=str(integration);resources['sourceSha256']=sha(integration.read_bytes());resources['upperEnclosureAmendment']={'status':'EXACT_ASSET_PIN_AMENDMENT_NATIVE_UNRUN','originalResources':describe(hist/'runtime-resources.json'),'originalIntegrationSource':{'path':oldResources['source'],'sha256':oldResources['sourceSha256']},'changedKinds':['bus','tram'],'ferryRecordsUnchanged':True,'noMethodCodeChanges':True}
 target=payload/'tools/native-review/methods'/method;target.mkdir(parents=True,exist_ok=True);resPath=target/'runtime-resources.json';resPath.write_text(json.dumps(resources,indent=2)+'\n');manifest=json.loads((base/'method-manifest.json').read_text());manifest['resources']['path']=str(resPath);manifest['resources']['sha256']=sha(resPath.read_bytes());pins='authoredSourcePins'if method=='transport'else'servedSourcePins';oldAssetPin=manifest[pins]['src/harbor-authored-transport-assets.js'];manifest[pins]['src/harbor-authored-transport-assets.js']=assetModuleSha
 manifest['upperEnclosureAssetAmendment']={'status':'RESOURCE_AND_ASSET_MODULE_PINS_UPDATED_NATIVE_UNRUN','originalMethodManifest':describe(hist/'method-manifest.json'),'originalAssetModuleSha256':oldAssetPin,'actualAssetModuleSha256':assetModuleSha,'changedRuntimeAssetCount':6,'ferryResourcesAndAllMethodCodeUnchanged':True,'historicalProvenanceAndOtherGuardsPreserved':True}
 (target/'method-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Check all payload runtime/source models are exact duplicates.
for e in entries:
 a=payload/e['target'];b=payload/'art-source/transport'/e['kind']/'models'/Path(e['target']).name;assert a.read_bytes()==b.read_bytes();assert sha(a.read_bytes())==e['sha256']
patch=[]
for kind,author in [('bus','author_bus.py'),('tram','author_tram.py')]:
 before=d/'history/ef92-before-enclosure/art-source/transport'/kind/'source'/author;after=d/'art-source/transport'/kind/'source'/author;patch.extend(difflib.unified_diff(before.read_text().splitlines(True),after.read_text().splitlines(True),fromfile='a/art-source/transport/'+kind+'/source/'+author,tofile='b/art-source/transport/'+kind+'/source/'+author))
(d/'enclosure-author-source.patch').write_text(''.join(patch))
files=[]
for f in sorted(payload.rglob('*')):
 if f.is_file():files.append({'target':str(f.relative_to(payload)),**describe(f)})
(d/'payload-ledger.json').write_text(json.dumps({'status':'CPU_EXPORT_CHECKED_NATIVE_PENDING','productionAndRequiredPreflightFiles':files,'runtimeAssetEntries':entries,'sameRuntimeAndAuthoringModelCopies':True,'ferryUnchanged':True,'rootUntouched':True,'assetModuleSha256':assetModuleSha,'independentReviewPending':True},indent=2)+'\n')
print(json.dumps({'fileCount':len(files),'assetModuleSha256':assetModuleSha,'sixAssetPins':entries,'cpu':[(k,json.loads((d/'art-source/transport'/k/'review/cpu-asset-check.json').read_text())['staticChecksPassed'])for k in ['bus','tram']]},indent=2))
