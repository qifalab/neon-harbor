#!/usr/bin/env python3
"""Prepare a raw-video manifest or READ ONLY verification receipts.

No upload, release/tag/ref mutation, Git mutation, or source-file edits exist here.
Downloads use bounded-memory subprocess streams, not the 32 MiB file connector.
The prepare command inherits sealed SHA records; verify rehashes local originals.
"""
import argparse
import datetime as dt
import hashlib
import json
import pathlib
import re
import subprocess
import tempfile
import threading
import urllib.parse


DEFAULT_CAPTURES = [
    (1, "docs/qa/art-final/continuous-tour"),
    (2, "docs/qa/transit-crossing-repair/continuous-tour"),
    (3, "docs/qa/transit-crossing-repair/continuous-tour-budget-review"),
]
SHA = re.compile(r"[0-9a-f]{64}\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
CHUNK = 1024 * 1024
RELEASE_LIMIT = 2 * 1024 ** 3


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def sha_file(path):
    total = 0
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while block := source.read(CHUNK):
            digest.update(block)
            total += len(block)
    return {"bytes": total, "sha256": digest.hexdigest()}


def write_new(path, value):
    destination = pathlib.Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("x", encoding="utf-8") as output:
        json.dump(value, output, ensure_ascii=False, indent=2)
        output.write("\n")


def require_sha(value):
    if not isinstance(value, str) or not SHA.fullmatch(value):
        raise ValueError("Invalid full SHA256")
    return value


def inside(root, relative):
    path = (root / relative).resolve()
    path.relative_to(root)
    return path


def capture_record(root, tag, number, directory):
    folder = inside(root, directory)
    ledger_path = folder / "evidence-files.json"
    ledger_raw = ledger_path.read_bytes()
    ledger = json.loads(ledger_raw)
    video_rows = [row for row in ledger["files"] if row["file"].endswith(".webm")]
    if len(video_rows) != 1:
        raise ValueError(f"Expected exactly one original WebM: {directory}")
    video = video_rows[0]
    source_path = (folder / video["file"]).resolve()
    source_path.relative_to(folder)
    expected_bytes = video["bytes"]
    if type(expected_bytes) is not int or not 0 < expected_bytes < RELEASE_LIMIT:
        raise ValueError("Release asset must be smaller than 2 GiB")
    expected_sha = require_sha(video["sha256"])
    if source_path.stat().st_size != expected_bytes:
        raise ValueError(f"Local size differs from sealed ledger: {source_path}")
    method_sha = require_sha(ledger["executedMethodSha256"])
    build_sha = require_sha(ledger["buildManifestSha256"])
    build_file = folder / "build-info.json"
    if sha_file(build_file)["sha256"] != build_sha:
        raise ValueError("Capture manifest differs from sealed ledger")
    if ledger.get("routeCompleted") and ledger.get("completedTwentyMinuteRoute") and ledger.get("processExitCode") == 0:
        outcome = "passed"
    elif ledger.get("processExitCode") not in (None, 0) or str(ledger.get("result", "")).startswith("failed"):
        outcome = "failed"
    else:
        outcome = "incomplete"
    name = f"neon-harbor-{tag}-tour{number:02d}-{outcome}-{build_sha[:8]}-{expected_sha[:12]}.webm"
    git = subprocess.run(["git", "-C", str(root), "ls-files", "-s", "--", str(source_path.relative_to(root))], capture_output=True, text=True, check=True)
    index_line = git.stdout.strip()
    return {
        "tourNumber": number,
        "actualCaptureResult": ledger.get("result"),
        "captureOutcomeForFilename": outcome,
        "routeCompleted": ledger.get("routeCompleted"),
        "completedTwentyMinuteRoute": ledger.get("completedTwentyMinuteRoute"),
        "originalCapturePath": str(source_path.relative_to(root)),
        "localAbsolutePath": str(source_path),
        "originalBytes": expected_bytes,
        "originalSha256": expected_sha,
        "sealedLedgerPath": str(ledger_path.relative_to(root)),
        "sealedLedgerSha256": hashlib.sha256(ledger_raw).hexdigest(),
        "executedMethodSha256": method_sha,
        "captureBuildManifestSha256": build_sha,
        "uniqueAssetName": name,
        "indexLineObservedAtPreparation": index_line or None,
        "shaVerificationAtPreparation": "Inherited from sealed capture ledger; video not rehashed by prepare",
        "intendedStorage": "GitHub Release attachment; original capture paths remain archival identifiers",
        "uploaded": False,
        "published": False,
        "assetId": None,
        "publicationUrl": None,
    }


def gh_json(endpoint, timeout=60):
    # Only GET is permitted, and no credentials are included in command arguments.
    result = subprocess.run(["gh", "api", "--method", "GET", endpoint], capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"GitHub GET failed for {endpoint}: {result.stderr[-4000:]}")
    return json.loads(result.stdout)


def gh_pages(endpoint):
    rows = []
    for page in range(1, 12):
        batch = gh_json(f"{endpoint}?per_page=100&page={page}")
        if not isinstance(batch, list):
            raise ValueError("Expected paginated asset array")
        rows.extend(batch)
        if len(batch) < 100:
            return rows
    raise ValueError("Asset pagination exceeded GitHub's 1,000-asset release limit")


def tag_commit(repo, tag):
    ref = gh_json(f"repos/{repo}/git/ref/tags/{urllib.parse.quote(tag, safe='')}")
    obj = ref["object"]
    for _ in range(6):
        if obj["type"] == "commit":
            if not COMMIT.fullmatch(obj["sha"]):
                raise ValueError("Invalid tag commit SHA")
            return obj["sha"]
        if obj["type"] != "tag":
            raise ValueError("Tag does not resolve to a commit")
        obj = gh_json(f"repos/{repo}/git/tags/{obj['sha']}")["object"]
    raise ValueError("Too many annotated-tag indirections")


def stream_download(argv, target, timeout):
    timed_out = threading.Event()
    digest = hashlib.sha256()
    total = 0
    started = now()
    with tempfile.TemporaryFile() as err, open(target, "xb") as destination:
        process = subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=err)
        def kill():
            timed_out.set()
            process.kill()
        timer = threading.Timer(timeout, kill)
        timer.daemon = True
        timer.start()
        try:
            while block := process.stdout.read(CHUNK):
                destination.write(block)
                digest.update(block)
                total += len(block)
            code = process.wait()
        finally:
            timer.cancel()
            process.stdout.close()
            if process.poll() is None:
                process.kill()
                process.wait()
        err.seek(0)
        stderr = err.read(8192).decode("utf-8", "replace")
    return {
        "startedAt": started, "endedAt": now(), "file": str(target),
        "bytes": total, "sha256": digest.hexdigest(), "exitCode": code,
        "timedOut": timed_out.is_set(), "stderr": stderr,
    }


