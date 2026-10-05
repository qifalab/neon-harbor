"""Selective literal native-tool adoption into final isolated child only; no GPU/build/fullrules/git."""
import argparse,datetime,hashlib,json,subprocess
from pathlib import Path
w=Path('/workspace/neon-candidates/harbor-material-lighting-final-20261005');r=Path('/workspace/neon-candidates/harbor-material-lighting-final-20261005-review');q=w/'docs/qa/material-lighting-adoption-20261005'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def save(p,v):assert not p.exists(),p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def cp(p,t):assert not t.exists(),t;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(p.read_bytes())
ap=argparse.ArgumentParser();ap.add_argument('--candidate',required=True);ap.add_argument('--manifest-sha256',required=True);ap.add_argument('--seal-sha256',required=True);ap.add_argument('--label',required=True);a=ap.parse_args();c=Path(a.candidate).resolve()
assert a.label.replace('-','').isalnum() and not any(x in a.label for x in ['..','/','\\'])
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=w,text=True).strip()=='ef4112bed4624c9c969b5b5f3746ccbfb64817aa'
assert sha(w/'dist/build-info.json')=='c6b72d9e690fea559643cbe7da74523618a1812fd3484dd1091833cc95ed98a2'
f=r/'final-idle-production-checks';source=load(f/'all-production-test-source-hashes-after.json');assert len(source)==401 and {p:sha(w/p) for p in source}==source
m=c/'PAYLOAD_MANIFEST.json';s=c/'SEAL.json';assert sha(m)==a.manifest_sha256 and sha(s)==a.seal_sha256;manifest=load(m);seal=load(s);sealed=seal['files'];assert isinstance(sealed,list) and seal['fileCount']==len(sealed)
for row in sealed:
 rel=Path(row['path']);assert not rel.is_absolute() and '..' not in rel.parts and not (c/rel).is_symlink();assert sha(c/rel)==row['sha256'] and (c/rel).stat().st_size==row['bytes'],str(rel)
rows=manifest['files'];assert rows and len({x['path'] for x in rows})==len(rows)
allowed={'tools/native-review/methods/transport/native-transport-high.mjs','tools/native-review/methods/transport/method-manifest.json','tools/native-review/cases.json','tools/native-review/native-matrix.json'}
for row in rows:
 rel=row['path'];assert rel in allowed or rel.startswith('tools/native-review/methods/transport/') and rel.endswith('AMENDMENT-20261005.json'),rel
 payload=c/'payload'/rel;assert sha(payload)==row['sha256'] and payload.stat().st_size==row['bytes'];old=row['previous']
 if old is None:assert not (w/rel).exists(),rel
 else:assert sha(w/rel)==old['sha256'] and (w/rel).stat().st_size==old['bytes'],rel
archive=q/'native-transport-protocol-candidates'/a.label;assert not archive.exists()
for row in rows:
 if row['previous'] is not None:cp(w/row['path'],archive/'original-active-targets'/row['path'])
for row in sealed:cp(c/row['path'],archive/'original-sealed-candidate'/row['path'])
cp(s,archive/'original-sealed-candidate/SEAL.json')
for row in rows:(w/row['path']).parent.mkdir(parents=True,exist_ok=True);(w/row['path']).write_bytes((c/'payload'/row['path']).read_bytes())
assert {p:sha(w/p) for p in source}==source
cmd=['node','--check','tools/native-review/methods/transport/native-transport-high.mjs']
with (archive/'syntax.stdout.txt').open('wb') as out,(archive/'syntax.stderr.txt').open('wb') as err:run=subprocess.run(cmd,cwd=w,stdout=out,stderr=err)
receipt={'status':'ACTUAL_SEALED_NATIVE_TRANSPORT_SELECTIVE_PAYLOAD_ADOPTED_CPU_ONLY','atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidate':str(c),'candidateManifestSHA256':sha(m),'candidateSealSHA256':sha(s),'originalSealedCandidateFileCount':len(sealed),'actualAdoptedPayloadFiles':{x['path']:{'sha256':sha(w/x['path']),'bytes':(w/x['path']).stat().st_size} for x in rows},'originalTargetRows':{x['path']:x['previous'] for x in rows},'syntaxCommand':cmd,'syntaxExitCode':run.returncode,'syntaxStdoutSHA256':sha(archive/'syntax.stdout.txt'),'syntaxStderrSHA256':sha(archive/'syntax.stderr.txt'),'productionSourceCount':len(source),'all401ProductionSourceUnchanged':True,'actualNull208BuildInfoSHA256':sha(w/'dist/build-info.json'),'fullRulesRepeated':False,'buildRepeated':False,'gpuExecuted':False,'nativeAcceptance':False,'originalNativeFailuresPreserved':True}
for dst in [r/(a.label+'-adoption-receipt.json'),archive/'adoption-receipt.json']:save(dst,receipt)
print(json.dumps({'status':receipt['status'],'actualPayloadFileCount':len(rows),'receipt':str(r/(a.label+'-adoption-receipt.json')),'receiptSHA256':sha(r/(a.label+'-adoption-receipt.json')),'syntaxExitCode':run.returncode}));raise SystemExit(run.returncode)
