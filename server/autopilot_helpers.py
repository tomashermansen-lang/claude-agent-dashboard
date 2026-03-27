"""Autopilot session discovery, log parsing, and incremental reading.

Functions: discover_autopilots, parse_log_phases, read_log_incremental,
load_summary, _resolve_log_path, _extract_cost, _parse_header.
"""

import json
import os
import re
import subprocess
import time
from pathlib import Path

# Configurable project root — override via PROJECTS_ROOT env var
PROJECTS_ROOT = Path(os.environ.get("PROJECTS_ROOT", str(Path.home() / "Projekter")))

# Phase name → artifact file mapping
PHASE_ARTIFACTS = {
    "BA": "REQUIREMENTS.md",
    "Plan": "PLAN.md",
    "Team Review": "TEAM_REVIEW.md",
    "Review": "REVIEW.md",
    "Static Analysis": "STATIC_ANALYSIS.md",
    "Team QA": "TEAM_QA.md",
    "QA": "QA_REPORT.md",
    "Test Plan": "TESTPLAN.md",
    "Implement": None,
    "Commit": None,
    "Done": None,
    "Merge": None,
}

_TASK_RE = re.compile(r'^[a-zA-Z0-9_-]+$')
_ANSI_RE = re.compile(r'(?:\x1b|\033|\\033)\[[0-9;?]*[A-Za-z]|\r')
_COST_RE = re.compile(r'\$(\d+\.\d+)')
_PHASE_START_RE = re.compile(r'Phase: (.+?)(?:\s*━|$)')
_SENDING_RE = re.compile(r'(?:Sending|Running): /(\S+) flow')
_PHASE_DONE_RE = re.compile(r'Phase completed in (\d+)s')
_CHECKPOINT_RE = re.compile(r'Phase checkpoint reached')

# Map slash commands to display phase names
_COMMAND_TO_PHASE = {
    "ba": "BA",
    "plan": "Plan",
    "team-review": "Team Review",
    "review": "Review",
    "implement": "Implement",  # also matches --step testplan via phase header
    "static-analysis": "Static Analysis",
    "manualtest": "Manual Test",
    "team-qa": "Team QA",
    "qa": "QA",
    "commit": "Commit",
    "done": "Merge",
}

# Map full phase names to canonical short names
_PHASE_NAME_NORMALIZE = {
    "Business Analysis": "BA",
    "BA": "BA",
    "Architecture Plan": "Plan",
    "Plan": "Plan",
    "Team Review": "Team Review",
    "Review": "Review",
    "Test Plan": "Test Plan",
    "Implementation (TDD)": "Implement",
    "Implement": "Implement",
    "Done": "Done",
    "Static Analysis": "Static Analysis",
    "Manual Test": "Manual Test",
    "Team QA": "Team QA",
    "QA": "QA",
    "Commit": "Commit",
    "Commit & Merge": "Commit",
    "Merge": "Merge",
}

# Discovery cache
_discovery_cache = {"data": [], "ts": 0}
_DISCOVERY_TTL = 3  # seconds


def _extract_cost(line):
    """Extract first dollar amount from a log line. Returns float or None."""
    m = _COST_RE.search(line)
    return float(m.group(1)) if m else None


