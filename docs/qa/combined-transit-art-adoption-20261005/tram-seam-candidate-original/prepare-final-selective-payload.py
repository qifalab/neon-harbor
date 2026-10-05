from pathlib import Path
import hashlib
import json
import shutil
from datetime import datetime, timezone

EX = Path('/workspace/neon-candidates/tram-waist-spandrel-seam-actual-cpu-export-20261005')
ORIGIN = Path('/workspace/neon-candidates/harbor-material-lighting-final-20261005')
TARGET = Path('/workspace/neon-candidates/harbor-combined-transit-art-final-20261005')
FIRST = Path('/workspace/neon-candidates/tram-waist-spandrel-source-only-seam-candidate-20261005')
CORRECTED = EX / 'corrected-recipe'
PAYLOAD = EX / 'payload'
ART = Path('art-source/transport/tram')
now = datetime.now(timezone.utc).isoformat()

def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def description(p, path=None):
    return {'path': str(path if path is not None else p), 'bytes': p.stat().st_size, 'sha256': sha(p)}

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def copy(source, relative):
    dest = PAYLOAD / relative
    assert not dest.exists(), f'Existing payload not overwritten: {dest}'
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, dest)
    assert sha(dest) == sha(source)

assert not PAYLOAD.exists(), 'Final payload preparation runs once in a fresh external directory.'
original_proposal = json.loads((FIRST / 'source-only-proposal-manifest.json').read_text())
prepared = json.loads((EX / 'inputs-prepared-before-execution.json').read_text())
comparison = json.loads((EX / 'actual-export-comparison-proof.json').read_text())
overlap = json.loads((EX / 'actual-corrected-overlap-removal-proof.json').read_text())
assert comparison['allThreeControlExportsByteReproduceOriginal']
assert comparison['noAdditionalPrimitivesTrianglesMaterialsTexturesHooksOrPhysics']
assert sum(len(t['actualSurfacePresenceSamples']) for t in overlap['tiers']) == 84
cpu = json.loads((CORRECTED / 'review/cpu-asset-check.json').read_text())
assert cpu['staticChecksPassed'] and not cpu['issues']
assert sha(ORIGIN / ART / 'source/author_tram.py') == original_proposal['originalGeneratorSHA256']
assert sha(ORIGIN / ART / 'source/vesper-t9-master.blend') == prepared['originalMasterSHA256']
for row in original_proposal['originalAssets']:
    assert sha(Path(row['path'])) == row['sha256']

# Snapshot every existing original tram asset/source/review, plus runtime fingerprints.
preserved_before = [description(p, p.relative_to(ORIGIN)) for p in sorted((ORIGIN / ART).rglob('*')) if p.is_file()]
preserved_before.append(description(ORIGIN / 'src/harbor-authored-transport-assets.js', 'src/harbor-authored-transport-assets.js'))

for tier in range(3):
    name = f'vesper-t9-lod{tier}.glb'
    copy(CORRECTED / 'models' / name, Path('assets/harbor/transport/tram') / name)
    copy(CORRECTED / 'models' / name, ART / 'models' / name)
copy(CORRECTED / 'source/author_tram.py', ART / 'source/author_tram.py')
copy(CORRECTED / 'source/vesper-t9-master.blend', ART / 'source/vesper-t9-master.blend')

# Historical review files stay unchanged. Actual newly exported reports get new names.
review_names = {
    'cpu-asset-check.json': 'seam-correction-cpu-asset-check-20261005.json',
    'authoring-stats.json': 'seam-correction-authoring-stats-20261005.json',
    'export-tangent-hygiene.json': 'seam-correction-export-tangent-hygiene-20261005.json',
}
for original_name, new_name in review_names.items():
    copy(CORRECTED / 'review' / original_name, ART / 'review' / new_name)
copy(EX / 'actual-export-comparison-proof.json', ART / 'review/seam-correction-array-comparison-20261005.json')
copy(EX / 'actual-corrected-overlap-removal-proof.json', ART / 'review/seam-correction-sampled-overlap-removal-20261005.json')
copy(ORIGIN / ART / 'asset-manifest.json', ART / 'review/seam-correction-original-asset-manifest-20261005.json')

