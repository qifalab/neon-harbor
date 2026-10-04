import hashlib
import json
from pathlib import Path
import subprocess
import time

pilot = Path('/workspace/scratch/neon-harbor-art-pilot')
base = pilot / 'docs/qa/art-pilot'
output = base / 'native-validation-2026-10-04'
stdout_path = base / 'native-validation-2026-10-04.stdout.txt'
stderr_path = base / 'native-validation-2026-10-04.stderr.txt'
invocation = base / 'native-validation-2026-10-04.invocation.json'
assert not output.exists() and not stdout_path.exists() and not stderr_path.exists() and not invocation.exists(), 'Preserve previous evidence; this one run needs new paths'
sha = lambda data: hashlib.sha256(data).hexdigest()
assert sha((pilot / 'tools/capture-workshop-pilot.mjs').read_bytes()) == '8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9'
assert sha((pilot / 'dist/build-info.json').read_bytes()) == '8f9186c1a3da3ebf1b3cc25db9adcaa66945871a06565bbd4e4cbfbcf8859204'
command = ['node', 'tools/capture-workshop-pilot.mjs', '--gpu-go', 'yes', '--root', 'dist', '--port', '5208',
           '--output', 'docs/qa/art-pilot/native-validation-2026-10-04', '--scenarios', 'normal,404,delay-exit']
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
