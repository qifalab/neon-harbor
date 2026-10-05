#!/usr/bin/env python3
"""Bounded capture executor. Capture completion always awaits human art review.

Prepared source only: this file has not been imported or executed by preparation.
The existing capture methods, routes, input guards and budgets are unmodified.
"""
from __future__ import annotations
import argparse
import errno
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

BASELINE = '7a90f7934b7c9d1af5c4494bf08c4ec337c373e4'
SUCCESS_STATES = {'capture-complete-art-review-pending', 'core-recorded-pending-manual-review',
                  'extra-recorded-pending-manual-review', 'PASSED'}
PORT = 5240
PREPARATION_SECONDS = 1200
OUTER_CLEANUP_GRACE_SECONDS = 120  # outside original tool limit; cannot extend playable case
ABORT_SIGNAL = None

def request_abort(signum, frame):
    global ABORT_SIGNAL
    ABORT_SIGNAL = ABORT_SIGNAL or signum

def now():
    return datetime.now(timezone.utc).isoformat()

def digest(path):
    result = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()

def save(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.writing')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')
    temporary.replace(path)

def proc_table():
    table = {}
    for directory in Path('/proc').iterdir():
        if not directory.name.isdecimal():
            continue
        try:
            raw = (directory / 'stat').read_text()
            fields = raw[raw.rfind(')') + 2:].split()
            table[int(directory.name)] = {'pid': int(directory.name), 'state': fields[0],
                'ppid': int(fields[1]), 'pgid': int(fields[2]), 'session': int(fields[3]),
                'startTicks': int(fields[19])}
        except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError, IndexError):
            pass
    return table

def observe_owned(table, identities, root_pid):
    # Retain exact PID/startTicks, so a recycled PID can never be signalled.
    selected = {pid for (pid, tick), old in identities.items()
                if pid in table and table[pid]['startTicks'] == tick}
    # The launch root must already have a kernel-bound identity. Numeric PID
    # discovery never grants ownership, including exceptional cleanup paths.
    changed = True
    while changed:
        before = len(selected)
        selected.update(pid for pid, row in table.items() if row['ppid'] in selected)
        changed = len(selected) != before
    for pid in selected:
        row = table[pid]
        key = (pid, row['startTicks'])
        if key not in identities:
            identities[key] = {**row, 'firstObservedAt': now(), 'pidfdBound': False}
            try:
                fd = os.pidfd_open(pid)
                after = proc_table().get(pid)
                if after is None or after['startTicks'] != row['startTicks']:
                    os.close(fd)
                    identities[key]['pidfdRefused'] = 'identity changed while obtaining kernel handle'
                else:
                    identities[key]['_pidfd'] = fd
                    identities[key]['pidfdBound'] = True
            except (OSError, AttributeError) as error:
                identities[key]['pidfdRefused'] = str(error)
        identities[key]['lastState'] = row['state']
        identities[key]['lastObservedAt'] = now()

def bind_launch_root(process, identities, receipt):
    # A Popen child has not been poll()/wait()/reaped yet. Require the actual
    # immediate parent and the new session/process group before accepting it.
    row = proc_table().get(process.pid)
    if row is None or row['ppid'] != os.getpid() or row['session'] != process.pid or row['pgid'] != process.pid:
        raise RuntimeError('Launch root parent/session/pgid identity could not be confirmed before poll/wait')
    fd = os.pidfd_open(process.pid)
    after = proc_table().get(process.pid)
    if after is None or any(after[field] != row[field] for field in ['pid','ppid','pgid','session','startTicks']):
        os.close(fd)
        raise RuntimeError('Launch root identity changed while binding its kernel pidfd')
    identity = {**after,'firstObservedAt':now(),'lastObservedAt':now(),'lastState':after['state'],
                'pidfdBound':True,'_pidfd':fd,'launchRoot':True}
    identities[(process.pid,after['startTicks'])] = identity
    receipt['launchRootIdentity'] = {k:v for k,v in identity.items() if not k.startswith('_')}
    receipt['launchRootBoundBeforeAnyPollWait'] = True

