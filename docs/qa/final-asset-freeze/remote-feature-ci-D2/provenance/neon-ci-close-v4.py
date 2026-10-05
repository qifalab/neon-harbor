#!/usr/bin/env python3
"""Close a terminal captured feature CI archive; no network, git or test execution."""
import argparse, collections, datetime, hashlib, json, pathlib, re

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--archive', required=True)
parser.add_argument('--run-id', type=int, required=True)
parser.add_argument('--source-sha', required=True)
parser.add_argument('--parent-sha', required=True)
parser.add_argument('--branch', required=True)
args = parser.parse_args()
archive = pathlib.Path(args.archive).resolve()
for sha in (args.source_sha, args.parent_sha):
    if not re.fullmatch('[0-9a-f]{40}', sha):
        raise ValueError('Exact forty-character SHAs required')
for output in ('final-run-summary.json', 'README.md', 'evidence-files.json'):
    if (archive / output).exists():
        raise FileExistsError('Closure cannot overwrite a previous sealed record: ' + output)

snapshots = sorted(archive.glob('20??-??-??T*-summary.json'))
if not snapshots:
    raise ValueError('No original snapshots')
snapshot = json.loads(snapshots[-1].read_text())
run_file, jobs_file = snapshot['rawRunFile'], snapshot['rawJobsFile']
run = json.loads((archive / run_file).read_text())
raw_jobs = json.loads((archive / jobs_file).read_text())['jobs']
if (run['id'], run['head_sha'], run['head_branch'], run['run_attempt'], run['event'], run['status']) != (args.run_id, args.source_sha, args.branch, 1, 'workflow_dispatch', 'completed'):
    raise ValueError('Terminal actual run identity does not match pinned candidate')
commit = json.loads((archive / 'remote-candidate-commit-original.json').read_text())
if commit['sha'] != args.source_sha or [p['sha'] for p in commit['parents']] != [args.parent_sha] or [f['filename'] for f in commit['files']] != ['tests/e2e/stability.spec.js']:
    raise ValueError('Remote D2 must be exact tests-only child of D')
required = [j for j in raw_jobs if j['name'].startswith('Build and gameplay tests (') or j['name'] == 'Multiplayer rooms in two browsers']
if len(required) != 12 or any(j['status'] != 'completed' for j in required):
    raise ValueError('All twelve required jobs must be terminal')

job_records, game_counts, mp_counts = [], collections.Counter(), collections.Counter()
rule_counts_per_game = []
for job in required:
    job_id = job['id']
    derived_path = archive / 'logs' / f'job-{job_id}-log-summary-final.json'
    derived = json.loads(derived_path.read_text())
    log_path = archive / 'logs' / f'job-{job_id}-original.log'
    raw = log_path.read_bytes()
    if derived['jobId'] != job_id or derived['expectedSourceSha'] != args.source_sha or not derived['expectedSourceCheckoutObserved'] or derived['logBytes'] != len(raw) or derived['logSha256'] != hashlib.sha256(raw).hexdigest():
        raise ValueError('Captured log identity/digest mismatch: ' + str(job_id))
    counts = {k: 0 for k in ('passed', 'failed', 'skipped', 'flaky', 'interrupted')}
    if not derived['playwrightTotals']:
        raise ValueError('Actual Playwright summary missing: ' + str(job_id))
    for count, outcome in derived['playwrightTotals']:
        counts[outcome] += int(count)
    is_game = job['name'].startswith('Build and gameplay tests (')
    npm_counts = None
    if is_game:
        npm_counts = {}
        for original_key, renamed_key in [('tests','tests'),('pass','passed'),('fail','failed'),('cancelled','cancelled'),('skipped','skipped')]:
            values = derived['ruleSummaries'][original_key]
            if len(values) != 1:
                raise ValueError('Exactly one actual npm summary required for game job: ' + str(job_id))
            npm_counts[renamed_key] = int(values[0])
        rule_counts_per_game.append(npm_counts)
        game_counts.update(counts)
    else:
        if any(derived['ruleSummaries'].values()):
            raise ValueError('MP npm-rule assumption changed; inspect actual log')
        mp_counts.update(counts)
    job_records.append({'jobId':job_id,'name':job['name'],'matrixId':job['name'].removeprefix('Build and gameplay tests (').removesuffix(')') if is_game else None,'status':job['status'],'conclusion':job['conclusion'],'startedAt':job['started_at'],'completedAt':job['completed_at'],'npmRuleRun':is_game,'npmRuleCounts':npm_counts,'browserCounts':counts,'caseResultLines':derived['caseLines'],'originalDecodedLog':str(log_path.relative_to(archive)),'originalDecodedLogBytes':len(raw),'originalDecodedLogSha256':derived['logSha256'],'rawConnectorResponse':f'logs/job-{job_id}-connector-response-original.json','rawJobLogSummary':str(derived_path.relative_to(archive))})

