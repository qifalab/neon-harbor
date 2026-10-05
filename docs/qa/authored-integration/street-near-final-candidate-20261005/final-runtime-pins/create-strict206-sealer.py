from pathlib import Path
import hashlib,json
ROOT=Path(__file__).parent;old=Path('/tmp/neon-native-recapture-final-seal-20261005.py');new=ROOT/'strict-final206-source-pin-sealer.py'
source=old.read_text();assert hashlib.sha256(old.read_bytes()).hexdigest()=='7bfed7f4fe7461ed2d08996d6d279c434a827872fce1d0e1df81bca311773f25'
needle=" problem(len(build['assets'])==len(authored['assets'])==192,'Current authored runtime must contain actual192 assets')";assert source.count(needle)==1
replacement=""" # Explicit final206 guard; only approved7-additions/9-changes from actual5cd199.
 # Original192/199 sealers and raw historical builds remain unchanged.
 final_receipt_path=Path('/workspace/neon-candidates/final-runtime-pin-refresh-20261005-0533/metadata-refresh-receipt.json')
 problem(digest(final_receipt_path)=='1597f6e8d982df354496049209814a5577432ce58a5c679aca2a5af39542a6e7','Original supplied final206 metadata receipt bytes changed')
 final_receipt=load(final_receipt_path)
 problem(final_receipt.get('status')=='SOURCE_ONLY_FINAL206_METADATA_REFRESHED_NATIVE_ART_PENDING','Final206 explicit source-only receipt missing')
 problem(digest(info_path)=='9519740965c34cb55fa95a8b601187eaac32cf231a75af8adb2058f07ccfd943','Actual final206 raw build bytes changed')
 problem(len(build['assets'])==len(authored['assets'])==206,'Final authored runtime must contain exactly actual206 assets')
 parent_build_path=b/'runtime-amendments/final-dense-bakery-ceramics-mp-css-20261005/original-parent-build-info-5cd-333332feb919.json'
 problem(digest(parent_build_path)=='333332feb9191772e2a1d653c22c1c2827fd8198258fe7bb46cc3d1ee2e1de3d','Actual original5cd199 build bytes changed')
 parent_assets=load(parent_build_path)['assets']
 problem(len(parent_assets)==199 and parent_assets==final_receipt['parentAssets'],'Original5cd199 complete dictionary changed')
 delta={'added':{p:build['assets'][p] for p in sorted(build['assets'].keys()-parent_assets.keys())},'changed':{p:{'before':parent_assets[p],'after':build['assets'][p]} for p in sorted(build['assets'].keys()&parent_assets.keys()) if build['assets'][p]!=parent_assets[p]},'removed':sorted(parent_assets.keys()-build['assets'].keys()),'unchangedCount':sum(build['assets'][p]==parent_assets[p] for p in build['assets'].keys()&parent_assets.keys())}
 problem(delta==final_receipt['exactRuntimeDeltaFrom5cd199'],'Actual final build does not match explicit supplied7-added/9-changed delta')
 problem(set(delta['added'])=={'assets/harbor/bakery/LICENSE-ASSETS-CC0.txt','assets/harbor/bakery/bread-crust-albedo.png','assets/harbor/bakery/bread-crust-height.png','assets/harbor/bakery/bread-crust-roughness.png','assets/harbor/bakery/manifest.json','src/harbor-bread-art.js','src/harbor-ceramic-art.js'} and set(delta['changed'])=={'assets/harbor/vegetation/asset-manifest.json','assets/harbor/vegetation/quay-banyan-a.glb','assets/harbor/vegetation/quay-banyan-b.glb','assets/harbor/vegetation/quay-banyan-c.glb','src/harbor-district.js','src/harbor-frontage-profiles.js','src/harbor-sample-trees.js','src/multiplayer.js','styles.css'} and not delta['removed'] and delta['unchangedCount']==190,'Final delta exceeds centrally approved paths/counts')
 problem(build['assets']==final_receipt['runtimeAssets'],'Final explicit runtime source/image/model pins changed')
 for rel,pin in final_receipt['runtimeAssets'].items():problem(digest(contained(w,rel))==pin,'Final actual source/asset pin changed:'+rel)
 notes.append('Strict206 copy binds actual951974 build and explicit7-added/9-changed/190-unchanged/0-removed delta from original5cd199. Original source/build/FAIL/proof cases remain historical. This sealer performs no product tests/build/native/art acceptance.')"""
with new.open('x') as f:f.write(source.replace(needle,replacement))
receipt={'originalSealerPath':str(old),'originalSealerSHA256':hashlib.sha256(old.read_bytes()).hexdigest(),'copiedSealerPath':str(new),'copiedSealerSHA256':hashlib.sha256(new.read_bytes()).hexdigest(),'onlyChangedGuard':'Only fixed192 runtime guard replaced with exact final206/951974 explicit receipt SHA and exact approved7-additions/9-changes/190unchanged/0removals plus full actual source/image/model SHA binding. No budgets, workflows, case sets, native criteria or other pin-refresh policy changed. New explicit breadCeramicFinishAmendment is recognized by the original sealer.'}
(ROOT/'strict206-sealer-copy-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