# Runtime source alteration is exactly the three actual Tram GLB SHA literals.
runtime_rel = Path('src/harbor-authored-transport-assets.js')
old_runtime_text = (TARGET / runtime_rel).read_text()
assert sha(TARGET / runtime_rel) == sha(ORIGIN / runtime_rel)
new_runtime_text = old_runtime_text
for tier in comparison['tiers']:
    assert new_runtime_text.count(tier['originalSHA256']) == 1
    new_runtime_text = new_runtime_text.replace(tier['originalSHA256'], tier['correctedSHA256'])
(PAYLOAD / runtime_rel).parent.mkdir(parents=True, exist_ok=True)
(PAYLOAD / runtime_rel).write_text(new_runtime_text)

def proof_ref(relative):
    return description(PAYLOAD / relative, relative)

provenance_rel = ART / 'review/waist-spandrel-seam-correction-20261005.json'
provenance = {
    'createdAt': now,
    'status': 'ACTUAL_CPU_EXPORTED_SAMPLED_OVERLAP_REMOVED_NATIVE_REVIEW_PENDING',
    'originalSourceHead': prepared['sourceHead'],
    'targetParentHead': '220312885a7b1a7a987790aa4f9d1d38b294be90',
    'scope': 'Raise only original opaque brown upper side/end/corner spandrel lower edge 2.55m to 2.57m to meet unchanged pearl waist; preserve original side upper3.058m/end upper3.088m, thickness, box bounds, layout, hooks, collision, materials, textures, licence and controls.',
    'generatorChanges': original_proposal['onlyIntendedChanges'],
    'generatorChangedLines': 3,
    'originalGeometryDiagnosis': description(FIRST / 'original-three-lod-geometry-diagnostic.json'),
    'originalSixImageReview': {
        'path': '/workspace/neon-candidates/final-combined-independent-pixels-review-20261005/9cf1-bus-tram-six-original-pixels-review.json',
        'sha256': '896d134907ca804c58aa829cc5bddb40d7759ec56591046e8ee44a50e4ae9198',
        'status': 'PARTIAL_VISIBLE_VEHICLE_COMPONENTS_REVIEWED_FULL_VEHICLE_ART_UNACCEPTED',
        'originalBusAndTramNativeJourneyFailuresRemainFailures': True,
        'triangleSeamVisualCauseNotEstablishedByStillImageAlone': True,
    },
    'actualExports': [json.loads((EX / mode / 'actual-cpu-export-receipt.json').read_text()) for mode in ['control-original-recipe', 'corrected-recipe']],
    'actualCheckerObservation': {
        'command': 'python source/check_authored_transport.py',
        'cwd': str(CORRECTED),
        'observedCompletedExitCode': 0,
        'staticChecksPassed': cpu['staticChecksPassed'],
        'issues': cpu['issues'],
        'wallSecondsReportedByActualChecker': cpu['wallSeconds'],
        'scope': cpu['scope'],
        'stdout': description(CORRECTED / 'check.stdout.log'),
        'stderr': description(CORRECTED / 'check.stderr.log'),
    },
    'actualArrayComparison': proof_ref(ART / 'review/seam-correction-array-comparison-20261005.json'),
    'actualSampledOverlapRemoval': proof_ref(ART / 'review/seam-correction-sampled-overlap-removal-20261005.json'),
    'sampledSurfaceCount': 84,
    'actualChangedAttributeRowsByLOD': [{'tier': t['tier'], 'changedPrimitives': t['changedPrimitives']} for t in comparison['tiers']],
    'noNewPrimitivesTrianglesMaterialsTexturesHooksOrPhysics': True,
    'controlThreeGLBsByteExactlyReproduceOriginal': True,
    'originalMasterReference': description(ORIGIN / ART / 'source/vesper-t9-master.blend'),
    'controlMaster': description(EX / 'control-original-recipe/source/vesper-t9-master.blend'),
    'controlMasterByteExactToOriginal': False,
    'controlMasterLimitation': 'Fresh .blend storage/path metadata is not asserted identical. Actual three control GLBs reproduce every original byte; corrected editable master is freshly generated from the minimally changed exact recipe with unchanged inputs.',
    'correctedEditableMaster': proof_ref(ART / 'source/vesper-t9-master.blend'),
    'licencesAndOriginalReviewFilesUnchanged': True,
    'originalRuntimeInterfaceBaselineUnchanged': True,
    'GPUExecuted': False,
    'nativeValidated': False,
    'pixelSeamFixAccepted': False,
    'journeyAccepted': False,
    'performanceAccepted': False,
    'aaaClaim': False,
    'wholeCityClaim': False,
    'requiredFutureEvidence': 'After Root adoption/build, actual High Tram close view and new-source four Day/Night native images; new actual journey/performance verification. Previous native failures/old-source pixels remain original evidence.',
}
write_json(PAYLOAD / provenance_rel, provenance)