def live_owned(identities):
    table = proc_table()
    return [row for (pid, tick), row in identities.items()
            if pid in table and table[pid]['startTicks'] == tick and table[pid]['state'] != 'Z']

def terminate_exact(identities, signum, receipt):
    for (pid, tick), row in list(identities.items()):
        if pid == os.getpid():
            continue
        item = {'at': now(), 'pid': pid, 'startTicks': tick, 'signal': signum,
                'scope': 'kernel pidfd held since observing this exact owned process'}
        try:
            if '_pidfd' not in row:
                raise RuntimeError('No kernel identity handle; refusing any numeric-PID signal')
            signal.pidfd_send_signal(row['_pidfd'], signum)
            item['sent'] = True
        except ProcessLookupError:
            item['alreadyAbsent'] = True
        except (OSError, RuntimeError) as error:
            item['error'] = str(error)
        receipt.setdefault('signals', []).append(item)

def port_closed(port=PORT):
    with socket.socket() as connection:
        connection.settimeout(.25)
        result = connection.connect_ex(('127.0.0.1', port))
    return {'port': port, 'connectErrno': result, 'confirmedRefused': result == errno.ECONNREFUSED}

def run_owned(argv, cwd, environment, timeout_seconds, log_base, check_port=False, metadata_path=None, owned_port=PORT):
    receipt = {'argv': argv, 'cwd': str(cwd), 'startedAt': now(), 'timeoutSeconds': timeout_seconds,
               'outerWatchdogOnly': True, 'originalPlayableBudgetUnchanged': True, 'signals': []}
    identities = {}
    deadline = time.monotonic() + timeout_seconds
    process = None
    try:
        if ABORT_SIGNAL is not None:
            raise InterruptedError('Cancellation received before child launch')
        with open(str(log_base) + '.stdout.log', 'xb') as stdout, open(str(log_base) + '.stderr.log', 'xb') as stderr:
            process = subprocess.Popen(argv, cwd=cwd, env=environment, stdout=stdout, stderr=stderr, start_new_session=True)
            receipt['ownedRunnerPid'] = process.pid
            bind_launch_root(process, identities, receipt)
            while True:
                observe_owned(proc_table(), identities, process.pid)
                if process.poll() is not None:
                    break
                if ABORT_SIGNAL is not None:
                    receipt['executorFirstError'] = {'type':'InterruptedError','signal':ABORT_SIGNAL,
                                                    'message':'workflow executor received cancellation signal'}
                    terminate_exact(identities, signal.SIGTERM, receipt)
                    break
                if time.monotonic() >= deadline:
                    receipt['outerWatchdogFailure'] = 'tool exceeded its original budget plus cleanup grace'
                    terminate_exact(identities, signal.SIGTERM, receipt)
                    break
                time.sleep(.25)
            close_deadline = time.monotonic() + 15
            while (process.poll() is None or live_owned(identities)) and time.monotonic() < close_deadline:
                observe_owned(proc_table(), identities, process.pid)
                time.sleep(.25)
            if process.poll() is None or live_owned(identities):
                receipt['ownedChildSurvivedNormalClosure'] = True
                terminate_exact(identities, signal.SIGKILL, receipt)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    receipt['ownedRunnerWaitFailure'] = 'exact child still not reaped after SIGKILL'
                final_close_deadline = time.monotonic() + 10
                while live_owned(identities) and time.monotonic() < final_close_deadline:
                    observe_owned(proc_table(), identities, process.pid)
                    time.sleep(.25)
            receipt['exitCode'] = process.poll()
    except BaseException as error:
        receipt['executorFirstError'] = {'type': type(error).__name__, 'message': str(error)}
        if process is not None:
            observe_owned(proc_table(), identities, process.pid)
            terminate_exact(identities, signal.SIGTERM, receipt)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                terminate_exact(identities, signal.SIGKILL, receipt)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    receipt['ownedRunnerWaitFailure'] = 'exact child remained alive after exceptional cleanup'
            receipt['exitCode'] = process.poll()
    # Method raw metadata is additional closure evidence, never permission to
    # signal an unobserved PID. A live unobserved/reused browser PID blocks GPU.
    table = proc_table()
    receipt['reportedBrowserProcessChecks'] = []
    if metadata_path is not None and Path(metadata_path).exists():
        try:
            raw = read_json(metadata_path)
            declared = [raw.get('browser',{}).get('ownedPid') if isinstance(raw.get('browser'),dict) else None,
                        raw.get('ownedLaunch',{}).get('pid'),
                        raw.get('cleanup',{}).get('ownedBrowserPID') if isinstance(raw.get('cleanup'),dict) else None]
            for pid in sorted(set(pid for pid in declared if isinstance(pid,int) and pid>0)):
                current = table.get(pid)
                receipt['reportedBrowserProcessChecks'].append({'pid':pid,'actualProcState':current,
                    'recordedPidAbsentOrZombie':current is None or current['state']=='Z',
                    'observedIdentity':next((row for (p,tick),row in identities.items()
                         if p==pid and current and current['startTicks']==tick),None)})
        except (OSError,ValueError,TypeError,AttributeError) as error:
            receipt['rawMetadataClosureReadError'] = str(error)
    receipt['ownedProcesses'] = [{k:v for k,v in row.items() if not k.startswith('_')} for row in identities.values()]
    receipt['remainingOwnedProcesses'] = [{k:v for k,v in row.items() if not k.startswith('_')} for row in live_owned(identities)]
    receipt['ownedClosureConfirmed'] = receipt.get('launchRootBoundBeforeAnyPollWait') is True and receipt.get('exitCode') is not None and not receipt['remainingOwnedProcesses']
    if any(not check['recordedPidAbsentOrZombie'] for check in receipt['reportedBrowserProcessChecks']):
        receipt['ownedClosureConfirmed'] = False
    if check_port:
        receipt['portClosure'] = port_closed(owned_port)
        receipt['ownedClosureConfirmed'] = receipt['ownedClosureConfirmed'] and receipt['portClosure']['confirmedRefused']
    receipt['finishedAt'] = now()
    for row in identities.values():
        if '_pidfd' in row:
            os.close(row['_pidfd'])
            del row['_pidfd']
    save(str(log_base) + '.owned-process-receipt.json', receipt)
    return receipt

