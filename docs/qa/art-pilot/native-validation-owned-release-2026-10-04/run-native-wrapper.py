import hashlib
import json
from pathlib import Path
import subprocess
import time

pilot = Path('/workspace/scratch/neon-harbor-art-pilot')
base = pilot / 'docs/qa/art-pilot'
output = base / 'native-validation-owned-release-2026-10-04'
stdout_path = base / 'native-validation-owned-release-2026-10-04.stdout.txt'
stderr_path = base / 'native-validation-owned-release-2026-10-04.stderr.txt'
invocation = base / 'native-validation-owned-release-2026-10-04.invocation.json'
assert not output.exists() and not stdout_path.exists() and not stderr_path.exists() and not invocation.exists(), 'Preserve previous evidence; this one run needs new paths'
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha((pilot / 'tools/capture-workshop-pilot.mjs').read_bytes()) == '6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714'
assert sha((pilot / 'dist/build-info.json').read_bytes()) == '502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3'
command = ['node', 'tools/capture-workshop-pilot.mjs', '--gpu-go', 'yes', '--root', 'dist', '--port', '5208',
           '--output', 'docs/qa/art-pilot/native-validation-owned-release-2026-10-04', '--scenarios', 'normal,404,delay-exit']
record = {'status': 'running', 'startedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()), 'cwd': str(pilot),
          'command': command, 'stdout': stdout_path.name, 'stderr': stderr_path.name,
          'gpuAuthorization': 'Explicit parent GPU GO; single sequential suite; no retry; frozen method/products',
          'sourceSha256': sha((pilot / 'tools/capture-workshop-pilot.mjs').read_bytes()),
          'buildInfoSha256': sha((pilot / 'dist/build-info.json').read_bytes())}
invocation.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
with stdout_path.open('wb') as stdout, stderr_path.open('wb') as stderr:
    process = subprocess.Popen(command,cwd=pilot,stdout=stdout,stderr=stderr)
    record['pid'] = process.pid
    invocation.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    code = process.wait()
record.update({'status': 'passed' if code == 0 else 'failed', 'exitCode': code,
               'endedAtUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
               'stdoutSha256': sha(stdout_path.read_bytes()), 'stderrSha256': sha(stderr_path.read_bytes()),
               'finalSourceSha256': sha((pilot / 'tools/capture-workshop-pilot.mjs').read_bytes()),
               'finalBuildInfoSha256': sha((pilot / 'dist/build-info.json').read_bytes())})
invocation.write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False),flush=True)
raise SystemExit(code)