old_manifest = json.loads((TARGET / ART / 'asset-manifest.json').read_text())
assert sha(TARGET / ART / 'asset-manifest.json') == sha(ORIGIN / ART / 'asset-manifest.json')
manifest = json.loads(json.dumps(old_manifest))
for record in manifest['assets']:
    record['sha256'] = sha(PAYLOAD / ART / record['path'])
manifest['editableSource'] = proof_ref(ART / 'source/vesper-t9-master.blend')
manifest['designSource'] = proof_ref(ART / 'source/author_tram.py')
manifest['cpuProof'] = proof_ref(ART / 'review/seam-correction-cpu-asset-check-20261005.json')
manifest['waistSpandrelSeamAmendment'] = {
    'revision': 'waist-spandrel-seam-2026-10-05',
    'status': 'ACTUAL_CPU_EXPORTED_SAMPLED_OVERLAP_REMOVED_NATIVE_REVIEW_PENDING',
    'scope': provenance['scope'],
    'originalSourceHead': prepared['sourceHead'],
    'originalManifest': proof_ref(ART / 'review/seam-correction-original-asset-manifest-20261005.json'),
    'originalEditableSource': old_manifest['editableSource'],
    'originalDesignSource': old_manifest['designSource'],
    'originalCpuProof': old_manifest['cpuProof'],
    'provenance': proof_ref(provenance_rel),
    'exportTangentHygiene': proof_ref(ART / 'review/seam-correction-export-tangent-hygiene-20261005.json'),
    'authoringStats': proof_ref(ART / 'review/seam-correction-authoring-stats-20261005.json'),
    'nativeValidated': False,
    'originalSourceProvenanceAndUpperEnclosureAmendmentRemainHistorical': True,
}
assert manifest['sourceProvenance'] == old_manifest['sourceProvenance']
assert manifest['upperEnclosureAmendment'] == old_manifest['upperEnclosureAmendment']
write_json(PAYLOAD / ART / 'asset-manifest.json', manifest)

scope_md = '''# Tram waist/spandrel seam correction — 2026-10-05

This revision removes a measured 20 mm overlap between the original opaque pearl waist and brown upper spandrels. The three generator lines raise the side/end/corner lower edge from 2.55 m to 2.57 m, retaining the existing upper edges, thickness and vehicle envelope.

Blender 4.3.2 actually exported all three corrected LODs in a separate CPU-only workspace. A control execution of the unmodified recipe reproduced all three original GLBs byte for byte. Corrected and control glTF JSON, triangle indices, embedded images, materials, hook transforms and every other primitive remain exact. Only existing paint-batch spandrel positions and their normals/tangents change. Triangles remain 77,744 / 23,892 / 7,972; materials remain 15 / 14 / 11; primitives remain 39 / 38 / 31; total GLB size remains 9,715,464 bytes.

The actual corrected buffers pass 84 sampled side/end material-presence checks: below the 2.57 m shared junction the original overlap band contains only pearl, and immediately above it only paint. The original CPU asset checker completed successfully, including its existing door, staircase, hook and engineering checks. These are CPU geometry findings. They establish neither temporal raster behavior nor a new native visual, journey or performance pass.

All previous review JSONs, manifests and failed native evidence remain historical records. New reports use the `seam-correction-*` names. The preceding active manifest is preserved literally in `review/seam-correction-original-asset-manifest-20261005.json`; its upper-enclosure amendment and original provenance are retained. Art/code/font licence files and the runtime interface baseline are unchanged. The newly generated editable master is included; the control .blend is not claimed byte-identical to the previous archived master.

The six original 9cf Bus/Tram images show only entry-adjacent and interior components. Both original journey cases failed; neither exterior image establishes the entire outside vehicle shape. The still-image triangular seam motivated this geometry correction, but a still alone did not prove its temporal cause. Root must inspect new-source actual High Tram images after adoption and re-capture the four Day/Night views. Whole-vehicle commercial-quality, AAA and whole-city claims remain unaccepted.
'''
(PAYLOAD / ART / 'SEAM-CORRECTION-20261005.md').write_text(scope_md)