required_counts = {k:sum(j['conclusion'] == k for j in required) for k in ('success','failure','cancelled','skipped')}
required_counts['total'] = len(required)
conditional = [{k:j.get(k) for k in ('id','name','status','conclusion','started_at','completed_at')} for j in raw_jobs if j not in required]
all_rules_311 = len(rule_counts_per_game) == 11 and all(c == {'tests':311,'passed':311,'failed':0,'cancelled':0,'skipped':0} for c in rule_counts_per_game)
whole_success = run['conclusion'] == 'success' and required_counts['success'] == 12
if whole_success and (not all_rules_311 or dict(game_counts) != {'passed':27,'failed':0,'skipped':0,'flaky':0,'interrupted':0} or dict(mp_counts) != {'passed':2,'failed':0,'skipped':0,'flaky':0,'interrupted':0}):
    raise ValueError('Whole CI success requires reviewed actual expected rules and browser counts')

artifacts = json.loads((archive / 'final-artifacts-original.json').read_text())
downloads = []
download_attempts = []
if (archive/'artifacts').exists():
    for receipt_path in sorted((archive/'artifacts').glob('*actual-receipt.json')):
        receipt = json.loads(receipt_path.read_text())
        download_attempts.append({'receipt':str(receipt_path.relative_to(archive)),'matchesServer':receipt.get('matchesServer',False),'actualBytes':receipt.get('actualBytes'),'file':receipt.get('file')})
        if receipt.get('matchesServer'):
            downloaded = archive / receipt['file']
            if downloaded.stat().st_size != receipt['actualBytes'] or receipt['serverDigest'] != 'sha256:'+receipt['actualSha256']:
                raise ValueError('Verified original artifact receipt/file mismatch')
            downloads.append(receipt['file'])
failure_record = json.loads((archive/'failure-summary.json').read_text()) if (archive/'failure-summary.json').exists() else None
if run['conclusion'] == 'failure' and failure_record is None:
    raise ValueError('Actual failed-run cause/evidence record required before closure')
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
summary = {'schema':'neon-harbor/tests-only-second-feature-ci/v1','closedAt':now,'runId':run['id'],'runAttempt':run['run_attempt'],'headSha':run['head_sha'],'parentSha':args.parent_sha,'headBranch':run['head_branch'],'event':run['event'],'workflowName':run['name'],'workflowPath':run['path'],'createdAt':run['created_at'],'runStartedAt':run.get('run_started_at'),'updatedAt':run['updated_at'],'status':run['status'],'conclusion':run['conclusion'],'runUrl':run['html_url'],'finalOriginalRunSnapshot':run_file,'finalOriginalJobsSnapshot':jobs_file,'requiredJobCounts':required_counts,'gameRuleCoverage':{'matrixJobsEachActuallyRan311':11 if all_rules_311 else None,'uniqueRuleTests':311 if all_rules_311 else None,'eachPassed':311 if all_rules_311 else None,'eachFailed':0 if all_rules_311 else None,'eachCancelled':0 if all_rules_311 else None,'eachSkipped':0 if all_rules_311 else None,'multiplayerJobDidNotRunNpmTest':True},'browserCounts':{'games':dict(game_counts),'multiplayer':dict(mp_counts),'overallCases':{k:game_counts[k]+mp_counts[k] for k in ('passed','failed','skipped','flaky','interrupted')}},'jobs':job_records,'conditionalJobsNotCountedAsPass':conditional,'candidateScope':{'remoteCommitOriginal':'remote-candidate-commit-original.json','onlyChangedPath':'tests/e2e/stability.spec.js','rootLocalHeadAtDispatch':args.parent_sha,'localContinuousTourActuallyRanD2':False,'runtimeSourceChangedByD2':False,'localManifestIsNotDownloadedRemoteRunnerManifest':True},'artifacts':{'originalApiMetadata':'final-artifacts-original.json','githubUploadedCount':artifacts['total_count'],'actualLocalZipDownloads':downloads,'actualDownloadAttempts':download_attempts,'successfulJobArtifactZipBytesNotDownloaded':True},'failure':failure_record,'externalWriteActions':{'rerun':False,'cancel':False,'sourceIndexOrRefMutation':False,'stageOrCommit':False,'pagesOrReleasePublication':False},'fullCiPassed':whole_success,'finalTourPassedClaimed':False,'aaaOrHardwareAcceptanceClaimed':False}
with (archive/'final-run-summary.json').open('x') as out:
    json.dump(summary,out,ensure_ascii=False,indent=2);out.write('\n')

