#!/usr/bin/env python3
"""Temporary CPU-only forwarding of two fixed original FAIL archives.

No arbitrary URL/artifact inputs, GPU, game execution, Git/ref/dispatch writes,
credential printing, auth-bearing CDN requests, TLS/proxy bypass or retries.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import ssl
import stat
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ORIGINALS = {
    "bus": {"artifactID": 11338895448, "bytes": 588064158,
            "sha256": "ba597965b048d44309425b1c6c9f4bf25377162afb423b3dc5d845529557426a"},
    "tram": {"artifactID": 11338286221, "bytes": 584240819,
             "sha256": "cf1315fa202e5fee66d2e231b9de829a549b28d9aa566d87af81e257d9f527d3"},
}
API_ROOT = "https://api.github.com/repos/qifalab/neon-harbor/actions/artifacts/"
PART_BYTES = 400 * 1024 * 1024
CHUNK = 1024 * 1024
MAX_JSON_BYTES = 256 * 1024 * 1024
MAX_SMALL_BYTES = 64 * 1024 * 1024
MAX_RAW_JSON_BYTES = 16 * 1024 * 1024
MAX_PNG_BYTES = 8 * 1024 * 1024
MAX_TEXT_BYTES = 2 * 1024 * 1024


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for data in iter(lambda: f.read(CHUNK), b""):
            h.update(data)
    return h.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def verified_opener():
    # Uses the platform CA trust and configured proxy; neither is bypassed.
    return urllib.request.build_opener(
        NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))


def check_cdn_url(url):
    u = urllib.parse.urlsplit(url)
    host = (u.hostname or "").lower()
    if (u.scheme != "https" or u.username or u.password or u.fragment
            or u.port not in (None, 443)
            or not (host.endswith(".blob.core.windows.net")
                    or host.endswith(".actions.githubusercontent.com")
                    or host.endswith(".githubusercontent.com"))):
        raise ValueError("Rejected artifact redirect host/scheme; signed URL withheld")
    return host


def open_fixed_archive(kind, opener, token):
    spec = ORIGINALS[kind]
    endpoint = API_ROOT + str(spec["artifactID"]) + "/zip"
    request = urllib.request.Request(endpoint, headers={
        "Authorization": "Bearer " + token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "neon-immutable-original-evidence-forward",
    })
    try:
        response = opener.open(request, timeout=30)
    except urllib.error.HTTPError as e:
        if e.code != 302:
            raise RuntimeError("Fixed GitHub archive GET failed HTTP " + str(e.code)) from None
        location = e.headers.get("Location")
        e.close()
        if not location:
            raise RuntimeError("GitHub archive redirect had no location")
        for _ in range(3):
            check_cdn_url(location)
            # Fresh request: no Authorization or API headers cross to the CDN.
            try:
                return opener.open(urllib.request.Request(location, headers={
                    "User-Agent": "neon-immutable-original-evidence-forward"}), timeout=30)
            except urllib.error.HTTPError as cdn_error:
                if cdn_error.code not in (301, 302, 303, 307, 308):
                    raise RuntimeError("Verified artifact CDN HTTP " + str(cdn_error.code)) from None
                next_url = cdn_error.headers.get("Location")
                cdn_error.close()
                if not next_url:
                    raise RuntimeError("Artifact CDN redirect had no location")
                location = urllib.parse.urljoin(location, next_url)
        raise RuntimeError("Finite artifact CDN redirect limit")
    if response.status != 200:
        response.close()
        raise RuntimeError("Unexpected fixed GitHub archive status")
    return response


def stream_exact(response, destination, spec, max_seconds=600):
    h, total, began = hashlib.sha256(), 0, time.monotonic()
    with response, destination.open("xb") as f:
        if response.status != 200:
            raise RuntimeError("Artifact stream did not return HTTP 200")
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) != spec["bytes"]:
            raise RuntimeError("Original archive declared size mismatch")
        while True:
            if time.monotonic() - began >= max_seconds:
                raise RuntimeError("Original archive finite download deadline")
            data = response.read(min(CHUNK, spec["bytes"] - total + 1))
            if not data:
                break
            total += len(data)
            if total > spec["bytes"]:
                raise RuntimeError("Original archive exceeded exact authorized size")
            h.update(data)
            f.write(data)
    if total != spec["bytes"] or h.hexdigest() != spec["sha256"]:
        raise RuntimeError("Original archive exact whole size/SHA mismatch")
    return {"bytes": total, "sha256": h.hexdigest(), "elapsedSeconds": time.monotonic() - began}


def validated_members(z):
    members = z.infolist()
    if len(members) > 4096 or sum(i.file_size for i in members) > 4 * 1024**3:
        raise ValueError("ZIP inventory/extraction budget")
    seen = set()
    for i in members:
        p = PurePosixPath(i.filename)
        mode = i.external_attr >> 16
        if (not i.filename or not p.parts or "\\" in i.filename or "\x00" in i.filename
                or p.is_absolute() or ".." in p.parts or ":" in p.parts[0]
                or i.filename.rstrip("/") != str(p)
                or i.filename in seen or stat.S_ISLNK(mode)
                or stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)
                or i.flag_bits & 1 or i.file_size > 512 * 1024 * 1024):
            raise ValueError("Rejected unsafe/duplicate/encrypted ZIP member")
        seen.add(i.filename)
    return members


def compact_failure(meta, motion=None):
    steps = (motion or meta).get("motion", [])
    failed = next((s for s in reversed(steps) if isinstance(s, dict) and s.get("firstError")), None)
    if failed is None:
        failed = steps[-1] if steps and isinstance(steps[-1], dict) else {}
    result = {k: meta.get(k) for k in (
        "status", "kind", "firstError", "secondaryErrors", "runtimeErrors", "startedAt",
        "elapsedMs", "budget", "toolSha256", "manifestSha256", "cleanup")}
    result["failedLeg"] = {k: failed.get(k) for k in (
        "stage", "target", "precision", "localBudget", "maxIterations", "initialLocal",
        "lastObservedLocal", "initialPosition", "lastObservedPosition", "firstError",
        "precisionModifier", "failureDiagnostic") if k in failed}
    samples = failed.get("samples", [])
    if samples:
        last = samples[-1]
        result["lastRecordedSample"] = {k: last.get(k) for k in (
            "n", "before", "after", "key", "slow", "desired", "inputs", "releaseConfirmed",
            "guardBaseline", "heldSeconds", "geometricMetres", "firstError", "publicHeldControl") if k in last}
        actual = last.get("actualHeldObservation")
        if actual:
            result["lastHeldObservation"] = {k: actual.get(k) for k in (
                "reason", "failure", "initialSimulationTime", "lastSimulationTime", "lastObservedLocal")}
            result["heldObservationCount"] = len(actual.get("observations", []))
        first = samples[0]
        if isinstance(first, dict) and "simulationTime" in first:
            result["preActionSimulationTime"] = first.get("simulationTime")
            result["preActionTiming"] = first.get("timing")
    result["completedPhotoCount"] = len(meta.get("photos", []))
    result["finalPoseCaution"] = "Only recorded values shown. Saved lastObservedLocal is not inferred to be a post-timeout final pose."
    return result


def extract_small(archive, small, kind):
    ledger, copied, parsed, total = [], [], {}, 0
    small.mkdir()
    with zipfile.ZipFile(archive) as z:
        members = validated_members(z)
        for i in members:
            if i.is_dir():
                continue
            selected_json = i.filename in {"pair-summary.json", "run-envelope.json"} or any(
                i.filename in {f"native/{v}/run.json", f"native/{v}/{kind}/case.json", f"native/{v}/{kind}/motion.json"}
                for v in ("baseline", "authored"))
            selected_png = any(i.filename.startswith(f"native/{v}/{kind}/") for v in ("baseline", "authored")) and i.filename.endswith(".png")
            selected_text = any(i.filename.startswith(f"native/{v}/") for v in ("baseline", "authored")) and i.filename.endswith((".log", ".txt"))
            if not selected_json and not selected_png and not selected_text:
                continue
            if selected_json and i.file_size > MAX_JSON_BYTES:
                ledger.append({"path": i.filename, "bytes": i.file_size, "status": "RAW_JSON_TOO_LARGE_NOT_PARSED_OR_COPIED"})
                continue
            if selected_png and i.file_size > MAX_PNG_BYTES:
                ledger.append({"path": i.filename, "bytes": i.file_size, "status": "PNG_TOO_LARGE_NOT_COPIED"})
                continue
            if selected_text and i.file_size > MAX_TEXT_BYTES:
                ledger.append({"path": i.filename, "bytes": i.file_size, "status": "TEXT_TOO_LARGE_NOT_COPIED"})
                continue
            raw = z.read(i)
            entry = {"path": i.filename, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}
            if selected_json:
                meta = json.loads(raw)
                # Retain compact facts, not simultaneous huge case/motion trees.
                if i.filename.endswith("/case.json"):
                    parsed[i.filename] = compact_failure(meta)
                elif i.filename.endswith("/motion.json"):
                    parsed[i.filename] = compact_failure({}, meta)
                elif i.filename.endswith("/run.json"):
                    parsed[i.filename] = {k: meta.get(k) for k in (
                        "actualSourceGit", "firstError", "secondaryErrors", "cleanup", "toolSha256")}
                    parsed[i.filename]["buildInfo"] = {"sha256": meta.get("buildInfo", {}).get("sha256")}
                del meta
            copy = (selected_png or selected_text or len(raw) <= MAX_RAW_JSON_BYTES) and total + len(raw) <= MAX_SMALL_BYTES
            entry["rawCopied"] = copy
            if copy:
                dest = small / "original-small" / i.filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(raw)
                total += len(raw)
                copied.append(i.filename)
            ledger.append(entry)
        summary = {"status": "ORIGINAL_METADATA_READ_ONLY_NO_NATIVE_RERUN", "kind": kind,
                   "originalArtifact": ORIGINALS[kind], "variants": {},
                   "rawSelectedMemberLedger": ledger, "rawCopiedBytes": total,
                   "wholeArchiveRemainsAuthoritative": True, "noVideoExtractedOrDuplicated": True,
                   "nativePassClaimed": False, "GPUExecuted": False}
        for v in ("baseline", "authored"):
            run = parsed.get(f"native/{v}/run.json", {})
            case = parsed.get(f"native/{v}/{kind}/case.json", {})
            motion = parsed.get(f"native/{v}/{kind}/motion.json", {})
            for field in ("failedLeg", "lastRecordedSample", "lastHeldObservation", "heldObservationCount",
                          "preActionSimulationTime", "preActionTiming"):
                if field in motion:
                    case[field] = motion[field]
            summary["variants"][v] = {"sourceGit": run.get("actualSourceGit"),
                "rawBuildSHA256": run.get("buildInfo", {}).get("sha256"),
                "toolSHA256": run.get("toolSha256"), "runFirstError": run.get("firstError"),
                "runSecondaryErrors": run.get("secondaryErrors"), "runCleanup": run.get("cleanup"),
                "case": case,
                "rawMetadataPresent": bool(run and case and motion)}
    data = json.dumps(summary, indent=2, ensure_ascii=False) + "\n"
    if len(data.encode()) > 1024 * 1024:
        raise ValueError("Finite derived summary budget")
    (small / "FIRST_FAILURE_READONLY_SUMMARY.json").write_text(data)
    return summary


def split_original(archive, out, spec):
    parts, reconstructed, total = [], hashlib.sha256(), 0
    with archive.open("rb") as source:
        for index in range(1, 3):
            dest = out / f"original.zip.part{index}"
            h, length = hashlib.sha256(), 0
            with dest.open("xb") as f:
                while length < PART_BYTES:
                    data = source.read(min(CHUNK, PART_BYTES - length))
                    if not data:
                        break
                    f.write(data)
                    h.update(data)
                    reconstructed.update(data)
                    length += len(data)
                    total += len(data)
            if length == 0:
                raise ValueError("Expected exactly two nonempty original parts")
            parts.append({"order": index, "filename": dest.name, "bytes": length, "sha256": h.hexdigest()})
        if source.read(1) or total != spec["bytes"] or reconstructed.hexdigest() != spec["sha256"]:
            raise ValueError("Original split/reconstruction exact size/SHA mismatch")
    return parts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kind", choices=tuple(ORIGINALS), required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("Actions read token missing; value never printed")
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    out = Path(args.output_dir).resolve()
    if root not in out.parents or out.exists():
        raise ValueError("Forward output must be fresh owned RUNNER_TEMP child")
    out.mkdir(parents=True)
    spec = ORIGINALS[args.kind]
    receipt = {"status": "STARTED", "kind": args.kind, "original": spec,
               "TLSVerified": True, "proxyConfigurationUnchanged": True,
               "CDNRequestsAuthorizationFree": True, "noRetries": True,
               "sourceGit": os.environ.get("GITHUB_SHA"), "originalPriorFailuresRetained": True}
    try:
        response = open_fixed_archive(args.kind, verified_opener(), token)
        receipt["wholeOriginalVerification"] = stream_exact(response, out / "original.zip", spec)
        receipt["status"] = "WHOLE_ORIGINAL_HASH_VERIFIED"
        summary = extract_small(out / "original.zip", out / "small", args.kind)
        receipt["parts"] = split_original(out / "original.zip", out, spec)
        receipt["reconstruction"] = "Concatenate ordered raw part1 then part2; verify exact whole bytes/SHA before ZIP use."
        receipt["status"] = "ORIGINAL_HASH_VERIFIED_TWO_ORDERED_PARTS_AND_READONLY_SUMMARY_READY"
        write_json(out / "small" / "FORWARD_RECEIPT.json", receipt)
        write_json(out / "FORWARD_RECEIPT.json", receipt)
        print(json.dumps({"status": receipt["status"], "kind": args.kind,
                          "summaryPath": str(out / "small" / "FIRST_FAILURE_READONLY_SUMMARY.json"),
                          "parts": receipt["parts"]}))
    except Exception as error:
        # Never include network exception strings: those may contain signed URLs.
        receipt["status"] = "FORWARD_FAILED_ORIGINAL_NATIVE_STATUS_UNCHANGED"
        receipt["failureType"] = type(error).__name__
        write_json(out / "FORWARD_RECEIPT.json", receipt)
        raise RuntimeError("Forward failed; safe receipt records type, original FAIL unchanged") from None


if __name__ == "__main__":
    main()