def executor_success(receipt):
    return receipt.get('exitCode') == 0 and receipt['ownedClosureConfirmed'] and not any(
        receipt.get(key) for key in ['outerWatchdogFailure','executorFirstError',
                                     'ownedChildSurvivedNormalClosure','ownedRunnerWaitFailure',
                                     'rawMetadataClosureReadError'])

def read_json(path):
    return json.loads(Path(path).read_text())

def git_head(root):
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True, timeout=10).strip()

def frozen(root, expected, head):
    manifest_path = root / 'dist/build-info.json'
    manifest = read_json(manifest_path)
    if git_head(root) != head or manifest.get('revision') != head:
        raise ValueError('Actual checkout HEAD and its own built revision must agree')
    if manifest.get('version') != '0.8.0' or manifest.get('assets') != expected['assets']:
        raise ValueError('Actual entire runtime dictionary differs from sealed ' + expected['mode'])
    for name, pin in manifest['assets'].items():
        source = (root / name).resolve()
        served = (root / 'dist' / name).resolve()
        if root not in source.parents or root / 'dist' not in served.parents:
            raise ValueError('Uncontained runtime asset path')
        if digest(source) != pin or digest(served) != pin:
            raise ValueError('Source/served runtime fingerprint differs: ' + name)
    return {'head': head, 'version': manifest['version'], 'revision': manifest['revision'],
            'buildInfoSha256': digest(manifest_path), 'assetCount': len(manifest['assets']),
            'assets': manifest['assets'], 'sourceServedMatched': True}