rows = []
for j in sorted(job_records,key=lambda x:(x['matrixId'] is None,x['matrixId'] or '')):
    c = j['browserCounts']
    rows.append(f"| {j['matrixId'] or 'multiplayer'} | {str(j['npmRuleCounts']['passed'])+'/'+str(j['npmRuleCounts']['tests']) if j['npmRuleRun'] else '未运行 npm test'} | {c['passed']} 通过 / {c['failed']} 失败 | {j['conclusion']} |")
readme = f"""# D2：tests-only 修订的第二轮 feature CI

[实际 run {args.run_id}]({run['html_url']})，attempt 1，`workflow_dispatch`，分支 `{args.branch}`，head `{args.source_sha}`，parent D `{args.parent_sha}`。{run['created_at']} 创建，{run['updated_at']} 最后更新，最终 **{run['status']} / {run['conclusion']}**。12 个 required job：{required_counts['success']} success、{required_counts['failure']} failure、{required_counts['cancelled']} cancelled、{required_counts['skipped']} skipped。PR-only room-art / room-detail 的实际状态单独列在原记录中，其 skipped 不算通过。

11 个游戏分片实际规则见表与 [final-run-summary.json](final-run-summary.json)；同一组 311 规则在不同 runner 重复运行，不能相加成不同功能。游戏浏览器 {game_counts['passed']} 通过、{game_counts['failed']} 失败；双浏览器多人 {mp_counts['passed']} 通过、{mp_counts['failed']} 失败，该 MP job 未运行 npm test。所有规则和浏览器数量均由各 job 完整原日志提取，逐案例原结果行与 log SHA 随 summary 保存。

| 分片 | 实际规则 | 实际浏览器 | Job 结论 |
| --- | --- | --- | --- |
""" + '\n'.join(rows) + f"""

[实际远程 commit GET](remote-candidate-commit-original.json) 验证 D2 的唯一 changed path 为 `tests/e2e/stability.spec.js`，是 D 的直接子提交。D2 从 private bare object store 上传；dispatch 时 ROOT checkout HEAD、index、测试和运行源码仍是 D，正在进行的本地唯一连续 tour 也仍实际绑定 D。此远程 CI 没有证明本地 tour 在 D2 上重跑。D2 未改运行源码；本地 `502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3 / 156 assets / 53 src` manifest 属于 D 本地冻结构建，不冒充从本 CI runner 下载的资源清单。实际部署仍需比较公网 revision 与完整资源指纹。

首轮 D 的失败、原 trace 和独立只读诊断仍封存在 [../remote-feature-ci/](../remote-feature-ci/)，没有改写或合并成成功。D2 调整测试触发方法，仍保留实际建筑接触、全车身不穿入等断言；第二轮结果只属于本 run。PR-only art/detail skip、规则通过、城市开放数量和 CI 成功不等于 AAA 美术、完整城市或硬件性能验收。本目录不宣称本地完整路线通过或 Pages/Release 已发布。

失败具体 timeout、断言/清理错误与原 trace 入口见 [failure-summary.json](failure-summary.json)；如实保留未通过结论。ZIP 下载的失败尝试、32 MiB executor transfer cap 和正常 HTTP client 的实际成功 receipt 全部保留；只有 server SHA/大小都匹配的完整 ZIP 列作实际下载成功，0B 失败文件不算 ZIP。完整失败 ZIP 保留全部 44 项，顶层没有 `.webm`，不能把 trace screencast 宣称为独立视频。

12 个完整 decoded 原日志来自 GitHub connector 字符串，保存为 UTF-8，保留 BOM、时间戳和原空白；原 connector reply 另存。这是 decoded log 原文，不是服务器压缩 wire bytes。run/jobs/artifact JSON 是原 gh GET stdout。成功 job 只保存完整原日志、状态和 GitHub artifact metadata，未额外下载其大 ZIP。实际失败 ZIP 下载列表见 summary。

本归档只进行 GitHub GET 与轻量文件读取/写入，没有 rerun、cancel、stage、commit、source/index/ref 改动或发布。所有封存文件的大小和 SHA 见 [evidence-files.json](evidence-files.json)，ledger 自身不计入自哈希。原 `.log` 被仓库 ignore 规则匹配，后续提交应显式保留原日志，不得修改原空白来满足 source diff-check。任何新增候选使用新目录，保持本目录字节不变。
"""
with (archive/'README.md').open('x') as out:out.write(readme)