rows = []
for p in sorted(PAYLOAD.rglob('*')):
    if not p.is_file():
        continue
    rel = p.relative_to(PAYLOAD)
    target = TARGET / rel
    rows.append({**description(p, rel), 'action': 'replace' if target.exists() else 'add', 'expectedOldTargetSHA256': sha(target) if target.exists() else None, 'expectedOldTargetBytes': target.stat().st_size if target.exists() else None})

unchanged_after = []
for row in preserved_before:
    original = ORIGIN / row['path']
    assert sha(original) == row['sha256']
    unchanged_after.append({**row, 'sameBeforeAndAfterExternalPayloadPreparation': True})
write_json(EX / 'original-source-assets-preservation-proof.json', {
    'createdAt': now, 'sourceHead': prepared['sourceHead'], 'sourceDirectory': str(ORIGIN),
    'originalSixGLBsStillMatchPreExportProposal': True,
    'originalMasterStillMatchesPreExportPreparedReceipt': True,
    'originalGeneratorStillMatchesPreExportProposal': True,
    'originalSourceAndAssetsWritten': False, 'files': unchanged_after,
})
write_json(EX / 'final-selective-payload-manifest.json', {
    'createdAt': now,
    'status': 'FINAL_ACTUAL_CPU_EXPORT_SELECTIVE_PAYLOAD_NOT_ADOPTED_NATIVE_PENDING',
    'payloadDirectory': str(PAYLOAD), 'expectedTargetDirectory': str(TARGET),
    'expectedTargetParentHead': '220312885a7b1a7a987790aa4f9d1d38b294be90',
    'originalAssetSourceHead': prepared['sourceHead'],
    'files': rows, 'payloadFileCount': len(rows), 'payloadTotalBytes': sum(r['bytes'] for r in rows),
    'replacementCount': sum(r['action'] == 'replace' for r in rows),
    'additionCount': sum(r['action'] == 'add' for r in rows),
    'onlyPayloadDirectoryIsForSelectiveAdoption': True,
    'externalQAControlOnlyNeverProductionPayload': ['control-original-recipe/', 'corrected-recipe/', 'run-cpu-export.py', 'compare-original-and-corrected-glb.py', 'inputs-prepared-before-execution.json', 'prepare-final-selective-payload.py', 'original-source-assets-preservation-proof.json', 'final-selective-payload-manifest.json', 'final-cpu-export-seal.json'],
    'doNotOverwriteOldReviewOrNativeEvidence': True,
    'deriveRuntimeManifestFromActualFinalBuild': True,
    'GPUExecuted': False, 'runtimeAdopted': False, 'nativeValidated': False,
    'aaaClaim': False, 'wholeCityClaim': False,
})
print(json.dumps({'status': 'PREPARED_ONCE_EXTERNAL_ONLY', 'payloadFileCount': len(rows), 'payloadTotalBytes': sum(r['bytes'] for r in rows), 'manifest': description(EX / 'final-selective-payload-manifest.json')}, indent=2))