def equal_download(download, record):
    return download["exitCode"] == 0 and not download["timedOut"] and download["bytes"] == record["originalBytes"] and download["sha256"] == record["originalSha256"]


def prepare(args):
    root = pathlib.Path(args.root).resolve()
    captures = DEFAULT_CAPTURES if not args.capture else []
    for specification in args.capture:
        number, directory = specification.split("=", 1)
        captures.append((int(number), directory))
    if any(number < 1 for number, _ in captures) or len(set(number for number, _ in captures)) != len(captures):
        raise ValueError("Capture numbers must be positive and unique")
    records = [capture_record(root, args.tag, number, directory) for number, directory in captures]
    if len(set(record["uniqueAssetName"] for record in records)) != len(records):
        raise ValueError("Duplicate asset name")
    manifest = {
        "schema": "neon-harbor/release-raw-video-plan/v1",
        "preparedAt": now(), "repo": args.repo, "tag": args.tag,
        "captureRoot": str(root),
        "status": "planned-only-not-uploaded-not-published",
        "totalOriginalBytes": sum(record["originalBytes"] for record in records),
        "preserveSealedCaptureRecords": True,
        "rawVideosRehashedByPrepare": False,
        "fourthRouteResult": "Not inferred; fourth capture must be supplied after actual closure",
        "videos": records,
    }
    write_new(args.out, manifest)
    print(json.dumps({"manifest": args.out, "videos": len(records), "totalOriginalBytes": manifest["totalOriginalBytes"], "status": manifest["status"]}))