files = []
for path in sorted(archive.rglob('*')):
    if path.is_file() and path.name != 'evidence-files.json':
        if path.is_symlink():raise ValueError('No symlink in immutable evidence')
        content = path.read_bytes()
        if len(content) >= 100*1024*1024:raise ValueError('Git blob must be below 100 MiB: '+str(path))
        relative = str(path.relative_to(archive))
        role = 'derived summary/receipt/provenance' if ('summary' in path.name or 'receipt' in path.name or 'provenance' in path.name or path.name == 'README.md') else 'original GET/decoded tool response or copied capture bytes'
        files.append({'file':relative,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest(),'role':role})
ledger = {'schema':'neon-harbor/second-tests-only-feature-ci-evidence/v1','generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'runId':args.run_id,'runAttempt':1,'headSha':args.source_sha,'parentSha':args.parent_sha,'result':run['conclusion'],'requiredJobs':required_counts,'gameBrowserCases':dict(game_counts),'multiplayerBrowserCases':dict(mp_counts),'ruleTestsEachGameMatrix':311 if all_rules_311 else None,'gameRuleMatricesActuallyPassed':11 if all_rules_311 else None,'mpNpmRulesNotRun':True,'conditionalPrOnlySkippedNotCountedAsPass':sum(j['conclusion']=='skipped' for j in conditional),'fullCiPassed':whole_success,'sourceIndexRefMutations':False,'stageOrCommitPerformed':False,'successfulArtifactZipBytesDownloaded':False,'downloadedFailureArtifacts':downloads,'scope':'All files currently closed in this new directory except evidence-files.json itself; old D archive remains unchanged. Future candidates must use a new directory.','files':files}
with (archive/'evidence-files.json').open('x') as out:json.dump(ledger,out,ensure_ascii=False,indent=2);out.write('\n')
ledger_raw = (archive/'evidence-files.json').read_bytes()
print(json.dumps({'runId':args.run_id,'conclusion':run['conclusion'],'required':required_counts,'rulesAll311':all_rules_311,'games':dict(game_counts),'multiplayer':dict(mp_counts),'ledgerSha256':hashlib.sha256(ledger_raw).hexdigest(),'ledgerBytes':len(ledger_raw),'files':len(files),'totalEvidenceBytesExcludingLedger':sum(f['bytes'] for f in files),'maxBlobBytes':max(f['bytes'] for f in files)},ensure_ascii=False))
