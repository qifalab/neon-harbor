# Resident core native method v2 — preparation only

Original `7bb` core seal is untouched. Use this standalone file for **both** baseline and authored core captures; CLI, viewport, browser launch flags, runtime route/poses, public settings, guards, 45-wall-second activity and phase/total budgets are unchanged. No browser, GPU, build or tests were run for this revision. `node --check` passed.

Two method corrections are documented in `patches/core-v2-after-7bb.patch`:

- Atlas travel and public V reset the real camera rig. Event/face operations now wait, read-only and at most the existing 180-second phase allowance, for the actual rendered camera's position/focus/yaw/pitch. There is no replacement pose or extra state write.
- The original 1080-second total deadline remains armed through owned context/video, browser and HTTP-server cleanup. All cleanup steps share a maximum 30-second budget, including a bounded failure snapshot. First and secondary errors remain in metadata. Timeout invokes the bound kill function of the exact browser launched by this method, then closes only this tool's HTTP connections. It performs no PID search or global process termination.

The owned process adapter was checked against actual installed Playwright **1.62.1** source (`coreBundle.js`): its in-process client Connection.toImpl(browser) maps to server Browser.options.browserProcess with the launched ChildProcess and bound kill(). This read-only launcher ownership probe keeps the original chromium.launch() and browser-version assertion; it does not substitute launchServer, connect, another executable or a renderer.

```sh
node /tmp/neon-resident-native-core-v2/tools/capture-resident-native.mjs --mode authored --project-root /tmp/neon-harbor-authored-integration --root /tmp/neon-harbor-authored-integration/dist --git-root /workspace/scratch/neon-harbor --output /tmp/neon-resident-authored-core-v2-01 --port 5194
```

Full asset fingerprints, actual git metadata, served manifest, method/server hashes, browser version, raw video, unedited PNG and actual simulation times are still recorded. Preparation does not establish native quality or release acceptance.