def _parse_header(log_lines):
    """Extract task, project, branch, mode from log header.

    Supports both ASCII-art box format (║ Task: X ║) and
    autopilot.sh timestamped format ([HH:MM:SS] Key: value).
    """
    result = {"task": None, "project": None, "branch": None, "mode": None}
    for line in log_lines:
        # Strip ASCII box chars and timestamps
        stripped = line.strip().strip("║").strip()
        # Strip [HH:MM:SS] timestamps
        stripped = re.sub(r'^\[\d{2}:\d{2}:\d{2}\]\s*', '', stripped)

        if stripped.startswith("Task:"):
            result["task"] = stripped[5:].strip()
        elif stripped.startswith("Autopilot started for task:"):
            result["task"] = stripped[len("Autopilot started for task:"):].strip()
        elif stripped.startswith("Project:"):
            result["project"] = stripped[8:].strip()
        elif stripped.startswith("Worktree:"):
            # Derive project name from worktree path
            wt_path = stripped[9:].strip()
            # e.g. /Users/.../OIH-two-layer-allocation → OIH
            dirname = wt_path.rstrip("/").rsplit("/", 1)[-1]
            # Remove task suffix: OIH-two-layer-allocation → OIH
            if result["task"] and dirname.endswith(f"-{result['task']}"):
                result["project"] = dirname[:-(len(result["task"]) + 1)]
            elif "-" in dirname:
                result["project"] = dirname.split("-")[0]
            else:
                result["project"] = dirname
        elif stripped.startswith("Branch:"):
            result["branch"] = stripped[7:].strip()
        elif stripped.startswith("Mode:") or stripped.startswith("Full mode:"):
            result["mode"] = stripped.split(":", 1)[1].strip()
    return result


def parse_log_phases(log_path):
    """Parse an autopilot log file for phase markers.

    Returns ordered list of phase dicts:
    [{name, status, duration_s, cost, artifact}, ...]
    """
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, IOError):
        return []

    if not content.strip():
        return []

    lines = content.splitlines()
    phases = []
    current_phase = None

    for raw_line in lines:
        line = _ANSI_RE.sub('', raw_line)

        # Phase start — command format (Running: /ba flow ... or Sending: /ba flow ...)
        # Check this first as it's more specific than the header marker
        m = _SENDING_RE.search(line)
        if m:
            cmd = m.group(1)
            phase_name = _COMMAND_TO_PHASE.get(cmd, cmd.title())
            # Skip if we just created this phase from its header marker
            if current_phase and current_phase["name"] == phase_name:
                continue
            current_phase = {
                "name": phase_name,
                "status": "running",
                "duration_s": None,
                "cost": None,
                "artifact": PHASE_ARTIFACTS.get(phase_name),
            }
            phases.append(current_phase)
            continue

        # Phase header markers (Phase: Business Analysis) are decorative —
        # the Running:/Sending: lines above are the authoritative phase starts.

        # Phase completion — structured marker
        m = _PHASE_DONE_RE.search(line)
        if m and current_phase:
            current_phase["duration_s"] = int(m.group(1))
            current_phase["status"] = "completed"
            continue

        # Phase completion — autopilot.sh checkpoint
        if _CHECKPOINT_RE.search(line) and current_phase:
            current_phase["status"] = "completed"
            continue

        # Cost extraction (within current phase)
        if current_phase:
            cost = _extract_cost(line)
            if cost is not None:
                current_phase["cost"] = cost

        # Task-level failure
        if "AUTOPILOT FAILED" in line:
            if current_phase and current_phase["status"] == "running":
                current_phase["status"] = "failed"

    return phases