def verify(args):
    manifest = json.loads(pathlib.Path(args.manifest).read_text())
    repo, tag = manifest["repo"], manifest["tag"]
    if manifest.get("schema") != "neon-harbor/release-raw-video-plan/v1" or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,60}", tag):
        raise ValueError("Invalid manifest schema, repository, or tag")
    if not manifest["videos"] or len({row["uniqueAssetName"] for row in manifest["videos"]}) != len(manifest["videos"]):
        raise ValueError("Empty manifest or duplicate asset names")
    root = pathlib.Path(manifest["captureRoot"]).resolve()
    for row in manifest["videos"]:
        if pathlib.Path(row["localAbsolutePath"]).resolve() != inside(root, row["originalCapturePath"]):
            raise ValueError("Raw video path differs from manifest capture root")
        inside(root, row["sealedLedgerPath"])
        require_sha(row["originalSha256"])
        require_sha(row["sealedLedgerSha256"])
        if type(row["originalBytes"]) is not int or not 0 < row["originalBytes"] < RELEASE_LIMIT or pathlib.Path(row["uniqueAssetName"]).name != row["uniqueAssetName"]:
            raise ValueError("Invalid raw video size or asset basename")
    if pathlib.Path(args.out).exists():
        raise FileExistsError("Receipt output already exists; no overwrite permitted")
    folder = pathlib.Path(args.download_dir).resolve()
    folder.mkdir(parents=True, exist_ok=True)
    receipt = {
        "schema": "neon-harbor/release-raw-video-actual-receipt/v1",
        "startedAt": now(), "manifestPath": str(pathlib.Path(args.manifest).resolve()),
        "manifestSha256": sha_file(args.manifest)["sha256"],
        "repo": repo, "tag": tag, "expectedDeployedSourceCommit": args.commit,
        "requestedReleaseId": args.release_id, "status": "verification-in-progress",
        "published": False, "videos": [], "errors": [],
        "mutationPerformed": False,
    }
    try:
        release = gh_json(f"repos/{repo}/releases/{args.release_id}")
        if release["tag_name"] != tag:
            raise ValueError("Release tag differs from plan")
        public = not release["draft"] and release.get("published_at") is not None
        receipt["release"] = {key: release.get(key) for key in ("id", "tag_name", "draft", "prerelease", "target_commitish", "published_at", "html_url")}
        if public:
            if args.commit is None:
                raise ValueError("Public verification requires the exact deployed source --commit")
            resolved = tag_commit(repo, tag)
            receipt["actualTagCommit"] = resolved
            if resolved != args.commit:
                raise ValueError("Published tag differs from exact deployed source commit")
        else:
            receipt["actualTagCommit"] = None
            receipt["tagVerification"] = "Deferred while draft; target_commitish is not proof of a public tag"
        assets = gh_pages(f"repos/{repo}/releases/{args.release_id}/assets")
        for record in manifest["videos"]:
            row = {"originalCapturePath": record["originalCapturePath"], "originalBytes": record["originalBytes"], "originalSha256": record["originalSha256"], "sealedLedgerPath": record["sealedLedgerPath"], "sealedLedgerSha256": record["sealedLedgerSha256"], "captureBuildManifestSha256": record["captureBuildManifestSha256"], "executedMethodSha256": record["executedMethodSha256"], "uniqueAssetName": record["uniqueAssetName"], "status": "verification-in-progress", "published": False}
            receipt["videos"].append(row)
            try:
                local = sha_file(record["localAbsolutePath"])
                row["localRehash"] = local
                if local != {"bytes": record["originalBytes"], "sha256": record["originalSha256"]}:
                    raise ValueError("Local raw video differs from sealed capture SHA or size")
                ledger_hash = sha_file(inside(root, record["sealedLedgerPath"]))["sha256"]
                row["currentSealedLedgerSha256"] = ledger_hash
                if ledger_hash != record["sealedLedgerSha256"]:
                    raise ValueError("Sealed capture ledger changed after preparation")
                matches = [asset for asset in assets if asset["name"] == record["uniqueAssetName"]]
                if len(matches) != 1:
                    raise ValueError("Expected exactly one asset with the unique manifest name; no clobber or ambiguous match")
                asset = gh_json(f"repos/{repo}/releases/assets/{matches[0]['id']}")
                row["asset"] = {key: asset.get(key) for key in ("id", "name", "state", "size", "digest", "content_type", "created_at", "updated_at", "browser_download_url")}
                if asset["state"] != "uploaded" or asset["size"] != record["originalBytes"] or asset["name"] != record["uniqueAssetName"]:
                    raise ValueError("Server asset name/state/size mismatch")
                server_digest = asset.get("digest")
                if server_digest is not None and server_digest != "sha256:" + record["originalSha256"]:
                    raise ValueError("Server digest differs from sealed raw video SHA")
                row["serverDigestVerification"] = "matched" if server_digest is not None else "not supplied by server; actual downloaded bytes still required"
                auth_path = folder / (record["uniqueAssetName"] + ".authenticated-download")
                download = stream_download(["gh", "api", "--method", "GET", f"repos/{repo}/releases/assets/{asset['id']}", "-H", "Accept: application/octet-stream"], auth_path, args.timeout)
                row["authenticatedDownload"] = download
                if not equal_download(download, record):
                    raise ValueError("Authenticated downloaded raw bytes differ or download failed")
                if public:
                    url = asset["browser_download_url"]
                    parsed = urllib.parse.urlparse(url)
                    if parsed.scheme != "https" or parsed.hostname != "github.com" or not parsed.path.startswith(f"/{repo}/releases/download/"):
                        raise ValueError("Unexpected public browser_download_url")
                    public_path = folder / (record["uniqueAssetName"] + ".anonymous-public-download")
                    public_download = stream_download(["curl", "--disable", "--fail", "--location", "--silent", "--show-error", "--proto", "=https", "--proto-redir", "=https", "--max-time", str(args.timeout), url], public_path, args.timeout + 5)
                    row["anonymousPublicDownload"] = public_download
                    if not equal_download(public_download, record):
                        raise ValueError("Anonymous public raw-byte download differs or failed")
                    row["status"] = "published-original-bytes-verified"
                    row["published"] = True
                    row["publicationUrl"] = url
                else:
                    row["status"] = "draft-authenticated-original-bytes-verified-not-public"
                    row["publicationUrl"] = None
                row["verifiedAt"] = now()
            except Exception as error:
                row["status"] = "failed"
                row["error"] = f"{type(error).__name__}: {error}"
        if any(row["status"] == "failed" for row in receipt["videos"]):
            receipt["status"] = "failed"
        elif public:
            receipt["status"] = "published-all-original-bytes-verified"
            receipt["published"] = True
        else:
            receipt["status"] = "draft-all-authenticated-original-bytes-verified-not-public"
    except Exception as error:
        receipt["status"] = "failed"
        receipt["errors"].append(f"{type(error).__name__}: {error}")
    receipt["endedAt"] = now()
    write_new(args.out, receipt)
    print(json.dumps({"receipt": args.out, "status": receipt["status"], "published": receipt["published"], "videosObserved": len(receipt["videos"])}))
    return 1 if receipt["status"] == "failed" else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    plan = commands.add_parser("prepare")
    plan.add_argument("--root", required=True)
    plan.add_argument("--repo", default="qifalab/neon-harbor")
    plan.add_argument("--tag", default="v0.8.0")
    plan.add_argument("--capture", action="append", default=[], help="N=relative/capture/directory; supplying this overrides the three defaults")
    plan.add_argument("--out", required=True)
    check = commands.add_parser("verify")
    check.add_argument("--manifest", required=True)
    check.add_argument("--release-id", type=int, required=True)
    check.add_argument("--commit", help="Exact 40-character deployed source commit; mandatory for public verification, may be omitted for draft byte verification")
    check.add_argument("--download-dir", required=True)
    check.add_argument("--timeout", type=int, default=3600, help="Finite per-stream wall seconds")
    check.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.command == "prepare":
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,60}", args.tag):
            parser.error("Invalid repository or tag")
        prepare(args)
        return 0
    if args.release_id < 1 or (args.commit is not None and not COMMIT.fullmatch(args.commit)) or not 1 <= args.timeout <= 14400:
        parser.error("Invalid release ID, exact commit, or finite timeout")
    return verify(args)


if __name__ == "__main__":
    raise SystemExit(main())