def native_command(case, mode, root, bundle, native_output):
    family = case['family']
    methods = bundle / 'methods'
    if family == 'continuous-tour':
        return ['node', str(root/'tools/capture-harbor-tour.mjs'), '--root', str(root/'dist'),
                '--output', str(native_output), '--port', str(case['port'])]
    if family == 'harbor':
        return ['node', str(methods/'harbor/capture-authored-harbor-native.mjs'), '--mode', mode,
                '--case', case['toolCase'], '--output', str(native_output), '--gpu-go', 'yes', '--port', str(PORT)]
    if family == 'scenic':
        result = ['node', str(methods/'scenic/capture-scenic-east.mjs'), '--mode', mode,
                  '--case', case['toolCase'], '--output', str(native_output), '--gpu-go', 'yes', '--port', str(PORT)]
        baseline = native_output.parent / 'baseline/metadata.json'
        if mode == 'authored' and baseline.exists() and read_json(baseline).get('status') == 'capture-complete-art-review-pending':
            result.extend(['--reference', str(baseline)])  # original optional same-pose guard
        return result
    if family == 'transport':
        return ['node', str(methods/'transport/native-transport-high.mjs'), '--mode', mode,
                '--kind', case['toolCase'], '--root', str(root/'dist'), '--source-root', str(root),
                '--playwright-root', str(root), '--output', str(native_output), '--port', str(PORT)]
    if family == 'transport-owner':
        return ['node', str(methods/'transport-owner/native-transport-ownership-extra.mjs'),
                '--mode',mode,'--kind',case['toolCase'],'--root',str(root/'dist'),'--source-root',str(root),
                '--playwright-root',str(root),'--output',str(native_output),'--port',str(case['port'])]
    if family not in ('resident', 'resident-extra'):
        raise ValueError('Unrecognized curated native family: ' + family)
    filename = 'capture-resident-extra.mjs' if family == 'resident-extra' else 'capture-resident-native.mjs'
    folder = 'resident-extra' if family == 'resident-extra' else 'resident'
    result = ['node', str(methods/folder/'tools'/filename), '--mode', mode, '--project-root', str(root),
              '--git-root', str(root), '--root', str(root/'dist'), '--output', str(native_output), '--port', str(PORT)]
    if family == 'resident-extra':
        result.extend(['--case', case['toolCase']])
    return result

