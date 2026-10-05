#!/usr/bin/env python3
import datetime
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root = Path(__file__).resolve().parent
mode = sys.argv[1]
if mode not in ('control-original-recipe', 'corrected-recipe'):
    raise SystemExit('Unknown bounded external export mode')
base = root/mode
source = base/'source/author_tram.py'
prepared = json.loads((root/'inputs-prepared-before-execution.json').read_text())
expected = next(row['inputFiles'] for row in prepared['newDisposableExternalWorkspaces'] if row['mode']==mode)
for row in expected:
    if hashlib.sha256((base/row['path']).read_bytes()).hexdigest() != row['sha256']:
        raise SystemExit('Prepared input changed before export')
argv = ['/usr/bin/blender', '--background', '--factory-startup', '--threads', '1', '--python-expr',
    "import sys,runpy;sys.dont_write_bytecode=True;runpy.run_path("+repr(str(source))+",run_name='__main__')"]
env = dict(os.environ)
env.update({'TMPDIR':str(base/'tmp'), 'TMP':str(base/'tmp'), 'TEMP':str(base/'tmp'), 'PYTHONDONTWRITEBYTECODE':'1'})
receipt = {'mode':mode, 'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'argv':argv, 'cwd':str(base), 'boundedCpuExportSeconds':300, 'GPUOrBrowserExecuted':False,
    'sourceRootMutated':False, 'originalAssetsMutated':False, 'BlenderVersion':'4.3.2',
    'blenderExecutable':'/usr/bin/blender', 'firstError':None}
start = time.monotonic()
with (base/'blender.stdout.log').open('wb') as stdout, (base/'blender.stderr.log').open('wb') as stderr:
    process = subprocess.Popen(argv, cwd=base, env=env, stdout=stdout, stderr=stderr, start_new_session=True)
    receipt['pid'] = process.pid
    try:
        receipt['returnCode'] = process.wait(timeout=300)
    except subprocess.TimeoutExpired:
        receipt['firstError'] = 'CPU export exceeded300s; terminating this exact owned process group'
        os.killpg(process.pid, signal.SIGTERM)
        try:
            receipt['returnCode'] = process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            receipt['returnCode'] = process.wait(timeout=5)
receipt['elapsedSeconds'] = time.monotonic()-start
receipt['finishedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
receipt['inputFilesUnchangedAfter'] = all(hashlib.sha256((base/row['path']).read_bytes()).hexdigest()==row['sha256'] for row in expected)
receipt['outputFiles'] = [{'path':str(p.relative_to(base)), 'bytes':p.stat().st_size,
    'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(base.rglob('*'))
    if p.is_file() and (p.parent.name in ('models','review') or p.name=='vesper-t9-master.blend')]
(base/'actual-cpu-export-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'mode':mode,'returnCode':receipt['returnCode'],'elapsedSeconds':receipt['elapsedSeconds'],
    'inputFilesUnchangedAfter':receipt['inputFilesUnchangedAfter'],'outputFiles':receipt['outputFiles']},indent=2))
raise SystemExit(0 if receipt['returnCode']==0 and receipt['inputFilesUnchangedAfter'] else 1)
