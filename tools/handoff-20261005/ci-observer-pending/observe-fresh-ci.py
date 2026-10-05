#!/usr/bin/env python3
"""Read-only, exact-run GitHub Actions observer; no artifact payload downloads."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

VERIFY_IDS = (
    "game", "stability", "metropolis-1", "metropolis-2", "metropolis-3",
    "living-city", "harbor-realism", "city-materials", "harbor-sample-1",
    "harbor-sample-2", "occupied-city",
)
REQUIRED_NAMES = tuple(f"Build and gameplay tests ({x})" for x in VERIFY_IDS) + (
    "Multiplayer rooms in two browsers",
)
NATIVE_NAMES = tuple(
    f"Optional native and route evidence / Native High ({x})"
    for x in ("bus", "tram", "ferry")
)
STOP = None


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()
    temporary = path.with_name(path.name + ".writing")
    temporary.write_bytes(data)
    temporary.replace(path)


def interrupted(signum, _frame):
    global STOP
    STOP = signal.Signals(signum).name


class ObservationError(RuntimeError):
    pass


class BindingError(ObservationError):
    pass


class Observer:
    def __init__(self, args):
        self.args = args
        self.output = args.output.resolve()
        # No resume or overwrite: originals and closures belong to one invocation.
        self.output.mkdir(parents=True, exist_ok=False)
        (self.output / "originals").mkdir()
        self.sequence = 0
        self.attempt = args.attempt
        self.started = time.monotonic()
        self.run = None
        self.jobs = []
        self.artifacts = []
        self.api_records = []
        self.errors = []
        self.log_records = []
        self.consecutive_errors = 0
        self.polling_closed = False
        self.state = {
            "schema": 1, "status": "OBSERVING", "started_at": utc(),
            "owner_pid": os.getpid(), "repo": args.repo, "run_id": args.run_id,
            "expected_head_sha": args.head, "bound_attempt": self.attempt,
            "poll_interval_seconds": args.interval,
            "maximum_observation_seconds": args.max_minutes * 60,
            "api_timeout_seconds": args.api_timeout,
            "required_job_names": list(REQUIRED_NAMES),
            "selected_native_job_names": list(NATIVE_NAMES),
            "artifact_payload_downloads": False,
            "log_fetch_policy": "completed-run closure only" if args.fetch_logs_at_closure else "disabled",
            "unique_rules": None,
            "scope": "Exact fresh run only; no inherited result, art acceptance or deployment assertion.",
        }
        self.write_state()

    def write_state(self):
        self.state.update({
            "sequence": self.sequence, "last_updated_at": utc(),
            "bound_attempt": self.attempt,
            "last_run": None if self.run is None else {
                key: self.run.get(key) for key in (
                    "id", "head_sha", "run_attempt", "status", "conclusion", "updated_at", "html_url"
                )
            },
            "jobs": [self.job_row(j) for j in self.jobs],
            "artifacts": [{key: a.get(key) for key in (
                "id", "name", "size_in_bytes", "expired", "created_at", "updated_at", "digest"
            )} for a in self.artifacts],
            "required": self.group(REQUIRED_NAMES), "selected_native": self.group(NATIVE_NAMES),
            "errors": self.errors, "api_records": self.api_records,
            "log_records": self.log_records, "polling_closed": self.polling_closed,
        })
        save_json(self.output / "state.json", self.state)

    @staticmethod
    def job_row(job):
        return {key: job.get(key) for key in (
            "id", "name", "run_id", "head_sha", "status", "conclusion", "started_at", "completed_at", "html_url"
        )} | {"failed_or_non_success_completed_steps": [
            {key: step.get(key) for key in ("name", "number", "status", "conclusion")}
            for step in job.get("steps", [])
            if step.get("status") == "completed" and step.get("conclusion") != "success"
        ]}

    def group(self, names):
        rows = []
        for name in names:
            matches = [j for j in self.jobs if j.get("name") == name]
            rows.append({
                "name": name, "matches": len(matches),
                "jobs": [self.job_row(j) for j in matches],
            })
        complete_unique = all(len(x["jobs"]) == 1 and x["jobs"][0]["status"] == "completed" for x in rows)
        all_success = complete_unique and all(x["jobs"][0]["conclusion"] == "success" for x in rows)
        return {"expected": len(names), "all_unique_completed": complete_unique,
                "all_success": all_success, "rows": rows}

    def api(self, endpoint, label, binary=False):
        if STOP:
            raise ObservationError("Signal stop requested before API call")
        if time.monotonic() - self.started >= self.args.max_minutes * 60:
            raise ObservationError("Observation deadline reached before API call")
        prefix = f"{self.sequence:04d}-{len(self.api_records) + 1:05d}-{label}"
        stdout_path = self.output / "originals" / (prefix + (".log" if binary else ".json"))
        stderr_path = self.output / "originals" / (prefix + ".stderr.txt")
        record = {"endpoint": endpoint, "started_at": utc(), "stdout": stdout_path.name,
                  "stderr": stderr_path.name, "timeout_seconds": self.args.api_timeout}
        # No shell; neither credential environment nor stderr contents are printed.
        try:
            with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
                child = subprocess.run(
                    ["gh", "api", "--method", "GET", endpoint],
                    stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                    timeout=self.args.api_timeout, check=False,
                )
            record["exit_code"] = child.returncode
        except subprocess.TimeoutExpired:
            record.update({"exit_code": None, "error": "API_TIMEOUT"})
        except OSError as error:
            record.update({"exit_code": None, "error": type(error).__name__})
        record.update({"finished_at": utc(), "stdout_sha256": sha(stdout_path),
                       "stderr_sha256": sha(stderr_path), "stdout_bytes": stdout_path.stat().st_size})
        self.api_records.append(record)
        self.write_state()
        if record.get("exit_code") != 0:
            raise ObservationError(f"API request failed; retained original record {prefix}")
        if binary:
            return stdout_path
        try:
            return json.loads(stdout_path.read_bytes())
        except (ValueError, UnicodeError) as error:
            raise ObservationError(f"Invalid JSON response retained as {prefix}") from error

    def paged(self, endpoint, key, label):
        collected = []
        total = None
        # Explicit pages preserve individual unmodified JSON API bodies.
        for page in range(1, 11):
            response = self.api(f"{endpoint}?per_page=100&page={page}", f"{label}-page-{page}")
            if not isinstance(response, dict):
                raise ObservationError(f"Invalid {label} response shape")
            entries = response.get(key)
            if not isinstance(entries, list) or not isinstance(response.get("total_count"), int):
                raise ObservationError(f"Invalid {label} collection shape")
            if any(not isinstance(item, dict) or not isinstance(item.get("id"), int) for item in entries):
                raise ObservationError(f"Invalid {label} member identity")
            if total is None:
                total = response["total_count"]
            collected.extend(entries)
            if len(entries) < 100 or len(collected) >= total:
                ids = [item.get("id") for item in collected]
                if len(ids) != len(set(ids)):
                    raise ObservationError(f"Duplicate {label} IDs across API pages")
                if len(collected) != response["total_count"]:
                    raise ObservationError(f"Changing/incomplete {label} page totals; retry entire observation")
                return collected
        raise ObservationError(f"{label} exceeds bounded 1000-item collection")

    def validate_run(self, run):
        if not isinstance(run, dict) or run.get("id") != self.args.run_id:
            raise BindingError("Run identity mismatch")
        if run.get("head_sha") != self.args.head:
            raise BindingError("Exact expected run HEAD mismatch")
        attempt = run.get("run_attempt")
        if not isinstance(attempt, int) or attempt < 1:
            raise BindingError("Invalid run attempt")
        if self.attempt is None:
            self.attempt = attempt
        elif attempt != self.attempt:
            raise BindingError("Run attempt changed; new evidence requires a new invocation/output")
        if run.get("repository", {}).get("full_name", "").lower() != self.args.repo.lower():
            raise BindingError("Repository identity mismatch")

    def fetch_logs(self):
        # This is a one-time closure adjunct, never another run/jobs polling loop.
        verify = [j for j in self.jobs if j.get("name") in REQUIRED_NAMES[:-1]]
        names = set()
        all_parsed = len(verify) == len(VERIFY_IDS)
        failures = 0
        for job in verify:
            if STOP:
                all_parsed = False
                break
            item = {"job_id": job["id"], "name": job["name"], "conclusion": job.get("conclusion")}
            try:
                path = self.api(f"repos/{self.args.repo}/actions/jobs/{job['id']}/logs", f"job-{job['id']}-original", binary=True)
                # A distinct-rule count is a set of actual top-level TAP test names.
                # Ignore browser summaries; repeated npm tests in eleven jobs are not eleven sets of unique rules.
                parsed = self.parse_rule_log(path)
                item.update({"original_log": str(path), "sha256": sha(path), **parsed})
                if not parsed["complete_tap_summary"]:
                    all_parsed = False
                names.update(parsed["top_level_rule_names"])
            except ObservationError as error:
                failures += 1
                all_parsed = False
                item["error"] = str(error)
            self.log_records.append(item)
            self.write_state()
        self.state["unique_rules"] = {
            "scope": "Union of actual top-level TAP rule names from closed verify job logs; never multiplied by job count.",
            "complete_for_all_eleven_verify_jobs": all_parsed,
            "observed_distinct_names": len(names),
            "names": sorted(names), "log_fetch_failures": failures,
            "pass_count": None,
            "pass_count_note": "No inferred unique PASS count; consult retained per-job TAP pass/fail summaries and required conclusions.",
        }

    @staticmethod
    def parse_rule_log(path):
        # Strip only GitHub's ISO timestamp prefix. Preserve indentation to distinguish nested TAP subtests.
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        cleaned = [re.sub(r"^\d{4}-\d{2}-\d{2}T\S+Z\s", "", x) for x in lines]
        clean_lines = [re.sub(r"\x1b\[[0-9;]*m", "", x) for x in cleaned]
        names = [line[len("# Subtest: "):] for line in clean_lines if line.startswith("# Subtest: ")]
        summary = {}
        for line in clean_lines:
            match = re.fullmatch(r"# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)", line)
            if match:
                summary[match.group(1)] = int(match.group(2))
        duplicate_names = sorted({name for name in names if names.count(name) > 1})
        return {"top_level_rule_names": sorted(set(names)), "top_level_name_entries": len(names),
                "duplicate_top_level_names": duplicate_names, "tap_summary": summary,
                "complete_tap_summary": bool(names) and all(key in summary for key in ("tests", "pass", "fail"))}

    def close(self, status, reason, exit_code):
        self.polling_closed = True
        self.state.update({"status": status, "closed_at": utc(), "closure_reason": reason,
                           "elapsed_seconds": round(time.monotonic() - self.started, 3),
                           "exit_code": exit_code, "polling_will_resume": False})
        self.write_state()
        ledger = [{"path": str(p.relative_to(self.output)), "bytes": p.stat().st_size, "sha256": sha(p)}
                  for p in sorted(self.output.rglob("*")) if p.is_file() and p.name != "closure.json"]
        save_json(self.output / "closure.json", {
            "schema": 1, "closed_at": utc(), "status": status, "reason": reason,
            "repo": self.args.repo, "run_id": self.args.run_id, "head_sha": self.args.head,
            "bound_attempt": self.attempt, "exit_code": exit_code,
            "original_and_derived_file_ledger": ledger,
            "no_main_ref_tag_release_pages_or_artifact_payload_mutations": True,
        })
        print(json.dumps({"observer": status, "run_id": self.args.run_id,
                          "head": self.args.head, "output": str(self.output), "exit_code": exit_code}), flush=True)
        return exit_code

    def run_loop(self):
        while True:
            if STOP:
                return self.close("STOPPED_BY_SIGNAL", STOP, 130)
            if time.monotonic() - self.started >= self.args.max_minutes * 60:
                return self.close("OBSERVATION_DEADLINE_REACHED", "No conclusion inferred", 2)
            self.sequence += 1
            tick = time.monotonic()
            try:
                run = self.api(f"repos/{self.args.repo}/actions/runs/{self.args.run_id}", "run")
                self.validate_run(run)
                self.run = run
                self.jobs = self.paged(
                    f"repos/{self.args.repo}/actions/runs/{self.args.run_id}/attempts/{self.attempt}/jobs",
                    "jobs", "jobs",
                )
                for job in self.jobs:
                    if job.get("run_id") != self.args.run_id or job.get("head_sha") != self.args.head:
                        raise BindingError("Job run or exact HEAD mismatch")
                self.artifacts = self.paged(
                    f"repos/{self.args.repo}/actions/runs/{self.args.run_id}/artifacts", "artifacts", "artifacts"
                )
                self.consecutive_errors = 0
                self.write_state()
                print(json.dumps({"sequence": self.sequence, "at": utc(), "run_status": run.get("status"),
                                  "run_conclusion": run.get("conclusion"), "jobs_observed": len(self.jobs),
                                  "required_success": self.group(REQUIRED_NAMES)["all_success"],
                                  "selected_native_success": self.group(NATIVE_NAMES)["all_success"]}), flush=True)
                if run.get("status") == "completed":
                    self.polling_closed = True
                    self.state["polling_closed_at"] = utc()
                    self.write_state()
                    if self.args.fetch_logs_at_closure and not STOP:
                        self.fetch_logs()
                    success = run.get("conclusion") == "success" and self.group(REQUIRED_NAMES)["all_success"] and self.group(NATIVE_NAMES)["all_success"]
                    return self.close("RUN_COMPLETED", f"Actual run conclusion: {run.get('conclusion')}; missing, failed or skipped expected jobs remain explicit", 0 if success else 1)
            except BindingError as error:
                self.errors.append({"at": utc(), "sequence": self.sequence, "kind": "BINDING_ERROR", "message": str(error)})
                return self.close("BINDING_REJECTED", str(error), 3)
            except ObservationError as error:
                self.consecutive_errors += 1
                self.errors.append({"at": utc(), "sequence": self.sequence, "kind": "API_OBSERVATION_ERROR", "message": str(error)})
                self.write_state()
                if STOP:
                    return self.close("STOPPED_BY_SIGNAL", STOP, 130)
                if time.monotonic() - self.started >= self.args.max_minutes * 60:
                    return self.close("OBSERVATION_DEADLINE_REACHED", "No conclusion inferred", 2)
                # Once a completed run is observed, never poll it again, even if its jobs/artifact metadata failed.
                if self.run is not None and self.run.get("status") == "completed":
                    return self.close("COMPLETED_RUN_METADATA_INCOMPLETE", str(error), 2)
                if self.consecutive_errors >= 3:
                    return self.close("API_ERROR_LIMIT_REACHED", "Three consecutive incomplete API observations", 2)
            # Stoppable one-second increments; one snapshot start per >=60 seconds.
            while time.monotonic() - tick < self.args.interval and not STOP:
                if time.monotonic() - self.started >= self.args.max_minutes * 60:
                    break
                time.sleep(min(1.0, max(0.0, self.args.interval - (time.monotonic() - tick))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--run-id", required=True, type=int)
    parser.add_argument("--head", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--attempt", type=int, help="Optional exact expected attempt; otherwise bind first response")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--max-minutes", type=int, default=180)
    parser.add_argument("--api-timeout", type=int, default=45)
    parser.add_argument("--fetch-logs-at-closure", action="store_true")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo):
        parser.error("--repo must be an owner/repository pair")
    if not re.fullmatch(r"[0-9a-f]{40}", args.head):
        parser.error("--head must be an exact lowercase 40-character commit SHA")
    if args.run_id < 1 or (args.attempt is not None and args.attempt < 1):
        parser.error("run ID and attempt must be positive")
    if not 60 <= args.interval <= 300 or not 1 <= args.max_minutes <= 240 or not 5 <= args.api_timeout <= 60:
        parser.error("interval must be 60..300 s; duration 1..240 min; API timeout 5..60 s")
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        return Observer(args).run_loop()
    except FileExistsError:
        print("Output already exists: refusing to overwrite or resume original evidence", file=sys.stderr)
        return 3
    except OSError as error:
        # Do not echo potentially credential-bearing command stderr or full exception data.
        print(f"Observer filesystem/process error: {type(error).__name__}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