def parse_stream_phases(stream_path):
    """Parse phase events from an NDJSON stream file.

    Returns ordered list of phase dicts compatible with parse_log_phases output.
    Merges running+completed events for the same phase into one entry.
    """
    try:
        with open(stream_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except (OSError, IOError):
        return []

    phases = []
    phase_map = {}  # normalized name -> phase dict

    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except (json.JSONDecodeError, ValueError):
            continue
        if not isinstance(event, dict) or event.get("type") != "phase":
            continue

        raw_name = event.get("phase", "")
        phase_name = _PHASE_NAME_NORMALIZE.get(raw_name, raw_name)
        status = event.get("status", "running")

        if phase_name not in phase_map:
            phase_dict = {
                "name": phase_name,
                "status": status,
                "duration_s": event.get("duration_s"),
                "cost": None,
                "artifact": PHASE_ARTIFACTS.get(phase_name),
            }
            phase_map[phase_name] = phase_dict
            phases.append(phase_dict)
        else:
            existing = phase_map[phase_name]
            if status == "completed":
                existing["status"] = "completed"
                if event.get("duration_s") is not None:
                    existing["duration_s"] = event["duration_s"]
            elif status == "failed":
                existing["status"] = "failed"

    # Extract costs from result events
    try:
        with open(stream_path, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except (json.JSONDecodeError, ValueError):
                    continue
                if isinstance(event, dict) and event.get("type") == "result":
                    cost = event.get("total_cost_usd")
                    if cost is not None and phases:
                        # Assign cost to the most recent completed phase
                        for p in reversed(phases):
                            if p["status"] == "completed" and p["cost"] is None:
                                p["cost"] = round(cost, 2)
                                break
    except (OSError, IOError):
        pass

    return phases


def _resolve_artifact_path(task, filename):
    """Find an artifact file in the task's feature folder.

    Searches docs/INPROGRESS_Feature_<task>/<filename> across all projects.
    Also checks DONE_ folders. Returns absolute path string or None.
    """
    if not _TASK_RE.match(task):
        return None

    roots = _get_all_project_roots()
    for prefix in ("INPROGRESS_Feature_", "DONE_Feature_"):
        for root in roots:
            candidate = Path(root) / "docs" / f"{prefix}{task}" / filename
            if candidate.is_file():
                # Security: resolve symlinks and validate under PROJECTS_ROOT
                resolved = candidate.resolve()
                if str(resolved).startswith(str(PROJECTS_ROOT) + "/"):
                    return str(resolved)
    return None


_KNOWN_ARTIFACTS = sorted([
    "REQUIREMENTS.md", "PLAN.md", "DESIGN.md", "REVIEW.md", "TEAM_REVIEW.md",
    "STATIC_ANALYSIS.md", "TEAM_QA.md", "QA_REPORT.md", "TESTPLAN.md",
    "MANUAL_TEST_LOG.md",
])


def list_autopilot_artifacts(task):
    """List available doc artifacts for an autopilot task.

    Searches docs/{INPROGRESS,DONE}_Feature_<task>/ across all project roots.
    Returns list of {"name": str, "file": str} dicts.
    """
    if not _TASK_RE.match(task):
        return []
    roots = _get_all_project_roots()
    for prefix in ("INPROGRESS_Feature_", "DONE_Feature_"):
        for root in roots:
            feature_dir = Path(root) / "docs" / f"{prefix}{task}"
            if not feature_dir.is_dir():
                continue
            results = []
            for filename in _KNOWN_ARTIFACTS:
                if (feature_dir / filename).is_file():
                    results.append({"name": filename, "file": filename})
            if results:
                return results
    return []


def read_log_incremental(log_path, offset):
    """Read log file from byte offset. Returns (content, new_offset) or None.

    Security: validates path is under PROJECTS_ROOT after resolving symlinks.
    Strips ANSI escape sequences and carriage returns from output.
    """
    try:
        resolved = Path(log_path).resolve()
    except (OSError, ValueError):
        return None

    home = Path.home()
    if not str(resolved).startswith(str(PROJECTS_ROOT) + "/"):
        # Also allow pytest tmp dirs for testing
        tmp_prefixes = ("/tmp/", "/private/tmp/", "/var/folders/")
        if not any(str(resolved).startswith(p) for p in tmp_prefixes):
            return None

    if not resolved.is_file():
        return None

    try:
        with open(str(resolved), "rb") as f:
            f.seek(offset)
            raw = f.read()
            new_offset = offset + len(raw)
        content = raw.decode("utf-8", errors="replace")
        content = _ANSI_RE.sub("", content)
        return (content, new_offset)
    except (OSError, IOError):
        return None


def _resolve_log_path(task, search_roots=None):
    """Find the log file for a task.

    Checks docs/INPROGRESS_Feature_<task>/autopilot.log across search roots.
    When no search_roots provided, scans all projects under PROJECTS_ROOT
    (not just the current git repo's worktrees) to support multi-project discovery.
    Falls back to /tmp/autopilot-<task>.log for backward compatibility.
    """
    if not _TASK_RE.match(task):
        return None

    # Search provided roots, or all project directories under PROJECTS_ROOT
    roots = search_roots or _get_all_project_roots()
    for prefix in ("INPROGRESS_Feature_", "DONE_Feature_"):
        for root in roots:
            candidate = Path(root) / "docs" / f"{prefix}{task}" / "autopilot.log"
            if candidate.is_file():
                return str(candidate)

    # Fallback to /tmp
    tmp_path = f"/tmp/autopilot-{task}.log"
    if os.path.isfile(tmp_path):
        return tmp_path

    return None


def _get_worktree_roots():
    """Get worktree roots from git. Returns list of paths."""
    try:
        result = subprocess.run(
            ["git", "worktree", "list", "--porcelain"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return []
        roots = []
        for line in result.stdout.splitlines():
            if line.startswith("worktree "):
                roots.append(line[len("worktree "):])
        return roots
    except Exception:
        return []


def _get_all_project_roots():
    """Get all project directories under PROJECTS_ROOT.

    Scans top-level dirs (both main repos and worktrees) to support
    multi-project autopilot discovery — not limited to the current git repo.
    """
    projekter = PROJECTS_ROOT
    if not projekter.is_dir():
        return []
    try:
        return [str(d) for d in projekter.iterdir() if d.is_dir() and not d.name.startswith(".")]
    except OSError:
        return []


def _status_from_stream(stream_path, now):
    """Determine autopilot status from NDJSON stream file."""
    try:
        resolved = Path(stream_path).resolve()
        mtime = resolved.stat().st_mtime
    except OSError:
        return "completed"

    # Check last few lines for completion/failure markers
    try:
        with open(stream_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
    except (OSError, IOError):
        return "completed"

    for line in reversed(lines[-20:]):
        try:
            event = json.loads(line.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        if event.get("type") == "phase":
            if event.get("status") == "failed":
                return "failed"
        if event.get("type") == "result" and event.get("is_error"):
            return "failed"

    # If file was modified recently, still running
    if now - mtime < 60:
        return "running"

    return "completed"


def discover_autopilots(_tmux_cmd=None):
    """Discover autopilot sessions by scanning for log files.

    Returns list of session dicts with task, project, branch, status,
    phases, elapsed_s, cost, log_path.

    Scans all projects under PROJECTS_ROOT for INPROGRESS_Feature_*/autopilot.log.
    A session is 'running' if the log was modified in the last 60 seconds.

    _tmux_cmd parameter kept for test compatibility (ignored in v2).
    """
    now = time.time()
    if _tmux_cmd is None and now - _discovery_cache["ts"] < _DISCOVERY_TTL:
        return _discovery_cache["data"]

    sessions = []
    for root in _get_all_project_roots():
        docs = Path(root) / "docs"
        if not docs.is_dir():
            continue
        try:
            entries = list(docs.iterdir())
        except OSError:
            continue
        for entry in entries:
            is_done = False
            if entry.name.startswith("INPROGRESS_Feature_"):
                task = entry.name[len("INPROGRESS_Feature_"):]
            elif entry.name.startswith("DONE_Feature_"):
                task = entry.name[len("DONE_Feature_"):]
                is_done = True
            else:
                continue
            # Check for NDJSON stream (v2) or text log (v1)
            stream_file = entry / "autopilot-stream.ndjson"
            log_file = entry / "autopilot.log"
            if not stream_file.is_file() and not log_file.is_file():
                continue
            if not _TASK_RE.match(task):
                continue

            # Use NDJSON stream (v2) or text log (v1) for phases and status
            has_stream = stream_file.is_file()
            active_file = stream_file if has_stream else log_file
            active_path = str(active_file)

            if has_stream:
                phases = parse_stream_phases(active_path)
            else:
                phases = parse_log_phases(active_path)

            # Parse header from log file (v1) or stream (v2)
            header = {}
            if log_file.is_file():
                try:
                    with open(str(log_file), "r", encoding="utf-8", errors="replace") as f:
                        header = _parse_header(f.readlines()[:20])
                except (OSError, IOError):
                    pass

            # For DONE features, force all phases to completed
            if is_done:
                for p in phases:
                    if p["status"] == "running":
                        p["status"] = "completed"

            # Determine overall status
            if is_done:
                status = "completed"
            elif has_stream:
                # Check stream for phase end markers
                status = _status_from_stream(active_path, now)
            else:
                try:
                    with open(active_path, "r", encoding="utf-8", errors="replace") as f:
                        full_content = f.read()
                except (OSError, IOError):
                    full_content = ""
                if "AUTOPILOT COMPLETE" in full_content:
                    status = "completed"
                elif "AUTOPILOT FAILED" in full_content or "Stopping." in full_content:
                    status = "failed"
                else:
                    try:
                        mtime = active_file.stat().st_mtime
                        status = "running" if now - mtime < 60 else "completed"
                    except OSError:
                        status = "completed"

            # Total elapsed and cost
            total_elapsed = sum(p["duration_s"] or 0 for p in phases)
            total_cost = None
            phase_costs = [p["cost"] for p in phases if p["cost"] is not None]
            if phase_costs:
                total_cost = sum(phase_costs)

            # Infer project name: prefer header, fall back to directory name
            project_name = header.get("project")
            if not project_name:
                project_name = Path(root).name

            sessions.append({
                "task": task,
                "project": project_name,
                "branch": header.get("branch"),
                "status": status,
                "phases": phases,
                "elapsed_s": total_elapsed,
                "cost": total_cost,
                "log_path": str(log_file) if log_file.is_file() else None,
                "stream_path": active_path if has_stream else None,
            })

    if _tmux_cmd is None:
        _discovery_cache["data"] = sessions
        _discovery_cache["ts"] = now

    return sessions


def _resolve_stream_path(task, search_roots=None):
    """Find the NDJSON stream file for a task.

    Checks docs/INPROGRESS_Feature_<task>/autopilot-stream.ndjson across search roots.
    When no search_roots provided, scans all projects under PROJECTS_ROOT.
    """
    if not _TASK_RE.match(task):
        return None

    roots = search_roots or _get_all_project_roots()
    for prefix in ("INPROGRESS_Feature_", "DONE_Feature_"):
        for root in roots:
            candidate = Path(root) / "docs" / f"{prefix}{task}" / "autopilot-stream.ndjson"
            if candidate.is_file():
                return str(candidate)

    return None


def read_stream_incremental(stream_path, offset):
    """Read NDJSON stream file from byte offset, parse and filter events.

    Returns (events_list, new_byte_offset) or None on error.
    Filters out 'system' and 'rate_limit_event' type events.
    Security: validates path is under PROJECTS_ROOT after resolving symlinks.
    """
    try:
        resolved = Path(stream_path).resolve()
    except (OSError, ValueError):
        return None

    if not str(resolved).startswith(str(PROJECTS_ROOT) + "/"):
        tmp_prefixes = ("/tmp/", "/private/tmp/", "/var/folders/")
        if not any(str(resolved).startswith(p) for p in tmp_prefixes):
            return None

    if not resolved.is_file():
        return None

    try:
        with open(str(resolved), "rb") as f:
            f.seek(offset)
            raw = f.read()
            new_offset = offset + len(raw)
        content = raw.decode("utf-8", errors="replace")
    except (OSError, IOError):
        return None

    events = []
    filtered_types = {"system", "rate_limit_event"}
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict) and event.get("type") not in filtered_types:
            events.append(event)

    return (events, new_offset)


def load_summary(task, search_roots=None):
    """Load autopilot-summary.json for a task. Returns parsed dict or None."""
    if not _TASK_RE.match(task):
        return None

    roots = search_roots or _get_all_project_roots()
    for root in roots:
        candidate = Path(root) / "docs" / f"INPROGRESS_Feature_{task}" / "autopilot-summary.json"
        if candidate.is_file():
            try:
                return json.loads(candidate.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                return None

    # Also check DONE_ folders
    for root in roots:
        docs = Path(root) / "docs"
        if not docs.is_dir():
            continue
        for entry in docs.iterdir():
            if entry.name.startswith(f"DONE_Feature_{task}"):
                summary = entry / "autopilot-summary.json"
                if summary.is_file():
                    try:
                        return json.loads(summary.read_text(encoding="utf-8"))
                    except (json.JSONDecodeError, OSError):
                        return None

    return None
