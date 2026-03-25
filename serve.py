#!/usr/bin/env python3
"""Localhost-only HTTP server for Agent Dashboard.

Serves static files from app/dist/ and provides read-only API endpoints
for execution plans, sessions, flow status, and worktrees.
"""

import http.server
import json
import os
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PORT = 8787
DASHBOARD_DIR = Path(__file__).resolve().parent
SCHEMA_VERSION = "1.0.0"
APP_DIST = DASHBOARD_DIR / "app" / "dist"
WORKTREE_CACHE_TTL = 30  # seconds

_worktree_cache = {"roots": set(), "ts": 0}


def get_worktree_roots():
    now = time.time()
    if now - _worktree_cache["ts"] < WORKTREE_CACHE_TTL:
        return _worktree_cache["roots"]
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            _worktree_cache["roots"] = set()
            _worktree_cache["ts"] = now
            return set()
        roots = set()
        for line in result.stdout.splitlines():
            if line.startswith("worktree "):
                roots.add(line[len("worktree "):])
        _worktree_cache["roots"] = roots
    except Exception:
        _worktree_cache["roots"] = set()
    _worktree_cache["ts"] = now
    return _worktree_cache["roots"]


def get_main_worktree(cwd):
    """Given a cwd, resolve the main (first) worktree root for that repo."""
    if not cwd or not os.path.isabs(cwd) or ".." in cwd:
        return None
    resolved = Path(cwd).resolve()
    if not resolved.is_dir():
        return None
    home = Path.home()
    if not str(resolved).startswith(str(home) + "/") and str(resolved) != str(home):
        return None
    try:
        result = subprocess.run(
            ["git", "-C", str(resolved), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if line.startswith("worktree "):
                    return line[len("worktree "):]
    except Exception:
        pass
    return None


def _scan_docs_dir(docs_dir):
    """Scan a single docs/ directory for feature/plan status entries."""
    results = []
    if not docs_dir.is_dir():
        return results
    try:
        for entry in docs_dir.iterdir():
            if not entry.is_dir():
                continue
            name = entry.name
            if name.startswith("."):
                continue
            # Convention: docs/{STATUS}_{Type}_{name}/
            if name.startswith("DONE_Feature_"):
                feature = name[13:]
                phase = "done"
            elif name.startswith("DONE_Plan_"):
                feature = name[10:]
                phase = "done"
            elif name.startswith("INPROGRESS_Feature_"):
                feature = name[19:]
                phase = _detect_phase(entry)
            elif name.startswith("INPROGRESS_Plan_"):
                feature = name[16:]
                phase = _detect_phase(entry)
            elif name.startswith("PENDING_Feature_"):
                feature = name[16:]
                phase = "pending"
            elif name.startswith("PENDING_Plan_"):
                feature = name[13:]
                phase = "pending"
            else:
                continue
            results.append({"feature": feature, "phase": phase, "dir": name})
    except Exception:
        pass
    return results


def detect_flow_status(cwd):
    """Detect flow phase for all features across a repo's worktrees.

    Scans docs/ in the given CWD and all sibling worktrees so that
    features in progress on worktree branches are visible from main.
    """
    if not cwd or not os.path.isabs(cwd) or ".." in cwd:
        return []
    resolved = Path(cwd).resolve()
    if not resolved.is_dir():
        return []
    home = Path.home()
    if not str(resolved).startswith(str(home) + "/") and str(resolved) != str(home):
        return []

    # Collect all worktree roots for this repo
    worktree_roots = set()
    worktree_roots.add(str(resolved))
    try:
        proc = subprocess.run(
            ["git", "-C", str(resolved), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5,
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if line.startswith("worktree "):
                    wt = line[len("worktree "):]
                    if Path(wt).is_dir():
                        worktree_roots.add(wt)
    except Exception:
        pass

    # Scan docs/ in each worktree, dedup by feature name (prefer INPROGRESS over DONE)
    seen = {}
    for root in sorted(worktree_roots):
        docs_dir = Path(root) / "docs"
        for entry in _scan_docs_dir(docs_dir):
            feat = entry["feature"]
            # INPROGRESS entries take priority over DONE/PENDING
            if feat not in seen or entry["phase"] not in ("done", "pending"):
                seen[feat] = entry

    return list(seen.values())


def _detect_phase(docs_feature_dir):
    """Determine flow phase from which files exist in docs/<feature>/.

    Checks from most-advanced phase backward:
    QA_REPORT/TEAM_QA → qa done → MANUAL_TEST_LOG → manualtest done →
    TESTPLAN → implementing → TEAM_REVIEW → review done →
    PLAN → plan done → DESIGN → design done → REQUIREMENTS → ba done.
    """
    has = set()
    try:
        for f in docs_feature_dir.iterdir():
            has.add(f.name)
    except Exception:
        return "unknown"
    if "QA_REPORT.md" in has or "TEAM_QA.md" in has:
        return "qa"
    if "MANUAL_TEST_LOG.md" in has:
        return "manualtest"
    if "TESTPLAN.md" in has:
        return "implement"
    if "TEAM_REVIEW.md" in has:
        return "review"
    if "PLAN.md" in has:
        return "plan"
    if "DESIGN.md" in has:
        return "design"
    if "REQUIREMENTS.md" in has:
        return "ba"
    return "unknown"


def get_all_worktrees(cwd):
    """Return list of {path, branch} for all worktrees in the repo."""
    if not cwd or not os.path.isabs(cwd) or ".." in cwd:
        return []
    resolved = Path(cwd).resolve()
    if not resolved.is_dir():
        return []
    home = Path.home()
    if not str(resolved).startswith(str(home) + "/") and str(resolved) != str(home):
        return []
    try:
        result = subprocess.run(
            ["git", "-C", str(resolved), "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return []
        worktrees = []
        current = {}
        for line in result.stdout.splitlines():
            if line.startswith("worktree "):
                if current and "path" in current:
                    worktrees.append(current)
                current = {"path": line[len("worktree "):]}
            elif line.startswith("branch "):
                if current:
                    current["branch"] = line[len("branch "):].rsplit("/", 1)[-1]
        if current and "path" in current:
            worktrees.append(current)
        return worktrees
    except Exception:
        return []


def _validate_cwd_param(cwd):
    """Validate a cwd parameter for security. Returns None if invalid."""
    if not cwd or not os.path.isabs(cwd) or ".." in cwd:
        return None
    resolved = Path(cwd).resolve()
    if not resolved.is_dir():
        return None
    home = Path.home()
    if not str(resolved).startswith(str(home) + "/") and str(resolved) != str(home):
        return None
    return str(resolved)


class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        doc_root = str(APP_DIST) if APP_DIST.is_dir() else str(DASHBOARD_DIR)
        super().__init__(*args, directory=doc_root, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        handler = ROUTES.get(parsed.path)
        if handler:
            handler(self, parsed)
        else:
            super().do_GET()

    def end_headers(self):
        """Add no-cache headers to HTML files to prevent stale bundles."""
        path = self.translate_path(self.path)
        if path.endswith(".html") or self.path == "/":
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def _send_json(self, data, status=200):
        """Helper to send a JSON response."""
        encoded = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):
        pass


def handle_api_flow_status(handler, parsed):
    """Return flow phase for all features in a worktree."""
    params = parse_qs(parsed.query)
    cwd_list = params.get("cwd", [])
    if not cwd_list:
        handler.send_error(400, "Missing cwd parameter")
        return
    cwd = cwd_list[0]
    statuses = detect_flow_status(cwd)
    handler._send_json(statuses)


def handle_api_worktrees(handler, parsed):
    """Return all worktrees for a given repo cwd."""
    params = parse_qs(parsed.query)
    cwd_list = params.get("cwd", [])
    if not cwd_list:
        handler.send_error(400, "Missing cwd parameter")
        return
    cwd = cwd_list[0]
    worktrees = get_all_worktrees(cwd)
    handler._send_json(worktrees)


def handle_api_plan(handler, parsed):
    """Return structured execution plan for a project."""
    params = parse_qs(parsed.query)
    cwd_list = params.get("cwd", [])
    if not cwd_list:
        handler.send_error(400, "Missing cwd parameter")
        return
    cwd = cwd_list[0]
    validated = _validate_cwd_param(cwd)
    if not validated:
        handler.send_error(403, "Forbidden")
        return
    main_root = get_main_worktree(validated)
    if not main_root:
        handler.send_error(404, "No git repo found")
        return
    from server.plan_helpers import load_execution_plan, merge_file_status
    # Try loading from the exact cwd first (supports plan_dir subdirectories),
    # then fall back to main worktree root.
    plan = load_execution_plan(validated)
    if not plan:
        plan = load_execution_plan(main_root)
    if not plan:
        handler.send_error(404, "No execution plan found")
        return
    plan = merge_file_status(plan, main_root)
    handler._send_json(plan)


def handle_api_plans(handler, parsed):
    """Return list of all discovered projects with execution plans."""
    from server.plan_helpers import discover_all_plans_v2
    plans = discover_all_plans_v2()
    handler._send_json(plans)


def handle_api_sessions(handler, parsed):
    """Return current session states derived from sessions.jsonl."""
    from server.session_helpers import get_session_states
    states = get_session_states()
    handler._send_json(states)


def handle_api_metrics(handler, parsed):
    """Return aggregated session metrics (M1-M8)."""
    params = parse_qs(parsed.query)
    sid = params.get("sid", [None])[0]
    since = params.get("since", [None])[0]
    # Validate sid: alphanumeric, hyphens, underscores
    if sid and not re.match(r'^[a-zA-Z0-9_-]+$', sid):
        handler.send_error(400, "Invalid sid")
        return
    # Validate since: ISO 8601 format
    if since:
        try:
            datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            handler.send_error(400, "Invalid since timestamp")
            return
    from server.metrics_helpers import compute_metrics
    result = compute_metrics(sid=sid, since=since)
    handler._send_json(result)


def handle_api_autopilots(handler, parsed):
    """Return list of active autopilot sessions."""
    from server.autopilot_helpers import discover_autopilots
    sessions = discover_autopilots()
    handler._send_json(sessions)


def handle_api_autopilot_log(handler, parsed):
    """Return incremental log content from byte offset."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    if not task_list:
        handler.send_error(400, "Missing task parameter")
        return
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return

    offset_str = params.get("offset", ["0"])[0]
    try:
        offset = int(offset_str)
    except ValueError:
        handler.send_error(400, "Invalid offset parameter")
        return
    if offset < 0:
        handler.send_error(400, "Invalid offset parameter")
        return

    from server.autopilot_helpers import _resolve_log_path, read_log_incremental
    log_path = _resolve_log_path(task)
    if not log_path:
        handler.send_error(404, "Log file not found")
        return

    result = read_log_incremental(log_path, offset)
    if result is None:
        handler.send_error(404, "Log file not found")
        return

    content, new_offset = result
    handler._send_json({"content": content, "offset": new_offset, "task": task})


def handle_api_autopilot_stream(handler, parsed):
    """Return incremental NDJSON stream events from byte offset."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    if not task_list:
        handler.send_error(400, "Missing task parameter")
        return
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return

    offset_str = params.get("offset", ["0"])[0]
    try:
        offset = int(offset_str)
    except ValueError:
        handler.send_error(400, "Invalid offset parameter")
        return
    if offset < 0:
        handler.send_error(400, "Invalid offset parameter")
        return

    from server.autopilot_helpers import _resolve_stream_path, read_stream_incremental
    stream_path = _resolve_stream_path(task)
    if not stream_path:
        handler.send_error(404, "Stream file not found")
        return

    result = read_stream_incremental(stream_path, offset)
    if result is None:
        handler.send_error(404, "Stream file not found")
        return

    events, new_offset = result
    handler._send_json({"events": events, "offset": new_offset, "task": task})


def handle_api_autopilot_summary(handler, parsed):
    """Return parsed autopilot summary JSON."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    if not task_list:
        handler.send_error(400, "Missing task parameter")
        return
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return

    from server.autopilot_helpers import load_summary
    summary = load_summary(task)
    if summary is None:
        handler.send_error(404, "Summary not found")
        return
    handler._send_json(summary)


def handle_api_autopilot_artifacts(handler, parsed):
    """List available doc artifacts for an autopilot task."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    if not task_list:
        handler.send_error(400, "Missing task parameter")
        return
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return
    from server.autopilot_helpers import list_autopilot_artifacts
    artifacts = list_autopilot_artifacts(task)
    handler._send_json(artifacts)


def handle_api_autopilot_artifact(handler, parsed):
    """Return raw markdown content for an autopilot phase artifact."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    file_list = params.get("file", [])
    if not task_list or not file_list:
        handler.send_error(400, "Missing task or file parameter")
        return
    task = task_list[0]
    filename = file_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return
    # Only allow known artifact filenames
    allowed_files = {
        "REQUIREMENTS.md", "PLAN.md", "DESIGN.md", "REVIEW.md", "TEAM_REVIEW.md",
        "STATIC_ANALYSIS.md", "TEAM_QA.md", "QA_REPORT.md", "TESTPLAN.md",
        "MANUAL_TEST_LOG.md",
    }
    if filename not in allowed_files:
        handler.send_error(400, "Invalid file parameter")
        return

    from server.autopilot_helpers import _resolve_artifact_path
    artifact_path = _resolve_artifact_path(task, filename)
    if artifact_path is None:
        handler.send_error(404, "Artifact not found")
        return

    try:
        content = Path(artifact_path).read_text(encoding="utf-8")
    except (OSError, IOError):
        handler.send_error(500, "Error reading artifact")
        return
    handler._send_json({"task": task, "file": filename, "content": content})


def handle_api_plan_artifacts(handler, parsed):
    """List available doc artifacts for a task in an execution plan project."""
    params = parse_qs(parsed.query)
    cwd_list = params.get("cwd", [])
    task_list = params.get("task", [])
    if not cwd_list or not task_list:
        handler.send_error(400, "Missing cwd or task parameter")
        return
    cwd = cwd_list[0]
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return
    from server.plan_helpers import list_task_artifacts
    artifacts = list_task_artifacts(cwd, task)
    handler._send_json(artifacts)


def handle_api_plan_artifact(handler, parsed):
    """Return content of a plan or task artifact file."""
    params = parse_qs(parsed.query)
    file_list = params.get("file", [])
    if not file_list:
        handler.send_error(400, "Missing file parameter")
        return
    filename = file_list[0]

    task_list = params.get("task", [])
    cwd_list = params.get("cwd", [])
    plan_dir_list = params.get("plan_dir", [])

    task = task_list[0] if task_list else None
    cwd = cwd_list[0] if cwd_list else None
    plan_dir = plan_dir_list[0] if plan_dir_list else None

    if task and not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return
    if ".." in filename or "/" in filename:
        handler.send_error(400, "Invalid file parameter")
        return

    from server.plan_helpers import get_plan_artifact, _ALL_ALLOWED_FILES
    if filename not in _ALL_ALLOWED_FILES:
        handler.send_error(400, "Invalid file parameter")
        return

    content = get_plan_artifact(cwd, plan_dir, task, filename)
    if content is None:
        handler.send_error(404, "Artifact not found")
        return
    handler._send_json({"file": filename, "content": content})


def handle_api_autopilot_activity(handler, parsed):
    """Return recent session tool events for an autopilot task's feature branch."""
    params = parse_qs(parsed.query)
    task_list = params.get("task", [])
    if not task_list:
        handler.send_error(400, "Missing task parameter")
        return
    task = task_list[0]
    if not re.match(r'^[a-zA-Z0-9_-]+$', task):
        handler.send_error(400, "Invalid task parameter")
        return
    since = params.get("since", [None])[0]
    if since:
        try:
            datetime.fromisoformat(since.replace("Z", "+00:00"))
        except ValueError:
            handler.send_error(400, "Invalid since timestamp")
            return
    from server.session_helpers import get_session_activity
    events = get_session_activity(task, since=since)
    handler._send_json({"task": task, "events": events})


ROUTES = {
    "/api/flow-status": handle_api_flow_status,
    "/api/worktrees": handle_api_worktrees,
    "/api/plan": handle_api_plan,
    "/api/plans": handle_api_plans,
    "/api/sessions": handle_api_sessions,
    "/api/metrics": handle_api_metrics,
    "/api/autopilots": handle_api_autopilots,
    "/api/autopilot/log": handle_api_autopilot_log,
    "/api/autopilot/stream": handle_api_autopilot_stream,
    "/api/autopilot/summary": handle_api_autopilot_summary,
    "/api/autopilot/artifacts": handle_api_autopilot_artifacts,
    "/api/autopilot/artifact": handle_api_autopilot_artifact,
    "/api/autopilot/activity": handle_api_autopilot_activity,
    "/api/plan/artifacts": handle_api_plan_artifacts,
    "/api/plan/artifact": handle_api_plan_artifact,
}


if __name__ == "__main__":
    server = http.server.HTTPServer(("127.0.0.1", PORT), DashboardHandler)
    print(f"Agent Dashboard serving at http://127.0.0.1:{PORT}")
    print("Press Ctrl+C to stop")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        server.server_close()