def native_result(output, family, stdout_path=None):
    if family == 'transport-owner':
        case_path, completion_path, late_path = (output/'case.json',output/'completion.json',output/'late-failure.json')
        read_errors = []
        def preserved_record(path):
            try:
                value = read_json(path)
                if not isinstance(value,dict):
                    raise TypeError('Original record must be a JSON object')
                return value
            except (OSError,ValueError,TypeError) as error:
                read_errors.append({'file':str(path),'type':type(error).__name__,'message':str(error)})
                return {}
        original_case = preserved_record(case_path)
        completion = preserved_record(completion_path)
        late = preserved_record(late_path) if late_path.exists() else None
        terminal = {}
        try:
            last_line = ''
            with open(stdout_path,encoding='utf-8') as handle:
                for line in handle:
                    if line.strip():
                        last_line = line
            terminal = json.loads(last_line)
            if not isinstance(terminal,dict):
                raise TypeError('Original final stdout must be a JSON object')
        except (OSError,ValueError,TypeError) as error:
            read_errors.append({'file':str(stdout_path),'type':type(error).__name__,'message':str(error)})
            terminal = {}
        records = [{'file':str(p),'sha256':digest(p),'bytes':p.stat().st_size}
                   for p in [case_path,completion_path,late_path] if p.exists()]
        first = next((r.get('firstError') for r in [original_case,completion,late,terminal]
                      if isinstance(r,dict) and r.get('firstError')),None)
        failed = bool(read_errors) or late is not None or any(r.get('status') != 'RECORDED_PENDING_MANUAL_REVIEW'
                                        for r in [terminal,completion,original_case])
        if completion.get('caseFileWritten') is not True or not case_path.exists() or completion.get('caseFileSha256') != digest(case_path):
            failed = True
            read_errors.append({'file':str(completion_path),'type':'ValueError',
                                'message':'Completion does not verify actual immutable case.json bytes'})
        selected = late_path if late is not None else completion_path if completion_path.exists() else stdout_path
        return {'file':str(selected),'sha256':digest(selected),'status':'FAILED' if failed else completion['status'],
                'originalFirstError':first,'records':records,'readErrors':read_errors,
                'originalTerminalStdout':terminal,'rawMetadata':completion}
    file = output / ('run.json' if family == 'transport' else 'metadata.json')
    raw = read_json(file)
    return {'file': str(file), 'sha256': digest(file), 'status': raw.get('status'),
            'originalFirstError': raw.get('firstError') or raw.get('firstFailure') or raw.get('primaryError') or raw.get('failure'),
            'rawMetadata': raw}

