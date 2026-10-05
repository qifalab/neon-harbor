#!/usr/bin/env python3
"""Passive single-run supervisor. No browser calls or game/source mutations.
Only --execute-once spawns the already-frozen native tour method.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path('/workspace/scratch/neon-harbor')
OUTPUT_RELATIVE = 'docs/qa/final-asset-freeze/continuous-tour'
OUTPUT = ROOT / OUTPUT_RELATIVE
LIVE = Path('/tmp/neon-harbor-final-one-tour-runner-live')
PREP = Path('/tmp/neon-harbor-final-one-tour-runner-prep')
EXPECTED = PREP / 'expected-preflight.json'
EXPECTED_MANIFEST = '502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3'
EXPECTED_METHOD = 'a8ff1a10fb47c97d2385054e65503b3269ba1a44fc3d2f7318bf5fe39603e537'
CASE_BUDGET_MS = 240 * 60 * 1000
MINIMUM_ROUTE_MS = 20 * 60 * 1000
PORT = 5193


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def digest(file):
    h = hashlib.sha256()
    with Path(file).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(file, value):
    Path(file).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def git_head():
    # Record the actual release commit D; no hard pin to the former0330 HEAD.
    return subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()


def frozen_inventory(expected):
    manifest_file = ROOT / 'dist/build-info.json'
    assert digest(manifest_file) == EXPECTED_MANIFEST, 'final manifest changed'
    manifest = json.loads(manifest_file.read_text())
    assert len(manifest['assets']) == 156
    assert sum(file.startswith('src/') for file in manifest['assets']) == 53
    mismatches = []
    asset_bytes = {}
    for file, wanted in manifest['assets'].items():
        served = ROOT / 'dist' / file
        asset_bytes[file] = served.stat().st_size
        if digest(served) != wanted:
            mismatches.append('dist/' + file)
        if file.startswith('src/') and digest(ROOT / file) != wanted:
            mismatches.append(file)
    methods = []
    for original in expected['methodAndDependencies']:
        file = original['file']
        actual = ROOT / file
        item = {'file': file, 'sha256': digest(actual), 'bytes': actual.stat().st_size}
        methods.append(item)
        if item['sha256'] != original['sha256'] or item['bytes'] != original['bytes']:
            mismatches.append(file)
    assert methods[0]['sha256'] == EXPECTED_METHOD
    assert not mismatches, json.dumps(mismatches)
    old_tours = []
    for original in expected['oldTours']:
        directory = ROOT / original['directory']
        ledger = directory / 'evidence-files.json'
        assert digest(ledger) == original['ledgerSha256'], 'old ledger changed: ' + str(directory)
        listed = json.loads(ledger.read_text())['files']
        assert len(listed) == original['entries']
        failures = []
        for item in listed:
            file = directory / item['file']
            if file.stat().st_size != item['bytes'] or digest(file) != item['sha256']:
                failures.append(item['file'])
        assert not failures, json.dumps(failures)
        old_tours.append({'directory': original['directory'], 'entries': len(listed),
                          'ledgerSha256': original['ledgerSha256'], 'mismatches': failures})
    return {'checkedAt': utc(), 'actualGitHead': git_head(), 'manifestSha256': EXPECTED_MANIFEST,
            'buildRevision': manifest.get('revision'), 'version': manifest.get('version'),
            'assetHashes': manifest['assets'], 'assetBytes': asset_bytes,
            'sourceHashes': {file: wanted for file, wanted in manifest['assets'].items() if file.startswith('src/')},
            'methodAndDependencies': methods, 'previousTours': old_tours, 'mismatches': mismatches}


def event(kind, **detail):
    value = {'kind': kind, 'at': utc(), 'monotonicNanoseconds': time.monotonic_ns(), **detail}
    with (LIVE / 'runner-events-original.jsonl').open('a') as stream:
        stream.write(json.dumps(value, ensure_ascii=False) + '\n')
    return value


def main():
    assert sys.argv[1:] == ['--execute-once'], 'Preparation only. Execute once only after root GPU GO: --execute-once'
    assert 'CHROMIUM_PATH' not in os.environ, 'Use the normal Playwright-installed browser; no CHROMIUM_PATH'
    assert not LIVE.exists(), 'choose a new runner live directory; never reuse a run'
    assert not OUTPUT.exists() or not any(OUTPUT.iterdir()), 'tour output must be new/empty'
    LIVE.mkdir()
    start_utc, start_mono = utc(), time.monotonic_ns()
    expected = json.loads(EXPECTED.read_text())
    result = {'status': 'preflight', 'wrapperStartedAt': start_utc, 'wrapperStartedMonotonicNanoseconds': start_mono,
              'wrapperPid': os.getpid(), 'workingDirectory': str(ROOT), 'output': str(OUTPUT),
              'command': ['node', 'tools/capture-harbor-tour.mjs', '--output', OUTPUT_RELATIVE, '--port', str(PORT)],
              'plannedAttemptLimit': 1, 'actualSpawnCount': 0, 'automaticRetry': False, 'sourceOrToolWritesByWrapper': 0,
              'gameCaseBudgetMilliseconds': CASE_BUDGET_MS, 'minimumActualRouteMilliseconds': MINIMUM_ROUTE_MS,
              'outerWatchdogAdded': False, 'chromiumPathEnvironmentPresent': False,
              'browserOperationsByWrapper': 0, 'published': False, 'publicationUrl': None, 'closureErrors': []}
    child = None
    try:
        before = frozen_inventory(expected)
        write_json(LIVE / 'pre-run-freeze-original.json', before)
        shutil.copyfile(EXPECTED, LIVE / 'expected-preflight-original.json')
        shutil.copyfile(__file__, LIVE / 'runner-wrapper-original.py')
        shutil.copyfile(ROOT / 'dist/build-info.json', LIVE / 'build-info-original.json')
        # Copies live beside the output until the child has completed its empty-directory assertion.
        for item in before['methodAndDependencies']:
            dest = LIVE / 'frozen-method-files' / item['file']
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / item['file'], dest)
        for file in before['sourceHashes']:
            dest = LIVE / 'frozen-sources' / file
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / file, dest)
        result['actualLaunchGitHead'] = before['actualGitHead']
        result['nodeVersion'] = subprocess.check_output(['node', '--version'], cwd=ROOT, text=True).strip()
        write_json(LIVE / 'runner-result.json', result)
        OUTPUT.mkdir(parents=True, exist_ok=True)
        assert not any(OUTPUT.iterdir())
        # One Popen only. Raw child stdout/stderr go directly to files without prefixes, decoding or editing.
        with (LIVE / 'capture-stdout-original.log').open('xb', buffering=0) as stdout, \
             (LIVE / 'capture-stderr-original.log').open('xb', buffering=0) as stderr:
            result['childSpawnRequestedAt'] = utc()
            result['childSpawnRequestedMonotonicNanoseconds'] = time.monotonic_ns()
            child = subprocess.Popen(result['command'], cwd=ROOT, stdout=stdout, stderr=stderr)
            result['actualSpawnCount'] = 1
            result['childPid'] = child.pid
            result['childProcessGroupId'] = os.getpgid(child.pid)
            result['childSpawnObservedAt'] = utc()
            event('child-spawned', pid=child.pid, actualGitHead=result['actualLaunchGitHead'], command=result['command'])
            write_json(LIVE / 'runner-result.json', result)
            print(json.dumps({'event': 'spawned-once', 'pid': child.pid, 'at': result['childSpawnObservedAt'],
                              'actualGitHead': result['actualLaunchGitHead'], 'liveEvidence': str(LIVE)}, ensure_ascii=False), flush=True)
            # Original a8 method owns its fixed240-minute case timer and normal failure/video shutdown.
            result['childReturnCode'] = child.wait()
        result['childExitedAt'] = utc()
        result['childExitedMonotonicNanoseconds'] = time.monotonic_ns()
        result['childWallMilliseconds'] = (result['childExitedMonotonicNanoseconds'] - result['childSpawnRequestedMonotonicNanoseconds']) / 1_000_000
        result['childSignal'] = -result['childReturnCode'] if result['childReturnCode'] < 0 else None
        event('child-exited', pid=child.pid, returnCode=result['childReturnCode'], signal=result['childSignal'])
        metadata_file = OUTPUT / 'metadata.json'
        metadata = None
        try:
            assert metadata_file.exists(), 'Original game metadata missing'
            metadata = json.loads(metadata_file.read_text())
        except Exception as error:
            result['closureErrors'].append({'operation': 'metadata-read', 'type': type(error).__name__, 'message': str(error)})
        result['gameMetadataStatus'] = metadata.get('status') if metadata else None
        result['gameFailureAt'] = metadata.get('failureAt') if metadata else None
        result['gameFailure'] = metadata.get('failure') if metadata else None
        result['methodCleanupErrors'] = metadata.get('cleanupErrors') if metadata else None
        result['methodCompletedAt'] = metadata.get('completedAt') if metadata else None
        result['methodVideoStoppedAt'] = metadata.get('videoStoppedAt') if metadata else None
        result['browserClosureReportedByMethod'] = bool(metadata and metadata.get('completedAt') and metadata.get('videoStoppedAt') and metadata.get('cleanupErrors') == [])
        result['browserDescendantsIndependentlyObservedExited'] = False
        result['browserClosureEvidenceScope'] = 'Frozen a8 awaits context.close and browser.close; metadata reports cleanup. Wrapper does not inspect or control browser processes.'
        if not result['browserClosureReportedByMethod']:
            result['closureErrors'].append({'operation': 'browser-closure-report', 'message': 'Method closure not confirmed; GPU owner must confirm process release separately.'})
        # Hash verification is passive and occurs only after the child/browser has exited.
        try:
            after = frozen_inventory(expected)
            write_json(LIVE / 'post-run-freeze-original.json', after)
            result['endFreezePassed'] = True
            result['actualEndGitHead'] = after['actualGitHead']
        except Exception as error:
            result['endFreezePassed'] = False
            result['closureErrors'].append({'operation': 'end-freeze', 'type': type(error).__name__, 'message': str(error)})
        videos = sorted((OUTPUT / 'video').glob('*.webm'))
        result['videoFilesFound'] = [str(file.relative_to(OUTPUT)) for file in videos]
        try:
            assert len(videos) == 1, 'Exactly one original uninterrupted WebM required'
            video = videos[0]
            command = ['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(video)]
            probe_start = utc()
            with (LIVE / 'independent-ffprobe-original.json').open('xb') as stdout, \
                 (LIVE / 'independent-ffprobe-stderr-original.log').open('xb') as stderr:
                probe = subprocess.run(command, stdout=stdout, stderr=stderr, check=False)
            result['ffprobe'] = {'command': command, 'startedAt': probe_start, 'finishedAt': utc(), 'returnCode': probe.returncode}
            assert probe.returncode == 0, 'Independent raw-video ffprobe failed'
            info = json.loads((LIVE / 'independent-ffprobe-original.json').read_text())
            seconds = float(info['format']['duration'])
            stream = next(item for item in info['streams'] if item.get('codec_type') == 'video')
            actual = {'file': str(video.relative_to(OUTPUT)), 'bytes': video.stat().st_size, 'sha256': digest(video),
                      'durationSeconds': seconds, 'codec': stream['codec_name'], 'width': stream['width'], 'height': stream['height'],
                      'probeSource': 'independent-ffprobe-original.json', 'unedited': True,
                      'published': False, 'publicationUrl': None, 'largeFilePolicy': 'retain local original; publication requires actual separate receipt'}
            result['video'] = actual
            assert metadata and metadata.get('video'), 'Game raw-video metadata missing'
            assert actual['file'] == metadata['video']['file']
            assert actual['bytes'] == metadata['video']['bytes']
            assert actual['sha256'] == metadata['video']['sha256']
            assert abs(seconds - metadata['video']['durationSeconds']) < .005
            assert metadata['video']['published'] is False and metadata['video']['publicationUrl'] is None
            assert (stream['width'], stream['height']) == (512, 320), 'Actual functional-video viewport changed'
            assert seconds >= metadata['recordingWallMilliseconds'] / 1000 - 2, 'Original video shorter than observed full recording wall time'
            result['independentVideoVerificationPassed'] = True
        except Exception as error:
            result['independentVideoVerificationPassed'] = False
            result['closureErrors'].append({'operation': 'independent-video', 'type': type(error).__name__, 'message': str(error)})
        if metadata:
            result['actualRouteWallMilliseconds'] = metadata.get('routeWallMilliseconds') or metadata.get('failureRouteWallMilliseconds')
            result['actualCaseWallMilliseconds'] = metadata.get('caseWallMilliseconds')
            result['routeCompleted'] = bool(metadata.get('routeEndedAt'))
            result['afterReloadReal2FObserved'] = any(p.get('label') == 'after-reload-real-E-and-stairs-reach-original-2F' for p in metadata.get('phases', []))
            if metadata.get('status') == 'passed':
                try:
                    assert metadata['caseBudgetWallMilliseconds'] == CASE_BUDGET_MS
                    assert metadata['routeWallMilliseconds'] >= MINIMUM_ROUTE_MS
                    assert metadata['caseWallMilliseconds'] <= CASE_BUDGET_MS
                    assert result['routeCompleted'] and result['afterReloadReal2FObserved']
                    assert not metadata['errors']
                except Exception as error:
                    result['closureErrors'].append({'operation': 'completed-case-consistency', 'type': type(error).__name__, 'message': str(error)})
        result['candidateGameSuccess'] = bool(result.get('childReturnCode') == 0 and result['gameMetadataStatus'] == 'passed' and not result['closureErrors'])
        result['status'] = 'closure-pending' if result['candidateGameSuccess'] else 'failed'
    except BaseException as error:
        result['status'] = 'failed'
        result['supervisorError'] = {'type': type(error).__name__, 'message': str(error), 'at': utc()}
        try:
            event('supervisor-error', type=type(error).__name__, message=str(error))
        except BaseException as record_error:
            result['closureErrors'].append({'operation': 'supervisor-error-event-write', 'type': type(record_error).__name__, 'message': str(record_error)})
        # Do not silently kill/restart the child or overwrite its first failure.
        if child is not None and child.poll() is None:
            result['childStillRunning'] = True
            try:
                write_json(LIVE / 'runner-result.json', result)
            except BaseException as record_error:
                result['closureErrors'].append({'operation': 'child-running-failure-record-write', 'type': type(record_error).__name__, 'message': str(record_error)})
            print(json.dumps({'status': 'supervisor-failed-child-running', 'pid': child.pid, 'liveEvidence': str(LIVE)}, ensure_ascii=False), flush=True)
            return 2
    # Archive only after the Node child has exited; closure proof is recorded above,
    # never inferred from child exit alone. Original game files remain untouched.
    destination = OUTPUT / 'runner-evidence'
    created_archive = False
    archive_owned = False
    created_closure = False
    archive_files = []
    result['archiveStatus'] = 'not-started'
    if child is not None and child.poll() is not None:
        result['archiveStatus'] = 'pending'
        try:
            write_json(LIVE / 'runner-result.json', result)
            assert not destination.exists(), 'never overwrite a previous runner archive'
            root_copies = {
                'capture-harbor-tour-original.mjs': LIVE / 'frozen-method-files/tools/capture-harbor-tour.mjs',
                'capture-stdout-original.log': LIVE / 'capture-stdout-original.log',
                'capture-stderr-original.log': LIVE / 'capture-stderr-original.log',
            }
            for name in [*root_copies, 'runner-closure-original.json', 'runner-evidence-files.json']:
                assert not (OUTPUT / name).exists(), 'never overwrite a previous evidence file: ' + name
            archive_owned = True
            shutil.copytree(LIVE, destination)
            created_archive = True
            for name, original in root_copies.items():
                # Exclusive output prevents an unrelated existing file from being overwritten.
                with original.open('rb') as source, (OUTPUT / name).open('xb') as target:
                    shutil.copyfileobj(source, target)
                archive_files.append(OUTPUT / name)
            result['archiveStatus'] = 'copied-pending-final-records'
        except BaseException as error:
            created_archive = bool(archive_owned and destination.exists())
            result['archiveStatus'] = 'failed'
            result['closureErrors'].append({'operation': 'archive-copy', 'type': type(error).__name__, 'message': str(error), 'at': utc()})
            result['status'] = 'failed'

    def finalize_result():
        result['status'] = 'passed' if result.get('candidateGameSuccess') and result['archiveStatus'] == 'completed' and not result['closureErrors'] else 'failed'
        result['wrapperCompletedAt'] = utc()
        result['wrapperWallMilliseconds'] = (time.monotonic_ns() - start_mono) / 1_000_000
        result['wrapperExitCode'] = 0 if result['status'] == 'passed' else (result.get('childReturnCode') if result.get('childReturnCode', 0) > 0 else 2)
        records = [LIVE / 'runner-result.json']
        if created_archive:
            records.append(destination / 'runner-result.json')
        for record in records:
            try:
                # Mutable supervisor records may be finalized; no game/raw log is edited.
                write_json(record, result)
            except BaseException as error:
                result['archiveStatus'] = 'failed'
                result['status'] = 'failed'
                result['wrapperExitCode'] = result.get('childReturnCode') if result.get('childReturnCode', 0) > 0 else 2
                result['closureErrors'].append({'operation': 'supervisor-record-finalization', 'file': str(record), 'type': type(error).__name__, 'message': str(error), 'at': utc()})
        # Caller and terminal stdout always receive nonzero on record-write failure;
        # a storage failure cannot be guaranteed repairable on that same storage.

    if created_archive:
        try:
            if result['archiveStatus'] == 'copied-pending-final-records':
                result['archiveStatus'] = 'completed'
            finalize_result()
            with (OUTPUT / 'runner-closure-original.json').open('x') as stream:
                created_closure = True
                stream.write(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
            archive_files.append(OUTPUT / 'runner-closure-original.json')
            archive_files.extend(file for file in sorted(destination.rglob('*')) if file.is_file())
            files = [{'file': str(file.relative_to(OUTPUT)), 'bytes': file.stat().st_size, 'sha256': digest(file)} for file in sorted(archive_files)]
            with (OUTPUT / 'runner-evidence-files.json').open('x') as stream:
                stream.write(json.dumps({'generatedAt': utc(), 'scope': 'Complete supervisor-created archive including root method/stdout/stderr/closure copies; original game files are outside this ledger',
                                         'published': False, 'files': files}, indent=2, ensure_ascii=False) + '\n')
        except BaseException as error:
            result['archiveStatus'] = 'failed'
            result['closureErrors'].append({'operation': 'archive-final-records', 'type': type(error).__name__, 'message': str(error), 'at': utc()})
            result['status'] = 'failed'
            finalize_result()
            if created_closure:
                # Only the supervisor-owned partial closure can be repaired; no original game evidence is rewritten.
                try:
                    write_json(OUTPUT / 'runner-closure-original.json', result)
                except BaseException as final_error:
                    result['closureErrors'].append({'operation': 'closure-failure-record-write', 'type': type(final_error).__name__, 'message': str(final_error), 'at': utc()})
    else:
        finalize_result()
    print(json.dumps({'status': result['status'], 'childReturnCode': result.get('childReturnCode'),
                      'wrapperExitCode': result['wrapperExitCode'], 'finishedAt': result['wrapperCompletedAt'],
                      'output': str(OUTPUT), 'closureErrors': result['closureErrors']}, ensure_ascii=False), flush=True)
    return result['wrapperExitCode']


if __name__ == '__main__':
    sys.exit(main())
