#!/usr/bin/env python3
"""One GET-only CI poll for a freshly dispatched actual run.

No dispatch/rerun/cancel/upload/Git/source/index/ref operations. This script is
prepared, not started. Supply actual run/head/branch/archive after dispatch.
Repeated calls preserve exclusive snapshots in a new, run-specific archive.
"""
import argparse,concurrent.futures,datetime,json,pathlib,re,subprocess

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo',default='qifalab/neon-harbor')
    parser.add_argument('--run-id',type=int,required=True)
    parser.add_argument('--source-sha',required=True)
    parser.add_argument('--branch',required=True)
    parser.add_argument('--attempt',type=int,default=1)
    parser.add_argument('--workflow-name',default='CI')
    parser.add_argument('--archive',required=True)
    args=parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',args.repo) or not re.fullmatch(r'[0-9a-f]{40}',args.source_sha) or args.run_id<1 or args.attempt<1:
        parser.error('Invalid repository, actual run ID, exact source SHA or attempt')
    archive=pathlib.Path(args.archive).resolve()
    config={'schema':'neon-harbor/readonly-actual-ci-watcher/v2','repo':args.repo,'runId':args.run_id,'expectedSourceSha':args.source_sha,'expectedBranch':args.branch,'expectedAttempt':args.attempt,'expectedWorkflowName':args.workflow_name,'scope':'GET only; archive writes only; never dispatch/rerun/cancel/upload/Git/source/index/ref mutation'}
    config_path=archive/'watcher-config.json'
    if archive.exists():
        if not config_path.is_file() or json.loads(config_path.read_text())!=config:
            raise RuntimeError('Existing archive is not this exact fresh run watcher; old sealed archive must not be changed')
    else:
        archive.mkdir(parents=True,exist_ok=False)
        with config_path.open('x') as output:json.dump(config,output,ensure_ascii=False,indent=2);output.write('\n')
    timestamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ')
    endpoints={'run':f'repos/{args.repo}/actions/runs/{args.run_id}','jobs':f'repos/{args.repo}/actions/runs/{args.run_id}/jobs?per_page=100'}
    def request(item):
        name,endpoint=item
        result=subprocess.run(['gh','api','--method','GET',endpoint],capture_output=True,text=True,timeout=30)
        return name,endpoint,result
    responses={}
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for name,endpoint,result in executor.map(request,endpoints.items()):
            with (archive/f'{timestamp}-{name}-original.json').open('x') as output:output.write(result.stdout)
            with (archive/f'{timestamp}-{name}-request-receipt.json').open('x') as output:json.dump({'endpoint':endpoint,'observedAt':timestamp,'exitCode':result.returncode,'stderr':result.stderr,'httpMethod':'GET'},output,indent=2);output.write('\n')
            if result.returncode:raise RuntimeError(f'Actual GET failed: {name}; original error preserved in request receipt')
            responses[name]=json.loads(result.stdout)
    run=responses['run'];jobs=responses['jobs']['jobs']
    observed=(run['id'],run['head_sha'],run['head_branch'],run['run_attempt'],run['name'])
    expected=(args.run_id,args.source_sha,args.branch,args.attempt,args.workflow_name)
    if observed!=expected:raise RuntimeError('Actual run/head/branch/attempt/workflow does not match immutable expected configuration')
    if responses['jobs'].get('total_count',len(jobs))>len(jobs):raise RuntimeError('Jobs exceed first page; must preserve paginated metadata before drawing counts')
    required=[];conditional=[]
    for job in jobs:
        data={'id':job['id'],'name':job['name'],'status':job['status'],'conclusion':job['conclusion'],'startedAt':job.get('started_at'),'completedAt':job.get('completed_at'),'activeStep':next((step['name'] for step in job['steps'] if step['status']=='in_progress'),None),'failedSteps':[{'name':step['name'],'number':step['number'],'conclusion':step['conclusion']} for step in job['steps'] if step['conclusion'] in ('failure','cancelled')]}
        if job['name'].startswith('Build and gameplay tests (') or job['name']=='Multiplayer rooms in two browsers':required.append(data)
        else:conditional.append(data)
    summary={'observedAt':timestamp,'run':{key:run.get(key) for key in ('id','name','event','head_sha','head_branch','run_attempt','status','conclusion','created_at','updated_at','html_url')},'required':required,'otherConditionalJobs':conditional,'rawRunFile':f'{timestamp}-run-original.json','rawJobsFile':f'{timestamp}-jobs-original.json','fullCiPassInferred':False,'ruleAndCaseCountsRequireActualCompletedOriginalLogs':True}
    with (archive/f'{timestamp}-summary.json').open('x') as output:json.dump(summary,output,ensure_ascii=False,indent=2);output.write('\n')
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
