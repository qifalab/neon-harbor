#!/usr/bin/env python3
"""One lightweight read-only GH poll, exact raw responses in new QA directory."""
import datetime,json,pathlib,subprocess

RUN=37235153499
SHA="0c746b6d1d5a8c1af8be8242982f3d378e564231"
ROOT=pathlib.Path('/workspace/scratch/neon-harbor/docs/qa/final-asset-freeze/remote-feature-ci')
timestamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')
responses={}
for name,endpoint in [('run',f'repos/qifalab/neon-harbor/actions/runs/{RUN}'),('jobs',f'repos/qifalab/neon-harbor/actions/runs/{RUN}/jobs?per_page=100')]:
    request=subprocess.run(['gh','api','--method','GET',endpoint],capture_output=True,text=True,timeout=30)
    with (ROOT/f'{timestamp}-{name}-original.json').open('x') as target:target.write(request.stdout)
    with (ROOT/f'{timestamp}-{name}-request-receipt.json').open('x') as target:json.dump({'endpoint':endpoint,'observedAt':timestamp,'exitCode':request.returncode,'stderr':request.stderr},target,indent=2);target.write('\n')
    if request.returncode:raise RuntimeError(request.stderr)
    responses[name]=json.loads(request.stdout)
run=responses['run'];jobs=responses['jobs']['jobs']
if run['id']!=RUN or run['head_sha']!=SHA or run['head_branch']!='codex/traffic-and-multiplayer' or run['run_attempt']!=1:raise RuntimeError('Run/head/ref/attempt mismatch')
required=[];skips=[]
for job in jobs:
    data={'id':job['id'],'name':job['name'],'status':job['status'],'conclusion':job['conclusion'],'startedAt':job.get('started_at'),'completedAt':job.get('completed_at'),'activeStep':next((step['name'] for step in job['steps'] if step['status']=='in_progress'),None),'failedSteps':[{'name':step['name'],'number':step['number'],'conclusion':step['conclusion']} for step in job['steps'] if step['conclusion'] in ('failure','cancelled')]}
    if job['name'].startswith('Build and gameplay tests (') or job['name']=='Multiplayer rooms in two browsers':required.append(data)
    else:skips.append(data)
summary={'observedAt':timestamp,'run':{key:run.get(key) for key in ('id','head_sha','head_branch','run_attempt','status','conclusion','created_at','updated_at','html_url')},'required':required,'otherConditionalJobs':skips,'rawRunFile':f'{timestamp}-run-original.json','rawJobsFile':f'{timestamp}-jobs-original.json'}
with (ROOT/f'{timestamp}-summary.json').open('x') as target:json.dump(summary,target,ensure_ascii=False,indent=2);target.write('\n')
print(json.dumps(summary,ensure_ascii=False))
