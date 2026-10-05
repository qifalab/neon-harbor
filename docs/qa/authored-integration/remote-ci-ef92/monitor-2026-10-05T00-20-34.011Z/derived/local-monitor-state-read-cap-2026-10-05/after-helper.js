// Read-only GitHub GET monitor. Invoked only in tool orchestration; no native
// runner/browser/build/test/index/ref/cancel/rerun/artifact download operations.
async function pollRemoteEf92(tools, root, delayMilliseconds = 45000) {
  await new Promise(resolve => setTimeout(resolve, delayMilliseconds));
  const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
  const stateRead = await tools.exec_command({ cmd: 'cat ' + quote(root + '/monitor-state.json'), max_output_tokens: 20000 });
  const state = JSON.parse(stateRead.output), stamp = new Date().toISOString().replaceAll(':', '-');
  state.sequence++;
  const base = 'https://api.github.com/repos/qifalab/neon-harbor/actions/runs/' + state.runId;
  const nonce = '&monitor_observed_at=' + encodeURIComponent(new Date().toISOString());
  const endpoints = [base + '?per_page=100' + nonce, base + '/attempts/1/jobs?per_page=100' + nonce, base + '/artifacts?per_page=100' + nonce];
  function body(response) {
    if (response.isError || typeof response.structuredContent?.content !== 'string') throw new Error('No original decoded UTF-8 GitHub body');
    return response.structuredContent.content;
  }
  function safe(raw) {
    for (const match of raw.matchAll(/[?&](?:sig|token|access_token|X-Amz-Signature|X-Amz-Credential)=([^&\s"<>]+)/gi))
      if (!match[1].includes('***')) throw new Error('Credential/signed URL detected; evidence body not stored');
  }
  function base64(raw) {
    const binary = encodeURIComponent(raw).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'; let out = '';
    for (let i = 0; i < binary.length; i += 3) {
      const a = binary.charCodeAt(i), b = binary.charCodeAt(i + 1), c = binary.charCodeAt(i + 2), value = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += chars[(value >>> 18) & 63] + chars[(value >>> 12) & 63] + (i + 1 < binary.length ? chars[(value >>> 6) & 63] : '=') + (i + 2 < binary.length ? chars[value & 63] : '=');
    }
    return out;
  }
  async function exact(path, raw) {
    safe(raw); const encoded = base64(raw), temporary = path + '.encoded-writing';
    await tools.apply_patch('*** Begin Patch\n*** Add File: ' + temporary + '\n' + (encoded.match(/.{1,10000}/g) || ['']).map(line => '+' + line).join('\n') + '\n*** End Patch');
    const code = "from pathlib import Path;import base64,hashlib,json,sys;p=Path(sys.argv[1]);q=Path(sys.argv[2]);b=base64.b64decode(p.read_bytes());q.write_bytes(b);p.unlink();print(json.dumps({'path':str(q),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}))";
    const result = await tools.exec_command({ cmd: 'python -c ' + quote(code) + ' ' + quote(temporary) + ' ' + quote(path), max_output_tokens: 350 });
    if (result.exit_code !== 0) throw new Error('Evidence write failed: ' + result.output);
    return JSON.parse(result.output);
  }
  const fetched = await Promise.allSettled(endpoints.map(url => tools.mcp__codex_apps__github_fetch({ url })));
  const originals = [], parsed = [], prefix = String(state.sequence).padStart(4, '0') + '-' + stamp;
  for (let i = 0; i < fetched.length; i++) {
    if (fetched[i].status !== 'fulfilled') throw fetched[i].reason;
    const raw = body(fetched[i].value); parsed[i] = JSON.parse(raw);
    originals.push(await exact(root + '/snapshots/' + prefix + '-' + ['run-original.json', 'jobs-attempt1-original.json', 'artifacts-original.json'][i], raw));
  }
  const [run, list, artifacts] = parsed, jobs = list.jobs, news = [];
  if (run.head_sha !== state.head || run.run_attempt !== 1 || jobs.some(j => j.head_sha !== state.head || j.run_attempt !== 1)) throw new Error('Different run identity/attempt; evidence not conflated');
  if (list.total_count !== jobs.length) throw new Error('Jobs pagination incomplete');
  const bucket = job => job.name.startsWith('Build and gameplay tests (') || job.name === 'Multiplayer rooms in two browsers' ? 'required' : job.name.startsWith('Optional native and route evidence /') ? 'native' : 'pr-only';
  const tally = Object.fromEntries(['required', 'native', 'pr-only'].map(key => {
    const selected = jobs.filter(job => bucket(job) === key);
    return [key, { total: selected.length, success: selected.filter(j => j.conclusion === 'success').length, failure: selected.filter(j => j.conclusion === 'failure').length, skipped: selected.filter(j => j.conclusion === 'skipped').length, inProgress: selected.filter(j => j.status === 'in_progress').length, queued: selected.filter(j => j.status === 'queued').length, cancelled: selected.filter(j => j.conclusion === 'cancelled').length }];
  }));
  for (const job of jobs.filter(j => j.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required'].includes(j.conclusion))) {
    if (state.failures.some(failure => failure.jobId === job.id)) continue;
    const failure = { jobId: job.id, name: job.name, conclusion: job.conclusion, firstObservedAt: new Date().toISOString(), failedSteps: (job.steps || []).filter(s => s.conclusion === 'failure').map(s => ({ name: s.name, number: s.number, conclusion: s.conclusion })), htmlUrl: job.html_url };
    state.failures.push(failure); news.push({ type: 'FIRST_JOB_FAILURE_OBSERVED', ...failure });
  }
  for (const artifact of artifacts.artifacts) {
    if (state.seenArtifacts.includes(artifact.id)) continue;
    state.seenArtifacts.push(artifact.id); news.push({ type: 'ARTIFACT_READY_FOR_ROOT_DOWNLOAD', id: artifact.id, name: artifact.name, bytes: artifact.size_in_bytes, digest: artifact.digest, expired: artifact.expired });
  }
  state.lastPollAt = new Date().toISOString(); state.lastRun = { status: run.status, conclusion: run.conclusion, updatedAt: run.updated_at }; state.lastTally = tally;
  state.lastJobs = jobs.map(j => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion }));
  state.artifacts = artifacts.artifacts.map(a => ({ id: a.id, name: a.name, bytes: a.size_in_bytes, digest: a.digest, expired: a.expired }));
  await exact(root + '/snapshots/' + prefix + '-read-receipt.json', JSON.stringify({ observedAt: state.lastPollAt, source: 'GitHub connector original decoded UTF-8 GET bodies; unique ignored read-only query avoids client URL cache alias', endpoints, files: originals, tally, news }, null, 2) + '\n');
  await exact(root + '/monitor-state.json', JSON.stringify(state, null, 2) + '\n');
  if (news.some(item => item.type === 'FIRST_JOB_FAILURE_OBSERVED')) { text({ poll: state.sequence, immediateFailureNotice: news }); await yield_control(); }
  const completedLogs = [], logErrors = [], ready = jobs.filter(j => j.status === 'completed' && j.conclusion !== 'skipped' && !state.seenLogs.includes(j.id));
  for (let start = 0; start < ready.length; start += 4) {
    const pack = ready.slice(start, start + 4), responses = await Promise.allSettled(pack.map(j => tools.mcp__codex_apps__github_fetch_workflow_job_logs({ job_id: j.id, repo_full_name: 'qifalab/neon-harbor' })));
    for (let i = 0; i < pack.length; i++) {
      const job = pack[i];
      try {
        if (responses[i].status !== 'fulfilled') throw responses[i].reason;
        const raw = body(responses[i].value), receipt = await exact(root + '/logs/job-' + job.id + '-original.log', raw), plain = raw.replace(/\u001b\[[0-9;]*m/g, '');
        const rule = term => [...plain.matchAll(new RegExp('(?:[ℹ#]\\s*)' + term + '\\s+(\\d+)', 'g'))].map(match => Number(match[1])).at(-1) ?? null;
        const errors = plain.split(/\r?\n/).filter(line => /##\[error\]|AssertionError|Error:|firstError|firstFailure|primaryError|FAILED|1\) \[chromium\]/.test(line)).map(line => line.slice(0, 1200));
        const review = { jobId: job.id, name: job.name, bucket: bucket(job), conclusion: job.conclusion, downloadedAt: new Date().toISOString(), raw: receipt, rules: { tests: rule('tests'), passed: rule('pass'), failed: rule('fail'), uniqueTestCountNotMultiplied: true }, errorLines: errors.slice(0, 40), actualJobSteps: job.steps, captureIsManualArtApproval: false };
        await exact(root + '/logs/job-' + job.id + '-derived-review.json', JSON.stringify(review, null, 2) + '\n'); state.seenLogs.push(job.id);
        const firstError = errors.find(line => !/Process completed with exit code/.test(line)) ?? errors[0] ?? null;
        const failure = state.failures.find(item => item.jobId === job.id); if (failure) { failure.originalLog = receipt.path; failure.firstErrorExcerpt = firstError; }
        completedLogs.push({ jobId: job.id, name: job.name, conclusion: job.conclusion, rules: review.rules, raw: receipt, firstError: job.conclusion === 'success' ? null : firstError });
      } catch (error) { logErrors.push({ jobId: job.id, name: job.name, message: String(error?.message || error).slice(0, 300), retryReadOnlyLogFetchOnNextPoll: true }); }
    }
  }
  const allComplete = jobs.length === 37 && jobs.every(job => job.status === 'completed'), allLogs = jobs.filter(j => j.conclusion !== 'skipped').every(j => state.seenLogs.includes(j.id));
  if (run.status === 'completed' && allComplete && allLogs) { state.monitorFinishedAt = new Date().toISOString(); state.finalStatus = run.conclusion; }
  await exact(root + '/monitor-state.json', JSON.stringify(state, null, 2) + '\n');
  return { poll: state.sequence, at: state.lastPollAt, run: state.lastRun, tally, news, completedLogs, logErrors, terminal: !!state.monitorFinishedAt, evidenceRoot: root, manualArtReviewPending: true };
}
