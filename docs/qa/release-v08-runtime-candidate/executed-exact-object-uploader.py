#!/usr/bin/env python3
"""Upload an exact local commit via gh REST. This script NEVER changes refs.

Only committed Git objects are read. Preserve each commit's state/log separately.
Example:
  python3 /tmp/neon-upload-git-objects-safe.py --repo /workspace/scratch/neon-harbor \
    --remote qifalab/neon-harbor --commit FULL_SHA --parent FULL_PARENT_SHA \
    --state /tmp/neon-upload-FULL_SHA.json --dry-run
Remove --dry-run after the committed candidate is authorized for upload.
"""
import argparse
import base64
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
import threading
import time


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, type=Path)
    parser.add_argument('--remote', required=True, help='GitHub owner/repository')
    parser.add_argument('--commit', required=True, help='Exact 40-character local HEAD SHA')
    parser.add_argument('--parent', required=True, help='Exact single parent SHA')
    parser.add_argument('--state', required=True, type=Path)
    parser.add_argument('--dry-run', action='store_true', help='Local preflight only; no API writes or reads')
    args = parser.parse_args()
    require(bool(re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.remote)), 'Invalid remote')
    require(all(re.fullmatch(r'[0-9a-f]{40}', value) for value in (args.commit, args.parent)),
            'Use exact lowercase 40-character commit and parent SHAs')
    repo = args.repo.resolve(strict=True)
    state_path = args.state.resolve()
    require(not str(state_path).startswith(str(repo) + '/.git/'), 'Do not place state in .git')
    lock = threading.Lock()

    def git(*arguments):
        return subprocess.check_output(['git', *arguments], cwd=repo)

    def api(endpoint, payload=None):
        # Fixed subcommands only. gh obtains its configured credential itself.
        # No headers, tokens, stdout bodies or stderr are emitted on failure.
        command = ['gh', 'api', '--method', 'POST' if payload is not None else 'GET',
                   f'repos/{args.remote}/{endpoint}']
        if payload is not None:
            command += ['--input', '-']
        body = None if payload is None else json.dumps(payload).encode()
        for attempt in range(3):
            result = subprocess.run(command, input=body, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, cwd=repo)
            if result.returncode == 0:
                return json.loads(result.stdout)
            statuses = re.findall(rb'HTTP\s+(\d{3})', result.stderr)
            status = statuses[-1].decode() if statuses else 'unavailable'
            if status in ('502', '503', '504') and attempt < 2:
                print(json.dumps({'status': 'transient-api-error', 'endpoint': endpoint,
                                  'http': status, 'attempt': attempt + 1}), flush=True)
                time.sleep(.5 * (attempt + 1))
                continue
            raise RuntimeError(f'API {endpoint} failed: exit={result.returncode} HTTP={status}')

    require(git('rev-parse', 'HEAD').decode().strip() == args.commit, 'HEAD changed before preflight')
    raw_commit = git('cat-file', 'commit', args.commit)
    header, message = raw_commit.split(b'\n\n', 1)
    headers = header.decode('utf-8').splitlines()
    require(all(line.startswith(('tree ', 'parent ', 'author ', 'committer ')) for line in headers),
            'Unsupported signed, encoded or extended commit headers; refs remain unchanged')
    require(sum(line.startswith('tree ') for line in headers) == 1, 'Expected one tree')
    tree_sha = next(line[5:] for line in headers if line.startswith('tree '))
    parents = [line[7:] for line in headers if line.startswith('parent ')]
    require(parents == [args.parent], 'Commit must have the explicitly selected single parent')
    base_tree = git('rev-parse', f'{args.parent}^{{tree}}').decode().strip()

    def person(kind):
        lines = [line[len(kind) + 1:] for line in headers if line.startswith(kind + ' ')]
        require(len(lines) == 1, f'Expected one {kind}')
        match = re.fullmatch(r'(.+) <([^<>]+)> (\d+) ([+-]\d{4})', lines[0])
        require(match is not None and match.group(4) == '+0000', f'{kind} must use UTC for exact API reconstruction')
        name, email, epoch, _ = match.groups()
        date = datetime.datetime.fromtimestamp(int(epoch), datetime.timezone.utc).isoformat().replace('+00:00', 'Z')
        return {'name': name, 'email': email, 'date': date}

    author, committer = person('author'), person('committer')
    commit_message = message.decode('utf-8')  # Includes the exact final LF; never strip it.
    parts = git('diff-tree', '-r', '--raw', '--no-abbrev', '-z', '--no-commit-id',
                '--no-renames', args.commit).split(b'\0')
    entries, blob_paths = [], {}
    index = 0
    while index < len(parts) and parts[index]:
        old_mode, mode, _, sha, status = parts[index].decode().split()
        path = parts[index + 1].decode('utf-8')
        index += 2
        require(status in ('A', 'M', 'D', 'T'), f'Unsupported status {status}')
        if status == 'D':
            require(old_mode in (':100644', ':100755', ':120000'), f'Unsupported removed mode {old_mode}')
            entries.append({'path': path, 'mode': old_mode[1:], 'type': 'blob', 'sha': None})
            continue
        require(mode in ('100644', '100755', '120000'), f'Unsupported mode {mode}')
        entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': sha})
        blob_paths.setdefault(sha, []).append(path)

    sizes = {}
    for sha in blob_paths:
        blob = git('cat-file', 'blob', sha)
        digest = hashlib.sha1(f'blob {len(blob)}\0'.encode() + blob).hexdigest()
        require(digest == sha, 'Local blob digest differs')
        sizes[sha] = len(blob)
    state = {'remote': args.remote, 'commit': args.commit, 'localTree': tree_sha,
             'parent': args.parent, 'baseTree': base_tree, 'changedPaths': len(entries),
             'uniqueBlobs': len(blob_paths), 'uploaded': {}, 'refsChanged': False}
    if state_path.exists():
        previous = json.loads(state_path.read_text())
        for key in ('remote', 'commit', 'localTree', 'parent', 'baseTree', 'changedPaths', 'uniqueBlobs'):
            require(previous.get(key) == state[key], f'State {key} differs; select this commit\'s own state path')
        require(previous.get('refsChanged') is False, 'Unexpected state marked refs changed')
        for sha, uploaded in previous.get('uploaded', {}).items():
            require(sha in blob_paths and uploaded.get('sha') == sha and
                    uploaded.get('size') == sizes[sha] and uploaded.get('paths') == blob_paths[sha],
                    'Cached uploaded-blob metadata differs')
        state['uploaded'] = previous.get('uploaded', {})
    print(json.dumps({'status': 'preflight-passed', 'commit': args.commit, 'parent': args.parent,
                      'tree': tree_sha, 'changedPaths': len(entries), 'uniqueBlobs': len(blob_paths),
                      'bytes': sum(sizes.values()), 'resumeBlobs': len(state['uploaded']),
                      'messageEndsWithLF': message.endswith(b'\n'), 'dryRun': args.dry_run,
                      'refsChanged': False}), flush=True)
    if args.dry_run:
        return
    remote_parent = api(f'git/commits/{args.parent}')
    require(remote_parent['sha'] == args.parent and remote_parent['tree']['sha'] == base_tree,
            'Remote parent tree differs; no objects uploaded')

    def save_state():
        state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = state_path.with_name(state_path.name + '.tmp')
        temporary.write_text(json.dumps(state, indent=2) + '\n')
        temporary.replace(state_path)

    def upload_blob(sha):
        blob = git('cat-file', 'blob', sha)
        result = api('git/blobs', {'content': base64.b64encode(blob).decode(), 'encoding': 'base64'})
        require(result['sha'] == sha, f'Remote blob digest differs: {sha}')
        with lock:
            state['uploaded'][sha] = {'paths': blob_paths[sha], 'size': sizes[sha], 'sha': result['sha']}
            save_state()
            count = len(state['uploaded'])
            if count == 1 or count % 20 == 0 or count == len(blob_paths):
                print(json.dumps({'status': 'blob-uploaded', 'completed': count, 'total': len(blob_paths),
                                  'sha': sha, 'path': blob_paths[sha][0]}), flush=True)
        return sha

    save_state()
    remaining = [sha for sha in blob_paths if sha not in state['uploaded']]
    if remaining and not state['uploaded']:
        first = min(remaining, key=lambda sha: sizes[sha])
        upload_blob(first)
        remaining.remove(first)
        print(json.dumps({'status': 'first-small-blob-write-confirmed', 'sha': first}), flush=True)
    if remaining:
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(upload_blob, sha) for sha in remaining]
            for future in concurrent.futures.as_completed(futures):
                future.result()
    require(len(state['uploaded']) == len(blob_paths), 'Missing uploaded blobs')
    require(git('rev-parse', 'HEAD').decode().strip() == args.commit, 'HEAD changed during upload; refs unchanged')
    tree = api('git/trees', {'base_tree': base_tree, 'tree': entries})
    state['createdTree'] = tree['sha']
    save_state()
    require(tree['sha'] == tree_sha, 'Remote tree differs; refs unchanged')
    print(json.dumps({'status': 'tree-created', 'sha': tree['sha'], 'exact': True}), flush=True)
    commit = api('git/commits', {'message': commit_message, 'tree': tree_sha,
                              'parents': parents, 'author': author, 'committer': committer})
    state['createdCommit'], state['exactCommit'] = commit['sha'], commit['sha'] == args.commit
    save_state()
    print(json.dumps({'status': 'commit-created', 'sha': commit['sha'], 'expected': args.commit,
                      'exact': state['exactCommit'], 'refsChanged': False}), flush=True)
    require(state['exactCommit'], 'Remote commit metadata differs; refs unchanged')
    require(git('rev-parse', 'HEAD').decode().strip() == args.commit, 'HEAD changed at completion; refs unchanged')


if __name__ == '__main__':
    main()