def main():
    signal.signal(signal.SIGTERM, request_abort)
    signal.signal(signal.SIGINT, request_abort)
    parser = argparse.ArgumentParser()
    parser.add_argument('--case', required=True)
    parser.add_argument('--baseline-root', required=True)
    parser.add_argument('--authored-root', required=True)
    parser.add_argument('--evidence-root', required=True)
    args = parser.parse_args()
    bundle = Path(__file__).resolve().parent
    authored = Path(args.authored_root).resolve()
    baseline = Path(args.baseline_root).resolve()
    evidence = Path(args.evidence_root).resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    if any(p.name != 'job-envelope.json' for p in evidence.iterdir()):
        raise ValueError('A previous evidence directory must never be reused')
    for folder in ['logs', 'preparation', 'native']:
        (evidence/folder).mkdir()
    summary = {'status': 'RUNNING', 'artAcceptance': 'PENDING_HUMAN_NATIVE_REVIEW', 'startedAt': now(),
               'case': args.case, 'retry': False, 'variants': [], 'firstError': None, 'secondaryErrors': [],
               'sourcePreparationBeforeGpu': True, 'noImagePostProcessing': True}
    def checkpoint():
        save(evidence/'pair-summary.json', summary)
    def apply_cancellation(stage, mode=None):
        if ABORT_SIGNAL is None:
            return False
        if 'cancellation' not in summary:
            cancellation = {'stage':stage,'type':'InterruptedError','signal':ABORT_SIGNAL,
                            'message':'Cancellation received during paired executor','observedAt':now()}
            if mode is not None:
                cancellation['mode'] = mode
            summary['cancellation'] = cancellation
            if summary['firstError'] is None:
                summary['firstError'] = cancellation
            else:
                summary['secondaryErrors'].append(cancellation)
        summary['status'] = 'FAILED'
        return True
    checkpoint()
    try:
        if not hasattr(os,'pidfd_open') or not hasattr(signal,'pidfd_send_signal'):
            raise RuntimeError('Linux pidfd API is required; numeric PID cleanup fallback is forbidden')
        config = read_json(bundle/'cases.json')
        case = next(c for c in config['cases'] if c['id'] == args.case)
        if case['family'] == 'continuous-tour':
            summary['artAcceptance'] = 'NOT_APPLICABLE_LOW_FUNCTIONAL_ONLY'
            summary['qualityScope'] = 'Low 512x320 public setting; authored continuous functional route only'
        if case['id'] == 'resident-loop':
            summary['artAcceptance'] = 'NOT_APPLICABLE_LOW_FUNCTIONAL_ONLY'
            summary['qualityScope'] = 'Low512x320 fixed workshop observer; actual natural resident day/public wage save exports; no High art acceptance'
        seal = read_json(bundle/'bundle-manifest.json')
        for name, pin in seal['files'].items():
            if digest(bundle/name) != pin['sha256']:
                raise ValueError('Curated method or executor SHA mismatch: ' + name)
        if digest(authored/'.github/workflows/native-art.yml') != seal['nativeWorkflowSha256']:
            raise ValueError('Actual feature native workflow differs from curated seal')
        if digest(authored/'.github/workflows/ci.yml') != seal['ciWorkflowSha256']:
            raise ValueError('Actual CI caller differs from the byte-preserving additive source review')
        if digest(authored/'.github/workflows/pages.yml') != seal['unchangedPagesSha256']:
            raise ValueError('Actual Pages gate differs from the unchanged reviewed workflow')
        actual_author = git_head(authored)
        if actual_author != os.environ.get('AUTHORED_SHA') or git_head(baseline) != BASELINE:
            raise ValueError('Actual Git roots must equal dispatched authored SHA and fixed baseline SHA')
        top = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=authored, text=True, timeout=10).strip()
        if Path(top).resolve() != authored:
            raise ValueError('Authored cwd must be its own actual Git root')
        expected = read_json(bundle/'expected-runtime-dictionaries.json')
        for name, pin in case.get('actualCheckoutToolPins',{}).items():
            if digest(authored/name) != pin:
                raise ValueError('Actual checkout original tool/helper SHA mismatch: ' + name)
        summary['heads'] = {'baseline': BASELINE, 'authored': actual_author}
        summary['bundleManifestSha256'] = digest(bundle/'bundle-manifest.json')
        shutil.copytree(bundle, evidence/'preparation/method-bundle-original')
        summary['github'] = {k: os.environ.get(k) for k in ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_WORKFLOW','GITHUB_EVENT_NAME']}
        environment = os.environ.copy()
        environment.pop('CHROMIUM_PATH', None)
        preparation_deadline = time.monotonic() + PREPARATION_SECONDS
        roots = [('baseline', baseline, BASELINE), ('authored', authored, actual_author)] if case['paired'] else [('authored', authored, actual_author)]
        for mode, root, head in roots:
            if ABORT_SIGNAL is not None:
                raise InterruptedError('Cancellation received; no additional native tool may launch')
            local_env = {**environment, 'GITHUB_SHA': head}
            package = read_json(root/'package.json')
            if package.get('devDependencies', {}).get('@playwright/test') != '1.62.1':
                raise ValueError('Actual project must retain exact Playwright 1.62.1')
            for phase, argv in [('npm-ci',['npm','ci']), ('build',['npm','run','build'])]:
                remaining = preparation_deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Fixed 20-minute whole CPU preparation budget exhausted')
                receipt = run_owned(argv, root, local_env, remaining, evidence/'logs'/f'{mode}-{phase}')
                if not executor_success(receipt):
                    raise RuntimeError('Failed CPU preparation: ' + mode + '-' + phase)
            current = frozen(root, expected[mode], head)
            save(evidence/'preparation'/f'{mode}-build-receipt.json', current)
            (evidence/'preparation'/f'{mode}-build-info-original.json').write_bytes((root/'dist/build-info.json').read_bytes())
        # One provider installs both pinned Chromium and its media/system dependencies.
        remaining = preparation_deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Fixed whole CPU preparation budget exhausted before browser install')
        receipt = run_owned(['npx','--no-install','playwright','install','--with-deps','chromium'], authored,
                            {**environment,'GITHUB_SHA':actual_author}, remaining, evidence/'logs/browser-install')
        if not executor_success(receipt):
            raise RuntimeError('Pinned browser installation did not close successfully')
        if case['family'] == 'continuous-tour':
            for phase, argv in [('ffmpeg-apt-update',['sudo','apt-get','update']),
                                ('ffmpeg-install',['sudo','apt-get','install','-y','ffmpeg']),
                                ('ffprobe-version',['ffprobe','-version'])]:
                remaining = preparation_deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError('Fixed CPU preparation deadline before ffprobe availability')
                receipt = run_owned(argv, authored, {**environment,'GITHUB_SHA':actual_author}, remaining,
                                    evidence/'logs'/phase)
                if not executor_success(receipt):
                    raise RuntimeError('Required original continuous-tour ffprobe preparation failed: ' + phase)
        for mode, root, head in roots:
            browsers = read_json(root/'node_modules/playwright-core/browsers.json')
            for name in ['chromium','chromium-headless-shell']:
                row = next(b for b in browsers['browsers'] if b['name'] == name)
                if row.get('browserVersion') != '151.0.7922.34':
                    raise ValueError('Installed provider declared a different Chromium version')
            adapter = seal['processAdapter']
            for path, pin in [('node_modules/playwright-core/package.json',adapter['packageSha256']),
                              ('node_modules/playwright-core/lib/coreBundle.js',adapter['coreBundleSha256'])]:
                if digest(root/path) != pin:
                    raise ValueError('Actual Playwright owned-process adapter differs: ' + mode + '/' + path)
            save(evidence/'preparation'/f'{mode}-dependency-receipt.json', {'browserManifest':browsers,
                 'playwrightVersion':'1.62.1', 'chromiumVersion':'151.0.7922.34', 'processAdapter':adapter,
                 'packageSha256':digest(root/'package.json'),'lockSha256':digest(root/'package-lock.json'),
                 'actualServerMethodSha256':digest(root/'tools/server.mjs')})
        summary['preparationFinishedAt'] = now()
        if time.monotonic() >= preparation_deadline:
            raise TimeoutError('Whole CPU preparation deadline expired after dependency/fingerprint checks')
        checkpoint()
        for index,(mode, root, head) in enumerate(roots):
            if ABORT_SIGNAL is not None:
                raise InterruptedError('Cancellation received; no additional GPU tool may launch')
            # No npm/build/install child is alive when a native tool launches.
            owned_port = case.get('port',PORT)
            if not port_closed(owned_port)['confirmedRefused']:
                raise RuntimeError('Previous owned localhost server closure not confirmed')
            before = frozen(root, expected[mode], head)
            if index == 0 and time.monotonic() >= preparation_deadline:
                raise TimeoutError('Whole preparation deadline expired before the first GPU launch')
            output = evidence/'native'/mode
            argv = native_command(case, mode, root, bundle, output)
            result = {'mode':mode,'actualHead':head,'freezeBefore':before,'collectorComplete':False,
                      'artAcceptance':summary['artAcceptance']}
            summary['variants'].append(result)
            checkpoint()
            receipt = run_owned(argv, root, {**environment,'GITHUB_SHA':head},
                                case['originalBudgetSeconds'] + OUTER_CLEANUP_GRACE_SECONDS,
                                evidence/'logs'/f'native-{mode}', check_port=True,
                                metadata_path=output/('run.json' if case['family']=='transport' else 'case.json' if case['family']=='transport-owner' else 'metadata.json'),
                                owned_port=owned_port)
            result['executor'] = receipt
            try:
                raw = native_result(output,case['family'],evidence/'logs'/f'native-{mode}.stdout.log')
                result['rawRecord'] = {k:v for k,v in raw.items() if k != 'rawMetadata'}
                states = {'passed'} if case['family']=='continuous-tour' else {'RECORDED_PENDING_MANUAL_REVIEW'} if case['family']=='transport-owner' else SUCCESS_STATES
                result['collectorComplete'] = executor_success(receipt) and raw['status'] in states and not raw['originalFirstError'] and ABORT_SIGNAL is None
                if raw['originalFirstError']:
                    summary['firstError'] = summary['firstError'] or {'mode':mode,'source':'original-native-record',**{'error':raw['originalFirstError']}}
            except (OSError,ValueError,TypeError) as error:
                summary['secondaryErrors'].append({'mode':mode,'stage':'read-original-result','message':str(error)})
            if ABORT_SIGNAL is not None:
                apply_cancellation('native-executor',mode)
            if receipt.get('outerWatchdogFailure') or receipt.get('ownedChildSurvivedNormalClosure') or receipt.get('executorFirstError'):
                result['collectorComplete'] = False
            if not result['collectorComplete']:
                summary['firstError'] = summary['firstError'] or {'mode':mode,'stage':'native-executor','exitCode':receipt.get('exitCode')}
            if not receipt['ownedClosureConfirmed']:
                raise RuntimeError('Owned native Node/browser/server closure unconfirmed; next GPU is forbidden')
            result['freezeAfter'] = frozen(root,expected[mode],head)
            for name, pin in case.get('actualCheckoutToolPins',{}).items():
                if digest(authored/name) != pin:
                    raise ValueError('Actual checkout original tool/helper changed during continuous route: ' + name)
            if result['freezeAfter'] != result['freezeBefore']:
                raise ValueError('Frozen source/served bytes changed during native case')
            checkpoint()
        completed = all(v['collectorComplete'] for v in summary['variants'])
        summary['status'] = ('FUNCTIONAL_TOUR_COMPLETE' if case['family']=='continuous-tour' else 'FUNCTIONAL_RESIDENT_DAY_COMPLETE' if case['id']=='resident-loop' else 'CAPTURE_COMPLETE_ART_REVIEW_PENDING') if completed else 'FAILED'
        apply_cancellation('final-success-decision')
    except BaseException as error:
        failure = {'stage':'paired-executor','type':type(error).__name__,'message':str(error)}
        if summary['firstError'] is None:
            summary['firstError'] = failure
        else:
            summary['secondaryErrors'].append(failure)
        summary['status'] = 'FAILED'
    finally:
        summary['finishedAt'] = now()
        apply_cancellation('before-final-evidence-hash')
        checkpoint()
        files = {}
        for path in sorted(evidence.rglob('*')):
            if path.is_file() and path.name != 'evidence-files.json':
                files[str(path.relative_to(evidence))] = {'bytes':path.stat().st_size,'sha256':digest(path)}
        # A late signal during potentially large WebM hashing cannot preserve
        # an earlier success decision. Refresh the final summary's ledger pin.
        apply_cancellation('after-final-evidence-hash')
        checkpoint()
        summary_file = evidence/'pair-summary.json'
        files['pair-summary.json'] = {'bytes':summary_file.stat().st_size,'sha256':digest(summary_file)}
        save(evidence/'evidence-files.json', {'status':summary['status'],'artAcceptance':summary['artAcceptance'],
             'integerSizePolicy':'Python unbounded integers; stream hashes; no 32MiB read cap','files':files})
        if apply_cancellation('before-final-receipt-return'):
            checkpoint()
            files['pair-summary.json'] = {'bytes':summary_file.stat().st_size,'sha256':digest(summary_file)}
            save(evidence/'evidence-files.json', {'status':summary['status'],'artAcceptance':summary['artAcceptance'],
                'integerSizePolicy':'Python unbounded integers; stream hashes; no 32MiB read cap','files':files})
    print(json.dumps({'case':args.case,'status':summary['status'],'artAcceptance':summary['artAcceptance']}))
    return 0 if summary['status'] in ('CAPTURE_COMPLETE_ART_REVIEW_PENDING','FUNCTIONAL_TOUR_COMPLETE','FUNCTIONAL_RESIDENT_DAY_COMPLETE') else 1

if __name__ == '__main__':
    raise SystemExit(main())
